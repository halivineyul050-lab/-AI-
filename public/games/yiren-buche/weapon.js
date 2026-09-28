// weapon.js —— 玩家武器系统
// 职责：管理当前武器、射击（射线检测命中敌人/墙）、换弹、武器切换、
//        后坐力、弹道散布、第一人称枪模、弹孔/枪口火光等视觉反馈
// 射击命中判定：从相机发出带散布的射线，与敌人分部命中网格做三角级求交，
//                并与地图 AABB 比较——若墙更近则被墙挡住。
// 经典脚本（非 ES Module）：THREE / CONFIG 由前置脚本挂到 window 提供

// _fire 散布采样用的相机右/上向量草稿（每发子弹复用，避免全自动武器
// 高射速下的高频临时分配；_fire 单线程非重入，静态复用安全）
const FIRE_SPREAD_RIGHT = new THREE.Vector3();
const FIRE_SPREAD_UP = new THREE.Vector3();

class WeaponSystem {
  constructor(scene, camera, player, gameMap, enemies, hud, audio) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.map = gameMap;
    this.enemies = enemies;     // 引用数组（动态）
    this.hud = hud;
    this.audio = audio;
    this.onEnemyKilled = null;

    // 局内强化修正（main 的强化卡注入，reset 清零）：乘/加作用于伤害、射速、
    // 换弹、弹匣与爆头倍率；未注入时全部为中性默认值。
    this.upgrades = this._freshUpgrades();

    // 当前武器
    this.currentId = 'usp';
    this.state = this._freshState('usp');
    // 出战配置清单（reset(loadout) 注入）：为空数组/null 时视为携带全部武器，
    // 兼容测试桩与旧调用方。数字键、切枪与弹药补给都按这份清单过滤。
    this._inventory = null;

    // 输入
    this.firing = false;        // 鼠标按下持续射击
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.switching = false;
    this._switchAnim = 0;       // 切枪动画进度 0→1
    this._spreadCurrent = 0;    // 连发散布累积值
    this._scopeZoomed = false;  // 瞄准镜放大状态（KeyC 切换）
    this._semiPending = false;
    this._lastFirearmId = 'usp';
    this._autoSwitchTimer = 0;
    this._meleeSwing = 0;
    this._throwAnim = 0;
    this._firePointerId = null; // FIRE 按住拖动转视角时的指针 id（真机流畅化）
    this._bindInput();

    // 第一人称枪模
    this._muzzleTexture = null;
    this._muzzleFlameTexture = null;
    this._buildViewModel();
    // 初始武器为 USP：隐藏 AWP 专属开镜按钮（只有 AWP 有 fov 才显示）
    const scopeBtn0 = document.getElementById('btnScope');
    if (scopeBtn0) scopeBtn0.classList.add('hidden');
    // 弹道轨迹池（临时线段）
    this._tracers = [];
    this._impacts = [];         // 弹孔
    this._buildImpactPool();
    // 高精度命中：复用单条 Raycaster（三角级精确求交）
    this.raycaster = new THREE.Raycaster();
    // 平衡骨骼敌人的贴合分段命中网格位于 layer 1；保留 layer 0 兼容旧模型兜底。
    this.raycaster.layers.enable(1);
    this._hitscanCandidates = [];
    this._hitscanTargets = [];
    this.performanceStats = { hitscanShots: 0, broadphaseCandidates: 0, preciseMeshes: 0 };
    this._buildHitPool();
    // 枪口火光
    this._muzzleTimer = 0;
    // 弹壳系统（池化 + 重力物理）
    this._shellPool = [];
    this._shells = [];
    this._buildShellPool();
    // M26 投掷物与爆炸视觉保持严格小池，避免连续波次中创建无上限对象。
    this._grenades = [];
    this._explosionPool = [];
    this._explosions = [];
    this._buildGrenadeEffects();
    this._viewYawDir = 1;   // 本次射击枪模左右扭向（_spawnMuzzleFlash 随机）
  }

  _freshUpgrades() {
    return { damageMul: 1, fireRateMul: 1, reloadTimeMul: 1, magMul: 1, headMultBonus: 0 };
  }

  // V7 magMul 判定统一键：无 kind（经典枪械）或 kind='firearm' 参与弹匣扩容；
  // kind='grenade'（每局两枚契约）与 kind='melee'（m9 magSize=0）完全豁免。
  // _freshState 建态、applyUpgrade 立即补满/备弹补给、reload 判定共用同一语义。
  _magMulEligible(w) {
    return !w.kind || w.kind === 'firearm';
  }

  // 当前武器实际弹匣容量（V6）：经典枪械 = magSize × magMul（扩容卡 30→39），
  // 其余武器用配置原值。换弹“弹匣是否满”判定、补满目标与 HUD 弹药比分同源。
  currentMagSize() {
    const w = CONFIG.weapons[this.currentId];
    if (!w) return 0;
    const base = Number.isFinite(w.magSize) ? w.magSize : 0;
    if (!this._magMulEligible(w)) return base;
    return Math.round(base * ((this.upgrades && this.upgrades.magMul) || 1));
  }

  _freshState(id) {
    const w = CONFIG.weapons[id];
    const magMul = (this.upgrades && this.upgrades.magMul) || 1;
    return {
      id,
      // 手雷/近战豁免弹匣扩容（V7 判定键统一）：“每局两枚”契约（mag 即持有枚数，
      // 恒等于 magSize），否则拿到弹匣卡后首次切到手雷会被 _freshState 放大到 3。
      mag: Number.isFinite(w.magSize)
        ? (this._magMulEligible(w) ? Math.round(w.magSize * magMul) : w.magSize)
        : 0,
      reserve: Number.isFinite(w.reserve) ? w.reserve : 0,
    };
  }

  // 强化卡效果（CONFIG.upgrades.cards 的 kind=weapon 项）：mul 乘算叠加、add 加算，
  // instant 为一次性补给；弹匣扩容立即按新容量补满当前弹匣。
  applyUpgrade(key, value, mode) {
    const u = this.upgrades || (this.upgrades = this._freshUpgrades());
    const w = CONFIG.weapons[this.currentId];
    if (key === 'damageMul') u.damageMul *= mode === 'mul' ? value : 1;
    else if (key === 'fireRateMul') u.fireRateMul *= mode === 'mul' ? value : 1;
    else if (key === 'reloadTimeMul') u.reloadTimeMul *= mode === 'mul' ? value : 1;
    else if (key === 'magMul') {
      u.magMul *= mode === 'mul' ? value : 1;   // 全局乘数保留（后续枪械仍生效）
      // 手雷/近战当前持有时跳过立即补满：弹匣+30% 会把 2 放大到 3，违反“每局两枚”契约。
      if (this._magMulEligible(w)) {
        this.state.mag = Math.round(w.magSize * u.magMul);
        this.hud.updateWeapon(w, this.state, this.currentMagSize());
      }
    } else if (key === 'headMultBonus') u.headMultBonus += value;
    else if (key === 'resupply') {
      this.addGrenades(value);
      if (this._magMulEligible(w)) {
        this.state.reserve = w.reserve;
        this.hud.updateWeapon(w, this.state, this.currentMagSize());
      }
    }
  }

  _bindInput() {
    this._onMouseDown = (e) => {
      if (e.button === 0) this.firing = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.firing = false;
    };
    this._onKeyDown = (e) => {
      if (e.code === 'KeyR') this.startReload();
      // 数字键按携带清单的第 N 件切换；未注入清单（测试桩/旧档）时回退全武器固定槽位。
      const digitMatch = /^Digit([1-9])$/.exec(e.code);
      if (digitMatch) {
        const index = Number(digitMatch[1]) - 1;
        const inventory = this._inventory;
        const fallback = ['usp', 'ak47', 'awp', 'm249', 'm9', 'grenade'];
        const target = inventory && inventory.length
          ? inventory[index]
          : fallback[index];
        if (target) this.switchTo(target);
      }
      if (e.code === 'KeyC') this._toggleScopeZoom();
    };
    // 触屏设备：原生 mouse 事件会由"点击屏幕视角区"合成触发导致误开火，
    // 因此只保留键盘；射击统一走 FIRE 按钮的 setFiring()
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!isTouch) {
      window.addEventListener('mousedown', this._onMouseDown);
      window.addEventListener('mouseup', this._onMouseUp);
    }
    window.addEventListener('keydown', this._onKeyDown);
  }

  // 触屏 FIRE 按钮 / 外部直接控制持续射击状态（自动武器）
  setFiring(v) {
    this.firing = v;
  }

  switchTo(id) {
    if (id === this.currentId) return;
    if (!CONFIG.weapons[id]) return;
    // 出战配置外的武器不在本局清单内，忽略切换请求（数字键/循环/耗尽切枪共用此守卫）。
    if (this._inventory && this._inventory.length && this._inventory.indexOf(id) < 0) return;
    const w = CONFIG.weapons[id];
    // 保留每种武器的弹匣状态
    if (!this._stash) this._stash = {};
    this._stash[this.currentId] = Object.assign({}, this.state);
    this.currentId = id;
    this.state = this._stash[id] ? Object.assign({}, this._stash[id]) : this._freshState(id);
    this._autoSwitchTimer = 0;
    if (!w.kind || w.kind === 'firearm') this._lastFirearmId = id;
    // 连发散布属于当前武器的瞬时状态，切枪后不能把上一把枪的累积带过来。
    this._spreadCurrent = 0;
    this.reloadTimer = 0;
    // 复位全部换弹弹夹（防换弹中途切枪残留：滑出/隐藏状态归位）
    if (this._viewGuns) {
      for (const key in this._viewGuns) {
        const mg = this._viewGuns[key].userData.reloadMag;
        if (mg) { mg.visible = false; mg.position.y = mg.userData.baseY || 0; }
      }
    }
    this._semiPending = false;               // 修 H-10：清半自动挂起，防止切枪后意外开火
    this.fireCooldown = w.switchTime || 0.3; // 切枪冷却 = config switchTime（数据驱动）
    this.firing = false;
    this._hideAllMuzzleFlashes();
    // 切枪动画状态机（F5）：下放→上抬
    this._switchAnim = 0;
    this.switching = true;
    // 切枪音（F6）
    if (this.audio) this.audio.switch(id);
    this.hud.updateWeapon(w, this.state, this.currentMagSize());
    this.hud.toast(w.name);
    // 武器级移速惩罚（蓝图：AWP 携带 -25%）
    if (this.player) {
      this.player.weaponSpeedMul = (w.moveSpeedMul != null) ? w.moveSpeedMul : 1;
      this.player.aimSensitivityMul = 1;
    }
    // 切枪时统一关镜并复位 FOV，避免上一把狙击枪的视觉状态串到新武器。
    this.clearScopeZoom(false);
  }

  // 切换瞄准镜放大/正常（仅对带 fov 的武器如 AWP 生效）
  // 公共方法：键盘 KeyC 与触屏"镜"按钮共用
  toggleScopeZoom() {
    const w = CONFIG.weapons[this.currentId];
    if (!w.fov || !this.camera) return;   // 非狙击武器无放大
    this._scopeZoomed = !this._scopeZoomed;
    if (this.player) this.player.aimSensitivityMul = this._scopeZoomed ? (CONFIG.player.scopeSensitivityMul || 0.72) : 1;
    // 蓝图：开镜瞄准速度中等偏慢 → FOV 平滑过渡（update 内插值），不瞬间切换
    this._fovTarget = this._scopeZoomed ? w.fov : CONFIG.fov;
    // 瞄准镜画面：开镜显示镜筒+十字线并隐藏普通准星，关镜恢复
    const ov = document.getElementById('scopeOverlay');
    const ch = document.getElementById('crosshair');
    if (ov) ov.classList.toggle('hidden', !this._scopeZoomed);
    if (ch) ch.classList.toggle('hidden', this._scopeZoomed);
    if (this.hud) this.hud.toast(this._scopeZoomed ? '开镜' : '关镜');
  }
  _toggleScopeZoom() { this.toggleScopeZoom(); }

  // 统一清理开镜状态：切枪、换弹、新局和死亡结算都走同一条路径。
  // hideScopeButton 仅用于结算态，避免结果页仍露出 AWP 专属操作。
  clearScopeZoom(hideScopeButton = false) {
    this._scopeZoomed = false;
    this._fovTarget = CONFIG.fov;
    if (this.camera) {
      this.camera.fov = CONFIG.fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.player) this.player.aimSensitivityMul = 1;
    const ov = document.getElementById('scopeOverlay');
    const ch = document.getElementById('crosshair');
    if (ov) ov.classList.add('hidden');
    if (ch) ch.classList.remove('hidden');
    const scopeBtn = document.getElementById('btnScope');
    const w = CONFIG.weapons[this.currentId];
    if (scopeBtn) scopeBtn.classList.toggle('hidden', hideScopeButton || !w || !w.fov);
  }

  startReload() {
    const w = CONFIG.weapons[this.currentId];
    if (w.reloadable === false || (w.kind && w.kind !== 'firearm')) return;
    if (this.reloadTimer > 0) return;
    // V6：弹匣“是否满”按实际容量判定（扩容卡后 magMul 的 39），而不是配置 magSize。
    if (this.state.mag >= this.currentMagSize()) return;
    if (this.state.reserve <= 0) {
      // 备弹为 0：差异化提示（M-9）
      this.hud.toast('备弹耗尽！');
      return;
    }
    this.reloadTimer = w.reloadTime * (this.upgrades ? this.upgrades.reloadTimeMul : 1);
    // 换弹与切枪一致：重置开镜（FOV 回默认值 + 复原普通准星）
    this.clearScopeZoom(false);
    // 换弹音效接入（D1）
    if (this.audio) this.audio.reload();
    this.hud.toast('换弹中…');
  }

  _finishReload() {
    const w = CONFIG.weapons[this.currentId];
    // V6：补满目标 = 实际弹匣容量（magMul 后的 39），与换弹判定、HUD 比分同源。
    const need = this.currentMagSize() - this.state.mag;
    const take = Math.min(need, this.state.reserve);
    this.state.mag += take;
    this.state.reserve -= take;
    this.reloadTimer = 0;
    this.hud.updateWeapon(w, this.state, this.currentMagSize());
  }

  // 本局携带清单（出战配置注入）；未注入时返回全武器固定顺序，调用方无需判空。
  getInventory() {
    if (this._inventory && this._inventory.length) return this._inventory.slice();
    return ['usp', 'ak47', 'awp', 'm249', 'm9', 'grenade'];
  }

  // 弹药包补给：当前枪与已暂存过的枪都补，各自封顶在初始储备（reserve）
  // 返回 { added, parts }：added=是否有任何补到，parts=['USP +12', ...] 供提示
  addAmmo(refill) {
    const parts = [];
    for (const id of Object.keys(refill)) {
      const w = CONFIG.weapons[id];
      if (!w) continue;
      // 没带进本局的武器不消耗补给，也不产生提示。
      if (this._inventory && this._inventory.length && this._inventory.indexOf(id) < 0) continue;
      let before, after;
      if (id === this.currentId) {
        before = this.state.reserve;
        after = Math.min(w.reserve, before + refill[id]);
        if (after > before) {
          this.state.reserve = after;
          this.hud.updateWeapon(w, this.state, this.currentMagSize());
        }
      } else if (this._stash && this._stash[id]) {
        before = this._stash[id].reserve;
        after = Math.min(w.reserve, before + refill[id]);
        if (after > before) this._stash[id].reserve = after;
      } else {
        continue;   // 从未切过的枪储备仍是初始满值，无可补
      }
      if (after > before) parts.push(`${w.name} +${after - before}`);
    }
    return { added: parts.length > 0, parts };
  }

  // 手榴弹专用补给：只补当前或已经暂存过的 grenade 状态；从未切换过时
  // 仍保持初始满库存，不凭空制造额外储备。返回实际增加量，供拾取物提示。
  addGrenades(amount) {
    const w = CONFIG.weapons.grenade;
    const requested = Math.max(0, Math.floor(Number(amount) || 0));
    if (!w || requested <= 0) return { added: false, amount: 0 };

    let before = 0;
    let after = 0;
    if (this.currentId === 'grenade') {
      before = Math.max(0, Math.min(w.magSize, Number(this.state && this.state.mag) || 0));
      after = Math.min(w.magSize, before + requested);
      if (after > before) {
        this.state.mag = after;
        if (this.hud && typeof this.hud.updateWeapon === 'function') {
          this.hud.updateWeapon(w, this.state, this.currentMagSize());
        }
      }
    } else if (this._stash && this._stash.grenade) {
      before = Math.max(0, Math.min(w.magSize, Number(this._stash.grenade.mag) || 0));
      after = Math.min(w.magSize, before + requested);
      if (after > before) this._stash.grenade.mag = after;
    } else {
      // 没有切过 grenade 就代表其独立状态仍是初始的 2 枚，不消耗补给包。
      return { added: false, amount: 0 };
    }
    return { added: after > before, amount: Math.max(0, after - before) };
  }

  // ---------- 主更新 ----------
  update(dt) {
    if (this._autoSwitchTimer > 0) {
      this._autoSwitchTimer -= dt;
      if (this._autoSwitchTimer <= 0 && this.currentId === 'grenade' && this.state.mag <= 0) {
        const fallback = CONFIG.weapons[this._lastFirearmId] ? this._lastFirearmId : 'usp';
        this.switchTo(fallback);
      }
    }
    const w = CONFIG.weapons[this.currentId];

    // 换弹
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload();
    }

    // 射击冷却
    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    // 开镜/关镜 FOV 平滑过渡（蓝图：重型狙击镜开镜速度中等偏慢，~0.25s）
    if (this._fovTarget != null && this.camera) {
      const cur = this.camera.fov, tgt = this._fovTarget;
      if (Math.abs(cur - tgt) > 0.05) {
        const k = 1 - Math.exp(-11 * dt);   // 指数趋近（帧率无关）
        this.camera.fov = cur + (tgt - cur) * k;
        this.camera.updateProjectionMatrix();
      } else if (cur !== tgt) {
        this.camera.fov = tgt;
        this.camera.updateProjectionMatrix();
      }
    }

    // 连发散布：未开火时按 spreadDecay 恢复（P1 S1）
    if (this._spreadCurrent > 0) {
      this._spreadCurrent = Math.max(w.spread, this._spreadCurrent - w.spreadDecay * dt);
    }

    // 持续射击（自动武器）
    const wantFire = this.firing && w.type === 'auto';
    const wantFireSemi = this._semiPending;
    if ((wantFire || wantFireSemi) && this.fireCooldown <= 0 && this.reloadTimer <= 0 && !this.switching) {
      this._fire();
      this._semiPending = false;
    }

    // 准星扩散与当前散布联动（静止收拢、移动张开 + 连发累积，所见即所射）
    const hSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const moveFactor = Math.min(1, hSpeed / CONFIG.player.walkSpeed);
    const curSpread = (this._spreadCurrent || w.spread) + w.spreadMove * moveFactor;
    this.hud.setCrosshairSpread(curSpread);

    // 枪模动画
    this._updateViewModel(dt);

    // 弹壳物理
    this._updateShells(dt);

    // M26 投掷物物理与爆炸池
    this._updateGrenades(dt);
    this._updateExplosions(dt);

    // 弹道/弹孔淡出
    this._updateTracers(dt);

    // 枪口火光衰减（只写入已登记的发光部件，避免每帧 traverse 整把枪模）
    if (this._muzzleTimer > 0) {
      this._muzzleTimer -= dt;
      const gun = this._viewGuns && this._viewGuns[this.currentId];
      const flash = gun && gun.userData.flash;
      if (flash) {
        const duration = this._effectDuration((CONFIG.performance && CONFIG.performance.muzzleDuration) || 0.075);
        this._setMuzzleOpacity(flash, Math.max(0, this._muzzleTimer / duration));
      }
    }
  }

  // 切枪动画状态机（F5）：下放（0-0.5）→ 上抬（0.5-1），时长 config.switchTime
  // 在 _updateViewModel 内推进并应用（避免跨函数引用 bob）
  _updateSwitchAnim(dt) {
    if (!this.switching) return null;
    const w = CONFIG.weapons[this.currentId];
    const st = w.switchTime || 0.3;
    this._switchAnim += dt / st;
    if (this._switchAnim >= 1) {
      this._switchAnim = 1;
      this.switching = false;
    }
    const t = this._switchAnim;
    // 下放段 t<0.5：枪下降 + 前倾；上抬段 t>0.5：回位
    const down = t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5;   // 0→1→0
    return { y: -down * 0.30, r: -down * 0.55 };
  }

  // 半自动：鼠标按下触发一次（冷却/换弹/切枪中忽略，防幽灵子弹 M-8）
  triggerSemi() {
    const w = CONFIG.weapons[this.currentId];
    if (w.type !== 'semi') return;
    if (this.fireCooldown > 0 || this.reloadTimer > 0 || this.switching) return;
    this._semiPending = true;
  }

  _fire() {
    const w = CONFIG.weapons[this.currentId];
    if (w.kind === 'melee') {
      this._fireMelee(w);
      return;
    }
    if (w.kind === 'grenade') {
      this._throwGrenade(w);
      return;
    }
    if (this.state.mag <= 0) {
      // 空仓（D2）：咔嗒音 + 红字告警 + 备弹 0 差异化文案
      if (this.audio) this.audio.dryFire();
      this.hud.setAmmoWarning('empty');
      this.fireCooldown = 0.2;
      this.firing = false;
      if (w.autoReload) this.startReload();
      return;
    }
    this.state.mag--;
    this.fireCooldown = w.fireRate / (this.upgrades ? this.upgrades.fireRateMul : 1);
    this.hud.updateWeapon(w, this.state, this.currentMagSize());
    this.hud.crosshairFire();

    // 连发散布累积（P1 S1）：AK 每发 +spreadInc，USP 不累积
    if (w.spreadInc > 0) {
      this._spreadCurrent = Math.min(w.spreadMax, (this._spreadCurrent || w.spread) + w.spreadInc);
    }

    // 计算弹道方向（带散布）
    const ray = this.player.getAimRay();
    // 移动时散布更大（叠加连发累积值）
    const hSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const moveFactor = Math.min(1, hSpeed / CONFIG.player.walkSpeed);
    const spread = (this._spreadCurrent || w.spread) + w.spreadMove * moveFactor;
    const dir = ray.direction.clone();
    // 在"屏幕平面"内做圆盘均匀采样（用相机右/上向量做基），
    // 保证弹孔分布始终落在准星扩散范围内，且朝向任意角度都不会畸变
    if (spread > 0) {
      const right = FIRE_SPREAD_RIGHT.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = FIRE_SPREAD_UP.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const ang = Math.random() * Math.PI * 2;
      const rad = spread * Math.sqrt(Math.random());
      dir.addScaledVector(right, Math.cos(ang) * rad)
         .addScaledVector(up, Math.sin(ang) * rad)
         .normalize();
    }

    const origin = ray.origin.clone();

    // 后坐力
    this.player.applyRecoil(Object.assign({}, w.recoil, { pattern: w.recoilPattern }));

    // ---- 高精度命中：Three.js Raycaster 对敌人真实网格做三角级求交 ----
    const hit = this._hitscan(origin, dir, w.range);
    // 墙遮挡：经典地图求交 AABB，港口地图求交真实模型网格（含命中面法线）
    const wall = this.map.raycastDetailed(origin, dir, w.range);

    // 视觉：弹道轨迹终点（取最近命中点：敌人 / 墙 / 最大射程）
    let endT = w.range;
    if (hit && hit.t < endT) endT = hit.t;
    if (wall.t < endT) endT = wall.t;
    const endPoint = origin.clone().addScaledVector(dir, endT);
    this._spawnTracer(origin, endPoint);
    this._spawnMuzzleFlash();
    this._spawnShell();

    // 命中处理
    if (hit && hit.t < wall.t) {
      const dmg = this._damageForPart(w, hit.part, hit.t);   // 部位倍率 × 距离衰减（F7/F8）
      const killed = hit.enemy.takeDamage(dmg, hit.part);
      const isHead = hit.part === 'head';
      // 视觉：命中标记三态（F1-F3）+ 伤害飘字（N4）
      this.hud.hitMarker(isHead, killed);
      const sp = this.hud.worldToScreen(hit.point, this.camera);
      this.hud.showDamageNumber(dmg, sp.x, sp.y, isHead);
      this._spawnHitSpark(hit.point, hit.normal, hit.part);
      // 音效：命中/爆头/击杀（H-7 修复：由 weapon 统一发起）
      if (this.audio) this.audio.hit(isHead, killed);
      if (killed) {
        this._reportPlayerKill(hit.enemy, w, isHead);
      }
    } else if (wall.t < w.range) {
      // 击中墙体，按墙面法线贴弹孔（精确贴合墙面）+ 墙击音
      this._spawnImpact(endPoint, wall.normal || dir.clone().negate());
      if (this.audio) this.audio.wallHit('concrete');
    }

    // 音效
    if (this.audio) this.audio.shot(this.currentId);
  }

  _reportPlayerKill(enemy, weapon, headshot) {
    this.hud.killFeed(enemy.name, weapon.name, headshot);
    if (typeof this.onEnemyKilled !== 'function') return;
    try {
      this.onEnemyKilled({
        enemyName: enemy.name,
        enemyTier: Number(enemy.tier) || 0,
        weaponId: weapon.id,
        weaponName: weapon.name,
        headshot: !!headshot,
      });
    } catch (error) {
      // 勋章或统计回调属于外围能力，异常时不能中断战斗和命中反馈。
      console.error('[cs15] player kill callback failed', error);
    }
  }

  _fireMelee(w) {
    this.fireCooldown = w.fireRate / (this.upgrades ? this.upgrades.fireRateMul : 1);
    this._meleeSwing = 1;
    this.hud.crosshairFire();
    const ray = this.player.getAimRay();
    const origin = ray.origin.clone();
    const direction = ray.direction.clone().normalize();
    const hit = this._hitscan(origin, direction, w.range);
    const wall = this.map.raycastDetailed(origin, direction, w.range);
    if (hit && hit.t < wall.t) {
      const damage = this._damageForPart(w, hit.part, hit.t);
      const killed = hit.enemy.takeDamage(damage, hit.part);
      const isHead = hit.part === 'head';
      this.hud.hitMarker(isHead, killed);
      const screen = this.hud.worldToScreen(hit.point, this.camera);
      this.hud.showDamageNumber(damage, screen.x, screen.y, isHead);
      this._spawnHitSpark(hit.point, hit.normal, hit.part);
      if (this.audio) {
        this.audio.melee(true);
        this.audio.hit(isHead, killed);
      }
      if (killed) this._reportPlayerKill(hit.enemy, w, isHead);
    } else {
      if (wall.t < w.range) this._spawnImpact(origin.clone().addScaledVector(direction, wall.t), wall.normal || direction.clone().negate());
      if (this.audio) this.audio.melee(false);
    }
  }

  _throwGrenade(w) {
    if (this.state.mag <= 0) {
      if (this.audio) this.audio.dryFire();
      this.hud.setAmmoWarning('empty');
      this.hud.toast('手榴弹已耗尽');
      this.fireCooldown = 0.25;
      this._autoSwitchTimer = 0.3;
      return;
    }
    const gun = this._viewGuns && this._viewGuns.grenade;
    const geometry = gun && gun.userData.projectileGeometry;
    const material = gun && gun.userData.projectileMaterial;
    if (!geometry || !material) return;
    const ray = this.player.getAimRay();
    const direction = ray.direction.clone().normalize();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'm26-live-grenade';
    mesh.scale.setScalar(0.18);
    mesh.position.copy(ray.origin).addScaledVector(direction, 0.58);
    mesh.position.y -= 0.08;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.scene.add(mesh);
    this._grenades.push({
      mesh,
      velocity: direction.multiplyScalar(w.throwSpeed).add(new THREE.Vector3(0, 2.8, 0)),
      fuse: w.fuseTime,
      radius: 0.11,
      weapon: w,
    });
    this.state.mag--;
    this.fireCooldown = w.fireRate / (this.upgrades ? this.upgrades.fireRateMul : 1);
    this._throwAnim = 1;
    this.hud.updateWeapon(w, this.state, this.currentMagSize());
    if (this.audio) this.audio.grenadeThrow();
    if (this.state.mag <= 0) this._autoSwitchTimer = 0.48;
  }

  // 高精度命中：对全部存活敌人网格做三角级射线求交，返回最近命中
  // { enemy, part, t, point, normal } 或 null
  _hitscan(origin, dir, range) {
    const candidates = this._hitscanCandidates;
    const targets = this._hitscanTargets;
    candidates.length = 0;
    targets.length = 0;
    this.performanceStats.hitscanShots++;
    for (const en of this.enemies) {
      if (!en.alive) continue;
      // 保守球体只做宽相位排除，半径覆盖头、腿、手臂与前伸武器；最终命中
      // 仍由原有分部网格 Raycaster 决定，不牺牲爆头和部位伤害精度。
      const centerX = en.position.x;
      const centerY = (en.position.y || 0) + 1.0;
      const centerZ = en.position.z;
      const relX = centerX - origin.x;
      const relY = centerY - origin.y;
      const relZ = centerZ - origin.z;
      const projection = relX * dir.x + relY * dir.y + relZ * dir.z;
      const broadRadius = 1.45;
      if (projection < -broadRadius || projection > range + broadRadius) continue;
      const closestSq = relX * relX + relY * relY + relZ * relZ - projection * projection;
      if (closestSq > broadRadius * broadRadius) continue;
      candidates.push(en);
    }
    this.performanceStats.broadphaseCandidates += candidates.length;
    for (const en of candidates) {
      // 敌人本帧刚移动过，强制刷新世界矩阵，保证命中与渲染位置一致
      en.mesh.updateMatrixWorld(true);
      for (const m of en.hitMeshes) targets.push(m);
    }
    this.performanceStats.preciseMeshes += targets.length;
    if (targets.length === 0) return null;

    this.raycaster.set(origin, dir);
    this.raycaster.near = 0.001;
    this.raycaster.far = range;
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return null;

    // intersectObjects 已按距离升序排序，取最近者
    const h = hits[0];
    const obj = h.object;
    // 面法线从局部空间变换到世界空间（用于精确着弹点特效）
    const normal = h.face
      ? h.face.normal.clone().transformDirection(obj.matrixWorld).normalize()
      : dir.clone().negate();
    return {
      enemy: obj.userData.enemy,
      part: obj.userData.part || 'torso',
      t: h.distance,
      point: h.point.clone(),
      normal,
    };
  }

  // 部位 → 伤害倍率（head/torso/arm/leg/gun）× 距离衰减（F7）
  // 距离衰减：<=falloffStart 满伤；>=falloffEnd falloffMin；中间线性
  _damageForPart(w, part, dist) {
    let dmg;
    switch (part) {
      case 'head': dmg = w.damage * (w.headMult + (this.upgrades ? this.upgrades.headMultBonus : 0));
        break;
      case 'leg':  dmg = w.damage * w.legMult;
        break;
      case 'arm':  dmg = w.damage * (w.armMult != null ? w.armMult : 1);
        break;
      case 'gun':  dmg = w.damage * (w.gunMult != null ? w.gunMult : 0.5);
        break;
      default:     dmg = w.damage;   // torso / body
    }
    // 局内强化：全局伤害乘算（穿甲弹头等）。
    if (this.upgrades && this.upgrades.damageMul !== 1) dmg *= this.upgrades.damageMul;
    // 距离衰减（config falloffStart/End/Min，未配置则满伤）
    if (w.falloffStart && w.falloffEnd && dist !== undefined) {
      if (dist <= w.falloffStart) return Math.round(dmg);
      if (dist >= w.falloffEnd) return Math.round(dmg * (w.falloffMin != null ? w.falloffMin : 0.5));
      const t = (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart);
      return Math.round(dmg * (1 - (1 - (w.falloffMin != null ? w.falloffMin : 0.5)) * t));
    }
    return Math.round(dmg);
  }

  _effectBudget(base, minimum = 1) {
    const scale = Math.max(0.25, Math.min(1.25, Number(CONFIG.performance && CONFIG.performance.effectBudgetScale) || 1));
    return Math.max(minimum, Math.round(base * scale));
  }

  _effectDuration(base) {
    const scale = Number(CONFIG.performance && CONFIG.performance.effectBudgetScale) || 1;
    const factor = scale < 0.75 ? 0.75 : (scale > 1 ? 1.2 : 1);
    return base * factor;
  }

  // 着弹点特效池（命中敌人时在精确命中点闪出血花/爆头火花）
  _buildHitPool() {
    this._hitPool = [];
    const mat = new THREE.SpriteMaterial({
      color: 0xff2a2a, transparent: true, opacity: 0.95,
    });
    const maxHitSparks = (CONFIG.performance && CONFIG.performance.maxHitSparks) || 30;
    for (let i = 0; i < maxHitSparks; i++) {
      const s = new THREE.Sprite(mat.clone());
      s.scale.setScalar(0.14);
      s.visible = false;
      this.scene.add(s);
      this._hitPool.push(s);
    }
    this._hitSparks = [];
  }

  _spawnHitSpark(point, normal, part) {
    const base = (CONFIG.performance && CONFIG.performance.maxHitSparks) || 30;
    if (this._hitSparks.length >= this._effectBudget(base, 4)) return;
    let s = this._hitPool.pop();
    if (!s) return;
    s.position.copy(point).addScaledVector(normal, 0.02);
    s.material.color.setHex(part === 'head' ? 0xffe14d : 0xff2a2a);
    s.scale.setScalar(part === 'head' ? 0.22 : 0.14);
    s.visible = true;
    s.material.opacity = 0.95;
    s.userData.maxLife = this._effectDuration(0.12);
    s.userData.life = s.userData.maxLife;
    this.scene.add(s);
    this._hitSparks.push(s);
  }

  _buildGrenadeEffects() {
    this._explosionGeometry = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 4; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xff7a18,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      });
      const effect = new THREE.Mesh(this._explosionGeometry, material);
      effect.visible = false;
      effect.renderOrder = 5;
      this.scene.add(effect);
      this._explosionPool.push(effect);
    }
  }

  _updateGrenades(dt) {
    if (!this._grenades || this._grenades.length === 0) return;
    const down = new THREE.Vector3(0, -1, 0);
    for (let index = this._grenades.length - 1; index >= 0; index--) {
      const grenade = this._grenades[index];
      grenade.fuse -= dt;
      const speed = grenade.velocity.length();
      const steps = Math.max(1, Math.ceil(speed * dt / 0.22));
      const stepTime = dt / steps;
      for (let step = 0; step < steps; step++) {
        grenade.velocity.y -= grenade.weapon.gravity * stepTime;
        const start = grenade.mesh.position;
        const target = start.clone().addScaledVector(grenade.velocity, stepTime);
        const vertical = {
          minY: target.y - grenade.radius,
          maxY: target.y + grenade.radius,
        };
        const moved = this.map.moveCircle(
          start.x, start.z, target.x, target.z, grenade.radius, vertical
        );
        if (Math.abs(moved.x - target.x) > 0.002) grenade.velocity.x *= -grenade.weapon.bounce;
        if (Math.abs(moved.z - target.z) > 0.002) grenade.velocity.z *= -grenade.weapon.bounce;
        target.x = moved.x;
        target.z = moved.z;

        let floorY = grenade.radius;
        if (typeof this.map.raycastDetailed === 'function') {
          // 性能：地面探测是全网格射线（已 BVH 加速，但仍按需执行）。
          // 仅在"下落或未缓存或水平位移超阈值"时探测；上升段与缓滚段
          // 复用上次结果，把每颗手雷的射线次数从每子步 1 次降到数步 1 次。
          const probeDx = target.x - (grenade._probeX !== undefined ? grenade._probeX : Infinity);
          const probeDz = target.z - (grenade._probeZ !== undefined ? grenade._probeZ : Infinity);
          const movedSinceProbe = Math.hypot(probeDx, probeDz);
          const falling = grenade.velocity.y <= 0.01;
          const hasCache = Number.isFinite(grenade.floorCacheY);
          // 贴着缓存地面滚动时（可能滚向平台边缘）加密探测，避免滚出边缘后短暂悬空。
          const nearCachedFloor = hasCache && (target.y - grenade.floorCacheY) < grenade.radius + 0.08;
          const probeThreshold = nearCachedFloor ? 0.15 : 0.35;
          if (falling && (!hasCache || movedSinceProbe > probeThreshold)) {
            const probeOrigin = new THREE.Vector3(target.x, target.y + grenade.radius + 0.04, target.z);
            const probeDistance = Math.max(
              grenade.radius * 3,
              Math.abs(grenade.velocity.y * stepTime) + grenade.radius * 2 + 0.06
            );
            const ground = this.map.raycastDetailed(probeOrigin, down, probeDistance);
            if (ground && ground.t < probeDistance - 0.0001) {
              grenade.floorCacheY = probeOrigin.y - ground.t + grenade.radius;
            } else {
              grenade.floorCacheY = grenade.radius;
            }
            grenade._probeX = target.x;
            grenade._probeZ = target.z;
          }
          if (hasCache || Number.isFinite(grenade.floorCacheY)) {
            floorY = Math.max(floorY, grenade.floorCacheY);
          }
        }
        if (target.y <= floorY) {
          target.y = floorY;
          if (grenade.velocity.y < -0.8) grenade.velocity.y *= -grenade.weapon.bounce;
          else grenade.velocity.y = 0;
          grenade.velocity.x *= 0.82;
          grenade.velocity.z *= 0.82;
        }
        grenade.mesh.position.copy(target);
        grenade.mesh.rotation.x += grenade.velocity.z * stepTime * 0.9;
        grenade.mesh.rotation.z -= grenade.velocity.x * stepTime * 0.9;
      }
      if (grenade.fuse <= 0) this._explodeGrenade(index, grenade);
    }
  }

  _explodeGrenade(index, grenade) {
    this._grenades.splice(index, 1);
    const position = grenade.mesh.position.clone();
    this.scene.remove(grenade.mesh);

    let effect = this._explosionPool.pop();
    if (!effect && this._explosions.length > 0) effect = this._explosions.shift();
    if (effect) {
      effect.position.copy(position);
      effect.scale.setScalar(0.25);
      effect.material.opacity = 0.95;
      effect.visible = true;
      effect.userData.life = 0.5;
      effect.userData.maxLife = 0.5;
      this._explosions.push(effect);
    }

    const origin = position.clone();
    origin.y += 0.18;
    const radius = grenade.weapon.blastRadius;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const target = new THREE.Vector3(enemy.position.x, (enemy.position.y || 0) + 1, enemy.position.z);
      const direction = target.clone().sub(origin);
      const distance = direction.length();
      if (distance > radius || distance <= 0.001) continue;
      direction.multiplyScalar(1 / distance);
      const wall = this.map.raycastDetailed(origin, direction, distance);
      if (wall && wall.t < distance - 0.2) continue;
      const falloff = 1 - 0.78 * (distance / radius);
      const damage = Math.max(1, Math.round(grenade.weapon.damage * falloff));
      const killed = enemy.takeDamage(damage, 'explosion');
      this.hud.hitMarker(false, killed);
      const screen = this.hud.worldToScreen(target, this.camera);
      this.hud.showDamageNumber(damage, screen.x, screen.y, false);
      if (killed) this._reportPlayerKill(enemy, grenade.weapon, false);
    }
    if (this.audio) this.audio.explosion();
  }

  _updateExplosions(dt) {
    for (let index = this._explosions.length - 1; index >= 0; index--) {
      const effect = this._explosions[index];
      effect.userData.life -= dt;
      const progress = 1 - Math.max(0, effect.userData.life) / effect.userData.maxLife;
      effect.scale.setScalar(0.25 + progress * 3.4);
      effect.material.opacity = Math.max(0, (1 - progress) * 0.95);
      if (effect.userData.life <= 0) {
        effect.visible = false;
        this._explosions.splice(index, 1);
        this._explosionPool.push(effect);
      }
    }
  }

  _clearGrenadeEffects() {
    for (const grenade of this._grenades) this.scene.remove(grenade.mesh);
    this._grenades.length = 0;
    for (let index = this._explosions.length - 1; index >= 0; index--) {
      const effect = this._explosions[index];
      effect.visible = false;
      this._explosionPool.push(effect);
    }
    this._explosions.length = 0;
  }

  // ---------- 视觉：第一人称枪模（高精度程序化贴图版） ----------
  _buildViewModel() {
    this._viewGroup = new THREE.Group();
    this.camera.add(this._viewGroup);
    this.scene.add(this.camera);   // 确保 camera 加入场景，枪模跟随

    // 六把武器各自独立构建：材质/几何/贴图全部在各自的 _buildXxx 内部自建，
    // 互不传参、互不引用对方材质（修复：AWP 曾复用 AK 材质 dark=darkDarkMat||darkMat
    // 导致串材质/穿模观感；现每把枪单独模型、单独材质，切换时互不影响）
    this._viewGuns = {
      usp: this._buildGlock(),
      ak47: this._buildAK(),
      awp: this._buildAwp(),
      m249: this._buildM249(),
      m9: this._buildM9(),
      grenade: this._buildGrenade(),
    };
    for (const key in this._viewGuns) this._viewGroup.add(this._viewGuns[key]);

    // aoMap 必需第二套 UV（uv2）：遍历所有武器几何体统一补齐（复用原 uv，零改动）
    this._viewGroup.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes.uv && !o.geometry.attributes.uv2) {
        o.geometry.setAttribute('uv2', o.geometry.attributes.uv);
      }
      // 第一人称枪模贴在相机下，不应参与地图阴影贴图；关闭可避免每帧额外的
      // shadow caster 遍历，尤其能减轻移动端切枪/射击时的 GPU 峰值。
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
    });

    // 初始只显示当前武器（1 号枪），其余隐藏——防三枪同显穿模（AWP 曾因漏设 visible 永远叠加）
    for (const key in this._viewGuns) {
      this._viewGuns[key].visible = (key === this.currentId);
    }

    // 当前枪模姿态
    this._viewRecoil = 0;
  }

  // ---- 程序化贴图 ----

  // 拉丝枪金属（深灰 + 竖向细纹 + 顶部高光 + 面板分割线）
  _makeMetalTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2d33';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i++) {
      const v = 34 + Math.random() * 40;
      g.fillStyle = `rgba(${v},${v + 2},${v + 6},0.06)`;
      g.fillRect(i, 0, 1, 256);
    }
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,255,255,0.12)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 2;
    for (let y = 64; y < 256; y += 70) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  // 卡通暖木（采样自三视图 #B98A4A：大色块 + 顶部高光带 + 底部阴影带 + 粗木纹 + 描边线）
  // 仅 AK 使用（USP 不用木件），卡通渲染风格：色块为主、纹理为辅
  // 注：贴图主色比三视图采样色深约 30%（场景环境光 1.8 + IBL 会提亮，预补偿防过曝）
  _makeWoodTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    // 主色块（SRGB 色彩空间下会略暗，主色取采样值的 90%：目标观感 #b98a4a）
    // 木纹贴图：基色按用户上传 3D 渲染图主色 #A07020（暖木），非之前的 #96713c 深棕
    g.fillStyle = '#A07020';
    g.fillRect(0, 0, 256, 256);
    // 顶部高光带（卡通风：亮部窄而明显）
    const hi = g.createLinearGradient(0, 0, 0, 110);
    hi.addColorStop(0, 'rgba(220,160,80,0.8)');
    hi.addColorStop(0.7, 'rgba(220,160,80,0.12)');
    hi.addColorStop(1, 'rgba(220,160,80,0)');
    g.fillStyle = hi;
    g.fillRect(0, 0, 256, 110);
    // 底部阴影带
    const sh = g.createLinearGradient(0, 170, 0, 256);
    sh.addColorStop(0, 'rgba(120,80,30,0)');
    sh.addColorStop(0.5, 'rgba(120,80,30,0.35)');
    sh.addColorStop(1, 'rgba(80,50,15,0.8)');
    g.fillStyle = sh;
    g.fillRect(0, 170, 256, 86);
    // 粗木纹（2~3 条大波浪，卡通感而非照片感）
    g.strokeStyle = 'rgba(100,70,25,0.55)';
    g.lineWidth = 3;
    for (const y0 of [70, 130, 195]) {
      g.beginPath();
      for (let x = 0; x <= 256; x += 16) {
        const yy = y0 + Math.sin(x * 0.05 + y0) * 6;
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    // 细亮纹（高光侧的反光纹）
    g.strokeStyle = 'rgba(230,180,120,0.4)';
    g.lineWidth = 1.5;
    for (const y0 of [96, 160]) {
      g.beginPath();
      for (let x = 0; x <= 256; x += 16) {
        const yy = y0 + Math.sin(x * 0.05 + y0 * 1.3) * 5;
        if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    // 上下描边（卡通轮廓感）
    g.strokeStyle = 'rgba(50,35,15,0.6)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 1.5); g.lineTo(256, 1.5); g.stroke();
    g.beginPath(); g.moveTo(0, 254.5); g.lineTo(256, 254.5); g.stroke();
    const woodTex = new THREE.CanvasTexture(c);
    if ('SRGBColorSpace' in THREE) woodTex.colorSpace = THREE.SRGBColorSpace;   // 照片级贴图色彩才正确（防线性空间提亮）
    return woodTex;
  }

  // 卡通军绿金属（采样自三视图 #565C46：色块 + 顶部亮带 + 底部暗带 + 面板分割描边 + 细颗粒）
  // 用于 AK 机匣/枪管/弹匣等金属件；保持金属反射（metalness 高），配色走卡通
  // 注：贴图主色比三视图采样色深约 30%（环境光 + IBL 提亮预补偿）
  _makeArmyMetalTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    // 主色块（SRGB 下取采样值 90%：目标观感 #565c46）
    g.fillStyle = '#484e3c';
    g.fillRect(0, 0, 256, 256);
    // 顶部高光带（卡通硬高光）
    const hi = g.createLinearGradient(0, 0, 0, 90);
    hi.addColorStop(0, 'rgba(94,100,78,0.9)');
    hi.addColorStop(0.65, 'rgba(88,94,74,0.25)');
    hi.addColorStop(1, 'rgba(88,94,74,0)');
    g.fillStyle = hi;
    g.fillRect(0, 0, 256, 90);
    // 底部阴影带
    const sh = g.createLinearGradient(0, 180, 0, 256);
    sh.addColorStop(0, 'rgba(38,42,32,0)');
    sh.addColorStop(0.55, 'rgba(38,42,32,0.4)');
    sh.addColorStop(1, 'rgba(26,30,22,0.85)');
    g.fillStyle = sh;
    g.fillRect(0, 180, 256, 76);
    // 细颗粒噪点（金属质感，弱强度保持卡通色块感）
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const v = Math.random();
      g.fillStyle = v > 0.5 ? 'rgba(108,114,90,0.05)' : 'rgba(20,24,16,0.05)';
      g.fillRect(x, y, 1.5, 1.5);
    }
    // 面板分割描边（AK 机匣的铆接/分件感，深色细线）
    g.strokeStyle = 'rgba(22,26,18,0.65)';
    g.lineWidth = 2;
    for (const y of [52, 128, 208]) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
    }
    // 分割线旁的铆钉点（卡通小细节）
    g.fillStyle = 'rgba(18,22,14,0.75)';
    for (const y of [52, 128, 208]) {
      for (let x = 20; x < 256; x += 46) {
        g.beginPath(); g.arc(x, y - 5, 2, 0, Math.PI * 2); g.fill();
      }
    }
    // 上下边缘描边
    g.strokeStyle = 'rgba(18,22,14,0.7)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 1.5); g.lineTo(256, 1.5); g.stroke();
    g.beginPath(); g.moveTo(0, 254.5); g.lineTo(256, 254.5); g.stroke();
    const armyTex = new THREE.CanvasTexture(c);
    if ('SRGBColorSpace' in THREE) armyTex.colorSpace = THREE.SRGBColorSpace;
    return armyTex;
  }

  // 暖青铜军绿金属（贴 3D 渲染图机匣色调：#5a5e48 偏暖，金黄高光）
  _makeArmyMetalWarmTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    // 主色块（暖青铜军绿，目标 #5a5e48）
    g.fillStyle = '#535840';
    g.fillRect(0, 0, 256, 256);
    // 顶部暖色高光带
    const hi = g.createLinearGradient(0, 0, 0, 95);
    hi.addColorStop(0, 'rgba(118,116,80,0.85)');
    hi.addColorStop(0.6, 'rgba(108,106,72,0.25)');
    hi.addColorStop(1, 'rgba(108,106,72,0)');
    g.fillStyle = hi;
    g.fillRect(0, 0, 256, 95);
    // 底部阴影
    const sh = g.createLinearGradient(0, 175, 0, 256);
    sh.addColorStop(0, 'rgba(40,42,32,0)');
    sh.addColorStop(0.55, 'rgba(40,42,32,0.4)');
    sh.addColorStop(1, 'rgba(28,30,22,0.85)');
    g.fillStyle = sh;
    g.fillRect(0, 175, 256, 81);
    // 细颗粒（暖金属感）
    for (let i = 0; i < 850; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const v = Math.random();
      g.fillStyle = v > 0.5 ? 'rgba(120,118,84,0.06)' : 'rgba(20,22,14,0.05)';
      g.fillRect(x, y, 1.5, 1.5);
    }
    // 面板分割描边
    g.strokeStyle = 'rgba(22,24,16,0.65)';
    g.lineWidth = 2;
    for (const y of [50, 125, 200]) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
    }
    // 铆钉点
    g.fillStyle = 'rgba(18,20,12,0.78)';
    for (const y of [50, 125, 200]) {
      for (let x = 20; x < 256; x += 46) {
        g.beginPath(); g.arc(x, y - 5, 2, 0, Math.PI * 2); g.fill();
      }
    }
    // 边缘描边
    g.strokeStyle = 'rgba(20,22,14,0.7)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 1.5); g.lineTo(256, 1.5); g.stroke();
    g.beginPath(); g.moveTo(0, 254.5); g.lineTo(256, 254.5); g.stroke();
    const warmTex = new THREE.CanvasTexture(c);
    if ('SRGBColorSpace' in THREE) warmTex.colorSpace = THREE.SRGBColorSpace;
    return warmTex;
  }

  // AK47 漫反射贴图（替代之前误用的 UV 展开图：那张是 UV 布局，大量透明区当 diffuse
  // 用会"透出底色+贴图错位"。改为程序化生成的暖青铜军绿 diffuse，匹配用户 3D 渲染图主色 #5a5e48）
  _makeAk47Texture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    // 暖青铜军绿基色（对应用户上传 3D 渲染图主色）
    // AK 金属贴图：基色按用户上传 3D 渲染图主色 #405040（深橄榄），非之前的 #5a5e48 暖青铜
    g.fillStyle = '#405040';
    g.fillRect(0, 0, 512, 512);
    // 顶部暖色高光带（机匣顶面反光，颜色按基色调）
    const hi = g.createLinearGradient(0, 0, 0, 180);
    hi.addColorStop(0, 'rgba(110, 108, 72, 0.85)');
    hi.addColorStop(0.7, 'rgba(100, 98, 64, 0.2)');
    hi.addColorStop(1, 'rgba(100, 98, 64, 0)');
    g.fillStyle = hi;
    g.fillRect(0, 0, 512, 180);
    // 底部阴影
    const sh = g.createLinearGradient(0, 360, 0, 512);
    sh.addColorStop(0, 'rgba(36, 38, 26, 0)');
    sh.addColorStop(0.5, 'rgba(36, 38, 26, 0.4)');
    sh.addColorStop(1, 'rgba(24, 26, 16, 0.85)');
    g.fillStyle = sh;
    g.fillRect(0, 360, 512, 152);
    // 细颗粒金属感
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      g.fillStyle = Math.random() > 0.5 ? 'rgba(100, 98, 68, 0.08)' : 'rgba(16, 18, 10, 0.06)';
      g.fillRect(x, y, 1.5, 1.5);
    }
    // 面板分割描边
    g.strokeStyle = 'rgba(16, 18, 10, 0.7)';
    g.lineWidth = 3;
    for (const y of [100, 256, 410]) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // 赛博霓虹 Glock diffuse（同步 Canvas，参考 J:\18 albedo 风格——暗紫红底 + 霓虹橙红线条 + 亮晶面板分割）
  // 同步生成、无文件依赖、真机可靠（同 _makeAk47Texture 模式）。避免异步 webp 在真机容器失落的隐患。
  _makeGlockCyberTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    // 暗紫红基色（J:\18 albedo 主色 ≈ #4a1028）
    g.fillStyle = '#3f0d24';
    g.fillRect(0, 0, 512, 512);
    // 底部更深（握把/下部更暗）
    const sh = g.createLinearGradient(0, 300, 0, 512);
    sh.addColorStop(0, 'rgba(20, 4, 12, 0)');
    sh.addColorStop(1, 'rgba(12, 2, 8, 0.75)');
    g.fillStyle = sh;
    g.fillRect(0, 300, 512, 212);
    // 顶部微亮高光（滑套顶面反光）
    const hi = g.createLinearGradient(0, 0, 0, 120);
    hi.addColorStop(0, 'rgba(140, 40, 78, 0.6)');
    hi.addColorStop(1, 'rgba(120, 30, 66, 0)');
    g.fillStyle = hi;
    g.fillRect(0, 0, 512, 120);
    // 面板分割描边（横向，模拟装甲板拼缝）
    g.strokeStyle = 'rgba(255, 106, 58, 0.5)';
    g.lineWidth = 2;
    for (const y of [90, 210, 330, 450]) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
    }
    // 霓虹线条（少量随机橙红/品红斜线，模拟赛博能量线路）
    const neon = ['rgba(255, 106, 58, 0.85)', 'rgba(255, 62, 150, 0.8)', 'rgba(255, 180, 90, 0.7)'];
    for (let i = 0; i < 40; i++) {
      const x0 = Math.random() * 512, y0 = Math.random() * 512;
      const len = 30 + Math.random() * 120;
      const ang = (Math.random() - 0.5) * Math.PI;
      g.strokeStyle = neon[(Math.random() * neon.length) | 0];
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      g.stroke();
    }
    // 节点亮点（橙色小点，模拟 LED/电路触点）
    for (let i = 0; i < 24; i++) {
      g.fillStyle = 'rgba(255, 200, 90, 0.9)';
      g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 3, 0, Math.PI * 2); g.fill();
    }
    // 细颗粒金属质感
    for (let i = 0; i < 1600; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      g.fillStyle = Math.random() > 0.5 ? 'rgba(200, 90, 120, 0.05)' : 'rgba(10, 2, 8, 0.07)';
      g.fillRect(x, y, 1.5, 1.5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // 防滑纹（深黑 + 密集点纹）
  _makeGripTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#17171b';
    g.fillRect(0, 0, 256, 256);
    for (let y = 5; y < 256; y += 11) {
      for (let x = 5; x < 256; x += 11) {
        g.fillStyle = `rgba(${58 + Math.random() * 26},${58 + Math.random() * 26},${64 + Math.random() * 26},0.55)`;
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      }
    }
    return new THREE.CanvasTexture(c);
  }

  // 枪口火光资源（只创建一次）：用本地 Canvas 径向渐变做光晕，不依赖网络贴图。
  _makeMuzzleTexture() {
    if (this._muzzleTexture) return this._muzzleTexture;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,245,1)');
    gradient.addColorStop(0.16, 'rgba(255,236,160,0.98)');
    gradient.addColorStop(0.42, 'rgba(255,145,35,0.62)');
    gradient.addColorStop(0.72, 'rgba(255,65,8,0.22)');
    gradient.addColorStop(1, 'rgba(255,25,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    this._muzzleTexture = new THREE.CanvasTexture(canvas);
    this._muzzleTexture.needsUpdate = true;
    return this._muzzleTexture;
  }

  // 定向火舌纹理（只创建一次）：用透明 Canvas 画出收尖轮廓，避免纯色平面在近景变成白色方片。
  _makeMuzzleFlameTexture() {
    if (this._muzzleFlameTexture) return this._muzzleFlameTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 96, 3, 32, 72, 58);
    gradient.addColorStop(0, 'rgba(255,255,238,1)');
    gradient.addColorStop(0.20, 'rgba(255,231,125,0.98)');
    gradient.addColorStop(0.62, 'rgba(255,123,22,0.72)');
    gradient.addColorStop(1, 'rgba(255,56,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(32, 122);
    ctx.bezierCurveTo(8, 108, 13, 70, 32, 4);
    ctx.bezierCurveTo(51, 70, 56, 108, 32, 122);
    ctx.closePath();
    ctx.fill();
    this._muzzleFlameTexture = new THREE.CanvasTexture(canvas);
    this._muzzleFlameTexture.colorSpace = THREE.SRGBColorSpace;
    this._muzzleFlameTexture.needsUpdate = true;
    return this._muzzleFlameTexture;
  }

  // 高速摄影参考中的枪口火光由膛口白热内芯、横向气体爆闪和轴向短焰组成。
  // profile 让手枪、AK 与 AWP 使用各自尺度；全部纹理由本地 Canvas 生成。
  _makeMuzzleFlashMesh(x, y, z, profileId = 'rifle') {
    const profiles = {
      pistol: { radius: 0.13, length: 0.16, light: 1.8 },
      rifle: { radius: 0.18, length: 0.25, light: 2.6 },
      ak47: { radius: 0.20, length: 0.29, light: 2.9 },
      awp: { radius: 0.24, length: 0.36, light: 3.2 },
      m249: { radius: 0.22, length: 0.32, light: 3.1 },
    };
    const profile = profiles[profileId] || profiles.rifle;
    const group = new THREE.Group();
    const additive = (color, opacity) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const parts = [];

    const core = new THREE.Mesh(new THREE.SphereGeometry(profile.radius * 0.22, 8, 8), additive(0xffffe1, 0));
    core.position.z = -0.012;
    group.add(core);
    parts.push({ object: core, opacity: 1 });

    // 两片沿 -Z 展开的交叉透明面只负责轴向短焰，不再把火舌平铺成面向相机的三张卡片。
    const flameTexture = this._makeMuzzleFlameTexture();
    const flameMaterial = (color) => new THREE.MeshBasicMaterial({
      map: flameTexture, color, transparent: true, opacity: 0,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const tongueGeo = new THREE.PlaneGeometry(profile.radius * 0.5, profile.length);
    const plumes = [];
    for (let i = 0; i < 2; i++) {
      const tongue = new THREE.Mesh(tongueGeo, flameMaterial(i === 0 ? 0xffd15a : 0xff7a18));
      tongue.position.z = -profile.length * 0.48;
      tongue.rotation.x = Math.PI / 2;
      tongue.rotation.z = i * Math.PI / 2;
      group.add(tongue);
      parts.push({ object: tongue, opacity: i === 0 ? 0.72 : 0.46 });
      plumes.push(tongue);
    }

    // 相机朝向的径向层表现枪口处的圆盘状冲击气体与次生火球。
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._makeMuzzleTexture(), color: 0xffb52e,
      transparent: true, opacity: 0, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.position.z = -0.025;
    glow.scale.set(profile.radius, profile.radius, 1);
    group.add(glow);
    parts.push({ object: glow, opacity: 0.86 });

    const gasRing = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._makeMuzzleTexture(), color: 0xff6b18,
      transparent: true, opacity: 0, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    gasRing.position.z = -profile.length * 0.22;
    gasRing.scale.set(profile.radius * 1.35, profile.radius * 0.72, 1);
    group.add(gasRing);
    parts.push({ object: gasRing, opacity: 0.34 });

    let light = null;
    if (!window.CS15_TOUCH && !window.CS15_LOWEND) {
      light = new THREE.PointLight(0xffb347, 0, 2.8, 2);
      light.castShadow = false;
      light.userData.maxIntensity = profile.light;
      group.add(light);
    }
    group.position.set(x, y, z);
    group.userData.core = core;
    group.userData.glow = glow;
    group.userData.gasRing = gasRing;
    group.userData.plumes = plumes;
    group.userData.profile = profile;
    group.userData.parts = parts;
    group.userData.light = light;
    group.visible = false;
    return group;
  }


  // Glock-18（CS2 外观，经典黑）：替换原 USP 作为 1 号枪。
  // 几何参考 CS2 Glock-18：方正低矮滑套 + 后防滑纹 + 方形扳机护圈 + 22° 握把倾角 + 掌底膨起 +
  // 内部机构静态展示（枪管/膛口/复进簧/导杆/击针/抛壳口）+ Safe Action 扳机组。
  // 皮肤：经典黑（黑滑套 + 深灰框架/细节 + 深灰握把 + 内部金属灰），不贴 usp 贴图。
  // 比例近似：全长 186mm / 枪管 114mm（游戏单位约 1:1 到 1:2 缩放），枪口朝 -Z。
  // 独立模型铁律：无参数、材质/贴图全部内部自建，不引用其他武器（与 AK/AWP 零共享）。
  _buildGlock() {
    const g = new THREE.Group();
    const X = 0.22;   // 枪械左右居中
    // ---- 赛博霓虹 PBR（同步 Canvas 贴图，参考 J:\18 albedo 风格）----
    // 用 _makeGlockCyberTexture() 同步生成赛博霓虹 diffuse（暗紫红底+霓虹线条），
    // 替代异步 webp（webp 在真机容器易失落/纯黑）。同步生成、无文件依赖、真机可靠。
    const cyberTex = this._makeGlockCyberTexture();
    // J:\18 是深色聚合物+霓虹发光（非高金属镜面），因此 metal 不宜过高，否则 diffuse 霓虹色被镜面反射压没。
    // 主件 metal 0.45（让霓虹 diffuse 显现）+ 微 emissive 品红辉光（赛博霓虹发光感）。
    const glockMat = new THREE.MeshPhysicalMaterial({
      map: cyberTex, roughness: 0.38, metalness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.3,
      emissive: 0x2a0a1a, emissiveIntensity: 0.4,
    });
    const glockDarkMat = new THREE.MeshPhysicalMaterial({
      map: cyberTex, color: 0x9a8a92, roughness: 0.55, metalness: 0.4, clearcoat: 0.12,
      emissive: 0x1a0510, emissiveIntensity: 0.3,
    });
    const glockGripMat = new THREE.MeshPhysicalMaterial({
      map: cyberTex, color: 0x8a7a86, roughness: 0.62, metalness: 0.3, clearcoat: 0.08,
    });
    // 内部金属灰（枪管/复进簧/导杆/击针/扳机等内部机构）
    const internalMat = new THREE.MeshPhysicalMaterial({ color: 0x8a8a90, roughness: 0.3, metalness: 0.85, clearcoat: 0.25, clearcoatRoughness: 0.3 });

    // ---- 1. 滑套（ExtrudeGeometry 圆角横截面，比 USP 更方正低矮）----
    const slideShape = new THREE.Shape();
    const sw = 0.052, sh = 0.045, sr = 0.008;
    slideShape.moveTo(-sw / 2 + sr, sh / 2);
    slideShape.lineTo(sw / 2 - sr, sh / 2);
    slideShape.quadraticCurveTo(sw / 2, sh / 2, sw / 2, sh / 2 - sr);
    slideShape.lineTo(sw / 2, -sh / 2 + sr);
    slideShape.quadraticCurveTo(sw / 2, -sh / 2, sw / 2 - sr, -sh / 2);
    slideShape.lineTo(-sw / 2 + sr, -sh / 2);
    slideShape.quadraticCurveTo(-sw / 2, -sh / 2, -sw / 2, -sh / 2 + sr);
    slideShape.lineTo(-sw / 2, sh / 2 - sr);
    slideShape.quadraticCurveTo(-sw / 2, sh / 2, -sw / 2 + sr, sh / 2);
    slideShape.closePath();
    const slideGeo = new THREE.ExtrudeGeometry(slideShape, { depth: 0.26, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 });
    slideGeo.translate(0, 0, -0.13);   // 居中挤出（滑套 z 范围约 -0.39 ~ -0.65）
    const slide = new THREE.Mesh(slideGeo, glockMat);
    slide.position.set(X, -0.148, -0.52);
    slide.castShadow = true;
    g.add(slide);

    // ---- 1b. 滑套顶部瞄具模块（J:\18 特征：滑套后段上方凸起的红点瞄具底座/战术导轨）----
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.014, 0.10), glockDarkMat);
    sightBase.position.set(X, -0.128, -0.50);
    g.add(sightBase);
    const sightBlock = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.040), glockMat);
    sightBlock.position.set(X, -0.116, -0.52);
    g.add(sightBlock);
    const lensHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.022, 12), glockDarkMat);
    lensHousing.position.set(X, -0.108, -0.53);
    g.add(lensHousing);
    // 瞄具镜片（蓝色半透明，贴近 J:\18 红点瞄具的前镜片）
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a3a5c, roughness: 0.15, metalness: 0.3, emissive: 0x0a2a4a, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(X, -0.108, -0.542);
    lens.rotation.z = Math.PI / 2;
    g.add(lens);

    // ---- 1c. 两侧导轨翼片（J:\18 最独特特征：左右对称的横向突出导轨/装饰翼片）----
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.020, 0.06), glockMat);
      wing.position.set(X + side * 0.030, -0.150, -0.54);
      wing.rotation.y = side * 0.18;   // 翼片微微后掠
      g.add(wing);
      // 翼片前端竖棱（装饰）
      const wingRib = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.026, 0.008), glockDarkMat);
      wingRib.position.set(X + side * 0.034, -0.150, -0.560);
      wingRib.rotation.y = side * 0.18;
      g.add(wingRib);
    }

    // ---- 1d. 滑套前部战术导轨（3 段横棱，J:\18 前部导轨凹槽）----
    for (let i = 0; i < 3; i++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.006, 0.008), glockDarkMat);
      rail.position.set(X, -0.128, -0.612 - i * 0.014);
      g.add(rail);
    }

    // ---- 2. 后防滑纹（8 条横向细棱，从滑套后部向前排）----
    for (let i = 0; i < 8; i++) {
      const serr = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.007, 0.012), glockDarkMat);
      serr.position.set(X, -0.128, -0.40 - i * 0.014);
      g.add(serr);
    }
    // ---- 3. 前防滑纹（4 条，靠前部，更细）----
    for (let i = 0; i < 4; i++) {
      const serr = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.005, 0.008), glockDarkMat);
      serr.position.set(X, -0.128, -0.605 - i * 0.012);
      g.add(serr);
    }

    // ---- 4. 枪管（金属灰，前端露出滑套）+ 膛口内凹 ----
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 10), internalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(X, -0.148, -0.66);
    g.add(barrel);
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 10), glockDarkMat);
    bore.rotation.x = Math.PI / 2;
    bore.position.set(X, -0.148, -0.725);
    g.add(bore);

    // ---- 5. 复进簧（5 圈 Torus 沿 Z 叠）+ 导杆 ----
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0015, 6, 12), internalMat);
      ring.position.set(X, -0.16, -0.42 - i * 0.010);
      g.add(ring);
    }
    const guideRod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 8), internalMat);
    guideRod.rotation.x = Math.PI / 2;
    guideRod.position.set(X, -0.16, -0.45);
    g.add(guideRod);

    // ---- 6. 击针（滑套后部，金属灰，内部机构展示）----
    const striker = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.05), internalMat);
    striker.position.set(X, -0.13, -0.40);
    g.add(striker);

    // ---- 7. 抛壳口（右侧滑套中部挖槽，暗色内衬）----
    const ejector = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5, metalness: 0.4 }));
    ejector.position.set(X + 0.028, -0.145, -0.55);
    g.add(ejector);

    // ---- 8. 后照门（带缺口：顶部两个小 Box 形成缺口）----
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.02, 0.018), glockDarkMat);
    rearSight.position.set(X, -0.118, -0.42);
    g.add(rearSight);
    const sightL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.016), glockDarkMat);
    sightL.position.set(X - 0.004, -0.104, -0.42);
    g.add(sightL);
    const sightR = sightL.clone();
    sightR.position.x = X + 0.004;
    g.add(sightR);

    // ---- 9. 前准星（片状）----
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.016, 0.01), glockDarkMat);
    frontSight.position.set(X, -0.118, -0.63);
    g.add(frontSight);

    // ---- 10. 框架（ExtrudeGeometry 圆角，深灰，比滑套略窄）----
    const frameShape = new THREE.Shape();
    const fw = 0.046, fh = 0.04, fr = 0.009;
    frameShape.moveTo(-fw / 2 + fr, fh / 2);
    frameShape.lineTo(fw / 2 - fr, fh / 2);
    frameShape.quadraticCurveTo(fw / 2, fh / 2, fw / 2, fh / 2 - fr);
    frameShape.lineTo(fw / 2, -fh / 2 + fr);
    frameShape.quadraticCurveTo(fw / 2, -fh / 2, fw / 2 - fr, -fh / 2);
    frameShape.lineTo(-fw / 2 + fr, -fh / 2);
    frameShape.quadraticCurveTo(-fw / 2, -fh / 2, -fw / 2, -fh / 2 + fr);
    frameShape.lineTo(-fw / 2, fh / 2 - fr);
    frameShape.quadraticCurveTo(-fw / 2, fh / 2, -fw / 2 + fr, fh / 2);
    frameShape.closePath();
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 });
    frameGeo.translate(0, 0, -0.09);   // 居中挤出（框架 z 范围约 -0.41 ~ -0.59）
    const frame = new THREE.Mesh(frameGeo, glockDarkMat);
    frame.position.set(X, -0.205, -0.50);
    frame.castShadow = true;
    g.add(frame);

    // ---- 11. 扳机护圈（椭圆环，贴近 J:\18 的椭圆大护圈；TorusGeometry 压扁成椭圆）----
    const guardTorus = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 10, 24), glockDarkMat);
    guardTorus.scale.set(1.0, 0.72, 1);   // 垂直压扁成椭圆
    guardTorus.rotation.z = Math.PI / 2 * 0;   // 环面默认在 XY 平面，需立起来贴枪身侧面
    guardTorus.rotation.x = Math.PI / 2;   // 转到 XZ 平面（护圈窗口朝前后）
    guardTorus.position.set(X, -0.236, -0.52);
    g.add(guardTorus);
    // 护圈前下沿（连到框架，模拟护圈前壁）
    const guardFront = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.040, 0.005), glockDarkMat);
    guardFront.position.set(X, -0.236, -0.485);
    g.add(guardFront);

    // ---- 12. 握把（粗壮外扩竞赛握把，贴近 J:\18：顶部窄、向下向后大幅外扩、掌底喇叭口宽大）----
    const gripShape = new THREE.Shape();
    gripShape.moveTo(-0.026, 0.085);
    gripShape.lineTo(0.026, 0.085);
    gripShape.lineTo(0.029, -0.020);
    gripShape.quadraticCurveTo(0.031, -0.068, 0.022, -0.100);
    gripShape.quadraticCurveTo(0.015, -0.122, 0.005, -0.128);
    gripShape.lineTo(-0.008, -0.128);
    gripShape.quadraticCurveTo(-0.022, -0.128, -0.032, -0.112);   // 掌底喇叭口：后下部大幅外扩
    gripShape.quadraticCurveTo(-0.038, -0.086, -0.035, -0.050);
    gripShape.quadraticCurveTo(-0.032, -0.012, -0.028, 0.012);
    gripShape.lineTo(-0.026, 0.085);
    gripShape.closePath();
    const gripGeo = new THREE.ExtrudeGeometry(gripShape, { depth: 0.085, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2 });
    gripGeo.translate(0, 0, -0.0425);
    const grip = new THREE.Mesh(gripGeo, glockGripMat);
    grip.position.set(X, -0.30, -0.44);
    grip.rotation.x = -0.34;   // 约 19.5° 后倾（J:\18 握把倾角略缓，粗壮赛事握把）
    grip.castShadow = true;
    g.add(grip);

    // ---- 13. 握把防滑纹（4 条斜向细棱，沿握把前斜面，真实凸起；作为 grip 子节点跟随倾角）----
    for (let i = 0; i < 4; i++) {
      const stria = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.010), glockDarkMat);
      stria.position.set(0.028, -0.02 - i * 0.022, 0);
      stria.rotation.z = 0.28;
      grip.add(stria);
    }

    // ---- 14. 弹匣（微弧形：两侧薄片错位）+ 底板（带横棱）----
    // 弹匣整体包成 magGroup：换弹动画时整组沿 -Y 滑出（卸夹）→ 隐藏 → 新夹上滑插回（装夹）
    const magGroup = new THREE.Group();
    magGroup.userData.baseY = 0;   // 弹匣基准高度（相对枪身局部）
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.09, 0.022), glockDarkMat);
    mag.position.set(X, -0.42, -0.44);
    magGroup.add(mag);
    const magSideL = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.085, 0.020), glockDarkMat);
    magSideL.position.set(X - 0.016, -0.42, -0.443);
    magGroup.add(magSideL);
    const magSideR = magSideL.clone();
    magSideR.position.x = X + 0.016;
    magSideR.position.z = -0.437;
    magGroup.add(magSideR);
    const magFloor = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.012, 0.024), glockMat);
    magFloor.position.set(X, -0.468, -0.44);
    magGroup.add(magFloor);
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.004, 0.004), glockDarkMat);
      rib.position.set(X, -0.470 + i * 0.006, -0.454);
      magGroup.add(rib);
    }
    g.add(magGroup);
    g.userData.reloadMag = magGroup;   // 换弹动画载体

    // ---- 15. Safe Action 扳机（两段小 Box 拼出弯板）+ 保险拨杆 ----
    const trigUpper = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.014, 0.008), internalMat);
    trigUpper.position.set(X, -0.228, -0.520);
    trigUpper.rotation.x = 0.20;
    g.add(trigUpper);
    const trigLower = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.016, 0.008), internalMat);
    trigLower.position.set(X, -0.248, -0.518);
    trigLower.rotation.x = -0.20;
    g.add(trigLower);
    // 保险拨杆（嵌在扳机槽内，哑光灰）
    const safetyLever = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, 0.004),
      new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 0.7, metalness: 0.3 }));
    safetyLever.position.set(X, -0.238, -0.518);
    g.add(safetyLever);

    // ---- 16. 弹匣释放钮（扳机护圈左上，左侧小圆柱）----
    const magRelease = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.008, 10), glockDarkMat);
    magRelease.rotation.z = Math.PI / 2;
    magRelease.position.set(X - 0.025, -0.21, -0.50);
    g.add(magRelease);

    // ---- 17. 空仓挂机（套筒左侧凸起）----
    const slideStop = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.026), glockDarkMat);
    slideStop.position.set(X - 0.026, -0.165, -0.46);
    g.add(slideStop);

    // 枪口火光（对准膛口）
    const flash = this._makeMuzzleFlashMesh(X, -0.148, -0.682, 'pistol');
    g.add(flash);
    g.userData.flash = flash;
    return g;
  }

  // AK-47 皮克斯风格 v3 重建（参考 jimeng 爆炸图 + 2089403292898562048 爆炸图 + mulan 三视图）
  // AK-47 真实模型（来源 J:////武器////ak47////456cfc24057067de62317281692822ef.obj）
  // 24,986 顶点 → 32,879 (v,vt) 去重顶点，50,000 三角形
  // 原始 OBJ 坐标系：X=枪长(1.18, -X 端枪口), Y=高度(0.34), Z=宽度(0.09)
  // 数据已在 ak47_model.js 中预减包围盒中心 (cx=0,cy=0.172,cz=0) → 当前坐标中心 (0,0,0)
  // viewmodel 映射：mesh.rotation.y=-PI/2 → -X(枪口)→-Z(前方)
  // PBR 贴图（albedo/metallic/roughness/normal，1024px webp base64）在 ak47_tex.js，
  // data URL 形式内嵌 → 零外部文件依赖（避免真机容器异步 webp 加载失落的坑）
  // 贴图加载异步：先创建灰色占位材质，加载完成后替换为真实 PBR 通道
  _buildAK() {
    const g = new THREE.Group();
    // 真实 PBR 材质（贴图加载前灰色兜底，AK 整体是冷灰金属+紫色聚合物感觉，0x9a8a98 中性）
    const akMat = new THREE.MeshPhysicalMaterial({
      color: 0x9a8a98, roughness: 0.55, metalness: 0.5, clearcoat: 0.15,
    });
    // 构建真实模型（mesh 内部已 rotation.y=-PI/2：枪口朝 -Z）
    const mesh = window.Ak47Model.build(null, akMat);
    g.add(mesh);
    // 整体平移到 viewmodel 居中：X 偏移 0.22、Y 中心 -0.19、Z=-0.41（枪管在 z≈-1.0）
    g.position.set(0.22, -0.19, -0.41);
    // 异步加载真实 PBR 贴图（data URL 同步可解码，无外部文件依赖）
    if (window.Ak47Tex && window.Ak47Tex.loadAll) {
      window.Ak47Tex.loadAll().then((texs) => {
        if (texs.albedo)   { akMat.map = texs.albedo;        akMat.color.set(0xffffff); }
        if (texs.normal)   { akMat.normalMap = texs.normal;  akMat.normalScale = new THREE.Vector2(0.7, 0.7); }
        if (texs.roughness){ akMat.roughnessMap = texs.roughness; akMat.roughness = 0.9; }
        if (texs.metallic) { akMat.metalnessMap = texs.metallic;  akMat.metalness = 0.9; }
        akMat.needsUpdate = true;
      });
    }
    // Muzzle flash（枪口在 mesh 局部 z=-0.59 处，X/Y 居中）
    const flash = this._makeMuzzleFlashMesh(0, 0, -0.59, 'ak47');
    g.add(flash);
    g.userData.flash = flash;
    // AK OBJ 是枪身与弹匣一体模型，无法安全拆分。禁止再叠加近似长方体弹匣，
    // 否则换弹结束后会出现一块不属于 AK 的贴图模型。
    g.userData.reloadMag = null;
    return g;
  }

  // AWP 真实模型（来源 J:////武器////awp////7cbf8dad723a866b3b3db03fb68da544.obj，fast_simplification 减面 95%）
  // 749,948 顶点 / 1,499,964 面 → 37,465 顶点 / 74,998 面
  // 原始坐标系: X=枪长(1.19, +X 端为枪口), Y=高度(0.32), Z=宽度(0.21)
  // 数据已在 awp_model.js 中预减包围盒中心 → 当前坐标中心 (0,0,0)
  // viewmodel 映射: mesh.rotation.y=+PI/2 → +X(枪口)→-Z(前方)
  // PBR 贴图（albedo/metallic/roughness/normal，1024px webp base64）在 awp_tex.js，
  // data URL 形式内嵌 → 零外部文件依赖（真机可靠）
  _buildAwp() {
    const g = new THREE.Group();
    // 真实 PBR 材质（贴图加载前灰色兜底：AWP 黑聚合物+橄榄绿+钢，0x8a9298 中性冷灰）
    const awpMat = new THREE.MeshPhysicalMaterial({
      color: 0x8a9298, roughness: 0.5, metalness: 0.6, clearcoat: 0.15,
    });
    // 构建真实模型（mesh 内部已 rotation.y=+PI/2：枪口朝 -Z）
    const mesh = window.AwpModel.build(null, awpMat);
    g.add(mesh);
    // 整体平移到 viewmodel 居中：X 偏移 0.22、Y 中心 -0.16、Z=-0.42（枪管在 z≈-1.0）
    g.position.set(0.22, -0.16, -0.42);
    // 异步加载真实 PBR 贴图（data URL 同步可解码，无外部文件依赖）
    if (window.AwpTex && window.AwpTex.loadAll) {
      window.AwpTex.loadAll().then((texs) => {
        if (texs.albedo)   { awpMat.map = texs.albedo;        awpMat.color.set(0xffffff); }
        if (texs.normal)   { awpMat.normalMap = texs.normal;  awpMat.normalScale = new THREE.Vector2(0.7, 0.7); }
        if (texs.roughness){ awpMat.roughnessMap = texs.roughness; awpMat.roughness = 0.9; }
        if (texs.metallic) { awpMat.metalnessMap = texs.metallic;  awpMat.metalness = 0.9; }
        awpMat.needsUpdate = true;
      });
    }
    // Muzzle flash（枪口在 mesh 局部 z=-0.595 处，X/Y 居中）
    const flash = this._makeMuzzleFlashMesh(0, 0, -0.595, 'awp');
    g.add(flash);
    g.userData.flash = flash;
    // 换弹弹夹（AWP 直弹匣，位于扳机护圈前下方，gun 局部 z≈-0.30；平时隐藏）
    const awpMag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.12, 0.026), awpMat);
    awpMag.position.set(0, -0.07, -0.30);
    awpMag.visible = false;
    awpMag.userData.baseY = -0.07;
    g.add(awpMag);
    g.userData.reloadMag = awpMag;
    return g;
  }

  _applyImportedWeaponTextures(textureApi, material, normalStrength) {
    if (!textureApi || typeof textureApi.loadAll !== 'function') return;
    textureApi.loadAll().then((textures) => {
      if (textures.albedo) { material.map = textures.albedo; material.color.set(0xffffff); }
      if (textures.normal) {
        material.normalMap = textures.normal;
        material.normalScale = new THREE.Vector2(normalStrength, normalStrength);
      }
      if (textures.roughness) { material.roughnessMap = textures.roughness; material.roughness = 0.9; }
      if (textures.metallic) { material.metalnessMap = textures.metallic; material.metalness = 0.9; }
      material.needsUpdate = true;
    });
  }

  _buildM249() {
    const group = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x8f8275, roughness: 0.58, metalness: 0.55, clearcoat: 0.12,
    });
    const mesh = window.M249Model.build(null, material);
    group.add(mesh);
    group.position.set(0.22, -0.19, -0.41);
    this._applyImportedWeaponTextures(window.M249Tex, material, 0.7);
    const flash = this._makeMuzzleFlashMesh(0, 0, -0.595, 'm249');
    group.add(flash);
    group.userData.flash = flash;
    // 弹鼓已经焊在 OBJ 中，和 AK 一样不叠加近似换弹代理。
    group.userData.reloadMag = null;
    return group;
  }

  _buildM9() {
    const group = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x6d78a8, roughness: 0.48, metalness: 0.62, clearcoat: 0.22,
    });
    const mesh = window.M9Model.build(null, material);
    mesh.scale.setScalar(0.48);
    // 刀尖仍朝前，但额外向屏幕中心偏转，避免整把刺刀沿视线轴被压成一个刀尖。
    mesh.rotation.y = -Math.PI / 2 + 0.58;
    mesh.rotation.x = 0.1;
    mesh.rotation.z = -0.22;
    group.add(mesh);
    group.position.set(0.22, -0.16, -0.42);
    this._applyImportedWeaponTextures(window.M9Tex, material, 0.62);
    group.userData.reloadMag = null;
    return group;
  }

  _buildGrenade() {
    const group = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x65704c, roughness: 0.7, metalness: 0.3, clearcoat: 0.05,
    });
    const mesh = window.GrenadeModel.build(null, material);
    mesh.scale.setScalar(0.18);
    mesh.rotation.z = 0.18;
    group.add(mesh);
    group.position.set(0.22, -0.12, -0.50);
    this._applyImportedWeaponTextures(window.GrenadeTex, material, 0.58);
    group.userData.reloadMag = null;
    group.userData.projectileGeometry = mesh.geometry;
    group.userData.projectileMaterial = material;
    return group;
  }




  _makeRoundedBox(w, h, d, r) {
    const s = new THREE.Shape();
    const x0 = -w / 2, y0 = -h / 2;
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
    s.moveTo(x0 + rr, y0);
    s.lineTo(x0 + w - rr, y0);
    s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr);
    s.lineTo(x0 + w, y0 + h - rr);
    s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h);
    s.lineTo(x0 + rr, y0 + h);
    s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr);
    s.lineTo(x0, y0 + rr);
    s.quadraticCurveTo(x0, y0, x0 + rr, y0);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: d, bevelEnabled: true, bevelThickness: rr * 0.5, bevelSize: rr * 0.5, bevelSegments: 2,
    });
    geo.translate(0, 0, -d / 2);
    return geo;
  }

  _makeWoodNormalTexture(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const grain = Math.sin(x * 0.28 + Math.sin(y * 0.09) * 1.5) * 0.5 + 0.5;
        H[y * size + x] = 0.35 + grain * 0.3 + (Math.random() - 0.5) * 0.08;
      }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const hL = H[y * size + (x + size - 1) % size];
        const hR = H[y * size + (x + 1) % size];
        const hD = H[((y + size - 1) % size) * size + x];
        const hU = H[((y + 1) % size) * size + x];
        const nx = (hL - hR) * 3;
        const ny = (hD - hU) * 1.2;
        const nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const p = i * 4;
        img.data[p]     = (nx / len * 0.5 + 0.5) * 255;
        img.data[p + 1] = (ny / len * 0.5 + 0.5) * 255;
        img.data[p + 2] = (nz / len * 0.5 + 0.5) * 255;
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // ---------- 几何/材质工具函数库（移植自 img2threejs AWP 参考，适配经典脚本） ----------
  // 参考版这些是模块级纯函数；这里改为实例方法，因为要用到 this._viewGroup（不需）与 THREE（全局）。
  // 约定：所有几何 build 后 translate(0,0,-depth/2) 居中 + computeVertexNormals()，与参考一致。

  // 材质工厂：统一 clearcoat 逻辑（metalness 高 → 清漆薄，低 → 清漆厚），可叠加 extra
  _pbrMat(color, roughness, metalness, extra) {
    return new THREE.MeshPhysicalMaterial(Object.assign({
      color, roughness, metalness,
      clearcoat: metalness > 0.5 ? 0.18 : 0.3,
      clearcoatRoughness: 0.18,
    }, extra || {}));
  }

  // 圆角盒（Shape + Extrude）：width/height 为截面 X/Y，depth 为沿 Z 挤出，radius 圆角
  _roundedBox(width, height, depth, radius, mat, segments) {
    segments = segments || 4;
    const shape = new THREE.Shape();
    const x = width / 2, y = height / 2;
    const r = Math.min(radius, x, y);
    shape.moveTo(-x + r, -y);
    shape.lineTo(x - r, -y);
    shape.quadraticCurveTo(x, -y, x, -y + r);
    shape.lineTo(x, y - r);
    shape.quadraticCurveTo(x, y, x - r, y);
    shape.lineTo(-x + r, y);
    shape.quadraticCurveTo(-x, y, -x, y - r);
    shape.lineTo(-x, -y + r);
    shape.quadraticCurveTo(-x, -y, -x + r, -y);
    const br = Math.min(radius * 0.32, depth * 0.18);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelSegments: segments,
      bevelSize: br, bevelThickness: br, curveSegments: segments,
    });
    geometry.translate(0, 0, -depth / 2);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  // 两点圆管（CylinderGeometry 对齐 a→b 方向）
  _tubeBetween(a, b, radius, mat, radialSegments) {
    radialSegments = radialSegments || 16;
    const dir = b.clone().sub(a);
    const geo = new THREE.CylinderGeometry(radius, radius, dir.length(), radialSegments, 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  // 沿 Z 轴的圆柱（镜身/枪管用，默认居中于 x）
  _cyZ(x, z, length, radius, mat, radiusRight, openEnded) {
    const geo = new THREE.CylinderGeometry(radius, radiusRight === undefined ? radius : radiusRight, length, 20, 2, !!openEnded);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.x = x; mesh.position.z = z;
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  // 沿 X 轴的圆柱（水平镜身段，带 taper：left→right 渐变半径）
  _cyX(x, length, radius, mat, radiusRight, openEnded) {
    const geo = new THREE.CylinderGeometry(radius, radiusRight === undefined ? radius : radiusRight, length, 20, 2, !!openEnded);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.z = -Math.PI / 2;
    mesh.position.x = x;
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  // 2D 轮廓挤出（枪托/握把等非矩形部件），holes 为孔位多边形（相对局部坐标）
  _profileGeo(points, depth, holes, bevel) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    for (const loop of (holes || [])) {
      const hole = new THREE.Path();
      hole.moveTo(loop[0][0], loop[0][1]);
      for (let i = 1; i < loop.length; i++) hole.lineTo(loop[i][0], loop[i][1]);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, steps: 2,
      bevelEnabled: bevel > 0, bevelSegments: 3,
      bevelSize: bevel, bevelThickness: bevel, curveSegments: 8,
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.computeVertexNormals();
    return geometry;
  }

  // 椭圆孔位点串（配合 _profileGeo holes 用）
  _ellipseLoop(cx, cy, width, height, segments) {
    const points = [];
    const n = segments || 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      points.push([cx + Math.cos(a) * width * 0.5, cy + Math.sin(a) * height * 0.5]);
    }
    return points;
  }


  _setMuzzleOpacity(flash, amount) {
    if (!flash) return;
    const a = Math.max(0, Math.min(1, amount));
    for (const part of (flash.userData.parts || [])) {
      if (part.object && part.object.material) part.object.material.opacity = a * part.opacity;
    }
    const light = flash.userData.light;
    if (light) light.intensity = a * (light.userData.maxIntensity || 2.6);
    flash.visible = a > 0;
  }

  _hideAllMuzzleFlashes() {
    if (!this._viewGuns) return;
    for (const key in this._viewGuns) {
      const flash = this._viewGuns[key].userData.flash;
      if (flash) this._setMuzzleOpacity(flash, 0);
    }
    this._muzzleTimer = 0;
  }

  _spawnMuzzleFlash() {
    const gun = this._viewGuns && this._viewGuns[this.currentId];
    const flash = gun && gun.userData.flash;
    if (flash) {
      // 每发只改变局部气体形态，保持整个挂点与枪管轴线不发生缩放位移。
      flash.rotation.z = (Math.random() - 0.5) * 0.45;
      for (const plume of (flash.userData.plumes || [])) {
        plume.scale.set(0.82 + Math.random() * 0.35, 0.8 + Math.random() * 0.75, 1);
      }
      const core = flash.userData.core;
      if (core) core.scale.setScalar(1 + Math.random() * 0.5);
      const glow = flash.userData.glow;
      const profile = flash.userData.profile || { radius: 0.18 };
      if (glow) glow.scale.setScalar(profile.radius * (0.88 + Math.random() * 0.32));
      const gasRing = flash.userData.gasRing;
      if (gasRing) gasRing.scale.set(
        profile.radius * (1.15 + Math.random() * 0.45),
        profile.radius * (0.58 + Math.random() * 0.28), 1
      );
      this._setMuzzleOpacity(flash, 1);
    }
    this._muzzleTimer = this._effectDuration((CONFIG.performance && CONFIG.performance.muzzleDuration) || 0.075);
    // 枪模后坐位移（本次扭向随机：AK 左右摆明显）
    this._viewYawDir = Math.random() < 0.5 ? -1 : 1;
    this._viewRecoil = 1;
  }

  _updateViewModel(dt) {
    const w = CONFIG.weapons[this.currentId];
    // 切换武器显隐：数据驱动遍历全部三把枪（修复：原逻辑只设 usp/ak47，
    // AWP 从未设置 visible 恒为 true，三枪叠加穿模。现每把枪单独模型、互不叠加）
    if (this._viewGuns) {
      for (const key in this._viewGuns) {
        this._viewGuns[key].visible = (key === this.currentId);
      }
    }

    // ---- 后坐力回弹（viewKick 数据驱动，真机可感知的物理冲击）----
    // 位移/上挑/扭动幅度随武器差异化：USP 轻快、AK 连发左右摆、AWP 重后坐慢回位
    const vk = w.viewKick || { push: 0.05, pitch: 0.09, yaw: 0, decay: 8 };
    this._viewRecoil = Math.max(0, this._viewRecoil - dt * vk.decay);
    const kick = this._viewRecoil;
    const recoilPitch = kick * vk.pitch;              // 上挑角（rotation.x 正值 = 前方枪口抬起）
    const recoilPush = kick * vk.push;                // 后缩位移（沿 -Z 枪模后拉）
    const recoilYaw = kick * vk.yaw * this._viewYawDir; // 左右扭（连发时枪口左右摆，AK 最明显）

    // 走路晃动：相位只在移动时推进，停步后由独立幅度回零。
    // 不能衰减相位本身，否则未射击时 sin(phase) 仍会变化，表现为枪口自动下沉/抬起。
    const bobAmount = this.player && Number.isFinite(this.player.viewBobAmount)
      ? this.player.viewBobAmount : 0;
    const bob = Math.sin(this.player.viewBob * 2) * 0.01 * bobAmount;
    this._viewGroup.position.x = bob * 0.5;
    const proneAmt = this.player && typeof this.player.getProneAmount === 'function'
      ? this.player.getProneAmount() : (this.player && this.player._proneAmt) || 0;
    const crouchAmt = (this.player && this.player._crouchAmt) || 0;

    // 切枪动画（F5）：下放→上抬，叠加在姿态上
    const sw = this._updateSwitchAnim(dt) || { y: 0, r: 0 };

    // ---- 换弹动作变量（声明前置，供下方 position.y 使用）----
    let dip = 0, sideTilt = 0, lowY = 0;

    // ---- 换弹动作：卸夹 → 换夹 → 回位（四段复合动画）----
    // 时间轴 t∈[0,1]：0~30% 枪下倾+侧转+下沉，弹夹沿 -Y 滑出（卸夹）
    //             30~45% 旧夹脱出（隐藏）  45~70% 新弹夹从下方上滑插回
    //             70~100% 枪身回正（换夹完成）
    if (this.reloadTimer > 0) {
      const t = 1 - this.reloadTimer / w.reloadTime;
      const lower = Math.min(1, t / 0.30);              // 下放进度
      const raise = Math.max(0, (t - 0.70) / 0.30);     // 回位进度
      const pose = lower - raise;                        // 0→1→0 姿态包络
      dip = pose * 0.38;        // 枪口下倾角（rotation.x 负向 = 枪口压低）
      sideTilt = pose * 0.34;   // 侧转（向左翻转露出弹匣槽，负 rotation.z）
      lowY = pose * 0.10;       // 枪身下沉
      const gun = this._viewGuns && this._viewGuns[this.currentId];
      const mag = gun && gun.userData.reloadMag;
      if (mag) {
        const baseY = mag.userData.baseY || 0;
        if (t < 0.30) {          // 卸夹：整组沿 -Y 滑出
          mag.visible = true;
          mag.position.y = baseY - (t / 0.30) * 0.16;
        } else if (t < 0.45) {   // 旧夹脱出（隐藏）
          mag.visible = false;
        } else if (t < 0.70) {   // 新夹插入：从下方上滑回槽位
          mag.visible = true;
          mag.position.y = baseY - 0.16 + ((t - 0.45) / 0.25) * 0.16;
        } else {                 // 装夹完成
          mag.visible = true;
          mag.position.y = baseY;
        }
      }
    } else {
      // 换弹结束的同一帧立即隐藏并复位临时弹匣，不能把动画代理留在枪模上。
      const gun = this._viewGuns && this._viewGuns[this.currentId];
      const mag = gun && gun.userData.reloadMag;
      if (mag) {
        mag.visible = false;
        mag.position.y = mag.userData.baseY || 0;
      }
    }
    if (this._meleeSwing > 0) this._meleeSwing = Math.max(0, this._meleeSwing - dt / Math.max(0.2, w.fireRate));
    if (this._throwAnim > 0) this._throwAnim = Math.max(0, this._throwAnim - dt / 0.48);
    const meleeEnvelope = this._meleeSwing > 0 ? Math.sin((1 - this._meleeSwing) * Math.PI) : 0;
    const throwEnvelope = this._throwAnim > 0 ? Math.sin((1 - this._throwAnim) * Math.PI) : 0;
    this._viewGroup.position.x = bob * 0.5 + meleeEnvelope * 0.12;
    this._viewGroup.position.y = -Math.abs(bob) * 0.5 + sw.y - lowY - proneAmt * 0.06 - crouchAmt * 0.012 - throwEnvelope * 0.06;
    this._viewGroup.position.z = recoilPush + proneAmt * 0.04 + meleeEnvelope * 0.06 + throwEnvelope * 0.18;
    this._viewGroup.rotation.x = recoilPitch - dip + sw.r + proneAmt * 0.025 + meleeEnvelope * 0.16 - throwEnvelope * 0.48;
    this._viewGroup.rotation.y = -meleeEnvelope * 0.85 + throwEnvelope * 0.2;
    this._viewGroup.rotation.z = recoilYaw - sideTilt + meleeEnvelope * 0.5 + throwEnvelope * 0.25;
  }

  // ---------- 弹壳系统（池化 + 重力物理，真机轻量） ----------
  // 每枪从抛壳口（viewKick 的 shell 局部坐标）向右后方抛出黄铜弹壳，
  // 带自旋与重力下落，落地弹跳一次后停留回收。共享几何/材质，最多 12 个活跃。
  _buildShellPool() {
    this._shellGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.02, 6);
    this._shellMat = new THREE.MeshBasicMaterial({ color: 0xd9a83f });  // 黄铜
    const maxShells = (CONFIG.performance && CONFIG.performance.maxShells) || 12;
    this._shellMax = maxShells;
    // InstancedMesh：全部弹壳一个 draw call；实例槽位即池语义。
    this._shellMesh = new THREE.InstancedMesh(this._shellGeo, this._shellMat, maxShells);
    this._shellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._shellMesh.frustumCulled = false;
    this._shellMesh.count = maxShells;
    const zero = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (let i = 0; i < maxShells; i++) this._shellMesh.setMatrixAt(i, zero);
    this.scene.add(this._shellMesh);
    this._shellPool = [];
    this._shellState = new Array(maxShells);
    for (let i = 0; i < maxShells; i++) this._shellPool.push(i);
  }

  _writeShellMatrix(state) {
    const m = this._shellTempMatrix || (this._shellTempMatrix = new THREE.Matrix4());
    const q = this._shellTempQuat || (this._shellTempQuat = new THREE.Quaternion());
    const s = this._shellTempScale || (this._shellTempScale = new THREE.Vector3(1, 1, 1));
    s.setScalar(state.hidden ? 0.0001 : 1);
    q.setFromEuler(state.rot);
    m.compose(state.pos, q, s);
    this._shellMesh.setMatrixAt(state.slot, m);
    this._shellMesh.instanceMatrix.needsUpdate = true;
  }

  _spawnShell() {
    const w = CONFIG.weapons[this.currentId];
    const gun = this._viewGuns && this._viewGuns[this.currentId];
    if (!gun || !w.shell) return;
    const base = (CONFIG.performance && CONFIG.performance.maxShells) || 12;
    // 预算档位可能放大到池上限之上（high 档 15 > _shellMax 12），与弹壳池封顶对齐。
    const activeCap = Math.min(this._effectBudget(base, 4), this._shellMax);
    if (this._shells.length >= activeCap) {
      // 池满：回收最旧实例槽位（弹壳小，原地消失不明显）
      const oldest = this._shells.shift();
      if (!oldest) return;
      this._shellPool.push(oldest.slot);
    }
    const slot = this._shellPool.pop();
    if (slot === undefined) return;
    // 抛壳口：枪模局部 → 世界（gun 含自身平移，localToWorld 精确）
    const p = new THREE.Vector3(w.shell.x, w.shell.y, w.shell.z);
    gun.updateMatrixWorld(true);
    p.applyMatrix4(gun.matrixWorld);
    // 初速度：向右 + 上 + 后方（相机基向量），经典第一人称抛壳观感
    const q = this.camera.quaternion;
    const v = new THREE.Vector3();
    v.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(q), 0.5 + Math.random() * 0.25);
    v.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), 0.45 + Math.random() * 0.3);
    v.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(q), -1.3 - Math.random() * 0.5);
    const state = {
      slot,
      pos: p,
      rot: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      vel: v,
      ang: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
      life: 3.5,        // 空中寿命上限（防卡地形）
      ground: false,    // 已落地
      bounce: 0,        // 弹跳次数
      fade: 0,          // 落地停留计时
      hidden: false,
    };
    this._shellState[slot] = state;
    this._shells.push(state);
    this._writeShellMatrix(state);
  }

  _updateShells(dt) {
    const G = CONFIG.player.gravity;
    for (let i = this._shells.length - 1; i >= 0; i--) {
      const d = this._shells[i];
      d.life -= dt;
      if (d.life <= 0) { this._recycleShell(i, d); continue; }
      if (!d.ground) {
        // 空中：重力积分 + 自旋
        d.vel.y -= G * dt;
        d.pos.addScaledVector(d.vel, dt);
        d.rot.x += d.ang.x * dt;
        d.rot.y += d.ang.y * dt;
        d.rot.z += d.ang.z * dt;
        // 落地检测（弹壳半径 0.007，留小间隙防穿地）
        if (d.pos.y <= 0.012) {
          d.pos.y = 0.012;
          if (d.bounce === 0 && d.vel.y < -1.2) {
            // 第一次弹跳：竖向反弹减弱 + 水平摩擦 + 自旋衰减
            d.vel.y = -d.vel.y * 0.32;
            d.vel.x *= 0.55; d.vel.z *= 0.55;
            d.ang.multiplyScalar(0.5);
            d.bounce = 1;
          } else {
            // 停住：原地停留 1.2s 后回收
            d.vel.set(0, 0, 0);
            d.ground = true;
            d.fade = 1.2;
          }
        }
      } else {
        d.fade -= dt;
        if (d.fade <= 0) { this._recycleShell(i, d); continue; }
      }
      this._writeShellMatrix(d);
    }
  }

  _recycleShell(i, state) {
    state.hidden = true;
    this._writeShellMatrix(state);   // 缩为零，从画面消失
    this._shells.splice(i, 1);
    this._shellPool.push(state.slot);
  }

  // ---------- 弹道与弹孔 ----------
  _spawnTracer(from, to) {
    // 池化复用：避免每发子弹 new Geometry/Line（高频分配触发 GC 卡顿）
    let line = this._tracerPool && this._tracerPool.pop();
    const baseTracers = (CONFIG.performance && CONFIG.performance.maxTracers) || 24;
    const maxTracers = this._effectBudget(baseTracers, 6);
    if (!line && this._tracers.length >= maxTracers) {
      // 达到移动端瞬时预算时直接复用最旧轨迹，不创建新 Geometry。
      line = this._tracers.shift();
      this.scene.remove(line);
    }
    if (!line) {
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const mat = new THREE.LineBasicMaterial({
        color: 0xffee88, transparent: true, opacity: 0.8,
      });
      line = new THREE.Line(geo, mat);
      this._tracerPool = this._tracerPool || [];
    } else {
      line.geometry.setFromPoints([from, to]);
    }
    line.userData.maxLife = this._effectDuration(0.06);
    line.userData.life = line.userData.maxLife;
    line.material.opacity = 0.8;
    line.visible = true;
    this.scene.add(line);
    this._tracers.push(line);
  }

  _updateTracers(dt) {
    for (let i = this._tracers.length - 1; i >= 0; i--) {
      const t = this._tracers[i];
      t.userData.life -= dt;
      t.material.opacity = Math.max(0, t.userData.life / (t.userData.maxLife || 0.06)) * 0.8;
      if (t.userData.life <= 0) {
        this.scene.remove(t);
        t.visible = false;
        this._tracerPool.push(t);   // 归还池中复用，不再 dispose
        this._tracers.splice(i, 1);
      }
    }
    for (let i = this._impacts.length - 1; i >= 0; i--) {
      const m = this._impacts[i];
      m.userData.life -= dt;
      if (m.userData.life <= 0) {
        this.scene.remove(m);
        this._impactPool.push(m);
        this._impacts.splice(i, 1);
      }
    }
    for (let i = this._hitSparks.length - 1; i >= 0; i--) {
      const s = this._hitSparks[i];
      s.userData.life -= dt;
      s.material.opacity = Math.max(0, s.userData.life / (s.userData.maxLife || 0.12));
      if (s.userData.life <= 0) {
        this.scene.remove(s);
        s.visible = false;
        this._hitPool.push(s);
        this._hitSparks.splice(i, 1);
      }
    }
  }

  _buildImpactPool() {
    this._impactPool = [];
    const geo = new THREE.CircleGeometry(0.06, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x111111, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    });
    const maxImpacts = (CONFIG.performance && CONFIG.performance.maxImpacts) || 24;
    for (let i = 0; i < maxImpacts; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      this.scene.add(m);
      this._impactPool.push(m);
    }
  }

  _spawnImpact(point, normal) {
    const base = (CONFIG.performance && CONFIG.performance.maxImpacts) || 24;
    if (this._impacts.length >= this._effectBudget(base, 6)) return;
    let m = this._impactPool.pop();
    if (!m) return;
    // 沿墙面外法线微偏移避免 Z-fighting；面朝向法线，精确贴合墙面
    m.position.copy(point).addScaledVector(normal, 0.01);
    m.lookAt(point.clone().add(normal));
    m.visible = true;
    m.material.opacity = 0.9;
    m.userData.life = this._effectDuration(6);
    this.scene.add(m);
    this._impacts.push(m);
  }

  // 新局重置。可传出战配置 loadout { carried: [id...], start: id }：
  // 注入后本局只携带勾选的武器并开局手持「首发」武器；不传时保持旧行为
  // （全武器、开局 Glock）。
  reset(loadout) {
    let inventory = null;
    let startId = 'usp';
    if (loadout && window.CS15Loadout && typeof window.CS15Loadout.inventoryOf === 'function') {
      inventory = window.CS15Loadout.inventoryOf(loadout);
      if (inventory.length) {
        startId = inventory.indexOf(loadout.start) >= 0 ? loadout.start : inventory[0];
      }
    }
    this._inventory = inventory;
    this.upgrades = this._freshUpgrades();   // 强化仅当局生效，新局清零
    this.currentId = startId;
    this.state = this._freshState(startId);
    this._stash = {};
    this.firing = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this._spreadCurrent = 0;
    this._semiPending = false;
    // 手雷耗尽自动切回的目标：携带清单里槽位最靠前的火器（首发是雷/刀时不至于无处可切）。
    const pool = inventory || this.getInventory();
    this._lastFirearmId = pool.find((id) => {
      const pw = CONFIG.weapons[id];
      return pw && (!pw.kind || pw.kind === 'firearm');
    }) || startId;
    this._autoSwitchTimer = 0;
    this._meleeSwing = 0;
    this._throwAnim = 0;
    this.switching = false;
    this._switchAnim = 0;
    this.clearScopeZoom(true);                    // 新局 FOV/准星/开镜按钮全部复位
    this._viewRecoil = 0;                         // 不把上一局枪口冲击带入新局
    this._hideAllMuzzleFlashes();
    this._viewYawDir = 1;
    // 复位全部换弹弹夹（新局清场）
    if (this._viewGuns) {
      for (const key in this._viewGuns) {
        const mg = this._viewGuns[key].userData.reloadMag;
        if (mg) { mg.visible = false; mg.position.y = mg.userData.baseY || 0; }
      }
    }
    // 回收全部弹壳（新局清场）
    for (let i = this._shells.length - 1; i >= 0; i--) this._recycleShell(i, this._shells[i]);
    this._clearGrenadeEffects();
    if (this.player) {
      const startW = CONFIG.weapons[this.currentId];
      // 开局武器的移速惩罚直接生效（AWP/M249 主武器起步即按携带减速）。
      this.player.weaponSpeedMul = startW && startW.moveSpeedMul != null ? startW.moveSpeedMul : 1;
      this.player.aimSensitivityMul = 1;
    }
    this.hud.updateWeapon(CONFIG.weapons[this.currentId], this.state, this.currentMagSize());
  }

  dispose() {
    this._clearGrenadeEffects();
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}

// 经典脚本全局暴露（依赖顺序：config → three(UMD) → map → player → enemy → weapon → …）
window.WeaponSystem = WeaponSystem;
