// hud.js —— DOM 层 HUD 控制
// 与游戏逻辑解耦：游戏模块调用这里的方法更新界面
// 经典脚本（非 ES Module）：CONFIG 由前置脚本挂到 window 提供

const CROSSHAIR_STYLE_IDS = Object.freeze(['classic', 'dot', 'circle', 'plus', 'tactical']);

class HUD {
  constructor() {
    // 缓存 DOM
    this.el = document.getElementById('hud');
    this.healthBar = document.getElementById('healthBar');
    this.armorBar = document.getElementById('armorBar');
    this.healthText = document.getElementById('healthText');
    this.armorText = document.getElementById('armorText');
    this.weaponName = document.getElementById('weaponName');
    this.ammoMag = document.getElementById('ammoMag');
    this.ammoReserve = document.getElementById('ammoReserve');
    this.weaponSlots = document.querySelectorAll('#weaponSlots .slot');
    this.enemyCount = document.getElementById('enemyCount');
    this.killCount = document.getElementById('killCount');
    this.scoreCount = document.getElementById('scoreCount');
    this.waveLabel = document.getElementById('waveLabel');
    this.comboBanner = document.getElementById('comboBanner');
    this.killFeedEl = document.getElementById('killFeed');
    this.toastEl = document.getElementById('toast');
    this.crosshair = document.getElementById('crosshair');
    this.crosshairStyle = 'classic';
    this.damageFlashEl = document.getElementById('damageFlash');
    this.menu = document.getElementById('menu');
    this.result = document.getElementById('result');
    this.resultTitle = document.getElementById('resultTitle');
    this.resultStats = document.getElementById('resultStats');
    // V4/V5 结算页新增元素：主题台词副行 + 本局高光行（旧 HTML 缺元素时静默降级）。
    this.resultEndLine = document.getElementById('resultEndLine');
    this.resultHighlight = document.getElementById('resultHighlight');
    this.pause = document.getElementById('pause');
    this.clickHint = document.getElementById('clickHint');

    this.audio = null;     // 由 main 注入
    this._toastTimer = 0;

    // 武器槽位显示索引：出战配置生效时按携带顺序重建（数字键 N = 第 N 件）。
    // 未调用 setWeaponSlots 前保持 CONFIG slot 的静态槽位（index.html 默认 6 槽）。
    this._slotWeaponIndex = null;

    // 命中标记 + 飘字
    this.hitmarker = document.getElementById('hitmarker');
    this.dmgLayer = document.getElementById('damageNumbers');
    this._dmgPool = [];      // 飘字 DOM 池
    this._dmgActive = [];
    this._hitMarkerTimer = 0;

    // 小地图
    this.minimap = document.getElementById('minimap');
    this.minimapCtx = this.minimap ? this.minimap.getContext('2d') : null;
    this.minimapWrap = document.getElementById('minimapWrap');
    this._minimapVisible = true;
    this._minimapRefs = null;  // { gameMap, player, enemiesGetter }

    this.setCrosshairStyle('classic');
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  // maxHealth/maxArmor 可选：局内强化（护盾扩容等）会改变玩家实例上限。
  updateVitals(hp, armor, maxHealth, maxArmor) {
    const P = CONFIG.player;
    const hpMax = Math.max(1, Number(maxHealth) || P.maxHealth);
    const armorMax = Math.max(1, Number(maxArmor) || P.maxArmor);
    this.healthBar.style.width = `${Math.max(0, Math.min(100, (hp / hpMax) * 100))}%`;
    this.armorBar.style.width = `${Math.max(0, Math.min(100, (armor / armorMax) * 100))}%`;
    this.healthText.textContent = Math.ceil(hp);
    this.armorText.textContent = Math.ceil(armor);
  }

  // 按出战携带清单重建武器槽 DOM：数字键与槽位编号一一对应。
  updateWeaponSlots(inventory) {
    const container = this.weaponSlots && this.weaponSlots[0] && this.weaponSlots[0].parentNode;
    if (!container) return;
    const ids = Array.isArray(inventory) && inventory.length
      ? inventory
      : ['usp', 'ak47', 'awp', 'm249', 'm9', 'grenade'];
    const index = {};
    // Chrome 61 基线：不用 replaceChildren，逐个移除旧槽位。
    while (container.firstChild) container.removeChild(container.firstChild);
    ids.forEach((id, position) => {
      const weapon = CONFIG.weapons[id];
      if (!weapon) return;
      index[id] = position + 1;
      const slot = document.createElement('span');
      slot.className = 'slot';
      slot.dataset.slot = String(position + 1);
      slot.dataset.weaponId = id;
      slot.textContent = `${position + 1} ${weapon.name}`;
      container.appendChild(slot);
    });
    this._slotWeaponIndex = index;
    // 重新缓存静态 NodeList 引用（旧节点已被替换）。
    this.weaponSlots = container.querySelectorAll('.slot');
  }

  // magSize 可选（V6）：武器系统传入 magMul 后的实际弹匣容量；未传时回退配置值。
  updateWeapon(w, state, magSize) {
    this.weaponName.textContent = w.name;
    if (w.kind === 'melee') {
      this.ammoMag.textContent = '∞';
      this.ammoReserve.textContent = '近战';
    } else if (w.kind === 'grenade') {
      this.ammoMag.textContent = state.mag;
      this.ammoReserve.textContent = '枚';
    } else {
      this.ammoMag.textContent = state.mag;
      this.ammoReserve.textContent = state.reserve;
    }
    // 弹药告警三态：<=25% 黄 / =0 红闪（D5）
    // V6：分母与武器系统同源——用实际弹匣容量（扩容卡后 ≠ 配置 magSize）。
    const cap = Number(magSize) > 0 ? Number(magSize) : w.magSize;
    const ratio = cap > 0 ? state.mag / cap : 1;
    this.ammoMag.classList.toggle('ammo-low', w.kind !== 'melee' && ratio > 0 && ratio <= 0.25);
    this.ammoMag.classList.toggle('ammo-empty', w.kind !== 'melee' && ratio <= 0);
    const displaySlot = this._slotWeaponIndex ? (this._slotWeaponIndex[w.id] || w.slot) : w.slot;
    this.weaponSlots.forEach(s => {
      s.classList.toggle('active', parseInt(s.dataset.slot) === displaySlot);
    });
  }

  updateScore(enemiesLeft, kills, wave) {
    // 脏检查：值不变不写 DOM（主循环每帧调用）
    if (enemiesLeft === this._lastEnemiesLeft && kills === this._lastKills && wave === this._lastWave) return;
    this._lastEnemiesLeft = enemiesLeft;
    this._lastKills = kills;
    this._lastWave = wave;
    this.enemyCount.textContent = enemiesLeft;
    this.killCount.textContent = kills;
    this.waveLabel.textContent = `回合 ${wave}`;
  }

  // 本局分数（脏检查；不存在 scoreCount 的旧 DOM 结构时静默跳过）
  setRunScore(score) {
    if (!this.scoreCount) return;
    const value = Math.max(0, Math.floor(Number(score) || 0));
    if (value === this._lastScore) return;
    this._lastScore = value;
    this.scoreCount.textContent = value.toLocaleString('en-US');
  }

  // 连杀播报（双杀/三连杀/…）：中央上方弹出，CSS 动画结束自动隐藏。
  showCombo(text, subtext) {
    if (!this.comboBanner) return;
    this.comboBanner.classList.remove('show');
    // Chrome 61 基线：不用 replaceChildren，逐个移除旧节点。
    while (this.comboBanner.firstChild) this.comboBanner.removeChild(this.comboBanner.firstChild);
    const main = document.createElement('div');
    main.className = 'combo-main';
    main.textContent = text || '';
    this.comboBanner.appendChild(main);
    if (subtext) {
      const sub = document.createElement('div');
      sub.className = 'combo-sub';
      sub.textContent = subtext;
      this.comboBanner.appendChild(sub);
    }
    // 强制 reflow 重启动画；旧 WebView 即使动画失败，也会由下方定时器隐藏。
    void this.comboBanner.offsetWidth;
    this.comboBanner.classList.add('show');
    clearTimeout(this._comboTimer);
    this._comboTimer = setTimeout(() => this.comboBanner.classList.remove('show'), 1400);
  }

  // 击杀播报（F3）：显示武器名 + 爆头标识
  killFeed(name, weaponName, headshot) {
    const div = document.createElement('div');
    div.className = 'kill-msg';
    const headTag = headshot ? ' <span class="hm-tag">爆头</span>' : '';
    div.innerHTML = `<span class="you">你</span> ✕ ${name}${headTag}<small>${weaponName || ''}</small>`;
    this.killFeedEl.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  // 命中标记（F1-F3）：白 X / 爆头金放大 / 击杀更大更久
  // 音效已移交 weapon 调用（H-7 修复），本方法只做视觉。
  // 性能：弹出动画用 Web Animations API 重启，M249 全自动 12.5 次/秒
  // 不再每次强制回流（旧实现 void offsetWidth 在真机上造成可感顿挫）；
  // 不支持 WAAPI 的旧 WebView 回退 class+reflow 原路径。
  hitMarker(head, killed) {
    const el = this.hitmarker;
    if (!el) return;
    clearTimeout(this._hitMarkerTimer);
    el.classList.remove('show', 'head', 'kill');
    if (killed) el.classList.add('show', 'kill');
    else if (head) el.classList.add('show', 'head');
    else el.classList.add('show');
    const duration = killed ? 300 : 180;
    if (typeof el.animate === 'function') {
      if (this._hitMarkerAnim) {
        try { this._hitMarkerAnim.cancel(); } catch (e) { /* 已结束 */ }
      }
      const fromScale = killed ? 1.6 : 1.4;
      try {
        this._hitMarkerAnim = el.animate([
          { transform: 'translate(-50%, -50%) scale(' + fromScale + ')', opacity: 1 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }
        ], { duration: duration, easing: 'ease-out', fill: 'forwards' });
      } catch (err) { this._hitMarkerAnim = null; }
    } else {
      void el.offsetWidth;   // 旧 WebView 回退：强制 reflow 重启动画
    }
    // 动画结束后显式清类，兼容部分 WebView 不执行 animation-fill-mode
    // 或动画被系统省电策略暂停的情况，保证 X 不会变成常驻准星。
    const cleanup = killed ? 320 : (head ? 220 : 190);
    this._hitMarkerTimer = setTimeout(() => {
      el.classList.remove('show', 'head', 'kill');
    }, cleanup);
  }

  hideHitMarker() {
    clearTimeout(this._hitMarkerTimer);
    if (this._hitMarkerAnim) {
      try { this._hitMarkerAnim.cancel(); } catch (e) { /* 已结束 */ }
    }
    if (this.hitmarker) this.hitmarker.classList.remove('show', 'head', 'kill');
  }

  // 射击反馈（D3）：准星短暂扩张 + 变红（80ms）
  crosshairFire() {
    if (!this.crosshair) return;
    this.crosshair.classList.add('firing');
    clearTimeout(this._fireFlashTimer);
    this._fireFlashTimer = setTimeout(() => {
      this.crosshair.classList.remove('firing');
    }, 80);
  }

  // 设置准星样式：样式只改变 HUD 外观，不影响命中判定或动态散布。
  setCrosshairStyle(style) {
    const next = CROSSHAIR_STYLE_IDS.includes(style) ? style : 'classic';
    if (!this.crosshair) return next;
    this.crosshair.classList.remove(...CROSSHAIR_STYLE_IDS.map(id => `style-${id}`));
    this.crosshair.classList.add(`style-${next}`);
    this.crosshair.dataset.style = next;
    this.crosshairStyle = next;
    return next;
  }

  // 世界坐标 → 内容坐标（飘字投影用；#gameRoot 旋转态需屏幕系→内容系逆变换，LESSONS#16）
  // 性能：旋转内容高度只在 resize/旋转时变化，缓存之——M249 扫射时每次
  // 飘字都读 clientHeight 会形成强制回流串。
  refreshLayoutCaches() {
    this._rotatedContentHeight = (this.dmgLayer && this.dmgLayer.clientHeight) || window.innerWidth;
  }

  worldToScreen(point, camera) {
    const v = point.clone().project(camera);
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    // 旋转态（body.rotated，即 #gameRoot rotate(90deg) translateY(-100%)）：
    // 内容x = 屏幕y，内容y = 内容高 - 屏幕x
    if (document.body.classList.contains('rotated')) {
      if (this._rotatedContentHeight === null || this._rotatedContentHeight === undefined) {
        this.refreshLayoutCaches();
      }
      const ch = this._rotatedContentHeight;
      return { x: sy, y: ch - sx };
    }
    return { x: sx, y: sy };
  }

  // 伤害飘字（N4：命中点显示 -24 / -96，爆头金色放大，650ms 上浮淡出）
  showDamageNumber(amount, x, y, isHead) {
    if (!this.dmgLayer) return;
    let el = this._dmgPool.pop();
    if (!el) {
      el = document.createElement('div');
      el.className = 'dmg-num';
      this.dmgLayer.appendChild(el);
    }
    el.textContent = `-${Math.ceil(amount)}`;
    el.classList.remove('head', 'show');
    if (isHead) el.classList.add('head');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.classList.add('show');
    this._dmgActive.push(el);
    // 650ms 后回收
    setTimeout(() => {
      el.classList.remove('show');
      const idx = this._dmgActive.indexOf(el);
      if (idx >= 0) this._dmgActive.splice(idx, 1);
      if (this._dmgPool.length < 10) this._dmgPool.push(el);
    }, 650);
  }

  // 空仓告警（D2 视觉侧）：弹药数字红色闪烁 + RELOAD 提示
  setAmmoWarning(mode) {
    if (mode === 'empty') {
      this.ammoMag.classList.add('ammo-empty');
      this.toast('弹匣空了！按 R 换弹');
    } else {
      this.ammoMag.classList.remove('ammo-empty');
    }
  }

  // 准星扩散：spread(弧度) → 屏幕像素偏移（脏检查，值不变不写 DOM）
  setCrosshairSpread(rad) {
    const px = Math.min(46, Math.round(rad * 520));
    if (px === this._lastCrossGap) return;
    this._lastCrossGap = px;
    this.crosshair.style.setProperty('--gap', px + 'px');
  }

  damageFlash() {
    this.damageFlashEl.classList.add('show');
    if (this.audio) this.audio.hurt();
    setTimeout(() => this.damageFlashEl.classList.remove('show'), 300);
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1100);
  }

  // 近战重击屏幕震动（精英/王牌近战触发）
  _onMelee() {
    const el = this.el;
    el.style.transition = 'transform 0.08s';
    const shake = () => {
      el.style.transform = `translate(${(Math.random() - 0.5) * 6}px, ${(Math.random() - 0.5) * 6}px)`;
      setTimeout(() => { el.style.transform = ''; }, 80);
    };
    shake(); setTimeout(shake, 60); setTimeout(shake, 120);
  }

  showMenu() { this.menu.classList.remove('hidden'); }
  hideMenu() { this.menu.classList.add('hidden'); }

  // extras 可选（V4/V5）：{ endLine, highlight } —— 胜负主题台词副行与本局高光行。
  showResult(win, stats, extras) {
    this.resultTitle.textContent = win ? '回合胜利' : '你已阵亡';
    this.resultTitle.style.color = win ? '#4ade60' : '#ff4040';
    let html = '';
    for (const [k, v] of Object.entries(stats)) {
      html += `<div>${k}：<b>${v}</b></div>`;
    }
    this.resultStats.innerHTML = html;
    // V5 主题台词副行：内容缺省时隐藏，不占版面。
    if (this.resultEndLine) {
      const line = extras && typeof extras.endLine === 'string' ? extras.endLine : '';
      this.resultEndLine.textContent = line;
      this.resultEndLine.classList.toggle('hidden', !line);
    }
    // V4 本局高光行：数据由 main 传入现成文案，追加在统计区之后。
    if (this.resultHighlight) {
      const hl = extras && typeof extras.highlight === 'string' ? extras.highlight : '';
      this.resultHighlight.textContent = hl;
      this.resultHighlight.classList.toggle('hidden', !hl);
    }
    this.result.classList.remove('hidden');
  }
  hideResult() { this.result.classList.add('hidden'); }

  showPause() { this.pause.classList.remove('hidden'); }
  hidePause() { this.pause.classList.add('hidden'); }

  showClickHint() { this.clickHint.classList.remove('hidden'); }
  hideClickHint() { this.clickHint.classList.add('hidden'); }

  // ---------- 小地图 ----------
  setMinimapRefs(gameMap, player, enemiesGetter, pickupsGetter) {
    this._minimapRefs = { gameMap, player, enemiesGetter, pickupsGetter };
  }

  setMinimapVisible(enabled) {
    this._minimapVisible = enabled !== false;
    if (this.minimapWrap) this.minimapWrap.classList.toggle('hidden', !this._minimapVisible);
  }

  drawMinimap() {
    const refs = this._minimapRefs;
    if (!this._minimapVisible || !refs || !this.minimapCtx) return;
    // 节流：每 100ms 重绘一次（原每帧全量 Canvas 绘制，手机上开销不小）
    const now = performance.now();
    if (now - (this._mmLastDraw || 0) < 100) return;
    this._mmLastDraw = now;
    const { gameMap, player, enemiesGetter, pickupsGetter } = refs;
    const ctx = this.minimapCtx;
    const W = this.minimap.width, H = this.minimap.height;
    const b = gameMap.bounds;
    const worldW = b.maxX - b.minX;
    const worldH = b.maxZ - b.minZ;
    // 留 4px 边距
    const pad = 4;
    const sx = (W - pad * 2) / worldW;
    const sz = (H - pad * 2) / worldH;
    const scale = Math.min(sx, sz);

    // 清屏
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, W, H);

    const wx = (x) => pad + (x - b.minX) * scale;
    const wz = (z) => pad + (z - b.minZ) * scale;

    // 墙体
    ctx.fillStyle = 'rgba(120,120,140,0.9)';
    for (const box of gameMap.boxes) {
      const x = wx(box.minX);
      const y = wz(box.minZ);
      const w = (box.maxX - box.minX) * scale;
      const h = (box.maxZ - box.minZ) * scale;
      ctx.fillRect(x, y, w, h);
    }

    // 敌人
    const enemies = enemiesGetter();
    ctx.fillStyle = '#ff4040';
    for (const en of enemies) {
      if (!en.alive) continue;
      const x = wx(en.position.x);
      const y = wz(en.position.z);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 补给包（血包绿色 / 弹药包琥珀色方块）
    if (pickupsGetter) {
      for (const pk of pickupsGetter()) {
        if (!pk.active) continue;
        ctx.fillStyle = pk.type === 'ammo' ? '#f5b53a' : '#4ade60';
        const x = wx(pk.pos.x);
        const y = wz(pk.pos.z);
        ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      }
    }

    // 玩家（带朝向三角）
    const px = wx(player.position.x);
    const py = wz(player.position.z);
    // 朝向：yaw=0 时朝 -Z（地图向上）
    const dirX = -Math.sin(player.yaw);
    const dirZ = -Math.cos(player.yaw);
    const tipX = px + dirX * 8;
    const tipY = py + dirZ * 8;
    ctx.strokeStyle = '#4ade60';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = '#4ade60';
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 经典脚本全局暴露（依赖顺序：… → hud → audio → pickup → main）
window.HUD = HUD;
window.CS15_CROSSHAIR_STYLE_IDS = CROSSHAIR_STYLE_IDS;
