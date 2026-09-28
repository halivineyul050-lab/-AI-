// hud.js —— DOM HUD：血条/装甲条/波次得分/雷达小地图/横幅播报/boss 血条
// 雷达用 2D canvas：红点地面装甲、橙点空中单位、绿/蓝补给点、橙色楔形来向预警。
// 另含：击杀播报条、伤害飘字（世界坐标投影）、命中标记、低血警戒、主动技能冷却。

// 机型的显示名（击杀播报 / 战报共用）
const ENEMY_NAMES = {
  tank: '轻型坦克', buggy: '自爆突袭车', heavy: '重型坦克', artillery: '自行火炮',
  jet: '喷气战机', bomber: '轰炸机', gunship: '浮空炮艇',
};

class HUD {
  constructor() {
    this.elHp = document.getElementById('bar-hp-fill');
    this.elArmor = document.getElementById('bar-armor-fill');
    this.elWave = document.getElementById('hud-wave');
    this.elTheme = document.getElementById('hud-theme');
    this.elScore = document.getElementById('hud-score');
    this.elKills = document.getElementById('hud-kills');
    this.elWaveBanner = document.getElementById('wave-banner');
    this.elCombo = document.getElementById('combo-banner');
    this.elPickup = document.getElementById('pickup-toast');
    this.elBossWrap = document.getElementById('boss-bar-wrap');
    this.elBossFill = document.getElementById('bar-boss-fill');
    this.elBossName = document.getElementById('boss-name');
    this.elHeatWrap = document.getElementById('heat-wrap');
    this.elHeat = document.getElementById('bar-heat-fill');
    this.elReload = document.getElementById('reload-tip');
    this.elCrosshair = document.getElementById('crosshair');
    this.elViewTag = document.getElementById('view-tag');
    this.elKillFeed = document.getElementById('kill-feed');
    this.elDmgLayer = document.getElementById('dmg-layer');
    this.elLowHp = document.getElementById('low-hp-vignette');
    this.elHitMarker = document.getElementById('hit-marker');
    this.elEmp = document.getElementById('btn-emp');
    this.elEmpCd = document.getElementById('emp-cd');
    this.radar = document.getElementById('radar');
    this.radarCtx = this.radar.getContext('2d');

    this._bannerTimer = null;
    this._comboTimer = null;
    this._pickupTimer = null;
    this._lastRadarDraw = 0;
    this._fp = false;         // 当前是否第一人称（影响 view-tag 文案）
    this._fpLocked = false;   // 指针是否已锁定（决定 view-tag 是否提示 Esc 解锁）

    // 击杀播报 / 伤害飘字 / 低血警戒
    this._feedRows = [];
    this._dmgPool = [];
    this._lowHpOn = false;
    this._v3 = new THREE.Vector3();
    this._initDmgPool();
  }

  // 伤害飘字元素池：DOM 节点复用，避免每次命中都 createElement
  _initDmgPool() {
    if (!this.elDmgLayer) return;
    for (let i = 0; i < CONFIG.feedback.dmgPool; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      el.style.display = 'none';
      this.elDmgLayer.append(el);
      this._dmgPool.push({ el, alive: false, pos: new THREE.Vector3(), life: 0, maxLife: 1, jitter: 0 });
    }
  }

  show() { document.getElementById('hud').classList.remove('hidden'); }
  hide() { document.getElementById('hud').classList.add('hidden'); }

  // 第一人称：显示中心准星 + 角落的视角标识
  setViewMode(mode) {
    this._fp = mode === 'fp';
    if (this.elCrosshair) this.elCrosshair.classList.toggle('hidden', !this._fp);
    if (this.elViewTag) {
      this.elViewTag.classList.toggle('fp', this._fp);
      this.elViewTag.classList.remove('hidden');
    }
    this._refreshViewTag();
  }

  // 指针锁定状态回显：锁定时鼠标被 canvas 独占，HUD 按钮点不动，必须让玩家知道怎么退出
  setLockState(locked) {
    this._fpLocked = !!locked;
    this._refreshViewTag();
  }

  _refreshViewTag() {
    if (!this.elViewTag) return;
    if (!this._fp) this.elViewTag.textContent = 'TP 俯视视角';
    else if (this._fpLocked) this.elViewTag.textContent = 'FP · 鼠标已锁定（Esc 解锁）';
    else this.elViewTag.textContent = 'FP 炮塔视角 · 点击画面锁定鼠标';
  }

  update(player, wave, themeName, score, kills) {
    const hpPct = clamp(player.health / player.maxHealth, 0, 1) * 100;
    this.elHp.style.width = `${hpPct}%`;
    this.elHp.classList.toggle('low', hpPct < 30);
    this.elArmor.style.width = `${clamp(player.armor / player.armorMax, 0, 1) * 100}%`;
    this.elWave.textContent = `第 ${wave} 波`;
    this.elTheme.textContent = themeName || '';
    this.elScore.textContent = `${score} 分`;
    this.elKills.textContent = `${kills} 击杀`;

    // 机枪过热条 + 装填提示
    const heatPct = clamp(player.mgHeat, 0, 100);
    this.elHeat.style.width = `${heatPct}%`;
    if (heatPct > 4) this.elHeatWrap.classList.remove('hidden');
    else this.elHeatWrap.classList.add('hidden');
    if (player.reloadTimer > 0) {
      this.elReload.classList.remove('hidden');
      this.elReload.textContent = `装填中 ${player.reloadTimer.toFixed(1)}s`;
    } else if (player.mgLocked) {
      this.elReload.classList.remove('hidden');
      this.elReload.textContent = '机枪过热!';
    } else {
      this.elReload.classList.add('hidden');
    }
  }

  // ---- 雷达 ----
  drawRadar(player, enemies, pickups, incomingAngle, now) {
    if (now - this._lastRadarDraw < 66) return; // 15FPS 足够
    this._lastRadarDraw = now;
    const ctx = this.radarCtx;
    const S = 240, C = S / 2;
    const range = 55;
    ctx.clearRect(0, 0, S, S);

    // 底色与网格
    ctx.fillStyle = 'rgba(10, 16, 14, 0.55)';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(90, 200, 120, 0.14)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(C, C, (C - 6) * i / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 扫描线
    const sweep = (now * 0.0012) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(120, 220, 150, 0.35)';
    ctx.beginPath();
    ctx.moveTo(C, C);
    ctx.lineTo(C + Math.cos(sweep) * (C - 6), C + Math.sin(sweep) * (C - 6));
    ctx.stroke();

    const toRadar = (x, z) => {
      const dx = x - player.position.x;
      const dz = z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (d > range) return null;
      // 世界 -Z 为屏幕上方（与相机一致）
      return [C + dx / range * (C - 8), C + dz / range * (C - 8)];
    };

    // 补给点
    for (const it of pickups) {
      const pt = toRadar(it.model.position.x, it.model.position.z);
      if (!pt) continue;
      ctx.fillStyle = it.kind === 'heal' ? '#35d058' : '#4aa8ff';
      ctx.fillRect(pt[0] - 3, pt[1] - 3, 6, 6);
    }

    // 敌点
    for (const e of enemies) {
      if (!e.alive) continue;
      const pt = toRadar(e.position.x, e.position.z);
      if (!pt) continue;
      const isBoss = e.kind === 'gunship';
      ctx.fillStyle = e.isAir ? '#ff9a3a' : '#ff4a3a';
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], isBoss ? 6 : (e.tier > 0 ? 4.2 : 3), 0, Math.PI * 2);
      ctx.fill();
    }

    // 玩家中心 + 朝向
    ctx.fillStyle = '#d8f3dd';
    ctx.beginPath();
    ctx.arc(C, C, 4, 0, Math.PI * 2);
    ctx.fill();

    // 来向预警楔形（橙色扇形脉动）
    if (incomingAngle !== null && incomingAngle !== undefined) {
      const pulse = 0.4 + 0.3 * Math.sin(now * 0.012);
      ctx.fillStyle = `rgba(255, 150, 40, ${pulse})`;
      ctx.beginPath();
      ctx.moveTo(C, C);
      // 世界 A=atan2(dx,dz) → 画布角 θ=atan2(dz,dx)=π/2-A（雷达 x=dx、y=dz，-Z 朝上）
      const a = Math.PI / 2 - incomingAngle;
      ctx.arc(C, C, (C - 8) * 0.62, a - 0.5, a + 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---- 横幅 ----
  showWaveBanner(text, dur = 2.2) {
    this.elWaveBanner.textContent = text;
    this.elWaveBanner.classList.remove('hidden');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.elWaveBanner.classList.add('hidden'), dur * 1000);
  }

  showCombo(text) {
    this.elCombo.textContent = text;
    this.elCombo.classList.add('show');
    clearTimeout(this._comboTimer);
    this._comboTimer = setTimeout(() => this.elCombo.classList.remove('show'), 1300);
  }

  showPickup(text) {
    this.elPickup.textContent = text;
    this.elPickup.classList.add('show');
    clearTimeout(this._pickupTimer);
    this._pickupTimer = setTimeout(() => this.elPickup.classList.remove('show'), 2400);
  }

  // ---- boss 血条 ----
  updateBossBar(enemy) {
    if (!enemy || !enemy.alive) {
      this.elBossWrap.classList.add('hidden');
      return;
    }
    this.elBossWrap.classList.remove('hidden');
    // 威胁等级 = 实际最大 HP / 配置基数（旧写法把 300 硬编码在 HUD 里）
    const lv = Math.ceil(enemy.maxHp / CONFIG.waves.threatHpPerLevel);
    this.elBossName.textContent = `浮空炮艇 · ${enemy.tier >= 1 ? '精英 ' : ''}威胁等级 ${lv}`;
    this.elBossFill.style.width = `${clamp(enemy.hp / enemy.maxHp, 0, 1) * 100}%`;
  }

  hideBossBar() { this.elBossWrap.classList.add('hidden'); }

  // ---------- 击杀播报条 ----------
  // 结构：[武器] 摧毁 [阶层] 机名。阶层靠左侧色条区分，boss 单独高亮。
  pushKill(source, kind, tier) {
    if (!this.elKillFeed) return;
    const row = document.createElement('div');
    row.className = 'kf-row'
      + (tier === 1 ? ' tier1' : tier === 2 ? ' tier2' : '')
      + (kind === 'gunship' ? ' boss' : '');
    const src = document.createElement('span');
    src.className = 'kf-src';
    src.textContent = source;
    const mid = document.createTextNode(' 摧毁 ');
    const tgt = document.createElement('span');
    tgt.className = 'kf-target';
    const tierLabel = tier === 2 ? '老练 ' : tier === 1 ? '精英 ' : '';
    tgt.textContent = tierLabel + (ENEMY_NAMES[kind] || kind);
    row.append(src, mid, tgt);
    this.elKillFeed.append(row);
    this._feedRows.push({ el: row, life: CONFIG.killFeed.life, fading: false });
    // 超出上限：最旧一行立即移除
    while (this._feedRows.length > CONFIG.killFeed.max) {
      const old = this._feedRows.shift();
      old.el.remove();
    }
  }

  clearKillFeed() {
    for (const it of this._feedRows) it.el.remove();
    this._feedRows.length = 0;
  }

  _tickKillFeed(dt) {
    for (let i = this._feedRows.length - 1; i >= 0; i--) {
      const it = this._feedRows[i];
      it.life -= dt;
      if (!it.fading && it.life <= 0.4) { it.fading = true; it.el.classList.add('out'); }
      if (it.life <= 0) { it.el.remove(); this._feedRows.splice(i, 1); }
    }
  }

  // ---------- 伤害飘字 ----------
  // pos：世界坐标（会被克隆，调用方可复用临时向量）
  spawnDamage(pos, amount, opts = {}) {
    const it = this._dmgPool.find((p) => !p.alive);
    if (!it) return;                        // 池耗尽静默丢弃，保帧率
    const dmg = Math.max(1, Math.round(amount));
    it.alive = true;
    it.pos.copy(pos);
    it.life = it.maxLife = CONFIG.feedback.dmgLife;
    it.jitter = rand(-10, 10);
    it.el.textContent = opts.crit ? `暴击 ${dmg}` : String(dmg);
    it.el.className = 'dmg-num' + (opts.crit ? ' crit' : '') + (opts.kill ? ' kill' : '');
    it.el.style.display = 'block';
    it.el.style.opacity = '1';
  }

  clearDamage() {
    for (const it of this._dmgPool) { it.alive = false; it.el.style.display = 'none'; }
  }

  // 每帧把飘字的世界坐标投影到屏幕（含上浮与淡出）
  updateDamage(dt, camera) {
    if (this._dmgPool.length === 0) return;
    camera.updateMatrixWorld();
    const w = window.innerWidth, h = window.innerHeight;
    for (const it of this._dmgPool) {
      if (!it.alive) continue;
      it.life -= dt;
      if (it.life <= 0) { it.alive = false; it.el.style.display = 'none'; continue; }
      it.pos.y += dt * 1.7;
      this._v3.copy(it.pos).project(camera);
      if (this._v3.z > 1) { it.el.style.display = 'none'; continue; }  // 相机背后
      const x = (this._v3.x * 0.5 + 0.5) * w + it.jitter;
      const y = (-this._v3.y * 0.5 + 0.5) * h;
      const k = it.life / it.maxLife;
      it.el.style.display = 'block';
      it.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${(0.85 + (1 - k) * 0.25).toFixed(3)})`;
      it.el.style.opacity = String(Math.min(1, k * 2.2));
    }
  }

  // ---------- 命中标记 ----------
  hitMarker(kill = false) {
    const el = this.elHitMarker;
    if (!el) return;
    el.classList.remove('hit', 'kill');
    void el.offsetWidth;                    // 强制回流以重启动画
    el.classList.add(kill ? 'kill' : 'hit');
  }

  // ---------- 低血警戒 ----------
  setLowHp(on) {
    if (on === this._lowHpOn) return;
    this._lowHpOn = on;
    if (this.elLowHp) this.elLowHp.classList.toggle('on', on);
  }

  // ---------- 主动技能冷却 ----------
  updateAbility(cd) {
    if (!this.elEmp) return;
    if (cd > 0) {
      this.elEmp.classList.add('cooling');
      this.elEmp.classList.remove('ready');
      if (this.elEmpCd) this.elEmpCd.textContent = cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1);
    } else {
      this.elEmp.classList.remove('cooling');
      this.elEmp.classList.add('ready');
      if (this.elEmpCd) this.elEmpCd.textContent = '';
    }
  }

  // ---------- 每帧反馈推进 ----------
  tickFeedback(dt, camera) {
    this._tickKillFeed(dt);
    this.updateDamage(dt, camera);
  }

  // 开新局时清空所有反馈层残留
  clearFeedback() {
    this.clearKillFeed();
    this.clearDamage();
    this.setLowHp(false);
  }
}

window.HUD = HUD;
