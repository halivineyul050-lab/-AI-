// main.js —— 入口与主游戏循环
// 职责：创建渲染器/场景/相机、管理指针与触摸输入、驱动每帧 update、
//        回合流程（波次刷怪 → 全清 → 下一波 → 通关/阵亡结算）
// 经典脚本（非 ES Module）：首屏只依赖 THREE / CONFIG / HUD / AudioFX；
//        地图、敌人和武器模块由包内资源调度器在玩家点击开始后分段加载。

// 敌人近邻查询的运行时宽相位。桶数组会复用，避免每个敌人都扫描完整敌人列表。
class EnemySpatialHash {
  constructor(cellSize = 2) {
    this.cellSize = Math.max(1, Number(cellSize) || 2);
    this.cells = new Map();
    this.activeBuckets = [];
  }

  rebuild(enemies) {
    for (const bucket of this.activeBuckets) bucket.length = 0;
    this.activeBuckets.length = 0;
    for (const enemy of enemies || []) {
      if (!enemy || !enemy.alive) continue;
      const gx = Math.floor(enemy.position.x / this.cellSize);
      const gz = Math.floor(enemy.position.z / this.cellSize);
      const key = `${gx},${gz}`;
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = [];
        this.cells.set(key, bucket);
      }
      if (bucket.length === 0) this.activeBuckets.push(bucket);
      bucket.push(enemy);
    }
  }

  queryInto(x, z, radius, out) {
    const result = out || [];
    result.length = 0;
    const minGX = Math.floor((x - radius) / this.cellSize);
    const maxGX = Math.floor((x + radius) / this.cellSize);
    const minGZ = Math.floor((z - radius) / this.cellSize);
    const maxGZ = Math.floor((z + radius) / this.cellSize);
    for (let gz = minGZ; gz <= maxGZ; gz++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const bucket = this.cells.get(`${gx},${gz}`);
        if (!bucket) continue;
        for (const enemy of bucket) result.push(enemy);
      }
    }
    return result;
  }
}

class Game {
  constructor() {
    // 全局错误捕获浮层：真机看不到控制台时，任何运行时报错直接显示红字，可截图定位
    const errBox = document.createElement('div');
    errBox.id = 'errBox';
    errBox.style.cssText = 'position:fixed;top:2px;left:2px;right:2px;z-index:99999;background:rgba(180,0,0,.9);color:#fff;font:11px monospace;padding:3px 6px;white-space:pre-wrap;display:none';
    document.body.appendChild(errBox);
    window.onerror = (msg, src, line, col, err) => {
      const t = (err && err.stack ? err.stack.split('\n').slice(0, 3).join(' ⏎ ') : '') || (msg + ' @' + line);
      errBox.textContent = '⚠️ ERR: ' + t;
      errBox.style.display = 'block';
    };
    // 真机稳定性：onerror 只能捕获同步异常，Promise 静默失败也要上报到错误浮层
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event && event.reason;
      const t = (reason && reason.stack ? reason.stack.split('\n').slice(0, 3).join(' ⏎ ') : '') || String(reason);
      errBox.textContent = '⚠️ ERR(P): ' + t;
      errBox.style.display = 'block';
    });

    this.hud = new HUD();
    this.audio = new AudioFX();
    this.hud.audio = this.audio;
    this.medalSystem = new MedalSystem({
      medals: CONFIG.medals.list,
      weaponMedals: CONFIG.medals.weaponMastery && CONFIG.medals.weaponMastery.list,
      weaponMasteryKills: CONFIG.medals.weaponMastery && CONFIG.medals.weaponMastery.kills,
      challenges: CONFIG.medals.challenges,   // 挑战成就（一次性行为解锁）装配进勋章系统
      storageKey: CONFIG.medals.storageKey,
    });
    this._runUnlockedMedalIds = [];

    // 触屏优先稳定帧率：默认关闭 MSAA 和实时阴影，限制 DPR；角色仍保留低成本接触阴影。
    this._layout = this._loadLayout();
    this._applyEnemyDamageSettings(this._layout.enemyDamageMin, this._layout.enemyDamageMax, false);
    this._applyArmorDropSettings(this._layout.armorDropChance, false);
    const inputSafety = CONFIG.inputSafety || {};
    this._interactionInsets = {
      left: Math.max(0, Number(inputSafety.landscapeLeftReserve) || 88),
      right: 0,
      bottom: Math.max(0, Number(inputSafety.landscapeBottomReserve) || 32),
    };
    this._isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const cores = navigator.hardwareConcurrency || 8;
    const memory = navigator.deviceMemory;
    const lowEnd = this._isTouchDevice && (cores <= 4 || (memory && memory <= 4));
    this._lowEndDevice = !!lowEnd;
    this._graphics = this._loadGraphicsSettings();
    this._renderProfile = this._buildRenderProfile(this._graphics);
    this._effectiveDpr = Math.min(window.devicePixelRatio || 1, this._renderProfile.dprCap);
    CONFIG.shadowMapSize = this._renderProfile.shadowMapSize;
    window.CS15_LOWEND = !!lowEnd;
    window.CS15_TOUCH = this._isTouchDevice;
    this._applyGraphicsBudgets();
    window.CS15_TEXTURE_ANISOTROPY = this._graphics.anisotropy;
    window.CS15_CONTACT_SHADOWS_ENABLED = this._graphics.shadows === 'contact';
    window.CS15_DYNAMIC_SHADOWS_ENABLED = this._graphics.shadows === 'dynamic';

    // 横屏包装层：小工具容器/WebView 常被宿主 App 锁定为竖屏、无法跟随设备旋转
    //（skill 文档明确容器不提供浏览器级全屏、方向锁定或鼠标锁定），
    // 把全部游戏 DOM 包进一层，视口为竖屏时整体 CSS 旋转 90° 强制横屏
    const gameRoot = document.createElement('div');
    gameRoot.id = 'gameRoot';
    for (const el of Array.from(document.body.children)) {
      if (el.tagName !== 'SCRIPT') gameRoot.appendChild(el);
    }
    document.body.appendChild(gameRoot);
    this.gameRoot = gameRoot;
    this._rotated = false;

    // Three 基础设施
    // 渲染器：小红书 miniapp-simulator 的 WebGL 可能受限，创建失败逐级降级重试
    let rendererCfg = { antialias: this._renderProfile.antialias, powerPreference: 'high-performance' };
    try {
      this.renderer = new THREE.WebGLRenderer(rendererCfg);
    } catch (e) {
      console.error('[cs15] renderer hi failed, retry low', e);
      try { this.renderer = new THREE.WebGLRenderer({ antialias: false }); }
      catch (e2) { console.error('[cs15] renderer failed', e2); throw e2; }
    }
    const initialViewport = window.visualViewport;
    const initialWidth = (initialViewport && initialViewport.width >= 100) ? initialViewport.width : window.innerWidth;
    const initialHeight = (initialViewport && initialViewport.height >= 100) ? initialViewport.height : window.innerHeight;
    this.renderer.setSize(initialWidth, initialHeight);
    // 渲染配置逐项防御：任一失败仅跳过该项（真机/模拟器 WebGL 差异）
    try {
      this.renderer.setPixelRatio(this._effectiveDpr);
      this.renderer.shadowMap.enabled = this._renderProfile.shadows;
      this.renderer.shadowMap.type = this._renderProfile.shadowType;
    } catch (e) { console.error('[cs15] shadow/dpr failed', e); }
    try { this.renderer.outputColorSpace = THREE.SRGBColorSpace; } catch (e) { console.error('[cs15] colorSpace failed', e); }
    try { this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0; } catch (e) { console.error('[cs15] toneMapping failed', e); }
    try {
      const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
      window.CS15_TEXTURE_ANISOTROPY = Math.max(1, Math.min(maxAnisotropy || 1, this._graphics.anisotropy));
    } catch (error) { window.CS15_TEXTURE_ANISOTROPY = 1; }
    gameRoot.appendChild(this.renderer.domElement);

    // 真机稳定性：移动 WebView 切后台时 GPU 上下文可能被系统回收。
    // preventDefault 是浏览器尝试恢复上下文的必要条件；丢失期间自动暂停并提示，
    // 恢复后由 THREE 自动重传几何/纹理资源，玩家从暂停界面手动继续。
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      try { if (this.state === 'playing') this._pauseForSystemInterruption(); } catch (e) { /* 暂停失败不遮蔽主错误 */ }
      errBox.textContent = '⚠️ 图形上下文丢失，正在恢复…';
      errBox.style.display = 'block';
    }, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      errBox.style.display = 'none';
    }, false);

    this.scene = new THREE.Scene();
    // 冷峻军事氛围：轻距离雾（纵深 + 电影感，不遮近战）
    this.scene.fog = new THREE.FogExp2(0x8a93a0, 0.006);
    this.camera = new THREE.PerspectiveCamera(CONFIG.fov, initialWidth / initialHeight, 0.05, CONFIG.renderDistance);
    this.scene.add(this.camera);

    // 首屏只创建空场景和菜单。地图、敌人、三把枪及其贴图在点击开始后加载，
    // 把大脚本解析、图片解码和 GPU 构建移到有明确进度反馈的准备阶段。
    this._environmentReady = false;
    this.forge = null;
    this.mapId = this._resolveMapId();
    this.selectedMapId = this.mapId;
    this._mapSelectionLocked = false;
    this._lastRunWon = false;
    this.gameMap = null;
    this.player = null;
    this.enemies = [];
    this._enemyPool = [];
    this._enemySpatialHash = new EnemySpatialHash((CONFIG.performance || {}).enemySpatialCellSize || 2);
    this._enemySpatialTimer = 0;
    this._activeEnemyCap = Math.max(1, Math.floor((CONFIG.performance || {}).activeEnemyCap || 4));
    this._enemyCapBadWindows = 0;
    this.weapons = null;
    this.pickups = null;
    this._runtimeReady = false;
    this._runtimeMapId = null;
    this._runtimeLoading = null;

    // 游戏状态
    this.state = 'menu';   // menu / playing / paused / over
    this.wave = 0;
    this.kills = 0;
    this.totalKills = 0;
    this.startTime = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this._waveWarningActive = false;
    this._waveWarningRemaining = 0;
    this._waveWarningLastSecond = -1;

    // 自定义控件布局（localStorage 持久化）
    this._editLayout = false;
    this._layoutEditHudWasHidden = null;
    this._layoutEditMinimapWasHidden = null;
    this._layoutEditMenuWasHidden = null;
    this._layoutEditReturnState = null;
    this._settingsReturnState = null;
    this._settingsFromPlay = false;
    this._resetVirtualJoystick = null;
    this._inputResetters = new Set();
    this._fireTouchId = null;
    this._medalReturnState = 'menu';
    this.medalShare = new MedalShare({
      system: this.medalSystem,
      config: CONFIG.medals,
      bindTap: (element, handler) => this._bindScrollableTap(element, handler),
      toast: (message) => this.hud.toast(message),
    });
    this.medalUI = new MedalUI({
      system: this.medalSystem,
      audio: this.audio,
      bindTap: (element, handler) => this._bindScrollableTap(element, handler),
      onShare: (medal) => this._openMedalShare(medal),
    });
    this._bindSettingsScroll(document.getElementById('medalCenter'));
    this._bindSettingsScroll(document.getElementById('medalShare'));
    // 出战配置加入后菜单内容变高，#menu 与设置中心走同一套滚动方案。
    this._bindSettingsScroll(document.getElementById('menu'));
    this._loadout = window.CS15Loadout
      ? window.CS15Loadout.load(typeof localStorage !== 'undefined' ? localStorage : null)
      : { primary: 'ak47', secondary: 'usp', melee: 'm9' };
    this._bindLoadout();
    this._syncLoadoutUI();
    this._bindMapSelection();
    this._bindSettings();
    this._bindLayoutEdit();

    // 输入：桌面端 Pointer Events 拖动瞄准；移动端触摸瞄准
    this._bindUI();
    this._bindResize();
    this.medalUI.queueUnlocks(this.medalSystem.pendingAnnouncements());

    // 启动渲染循环：游戏态满速；菜单/暂停态低频刷新
    this._lastTime = performance.now();
    this._lastIdleRender = 0;
    this._lastPerfTime = this._lastTime;
    this._perfFrames = [];
    this._perfEvaluationFrames = 0;
    this._loop();
    if (window.CS15ResourceLoader) window.CS15ResourceLoader.mark('menu_ready');
  }

  _resolveMapId() {
    const fallback = (CONFIG.map && CONFIG.map.defaultId) || 'classic';
    try {
      const match = String(window.location && window.location.search || '').match(/[?&]map=([^&]+)/i);
      const requested = match ? decodeURIComponent(match[1]) : '';
      return this._mapChoice(requested) ? requested : fallback;
    } catch (e) {
      return fallback;
    }
  }

  _mapChoices() {
    const configured = CONFIG.map && Array.isArray(CONFIG.map.choices) ? CONFIG.map.choices : [];
    if (configured.length > 0) return configured;
    return [
      { id: 'container-port', name: '港口集装箱仓库', description: '集装箱通道与高低掩体' },
      { id: 'classic', name: '经典竞技场', description: 'CT 房、T 房与中央长廊' },
    ];
  }

  _mapChoice(mapId) {
    return this._mapChoices().find(choice => choice && choice.id === mapId) || null;
  }

  _syncMapPickers() {
    const selected = this.selectedMapId || this.mapId;
    const locked = !!this._mapSelectionLocked;
    const groups = [
      {
        options: document.getElementById('menuMapOptions'),
        status: document.getElementById('menuMapStatus'),
        hint: document.getElementById('menuMapHint'),
      },
      {
        options: document.getElementById('settingsMapOptions'),
        status: document.getElementById('settingsMapStatus'),
        hint: document.getElementById('settingsMapHint'),
      },
    ];
    const selectedChoice = this._mapChoice(selected);
    for (const group of groups) {
      if (group.options) {
        group.options.querySelectorAll('[data-map-id]').forEach((button) => {
          const active = button.dataset.mapId === selected;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
          button.disabled = locked;
          button.setAttribute('aria-disabled', String(locked));
        });
      }
      if (group.status) group.status.textContent = locked ? '本局已锁定' : '可选择';
      if (group.hint) {
        group.hint.textContent = locked
          ? '地图已锁定，玩家阵亡后才能重新选择。'
          : `当前选择：${selectedChoice ? selectedChoice.name : selected}`;
      }
    }
    const subtitle = document.getElementById('menuSubtitle');
    if (subtitle && selectedChoice) subtitle.textContent = `${selectedChoice.name} · Web 射击 Demo`;
  }

  _bindMapSelection() {
    const bindGroup = (id, useScrollableTap) => {
      const group = document.getElementById(id);
      if (!group) return;
      group.querySelectorAll('[data-map-id]').forEach((button) => {
        const handler = () => this._selectMap(button.dataset.mapId);
        if (useScrollableTap) this._bindScrollableTap(button, handler);
        else this._bindTap(button, handler);
      });
    };
    bindGroup('menuMapOptions', false);
    bindGroup('settingsMapOptions', true);
    this._syncMapPickers();
  }

  // ---------- 出战配置（全武器携带勾选 + 首发 + 武器检视）----------
  // 卡片由 CONFIG.weapons 动态生成：新增武器自动出现在选择页。
  _weaponCardDesc(id) {
    const w = CONFIG.weapons[id];
    if (!w) return '';
    if (w.kind === 'melee') return `近战 · ${w.range}m`;
    if (w.kind === 'grenade') return `投掷 · ${w.magSize}枚`;
    const fireMode = w.type === 'auto' ? '全自动' : '半自动';
    if (w.fov) return `栓动狙击 · ${w.magSize}发`;
    return `${fireMode} · ${w.magSize}发`;
  }

  _buildLoadoutUI() {
    const container = document.getElementById('loadoutOptions');
    if (!container || !window.CS15Loadout) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    const masteryIds = new Set(
      (CONFIG.medals && CONFIG.medals.weaponMastery && CONFIG.medals.weaponMastery.list || [])
        .map((medal) => medal.weaponId)
    );
    for (const id of window.CS15Loadout.allWeaponIds()) {
      const weapon = CONFIG.weapons[id];
      if (!weapon) continue;
      const card = document.createElement('div');
      card.className = 'loadout-option';
      card.dataset.weaponId = id;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', 'false');
      card.setAttribute('tabindex', '0');

      const name = document.createElement('span');
      name.className = 'loadout-option-name';
      name.textContent = weapon.name;
      card.appendChild(name);

      const desc = document.createElement('span');
      desc.className = 'loadout-option-desc';
      desc.textContent = this._weaponCardDesc(id);
      card.appendChild(desc);

      if (masteryIds.has(id)) {
        const badge = document.createElement('span');
        badge.className = 'mastery-badge';
        badge.dataset.masteryBadge = id;
        card.appendChild(badge);
      }

      const actions = document.createElement('span');
      actions.className = 'loadout-card-actions';
      const startChip = document.createElement('button');
      startChip.type = 'button';
      startChip.className = 'card-chip start-chip';
      startChip.dataset.startWeapon = id;
      startChip.textContent = '首发';
      actions.appendChild(startChip);
      const inspectChip = document.createElement('button');
      inspectChip.type = 'button';
      inspectChip.className = 'card-chip';
      inspectChip.dataset.inspectWeapon = id;
      inspectChip.textContent = '检视';
      actions.appendChild(inspectChip);
      card.appendChild(actions);
      container.appendChild(card);

      // 整卡点按 = 切换携带；芯片点按需阻断冒泡，避免同时触发卡片切换。
      this._bindTap(card, () => this._selectCarryToggle(id));
      this._bindTap(startChip, (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        this._selectStartWeapon(id);
      });
      this._bindTap(inspectChip, (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        this._openWeaponInspect(id);
      });
    }
  }

  _bindLoadout() {
    this._buildLoadoutUI();
  }

  // 勾选/取消携带一件武器；至少保留一件，取消「首发」时自动换到剩余首把火器。
  _selectCarryToggle(weaponId) {
    if (!window.CS15Loadout || !CONFIG.weapons[weaponId]) return false;
    const carried = this._loadout.carried.slice();
    const index = carried.indexOf(weaponId);
    if (index >= 0) {
      if (carried.length <= 1) {
        if (this.hud) this.hud.toast('至少携带一件武器');
        return false;
      }
      carried.splice(index, 1);
    } else {
      carried.push(weaponId);
    }
    this._loadout = window.CS15Loadout.normalize({ carried, start: this._loadout.start });
    window.CS15Loadout.save(typeof localStorage !== 'undefined' ? localStorage : null, this._loadout);
    const weapon = CONFIG.weapons[weaponId];
    if (this.hud && weapon) {
      this.hud.toast(index >= 0 ? `${weapon.name} 已卸下` : `${weapon.name} 已携带`);
    }
    this._syncLoadoutUI();
    return true;
  }

  // 设为首发：未携带时自动带上。
  _selectStartWeapon(weaponId) {
    if (!window.CS15Loadout || !CONFIG.weapons[weaponId]) return false;
    let carried = this._loadout.carried;
    if (carried.indexOf(weaponId) < 0) {
      carried = carried.concat([weaponId]);
    }
    this._loadout = window.CS15Loadout.normalize({ carried, start: weaponId });
    window.CS15Loadout.save(typeof localStorage !== 'undefined' ? localStorage : null, this._loadout);
    const weapon = CONFIG.weapons[weaponId];
    if (this.hud && weapon) this.hud.toast(`首发 ${weapon.name}`);
    this._syncLoadoutUI();
    return true;
  }

  _syncLoadoutUI() {
    const carried = this._loadout.carried || [];
    const start = this._loadout.start;
    document.querySelectorAll('#loadoutOptions [data-weapon-id]').forEach((card) => {
      const active = carried.indexOf(card.dataset.weaponId) >= 0;
      card.classList.toggle('active', active);
      card.classList.toggle('carry-off', !active);
      card.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('#loadoutOptions [data-start-weapon]').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.startWeapon === start);
    });
    // 武器卡上的枪械专精进度徽标：未解锁 x/100，解锁后点亮。
    const progress = this.medalSystem && typeof this.medalSystem.getWeaponProgress === 'function'
      ? this.medalSystem.getWeaponProgress() : [];
    const byWeapon = new Map();
    for (const item of progress) byWeapon.set(item.weaponId, item);
    document.querySelectorAll('[data-mastery-badge]').forEach((badge) => {
      const item = byWeapon.get(badge.dataset.masteryBadge);
      if (!item) { badge.textContent = ''; return; }
      badge.textContent = item.unlocked ? '专精' : `专精 ${item.kills}/${item.threshold}`;
      badge.classList.toggle('unlocked', item.unlocked);
    });
    const status = document.getElementById('loadoutStatus');
    const startWeapon = CONFIG.weapons[start];
    if (status) {
      status.textContent = `已带 ${carried.length}/${window.CS15Loadout ? window.CS15Loadout.allWeaponIds().length : carried.length}` +
        (startWeapon ? ` · 首发 ${startWeapon.name}` : '');
    }
  }

  // ---------- 武器检视（菜单期 3D 检视：拖动旋转 / 缩放 / 切换武器）----------
  _inspectActive() {
    return !!this._inspect;
  }

  _ensureInspectScene() {
    if (this._inspectScene) {
      // 二次打开：场景仍在，但 composer 已被关闭检视时 dispose 并置空，这里判空补建。
      this._ensureInspectComposer();
      return this._inspectScene;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10151d);
    const hemi = new THREE.HemisphereLight(0xdde8f5, 0x2a2f3a, 1.15);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(2.4, 3.0, 4.0);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5fa8e8, 0.85);
    rim.position.set(-3.0, 1.6, -2.6);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
    const holder = new THREE.Group();
    scene.add(holder);
    this._inspectScene = scene;
    this._inspectCamera = camera;
    this._inspectHolder = holder;
    this._inspectModelCache = new Map();
    this._ensureInspectComposer();
    return scene;
  }

  // Bloom 后处理：检视页金属辉光。仅在非低端机且画面设置未关闭时启用；
  // EffectComposer/UnrealBloomPass 缺失或构造失败时回退直接渲染（游戏功能不受影响）。
  // 独立成方法以便重建：关闭检视会 dispose 并置空 composer，二次打开时由此判空补建。
  _ensureInspectComposer() {
    if (this._inspectComposer) return;
    this._inspectComposer = null;
    this._inspectBloom = null;
    if (!window.CS15_LOWEND && this._graphics.shadows !== 'off' &&
      THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
      try {
        const composer = new THREE.EffectComposer(this.renderer);
        composer.addPass(new THREE.RenderPass(this._inspectScene, this._inspectCamera));
        const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.35, 0.9);
        composer.addPass(bloom);
        this._inspectComposer = composer;
        this._inspectBloom = bloom;
      } catch (error) {
        console.warn('[cs15] inspect bloom unavailable, fallback to direct render', error);
        this._inspectComposer = null;
        this._inspectBloom = null;
      }
    }
  }

  _openWeaponInspect(weaponId) {
    if (!window.WeaponInspect) return;
    if (this.state !== 'menu' && this.state !== 'over') return;
    this._ensureInspectScene();
    const overlay = document.getElementById('weaponInspect');
    const menu = document.getElementById('menu');
    if (menu) menu.classList.add('hidden');
    if (overlay) overlay.classList.remove('hidden');
    this._inspect = {
      currentId: null,
      yaw: -0.35,
      pitch: 0.12,
      distance: 3.4,
      targetDistance: 3.4,
      spin: true,
      pointers: new Map(),
      pinchBase: 0,
      distanceBase: 0,
      loadSeq: 0,
    };
    this._renderInspectDots();
    this._bindInspectInput();
    this._inspectShow(weaponId);
    this._markBoot('weapon_inspect_open');
  }

  _closeWeaponInspect() {
    if (!this._inspect) return;
    this._inspect = null;
    if (this._inspectPointers) this._inspectPointers.clear();
    // 释放 Bloom 的渲染目标显存；下次打开检视时由 _ensureInspectScene 判空经 _ensureInspectComposer 重建。
    if (this._inspectComposer && typeof this._inspectComposer.dispose === 'function') {
      try { this._inspectComposer.dispose(); } catch (err) { /* 忽略 */ }
    }
    this._inspectComposer = null;
    this._inspectBloom = null;
    const overlay = document.getElementById('weaponInspect');
    if (overlay) overlay.classList.add('hidden');
    const menu = document.getElementById('menu');
    // 检视只从菜单进入；返回时恢复菜单（保持当前地图/出战选择状态）。
    if (menu && this.state !== 'playing' && this.state !== 'paused') menu.classList.remove('hidden');
  }

  _bindInspectInput() {
    if (this._inspectInputBound || !window.WeaponInspect) return;
    const overlay = document.getElementById('weaponInspect');
    if (!overlay) return;
    this._inspectPointers = new Map();
    const isButtonTarget = (event) => {
      const target = event && event.target;
      return !!(target && typeof target.closest === 'function' && target.closest('button'));
    };
    const contentPointXY = (clientX, clientY) => this._screenToContentPoint(clientX, clientY);

    const beginPoint = (key, clientX, clientY) => {
      if (!this._inspect) return;
      const point = contentPointXY(clientX, clientY);
      if (!point) return;
      this._inspectPointers.set(key, { x: point.x, y: point.y });
      this._inspect.spin = false;
      if (this._inspectPointers.size === 2) {
        const points = Array.from(this._inspectPointers.values());
        this._inspect.pinchBase = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
        this._inspect.distanceBase = this._inspect.targetDistance;
      }
    };
    const movePoint = (key, clientX, clientY) => {
      if (!this._inspect || !this._inspectPointers.has(key)) return;
      const point = contentPointXY(clientX, clientY);
      if (!point) return;
      const previous = this._inspectPointers.get(key);
      this._inspectPointers.set(key, { x: point.x, y: point.y });
      if (this._inspectPointers.size >= 2) {
        // 双指缩放：以两指内容坐标距离变化驱动相机距离。
        const points = Array.from(this._inspectPointers.values()).slice(0, 2);
        const pinch = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
        if (this._inspect.pinchBase > 0) {
          const ratio = this._inspect.pinchBase / pinch;
          this._inspect.targetDistance = Math.max(2.0, Math.min(6.0, this._inspect.distanceBase * ratio));
        }
        return;
      }
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const width = this._gw || window.innerWidth || 800;
      this._inspect.yaw -= dx / width * Math.PI * 2;
      this._inspect.pitch = Math.max(-1.1, Math.min(1.1, this._inspect.pitch + dy / width * Math.PI * 2));
    };
    const endPoint = (key) => {
      if (!this._inspectPointers || !this._inspectPointers.has(key)) return;
      this._inspectPointers.delete(key);
      if (this._inspect) {
        if (this._inspectPointers.size < 2) this._inspect.pinchBase = 0;
        if (this._inspectPointers.size === 0) this._inspect.spin = true;
      }
    };

    // 输入路径分工（v4 修订）：触屏统一只走 Touch Events，鼠标只走 Pointer
    // Events。真机 WebView 常对同一根手指双发 pointer(touch)+touch 两套事件，
    // 若两路都记账，单指会被当成“双指”永远走缩放分支——拖动/缩放全部失灵。
    // 两路输入源不相交后无需去重；缩放支持真双指。
    overlay.addEventListener('pointerdown', (e) => {
      if (!this._inspect || isButtonTarget(e)) return;
      if (e.pointerType && e.pointerType !== 'mouse') return;   // 触摸交给 Touch Events
      if (!Number.isFinite(Number(e.clientX)) || !Number.isFinite(Number(e.clientY))) return;
      e.preventDefault();
      beginPoint(e.pointerId, e.clientX, e.clientY);
    }, { passive: false });
    overlay.addEventListener('pointermove', (e) => {
      if (!this._inspect || !this._inspectPointers.has(e.pointerId)) return;
      if (!Number.isFinite(Number(e.clientX)) || !Number.isFinite(Number(e.clientY))) return;
      e.preventDefault();
      movePoint(e.pointerId, e.clientX, e.clientY);
    }, { passive: false });
    const pointerEnd = (e) => endPoint(e.pointerId);
    overlay.addEventListener('pointerup', pointerEnd, { passive: true });
    overlay.addEventListener('pointercancel', pointerEnd, { passive: true });
    // 鼠标 up 可能落在窗口外/浮层外；document 级兜底保证触点表清空。
    document.addEventListener('pointerup', pointerEnd, { passive: true });
    document.addEventListener('pointercancel', pointerEnd, { passive: true });
    overlay.addEventListener('wheel', (e) => {
      if (!this._inspect || isButtonTarget(e)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.12 : 0.89;
      this._inspect.targetDistance = Math.max(2.0, Math.min(6.0, this._inspect.targetDistance * delta));
    }, { passive: false });

    // Touch Events：单指拖动旋转，双指捏合缩放（最多同时记账两根手指）。
    overlay.addEventListener('touchstart', (e) => {
      if (!this._inspect || isButtonTarget(e)) return;
      const changed = e && e.changedTouches ? Array.from(e.changedTouches) : [];
      let taken = false;
      for (const touch of changed) {
        if (!touch || this._inspectPointers.size >= 2) continue;
        if (!Number.isFinite(Number(touch.clientX)) || !Number.isFinite(Number(touch.clientY))) continue;
        beginPoint(`t${touch.identifier}`, touch.clientX, touch.clientY);
        taken = true;
      }
      if (taken) e.preventDefault();
    }, { passive: false });
    overlay.addEventListener('touchmove', (e) => {
      if (!this._inspect) return;
      const changed = e && e.changedTouches ? Array.from(e.changedTouches) : [];
      let handled = false;
      for (const touch of changed) {
        if (!touch || !Number.isFinite(Number(touch.clientX)) || !Number.isFinite(Number(touch.clientY))) continue;
        const key = `t${touch.identifier}`;
        if (!this._inspectPointers.has(key)) continue;
        movePoint(key, touch.clientX, touch.clientY);
        handled = true;
      }
      if (handled) e.preventDefault();
    }, { passive: false });
    const touchEnd = (e) => {
      const changed = e && e.changedTouches ? Array.from(e.changedTouches) : [];
      for (const touch of changed) {
        if (touch) endPoint(`t${touch.identifier}`);
      }
    };
    overlay.addEventListener('touchend', touchEnd, { passive: true });
    overlay.addEventListener('touchcancel', touchEnd, { passive: true });
    // 真机可能把 touchend 派发到 document；兜底保证触点表清空、自转恢复。
    document.addEventListener('touchend', touchEnd, { passive: true });
    document.addEventListener('touchcancel', touchEnd, { passive: true });

    // 检视按钮：返回 / 上一件 / 下一件 / 设为首发
    this._bindTap(document.getElementById('inspectCloseBtn'), () => this._closeWeaponInspect());
    this._bindTap(document.getElementById('inspectPrevBtn'), () => this._inspectStep(-1));
    this._bindTap(document.getElementById('inspectNextBtn'), () => this._inspectStep(1));
    this._bindTap(document.getElementById('inspectEquipBtn'), () => {
      if (this._inspect && this._inspect.currentId) {
        this._selectStartWeapon(this._inspect.currentId);
        this._syncInspectEquipButton();
      }
    });
    this._inspectInputBound = true;
  }

  _inspectStep(direction) {
    if (!this._inspect || !window.WeaponInspect) return;
    const order = window.WeaponInspect.ORDER;
    let index = order.indexOf(this._inspect.currentId);
    if (index < 0) index = 0;
    const next = order[(index + direction + order.length) % order.length];
    this._inspectShow(next);
  }

  _syncInspectEquipButton() {
    const button = document.getElementById('inspectEquipBtn');
    if (!button || !this._inspect) return;
    const id = this._inspect.currentId;
    const isStart = this._loadout && this._loadout.start === id &&
      this._loadout.carried.indexOf(id) >= 0;
    button.textContent = isStart ? '当前首发 ✓' : '设为首发';
    button.disabled = !!isStart;
  }

  _renderInspectDots() {
    const dots = document.getElementById('inspectDots');
    if (!dots || !window.WeaponInspect) return;
    // Chrome 61 基线：不用 replaceChildren，逐个移除旧节点。
    while (dots.firstChild) dots.removeChild(dots.firstChild);
    for (const id of window.WeaponInspect.ORDER) {
      const dot = document.createElement('span');
      dot.className = 'inspect-dot';
      dot.dataset.weaponId = id;
      if (!window.WeaponInspect.isSupported(id)) dot.classList.add('unsupported');
      dots.appendChild(dot);
    }
    this._syncInspectDots();
  }

  _syncInspectDots() {
    const dots = document.getElementById('inspectDots');
    if (!dots || !this._inspect) return;
    dots.querySelectorAll('.inspect-dot').forEach((dot) => {
      dot.classList.toggle('active', dot.dataset.weaponId === this._inspect.currentId);
    });
  }

  async _inspectShow(weaponId) {
    if (!this._inspect || !window.WeaponInspect) return;
    const state = this._inspect;
    state.currentId = weaponId;
    state.spin = true;
    state.yaw = -0.35;
    state.pitch = 0.12;
    state.targetDistance = 3.4;
    state.distance = 3.4;
    const name = document.getElementById('inspectWeaponName');
    const status = document.getElementById('inspectStatus');
    if (name) name.textContent = window.WeaponInspect.labelOf(weaponId);
    this._syncInspectDots();
    this._syncInspectEquipButton();

    if (!window.WeaponInspect.isSupported(weaponId)) {
      // Glock-18 是程序化模型（weapon.js 菜单期未加载），本阶段不提供检视。
      if (status) status.textContent = '该武器暂不支持 3D 检视，可用左右箭头查看其他武器';
      while (this._inspectHolder.children.length) this._inspectHolder.remove(this._inspectHolder.children[0]);
      return;
    }

    const seq = ++state.loadSeq;
    if (status) status.textContent = '正在加载武器模型…';
    try {
      await window.WeaponInspect.ensureLoaded(weaponId);
      if (!this._inspect || this._inspect.loadSeq !== seq) return;
      let entry = this._inspectModelCache.get(weaponId);
      if (!entry) {
        entry = window.WeaponInspect.buildModel(weaponId, 1.7);
        this._inspectModelCache.set(weaponId, entry);
      }
      if (!this._inspect || this._inspect.loadSeq !== seq) return;
      while (this._inspectHolder.children.length) this._inspectHolder.remove(this._inspectHolder.children[0]);
      this._inspectHolder.add(entry.group);
      if (status) status.textContent = '';
      // 首次检视时尽力补一次环境反射，让金属件不呈死黑；失败只影响观感。
      if (!this._environmentReady && !window.CS15_LOWEND && THREE.PMREMGenerator) {
        try {
          this.scene.environment = this._buildEnvironment();
          this._environmentReady = true;
        } catch (err) { this._environmentReady = true; }
      }
      this._inspectScene.environment = this.scene.environment || null;
    } catch (error) {
      if (!this._inspect || this._inspect.loadSeq !== seq) return;
      console.error('[cs15] weapon inspect failed', error);
      if (status) status.textContent = '武器模型加载失败，请稍后再试';
    }
  }

  // 每帧推进检视相机/自转；由 _loop 在检视打开时调用。
  _updateInspect(dt) {
    const state = this._inspect;
    if (!state) return;
    if (state.spin) state.yaw += dt * 0.45;
    state.distance += (state.targetDistance - state.distance) * Math.min(1, dt * 10);
    const holder = this._inspectHolder;
    if (holder) {
      holder.rotation.y = state.yaw;
      holder.rotation.x = state.pitch;
    }
    const camera = this._inspectCamera;
    if (camera) {
      const aspect = (this._gw || window.innerWidth || 960) / Math.max(1, this._gh || window.innerHeight || 540);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // 旋转/俯仰作用在模型组上，相机固定在 +Z 轴按距离推拉，逻辑最简且稳定。
      camera.position.set(0, 0.15, state.distance);
      camera.lookAt(0, 0, 0);
      // composer 输出尺寸与内容视口同步（旋转/resize 会改变宽高比）。
      if (this._inspectComposer) {
        const w = this._gw || window.innerWidth || 960;
        const h = this._gh || window.innerHeight || 540;
        if (this._inspectComposerSizeW !== w || this._inspectComposerSizeH !== h) {
          this._inspectComposerSizeW = w;
          this._inspectComposerSizeH = h;
          try { this._inspectComposer.setSize(w, h); } catch (err) { /* 尺寸同步失败不阻断渲染 */ }
        }
      }
    }
  }

  // 开局时释放检视模型缓存：进入战斗后 weapon.js 会构建六件第一人称模型，
  // 检视缓存不再持有同量级几何，避免低端机双份显存占用。
  _disposeInspectModels() {
    if (!this._inspectModelCache) return;
    for (const entry of this._inspectModelCache.values()) {
      if (entry && typeof entry.dispose === 'function') entry.dispose();
    }
    this._inspectModelCache.clear();
    if (this._inspectHolder) {
      while (this._inspectHolder.children.length) this._inspectHolder.remove(this._inspectHolder.children[0]);
    }
  }

  _clearEnemiesForMapChange() {
    for (const enemy of this.enemies || []) {
      if (enemy && typeof enemy.dispose === 'function') enemy.dispose();
    }
    if (this.enemies) this.enemies.length = 0;
    for (const enemy of this._enemyPool || []) {
      if (enemy && typeof enemy.dispose === 'function') enemy.dispose();
    }
    if (this._enemyPool) this._enemyPool.length = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this._waveWarningActive = false;
    this._waveWarningRemaining = 0;
    this._waveWarningLastSecond = -1;
    this._scoreKey = null;
  }

  async _prewarmEnemyPool(targetCount = 4) {
    if (!this.gameMap || !this.player || !this.pickups || typeof Enemy !== 'function') return;
    while (this._enemyPool.length < targetCount) {
      const enemy = new Enemy(this.scene, this.gameMap, this.player, this.hud, {
        hp: CONFIG.enemy.maxHealth,
        speed: CONFIG.enemy.moveSpeed,
        tier: 0,
        difficulty: this._layout.aiDifficulty,
        pickups: this.pickups,
      });
      enemy.spatialHash = this._enemySpatialHash;
      enemy.deactivateForPool();
      this._enemyPool.push(enemy);
      this._setLoadingProgress(0.93 + this._enemyPool.length * 0.012, `预热敌人模型 ${this._enemyPool.length}/${targetCount}…`);
      await this._nextPaint();
    }
  }

  _selectMap(mapId) {
    const choice = this._mapChoice(mapId);
    if (!choice) return false;
    if (this._mapSelectionLocked || (this.state !== 'menu' && this.state !== 'over')) {
      if (this.hud) this.hud.toast('本局地图已锁定，阵亡后才能更换');
      this._syncMapPickers();
      return false;
    }
    this.selectedMapId = mapId;
    this._syncMapPickers();
    if (this.hud) this.hud.toast(`已选择地图：${choice.name}`);
    return true;
  }

  _showMapSelectionMenu() {
    if (this._mapSelectionLocked) return false;
    this._stopTouchActions();
    this.state = 'menu';
    this.hud.hide();
    this.hud.hideResult();
    this.hud.hidePause();
    this.hud.showMenu();
    this._syncMapPickers();
    return true;
  }

  _setLoadingProgress(ratio, label) {
    const bounded = Math.max(0, Math.min(1, Number(ratio) || 0));
    const percent = Math.round(bounded * 100);
    const bar = document.getElementById('loadingBar');
    const percentEl = document.getElementById('loadingPercent');
    const labelEl = document.getElementById('loadingLabel');
    if (bar) bar.style.width = `${percent}%`;
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (labelEl && label) labelEl.textContent = label;
  }

  _showLoading() {
    const screen = document.getElementById('loadingScreen');
    const startButton = document.getElementById('startBtn');
    if (screen) screen.classList.remove('hidden');
    if (startButton) startButton.disabled = true;
    this._setLoadingProgress(0, '准备本地资源…');
  }

  _hideLoading() {
    const screen = document.getElementById('loadingScreen');
    const startButton = document.getElementById('startBtn');
    if (screen) screen.classList.add('hidden');
    if (startButton) startButton.disabled = false;
  }

  _nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  _markBoot(name) {
    if (window.CS15ResourceLoader) window.CS15ResourceLoader.mark(name);
  }

  // 地图、敌人、三把枪和贴图只在玩家确认地图后加载。切图发生在死亡后的
  // 下一次开局准备阶段，避免在设置页同步解析大脚本造成触控卡死。
  _ensureRuntime(requestedMapId) {
    if (this._runtimeReady && this._runtimeMapId === requestedMapId &&
      this.gameMap && this.player && this.weapons && this.pickups) {
      return Promise.resolve(requestedMapId);
    }
    if (this._runtimeLoading) return this._runtimeLoading;

    this._runtimeLoading = (async () => {
      const loader = window.CS15ResourceLoader;
      if (!loader || typeof loader.loadForMap !== 'function') {
        throw new Error('本地资源调度器不可用');
      }

      await loader.loadForMap(requestedMapId, {
        onProgress: (progress) => {
          const ratio = Math.min(0.76, progress.ratio * 0.76);
          this._setLoadingProgress(ratio, `加载 ${progress.label}`);
        },
      });

      this._setLoadingProgress(0.79, '解码武器材质…');
      const weaponTextureJobs = [];
      if (window.Ak47Tex && typeof window.Ak47Tex.loadAll === 'function') {
        weaponTextureJobs.push(window.Ak47Tex.loadAll());
      }
      if (window.AwpTex && typeof window.AwpTex.loadAll === 'function') {
        weaponTextureJobs.push(window.AwpTex.loadAll());
      }
      if (weaponTextureJobs.length) await Promise.all(weaponTextureJobs);
      await this._nextPaint();

      if (!this.forge && !window.CS15_TOUCH && window.TextureForge) {
        try { this.forge = new TextureForge(this.renderer); }
        catch (error) { console.error('[cs15] forge failed', error); this.forge = null; }
      }

      const previousMap = this.gameMap;
      this._clearEnemiesForMapChange();
      if (previousMap && typeof previousMap.dispose === 'function') previousMap.dispose();
      this.gameMap = null;
      if (this.renderer.renderLists && typeof this.renderer.renderLists.dispose === 'function') {
        this.renderer.renderLists.dispose();
      }
      await this._nextPaint();

      this._setLoadingProgress(0.83, '构建地图与碰撞…');
      this._markBoot('map_build_start');
      let activeMapId = requestedMapId;
      let nextMap;
      try {
        nextMap = new GameMap(this.scene, { forge: this.forge, mapId: activeMapId });
      } catch (error) {
        console.error('[cs15] selected map failed', error);
        if (activeMapId === 'classic') throw error;
        activeMapId = 'classic';
        nextMap = new GameMap(this.scene, { forge: this.forge, mapId: activeMapId });
        this.selectedMapId = activeMapId;
        this.hud.toast('港口地图加载失败，已切换经典竞技场');
      }
      this._markBoot('map_build_ready');
      this.gameMap = nextMap;
      this.mapId = activeMapId;
      this.selectedMapId = activeMapId;
      this._applyGraphicsSettings(false, false);

      this._setLoadingProgress(0.87, '创建玩家与三把枪…');
      if (!this.player) this.player = new Player(this.camera, nextMap, this.hud);
      else this.player.map = nextMap;
      this.player.sensitivityScale = this._layout.sensitivity;
      // 受击钩子：无伤清波挑战判定用。
      this.player.onDamaged = () => { this._waveDamaged = true; };

      if (!this.weapons) {
        this.weapons = new WeaponSystem(
          this.scene, this.camera, this.player, nextMap,
          this.enemies, this.hud, this.audio
        );
      } else {
        this.weapons.map = nextMap;
      }
      this.weapons.onEnemyKilled = (event) => this._recordPlayerKill(event);

      if (!this.pickups) {
        this.pickups = new PickupSystem(
          this.scene, nextMap, this.player, this.hud, this.audio, this.weapons
        );
      } else if (typeof this.pickups.setMap === 'function') {
        this.pickups.setMap(nextMap);
      } else {
        this.pickups.gameMap = nextMap;
      }

      this.hud.setMinimapRefs(
        nextMap,
        this.player,
        () => this.enemies,
        () => this.pickups ? this.pickups.pickups : []
      );
      this._setLoadingProgress(0.93, '预编译战场画面…');
      await this._nextPaint();
      if (nextMap && typeof nextMap.whenTexturesReady === 'function') {
        await nextMap.whenTexturesReady();
      }
      this._markBoot('shader_compile_start');
      try {
        if (typeof this.renderer.compileAsync === 'function') {
          await this.renderer.compileAsync(this.scene, this.camera);
        } else {
          this.renderer.compile(this.scene, this.camera);
        }
      }
      catch (error) { console.warn('[cs15] renderer compile skipped', error); }
      this._markBoot('shader_compile_ready');

      // PMREM 是明显的一次性 GPU 长任务；触屏使用直接材质光照，桌面才生成环境反射。
      if (!window.CS15_TOUCH && !this._environmentReady && THREE.PMREMGenerator) {
        this._setLoadingProgress(0.97, '生成武器环境反射…');
        await this._nextPaint();
        try {
          this.scene.environment = this._buildEnvironment();
        } catch (error) {
          console.warn('[cs15] environment prefilter skipped', error);
        }
        this._environmentReady = true;
      }

      this._runtimeReady = true;
      this._runtimeMapId = activeMapId;
      this._syncMapPickers();
      this._setLoadingProgress(1, '准备完成');
      this._markBoot('runtime_ready');
      await this._nextPaint();
      return activeMapId;
    })().finally(() => {
      this._runtimeLoading = null;
    });

    return this._runtimeLoading;
  }

  // ---------- UI 绑定 ----------
  // 通用点按：优先 pointerdown，并保留 Touch Events 兜底。
  // 部分 WebView 会暴露 PointerEvent 构造器却只派发 touchstart；两条路径按
  // 最近触点去重，避免开始、设置和暂停按钮在真机上失去响应或双触发。
  _bindTap(el, handler) {
    if (!el) return;
    if ('PointerEvent' in window) {
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') {
          if (this._shouldSuppressPointerTouch(e)) return;
          this._recordPointerTouch(e, true);
        }
        e.preventDefault(); handler(e);
      }, { passive: false });
      const pointerEnd = (e) => {
        if (e.pointerType === 'touch') this._recordPointerTouch(e, false);
      };
      el.addEventListener('pointerup', pointerEnd, { passive: true });
      el.addEventListener('pointercancel', pointerEnd, { passive: true });
    }
    el.addEventListener('touchstart', (e) => {
      if (this._shouldSuppressTouchFallback(e)) return;
      this._recordTouchFallback(e);
      e.preventDefault(); handler(e);
    }, { passive: false });
    if (!('PointerEvent' in window)) {
      el.addEventListener('click', (e) => { e.preventDefault(); handler(e); });
    }
  }

  // 设置页按钮不能在 pointerdown 立刻阻止默认行为，否则从按钮上开始上滑时会抢走滚动。
  // 先记录短距离点按，超过阈值就把手势交还给 #settingsMenu 的原生滚动容器。
  _bindScrollableTap(el, handler) {
    if (!el) return;
    const hasPointerEvents = ('PointerEvent' in window);
    const hasTouchEvents = ('ontouchstart' in window) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || hasPointerEvents;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let touchId = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    const resetGesture = () => {
      if (pointerId !== null && typeof el.releasePointerCapture === 'function') {
        try { el.releasePointerCapture(pointerId); } catch (err) { /* 忽略容器差异 */ }
      }
      pointerId = null;
      touchId = null;
      moved = false;
      touchMoved = false;
    };
    this._registerInputReset(resetGesture);
    const clear = (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return false;
      pointerId = null;
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略不支持捕获的容器 */ }
      return true;
    };
    if (hasPointerEvents) {
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (pointerId !== null) return;
        if (!Number.isFinite(Number(e.clientX)) || !Number.isFinite(Number(e.clientY))) return;
        if (e.pointerType === 'touch') {
          if (this._shouldSuppressPointerTouch(e)) return;
          this._recordPointerTouch(e, true);
        }
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        moved = false;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略不支持捕获的容器 */ }
      }, { passive: true });
      el.addEventListener('pointermove', (e) => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        if (e.pointerType === 'touch') this._recordPointerTouch(e, true);
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) moved = true;
      }, { passive: true });
      const finish = (e) => {
        if (e.pointerType === 'touch') this._recordPointerTouch(e, false);
        const wasMoved = moved;
        if (!clear(e)) return;
        moved = false;
        if (wasMoved) return;
        e.preventDefault();
        handler(e);
      };
      el.addEventListener('pointerup', finish, { passive: false });
      el.addEventListener('pointercancel', (e) => {
        if (e.pointerType === 'touch') this._recordPointerTouch(e, false);
        if (clear(e)) moved = false;
      }, { passive: true });
      if (typeof document !== 'undefined' && document.addEventListener) {
        const finishPointerAtDocument = (e) => {
          if (pointerId !== null && e && e.pointerId === pointerId) finish(e);
        };
        document.addEventListener('pointerup', finishPointerAtDocument, { passive: false });
        document.addEventListener('pointercancel', finishPointerAtDocument, { passive: false });
      }
    }

    if (hasTouchEvents) {
      const findTouch = (touches) => Array.from(touches || []).find(touch => touch.identifier === touchId) || null;
      el.addEventListener('touchstart', (e) => {
        if (this._shouldSuppressTouchFallback(e)) return;
        const touch = e && e.changedTouches ? e.changedTouches[0] : null;
        if (!touch || touchId !== null ||
          !Number.isFinite(Number(touch.clientX)) || !Number.isFinite(Number(touch.clientY))) return;
        this._recordTouchFallback(e);
        touchId = touch.identifier;
        touchStartX = Number(touch.clientX);
        touchStartY = Number(touch.clientY);
        touchMoved = false;
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        if (this._shouldSuppressTouchFallback(e)) return;
        const touch = findTouch(e && e.changedTouches);
        if (!touch) return;
        if (Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY) > 8) touchMoved = true;
      }, { passive: true });
      const finishTouch = (e) => {
        if (this._shouldSuppressTouchFallback(e)) return;
        const touch = findTouch(e && e.changedTouches);
        if (!touch) return;
        touchId = null;
        if (touchMoved) return;
        e.preventDefault();
        handler(e);
      };
      el.addEventListener('touchend', finishTouch, { passive: false });
      el.addEventListener('touchcancel', (e) => {
        if (findTouch(e && e.changedTouches)) {
          touchId = null;
          touchMoved = false;
        }
      }, { passive: true });
      if (typeof document !== 'undefined' && document.addEventListener) {
        const finishTouchAtDocument = (e) => {
          if (touchId !== null) finishTouch(e);
        };
        document.addEventListener('touchend', finishTouchAtDocument, { passive: false });
        document.addEventListener('touchcancel', finishTouchAtDocument, { passive: false });
      }
    } else {
      el.addEventListener('click', (e) => { e.preventDefault(); handler(e); });
    }
  }

  // 强制横屏是对 gameRoot 做 transform，部分 WebView 在旋转容器内不会驱动原生 overflow 滚动。
  // 设置页因此同时保留原生滚动，并在 Touch Events 可用时按实际屏幕主轴手动更新 scrollTop。
  _bindSettingsScroll(menu) {
    if (!menu || typeof menu.addEventListener !== 'function') return;
    let touchId = null;
    let startX = 0;
    let startY = 0;
    let startScrollTop = 0;
    let axis = null;

    const safeArray = (touches) => {
      if (!touches) return [];
      try { return Array.from(touches); } catch (err) { return []; }
    };
    const touchList = (event) => {
      if (!event) return [];
      const changed = event.changedTouches;
      if (changed && Number(changed.length) > 0) return safeArray(changed);
      return safeArray(event.touches);
    };
    const findTouch = (event) => touchList(event).find(touch => touch.identifier === touchId) || null;
    const validTouch = (touch) => touch && touch.identifier !== undefined && touch.identifier !== null &&
      Number.isFinite(Number(touch.clientX)) && Number.isFinite(Number(touch.clientY));
    const maxScrollTop = () => {
      const scrollHeight = Number(menu.scrollHeight);
      const clientHeight = Number(menu.clientHeight);
      if (!Number.isFinite(scrollHeight) || !Number.isFinite(clientHeight)) return 0;
      return Math.max(0, scrollHeight - clientHeight);
    };
    const reset = () => {
      touchId = null;
      axis = null;
    };
    this._registerInputReset(reset);

    menu.addEventListener('touchstart', (e) => {
      const touch = touchList(e)[0];
      const target = e && e.target;
      if (!validTouch(touch) || touchId !== null ||
        (target && typeof target.closest === 'function' && target.closest('input[type="range"]'))) return;
      touchId = touch.identifier;
      startX = Number(touch.clientX);
      startY = Number(touch.clientY);
      const currentScrollTop = Number(menu.scrollTop);
      const max = maxScrollTop();
      startScrollTop = Number.isFinite(currentScrollTop) ? Math.max(0, Math.min(max, currentScrollTop)) : 0;
      axis = null;
    }, { passive: true });

    menu.addEventListener('touchmove', (e) => {
      const touch = findTouch(e);
      if (!validTouch(touch)) return;
      const dx = Number(touch.clientX) - startX;
      const dy = Number(touch.clientY) - startY;
      const desiredAxis = this._rotated ? 'x' : 'y';
      if (!axis && Math.hypot(dx, dy) > 8) {
        const candidateAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        axis = candidateAxis === desiredAxis ? candidateAxis : 'ignore';
      }
      if (axis !== desiredAxis) return;

      const max = maxScrollTop();
      if (max <= 0) return;
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      const fingerDelta = desiredAxis === 'x' ? dx : dy;
      // rotate(90deg) 后逻辑纵向滚动映射到屏幕横向；旋转态手指向右等价于内容向上。
      const scrollDelta = this._rotated ? fingerDelta : -fingerDelta;
      menu.scrollTop = Math.max(0, Math.min(max, startScrollTop + scrollDelta));
    }, { passive: false });

    const finishTouch = (e) => {
      const changed = e && e.changedTouches;
      if (findTouch(e) || ((!changed || Number(changed.length) === 0) && (!e || !e.touches || e.touches.length === 0))) reset();
    };
    menu.addEventListener('touchend', finishTouch, { passive: true });
    menu.addEventListener('touchcancel', () => reset(), { passive: true });
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('touchend', finishTouch, { passive: true });
      document.addEventListener('touchcancel', () => reset(), { passive: true });
    }
  }

  _screenViewportWidth() {
    const vv = window.visualViewport;
    const visualWidth = vv && Number(vv.width);
    if (Number.isFinite(visualWidth) && visualWidth >= 100) return visualWidth;
    const innerWidth = Number(window.innerWidth);
    return Number.isFinite(innerWidth) && innerWidth >= 100 ? innerWidth : 0;
  }

  _screenViewportHeight() {
    const vv = window.visualViewport;
    const visualHeight = vv && Number(vv.height);
    if (Number.isFinite(visualHeight) && visualHeight >= 100) return visualHeight;
    const innerHeight = Number(window.innerHeight);
    return Number.isFinite(innerHeight) && innerHeight >= 100 ? innerHeight : 0;
  }

  _computeInteractionInsets(shouldRotate, contentWidth, contentHeight, viewportWidth, viewportHeight, visualViewport) {
    const inputSafety = CONFIG.inputSafety || {};
    const baseLeft = Math.max(0, Number(inputSafety.landscapeLeftReserve) || 88);
    const baseBottom = Math.max(0, Number(inputSafety.landscapeBottomReserve) || 32);
    const offsetLeft = visualViewport ? Math.max(0, Number(visualViewport.offsetLeft) || 0) : 0;
    const offsetTop = visualViewport ? Math.max(0, Number(visualViewport.offsetTop) || 0) : 0;
    const hostWidth = Math.max(0, Number(window.innerWidth) || Number(viewportWidth) || 0);
    const hostHeight = Math.max(0, Number(window.innerHeight) || Number(viewportHeight) || 0);
    const physicalRight = visualViewport
      ? Math.max(0, hostWidth - offsetLeft - Math.max(0, Number(viewportWidth) || 0))
      : 0;
    const physicalBottom = visualViewport
      ? Math.max(0, hostHeight - offsetTop - Math.max(0, Number(viewportHeight) || 0))
      : 0;
    const width = Math.max(0, Number(contentWidth) || 0);
    const height = Math.max(0, Number(contentHeight) || 0);

    // 强制顺时针旋转时：物理顶部→逻辑左，物理左→逻辑底，物理底→逻辑右。
    // 系统手势条即使没有被 visualViewport 报告，也始终保留 baseBottom。
    return {
      left: Math.min(width * 0.25, baseLeft + (shouldRotate ? offsetTop : offsetLeft)),
      right: Math.min(width * 0.25, shouldRotate ? baseBottom + physicalBottom : physicalRight),
      bottom: Math.min(height * 0.25, baseBottom + (shouldRotate ? offsetLeft : physicalBottom)),
    };
  }

  // CSS 顺时针旋转时：screen.x = contentHeight - content.y，screen.y = content.x。
  // 触点职责必须按内容坐标判断，否则竖屏 WebView 会把画面上方误当成“右侧视角区”。
  _screenToContentPoint(clientX, clientY) {
    const x = Number(clientX), y = Number(clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const width = Number(this._gw) || (this._rotated ? this._screenViewportHeight() : this._screenViewportWidth());
    const height = Number(this._gh) || (this._rotated ? this._screenViewportWidth() : this._screenViewportHeight());
    if (this._rotated) return { x: y, y: height > 0 ? height - x : -x, width, height };
    return { x, y, width, height };
  }

  _isRightLookPoint(clientX, clientY) {
    const point = this._screenToContentPoint(clientX, clientY);
    if (!point) return false;
    const safety = this._interactionInsets || { left: 0, right: 0, bottom: 0 };
    // 小红书宿主退出键/刘海位于逻辑左侧；自然横屏的系统手势条在逻辑底部，
    // 强制旋转时物理底部映射到逻辑右侧。
    // 这些区域不接管视角触摸，宿主控件与系统手势可以保持原生行为。
    if (point.width > 0 && point.x < Math.max(0, Number(safety.left) || 0)) return false;
    if (point.width > 0 && point.x > point.width - Math.max(0, Number(safety.right) || 0)) return false;
    if (point.height > 0 && point.y > point.height - Math.max(0, Number(safety.bottom) || 0)) return false;
    // 容器极少数情况下拿不到视口尺寸；此时保留输入，避免整机失去视角。
    return point.width <= 0 || point.x > point.width * 0.5;
  }

  _releaseLookIfUnsafe(clientX, clientY, pointerId) {
    if (this._isRightLookPoint(clientX, clientY)) return false;
    if (pointerId === undefined || pointerId === null) {
      this._lookTouchId = null;
      return true;
    }
    if (pointerId !== this._mouseLookPointerId) return true;
    const canvas = this.renderer && this.renderer.domElement;
    if (canvas && typeof canvas.releasePointerCapture === 'function') {
      try { canvas.releasePointerCapture(pointerId); } catch (err) { /* 老 WebView 可能声明但拒绝释放 */ }
    }
    this._mouseLookPointerId = null;
    this._mouseLookPointerType = null;
    this._mouseLookLastX = 0;
    this._mouseLookLastY = 0;
    return true;
  }

  // Pointer Events 可能把多个硬件采样合并到一个 pointermove；逐个消费原始点，
  // 既减少快速甩镜的折线感，也不同时重复消费父事件。
  _pointerSamples(event) {
    if (!event) return [];
    if (typeof event.getCoalescedEvents === 'function') {
      try {
        const samples = event.getCoalescedEvents();
        if (samples && samples.length) return Array.from(samples);
      } catch (err) { /* 老 WebView 声明接口但调用失败时使用父事件 */ }
    }
    return [event];
  }

  _firstInputTouch(event) {
    if (!event) return null;
    const changed = event.changedTouches;
    const touches = changed && Number(changed.length) > 0 ? changed : event.touches;
    if (!touches || Number(touches.length) === 0) return null;
    try { return touches[0] || null; } catch (err) { return null; }
  }

  _recordPointerTouch(event, active) {
    if (!event || event.pointerType !== 'touch') return;
    if (!(this._activePointerTouchIds instanceof Set)) this._activePointerTouchIds = new Set();
    const id = event.pointerId;
    if (active) {
      if (id !== undefined && id !== null) this._activePointerTouchIds.add(id);
    } else if (id !== undefined && id !== null) {
      this._activePointerTouchIds.delete(id);
    } else {
      this._activePointerTouchIds.clear();
    }
    this._pointerTouchActive = this._activePointerTouchIds.size > 0;
    const x = Number(event.clientX), y = Number(event.clientY);
    this._lastPointerTouch = {
      at: Date.now(),
      x: Number.isFinite(x) ? x : null,
      y: Number.isFinite(y) ? y : null,
    };
  }

  _recordTouchFallback(event) {
    const touch = this._firstInputTouch(event);
    if (!touch) return;
    const x = Number(touch.clientX), y = Number(touch.clientY);
    this._lastTouchFallback = {
      at: Date.now(),
      x: Number.isFinite(x) ? x : null,
      y: Number.isFinite(y) ? y : null,
    };
  }

  _inputTouchPoints(event) {
    if (!event) return [];
    const changed = event.changedTouches;
    const touches = changed && Number(changed.length) > 0 ? changed : event.touches;
    if (!touches || Number(touches.length) === 0) return [];
    try { return Array.from(touches).filter(Boolean); } catch (err) { return []; }
  }

  _shouldSuppressTouchFallback(event) {
    const last = this._lastPointerTouch;
    if (!last || Date.now() - last.at > 600) return false;
    const points = this._inputTouchPoints(event);
    if (!points.length || last.x === null || last.y === null) return !!this._pointerTouchActive;
    // 只屏蔽全部都落在同一 Pointer 触点附近的重复事件；如果同一事件还带着
    // 第二根新手指，必须放行，避免左摇杆、右视角和独立开火互相吞输入。
    let hasFinitePoint = false;
    for (const point of points) {
      const x = Number(point.clientX), y = Number(point.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      hasFinitePoint = true;
      if (Math.hypot(x - last.x, y - last.y) >= 48) return false;
    }
    return hasFinitePoint ? true : !!this._pointerTouchActive;
  }

  _shouldSuppressPointerTouch(event) {
    if (!event || event.pointerType !== 'touch') return false;
    const last = this._lastTouchFallback;
    if (!last || Date.now() - last.at > 600) return false;
    const x = Number(event.clientX), y = Number(event.clientY);
    if (last.x === null || last.y === null || !Number.isFinite(x) || !Number.isFinite(y)) return true;
    return Math.hypot(x - last.x, y - last.y) < 48;
  }

  // 各输入控件把闭包里的 owner 一并登记，切页/失焦时统一释放，避免真机漏 up 后卡键。
  _registerInputReset(reset) {
    if (typeof reset !== 'function') return;
    if (!(this._inputResetters instanceof Set)) this._inputResetters = new Set();
    this._inputResetters.add(reset);
  }

  _resetInputOwners() {
    if (!(this._inputResetters instanceof Set)) return;
    for (const reset of this._inputResetters) {
      try { reset(); } catch (err) { /* 单个控件清理失败不能阻断其它输入状态复位 */ }
    }
  }

  _bindUI() {
    this._bindTap(document.getElementById('startBtn'), () => this._beginRun());
    this._bindTap(document.getElementById('restartBtn'), () => {
      if (!this._mapSelectionLocked) {
        this._showMapSelectionMenu();
        return;
      }
      this.hud.hideResult();
      this._beginRun();
    });
    this._bindTap(document.getElementById('resumeBtn'), () => this._resume());
    this._bindTap(document.getElementById('menuSettingsBtn'), () => this._openSettings());
    this._bindTap(document.getElementById('menuMedalsBtn'), () => this._openMedalCenter('menu'));
    this._bindTap(document.getElementById('resultMedalsBtn'), () => this._openMedalCenter('over'));
    this._bindScrollableTap(document.getElementById('medalCenterCloseBtn'), () => this._closeMedalCenter());
    this._bindTap(document.getElementById('internalGameBackBtn'), () => {
      // 布局编辑期该按钮是可拖动目标：按下必须交给 _bindLayoutEdit 处理，
      // 否则 pointerdown 一触发就 _returnDirectlyToGame，拖不动且会把
      // _settingsReturnState 清空，导致随后退出编辑时误判路由隐藏全部按钮。
      if (this._editLayout) return;
      this._returnDirectlyToGame();
    });
    this.medalShare.bind(() => {
      this.medalUI.openCenter();
      this._setSettingsScrollMode(true);
      this._syncInternalBackButton();
    });

    // 桌面端拖动瞄准：用指针捕获保证拖出画布仍连续，兼容小工具容器。
    this._mouseLookPointerId = null;
    this._mouseLookPointerType = null;
    this._mouseLookLastX = 0;
    this._mouseLookLastY = 0;
    this._onCanvasPointerDown = (e) => {
      if (this.state !== 'playing' || this._mouseLookPointerId !== null) return;
      const pointerType = e.pointerType || 'mouse';
      if (pointerType === 'mouse' && e.button !== 0) return;
      const clientX = Number(e.clientX), clientY = Number(e.clientY);
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
      if (pointerType === 'touch') {
        if (this._shouldSuppressPointerTouch(e)) return;
        // 先登记活动触点，即使它落在左半屏，也要阻止 Touch fallback 把它误当成视角。
        this._recordPointerTouch(e, true);
        if (!this._isRightLookPoint(clientX, clientY)) return;
      }
      e.preventDefault();
      this._mouseLookPointerId = e.pointerId;
      this._mouseLookPointerType = pointerType;
      this._mouseLookLastX = clientX;
      this._mouseLookLastY = clientY;
      if (pointerType === 'touch') this._lookTouchId = null;
      try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* 不支持时仍可画布内拖动 */ }
      if (this._mouseLookPointerType === 'mouse') {
        this.weapons.triggerSemi();
        this.weapons.setFiring(true);
      }
    };
    this._onCanvasPointerMove = (e) => {
      if (this.state !== 'playing' || e.pointerId !== this._mouseLookPointerId) return;
      if (this._mouseLookPointerType === 'touch') {
        if (this._releaseLookIfUnsafe(e.clientX, e.clientY, e.pointerId)) {
          this._recordPointerTouch(e, false);
          return;
        }
        this._recordPointerTouch(e, true);
      }
      e.preventDefault();
      for (const sample of this._pointerSamples(e)) {
        const x = Number(sample.clientX), y = Number(sample.clientY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const dx = x - this._mouseLookLastX;
        const dy = y - this._mouseLookLastY;
        this._mouseLookLastX = x;
        this._mouseLookLastY = y;
        if (this._mouseLookPointerType === 'touch') {
          this.player.onTouchLook(
            this._rotated ? dy : dx,
            this._rotated ? -dx : dy
          );
        } else {
          this.player.onMouseMove({ movementX: dx, movementY: dy });
        }
      }
    };
    this._onCanvasPointerEnd = (e) => {
      if (e && e.pointerType === 'touch') this._recordPointerTouch(e, false);
      if (e.pointerId !== this._mouseLookPointerId) return;
      const pointerType = this._mouseLookPointerType;
      this._mouseLookPointerId = null;
      this._mouseLookPointerType = null;
      if (pointerType === 'mouse') this.weapons.setFiring(false);
    };
    this.renderer.domElement.addEventListener('pointerdown', this._onCanvasPointerDown, { passive: false });
    this.renderer.domElement.addEventListener('pointermove', this._onCanvasPointerMove, { passive: false });
    this.renderer.domElement.addEventListener('pointerup', this._onCanvasPointerEnd);
    this.renderer.domElement.addEventListener('pointercancel', this._onCanvasPointerEnd);
    const releaseCanvasPointer = (e) => {
      if (e && e.pointerId === this._mouseLookPointerId) this._onCanvasPointerEnd(e);
    };
    // 左半屏触点不会成为视角 owner，但仍会先登记以阻止 Touch fallback 误抢；
    // 这类被忽略的指针也必须在 document 级 up/cancel 时移除。
    const releaseTrackedPointerTouch = (e) => {
      if (e && e.pointerType === 'touch') this._recordPointerTouch(e, false);
    };
    document.addEventListener('pointerup', releaseCanvasPointer, { passive: true });
    document.addEventListener('pointercancel', releaseCanvasPointer, { passive: true });
    document.addEventListener('pointerup', releaseTrackedPointerTouch, { passive: true });
    document.addEventListener('pointercancel', releaseTrackedPointerTouch, { passive: true });
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // 触屏视角控制（document 级，多指支持，独立于 FIRE/虚拟摇杆/动作键）
    this._lookTouchId = null;
    this._lookLastX = 0;
    this._lookLastY = 0;
    const safeTouchArray = (touches) => {
      if (!touches) return [];
      try { return Array.from(touches); } catch (err) { return []; }
    };
    const readChangedTouches = (e) => {
      if (!e) return [];
      const changed = e.changedTouches;
      if (changed && Number(changed.length) > 0) return safeTouchArray(changed);
      return safeTouchArray(e.touches);
    };
    const readActiveTouches = (e) => {
      if (!e) return [];
      if (e.touches && Number(e.touches.length) > 0) return safeTouchArray(e.touches);
      return safeTouchArray(e.changedTouches);
    };
    const touchControlSelectors = '#joyZone, .fire-btn, #actionBtns, #topControls, #minimapWrap, #weaponHud, #btnScope, .overlay, #menu, #result, #pause, #topbar';
    const isControlTouch = (touch) => {
      if (!touch) return false;
      let target = touch.target;
      // 小红书部分 WebView 的 Touch 对象没有 target；先用坐标反查实际元素，
      // 再用可视矩形兜底，避免摇杆/FIRE 的触点被文档视角监听误认。
      if (!target && typeof document.elementFromPoint === 'function') {
        try { target = document.elementFromPoint(Number(touch.clientX), Number(touch.clientY)); } catch (err) { /* 容器实现可能拒绝坐标查询 */ }
      }
      if (target && typeof target.closest === 'function' && target.closest(touchControlSelectors)) return true;
      const x = Number(touch.clientX), y = Number(touch.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      for (const el of document.querySelectorAll(touchControlSelectors)) {
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
      }
      return false;
    };

    this._onDocTouchStart = (e) => {
      if (this.state !== 'playing' || this._shouldSuppressTouchFallback(e)) return;
      // 遍历新增的触点，找到一个不在控件上的 → 作为视角触点
      for (const t of readChangedTouches(e)) {
        if (!t) continue;
        if (t.identifier === undefined || t.identifier === null ||
          !Number.isFinite(Number(t.clientX)) || !Number.isFinite(Number(t.clientY))) continue;
        // 跳过控件区域（虚拟摇杆、FIRE、动作键、小地图、overlay）
        if (isControlTouch(t)) continue;
        // 视角只从屏幕右半侧开始，左半侧留给移动摇杆和空白安全区。
        if (!this._isRightLookPoint(t.clientX, t.clientY)) continue;
        if (this._lookTouchId === null) {
          this._lookTouchId = t.identifier;
          this._lookLastX = t.clientX;
          this._lookLastY = t.clientY;
          this._recordTouchFallback(e);
        }
      }
    };
    // 视角滑动方向映射：整页旋转 90° 后，屏幕系位移 (dx,dy) 需转成内容系 (dy,-dx)
    // 仅当本指是"已捕获的视角指"时才 preventDefault 并消费，其他触点（摇杆/按钮/多余指）不干扰
    this._onDocTouchMove = (e) => {
      if (this.state !== 'playing' || this._lookTouchId === null || this._shouldSuppressTouchFallback(e)) return;
      for (const t of readActiveTouches(e)) {
        if (!t) continue;
        if (t.identifier === this._lookTouchId) {
          const x = Number(t.clientX), y = Number(t.clientY);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          if (this._releaseLookIfUnsafe(x, y, null)) return;
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          const dx = x - this._lookLastX;
          const dy = y - this._lookLastY;
          this._lookLastX = x;
          this._lookLastY = y;
          this.player.onTouchLook(
            this._rotated ? dy : dx,
            this._rotated ? -dx : dy
          );
          break;
        }
      }
    };
    this._onDocTouchEnd = (e) => {
      if (this._shouldSuppressTouchFallback(e)) return;
      for (const t of readChangedTouches(e)) {
        if (!t) continue;
        if (t.identifier === this._lookTouchId) {
          this._lookTouchId = null;
        }
      }
      const changed = e && e.changedTouches;
      if (this._lookTouchId !== null && (!changed || Number(changed.length) === 0) &&
        (!e || !e.touches || e.touches.length === 0)) this._lookTouchId = null;
    };
    // 无论浏览器是否声明 PointerEvent，都保留 Touch fallback；部分 WebView
    // 会暴露构造器却不派发触摸 pointer 事件。活动 Pointer 触点和最近一次
    // fallback 触点会互相去重，避免真正支持 Pointer Events 时画面抖动。
    document.addEventListener('touchstart', this._onDocTouchStart, { passive: false });
    document.addEventListener('touchmove', this._onDocTouchMove, { passive: false });
    document.addEventListener('touchend', this._onDocTouchEnd, { passive: false });
    document.addEventListener('touchcancel', this._onDocTouchEnd, { passive: false });

    // 移动端虚拟按钮（动作键）→ 模拟键盘事件；移动方向由浮动摇杆直接输出模拟量
    this._setupVirtualControls();

    // Esc 暂停
    this._onKeyDown = (e) => {
      if (e.code === 'Escape') {
        if (this._editLayout) { this._exitEditLayout(); return; }
        if (this._inspectActive()) { this._closeWeaponInspect(); return; }
        if (this.state === 'playing') {
          if (this._upgradeActive) this._finishUpgradePick(null, true);
          this._stopTouchActions();
          this.state = 'paused';
          this.hud.showPause();
        }
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    // 切后台/失焦时浏览器可能不再派发最后一根手指的 up/cancel；先暂停并清理，
    // 回到页面后由用户明确点击「继续游戏」，避免摇杆或自动射击残留。
    this._onSystemInterruption = () => this._pauseForSystemInterruption();
    window.addEventListener('blur', this._onSystemInterruption);
    window.addEventListener('pagehide', this._onSystemInterruption);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') this._pauseForSystemInterruption();
      else if (this.audio && typeof this.audio.resumeIfNeeded === 'function') this.audio.resumeIfNeeded();
    }, { passive: true });

    // 点击暂停界面任意处 → 继续（用 _bindTap 兼容不合成 click 的容器）
    this._bindTap(this.hud.pause, () => this._resume());
  }

  // 只供网页内“返回游戏”按钮使用。宿主返回键不再写入或拦截 history，
  // 继续执行小红书小工具原生的直接退出行为。
  _handleBackNavigation() {
    if (this._inspectActive()) {
      this._closeWeaponInspect();
      return true;
    }
    const share = document.getElementById('medalShare');
    if (share && !share.classList.contains('hidden')) {
      this.medalShare.close();
      this.medalUI.openCenter();
      this._setSettingsScrollMode(true);
      return true;
    }
    const center = document.getElementById('medalCenter');
    if (center && !center.classList.contains('hidden')) {
      this._closeMedalCenter();
      return true;
    }
    const settings = document.getElementById('settingsMenu');
    if (settings && !settings.classList.contains('hidden')) {
      this._closeSettings();
      return true;
    }
    if (this._editLayout) {
      this._exitEditLayout();
      return true;
    }
    this._stopTouchActions();
    if (this.state === 'playing') {
      this.state = 'paused';
      this.hud.showPause();
    } else if (this.state === 'paused') {
      this.hud.showPause();
    } else if (this.state === 'over') {
      this.hud.result.classList.remove('hidden');
    } else {
      this.hud.showMenu();
    }
    return true;
  }

  // 小红书宿主的系统返回键可能直接关闭 WebView，网页无法取消该宿主动作。
  // 因此在所有游戏内二级页提供固定的可靠返回入口，并在页面路由变化时同步显隐。
  _syncInternalBackButton() {
    const button = document.getElementById('internalGameBackBtn');
    if (!button) return;
    // 布局编辑期强制可见（拖动目标），显隐由 _exitEditLayout 统一恢复。
    if (this._editLayout) {
      button.classList.remove('hidden');
      return;
    }
    const shareEl = document.getElementById('medalShare');
    const centerEl = document.getElementById('medalCenter');
    const settingsEl = document.getElementById('settingsMenu');
    const shareOpen = !(shareEl && shareEl.classList.contains('hidden'));
    const centerOpen = !(centerEl && centerEl.classList.contains('hidden'));
    const settingsOpen = !(settingsEl && settingsEl.classList.contains('hidden'));
    const fromGame = this._settingsReturnState === 'playing' || this._settingsReturnState === 'paused';
    button.classList.toggle('hidden', !(fromGame && (shareOpen || centerOpen || settingsOpen)));
  }

  _returnDirectlyToGame() {
    const fromGame = this._settingsReturnState === 'playing' || this._settingsReturnState === 'paused';
    if (!fromGame) {
      this._handleBackNavigation();
      this._syncInternalBackButton();
      return;
    }
    this._stopTouchActions();
    if (this.medalShare && typeof this.medalShare.close === 'function') this.medalShare.close();
    if (this.medalUI && typeof this.medalUI.closeCenter === 'function') this.medalUI.closeCenter();
    const settings = document.getElementById('settingsMenu');
    if (settings) settings.classList.add('hidden');
    this._setSettingsScrollMode(false);
    this._settingsReturnState = null;
    this._settingsFromPlay = false;
    this.state = this.player && this.player.alive ? 'playing' : 'paused';
    if (this.hud && this.hud.hidePause) this.hud.hidePause();
    this._syncInternalBackButton();
  }

  _setupVirtualControls() {
    const touchControls = document.getElementById('touchControls');
    const isTouchDevice = ('ontouchstart' in window) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth <= 1024;
    const forceShow = window.location.search.includes('controls=1') || window.location.search.includes('mobile=1');
    if (!touchControls) return;
    // 触屏设备 OR 小屏 OR URL 强制：进入游戏中时显示虚拟控制
    if (!isTouchDevice && !isSmallScreen && !forceShow) return;
    const origShow = this.hud.show.bind(this.hud);
    this.hud.show = () => { origShow(); touchControls.classList.remove('hidden'); };
    const origHide = this.hud.hide.bind(this.hud);
    this.hud.hide = () => { origHide(); touchControls.classList.add('hidden'); };

    // 触屏设备上浏览器会在 touch 后合成 mouse 事件，若同时绑定会导致按钮双触发，
    // 因此统一用 Pointer Events 作为唯一输入源：触屏 pointerType='touch'、鼠标 pointerType='mouse'，
    // 天然去重（不会出现 touch + 合成 mouse 双发），且多指各自带 pointerId，互不干扰
    const hasPointerEvents = ('PointerEvent' in window);
    const readTouchPoints = (e) => {
      if (!e) return [];
      const changed = e.changedTouches;
      const touches = changed && Number(changed.length) > 0 ? changed : e.touches;
      if (!touches) return [];
      try { return Array.from(touches); } catch (err) { return []; }
    };
    const findTouchPoint = (e, identifier) => readTouchPoints(e)
      .find((touch) => touch && touch.identifier === identifier) || null;
    const bindPress = (btn, press, release) => {
      let fallbackTouchId = null;
      let fallbackTouchActive = false;
      let pointerTouchId = null;
      const pointerOwner = (e) => e && e.pointerId != null ? e.pointerId : '__touch__';
      const resetPress = () => {
        if (pointerTouchId !== null && typeof btn.releasePointerCapture === 'function') {
          try { btn.releasePointerCapture(pointerTouchId); } catch (err) { /* 忽略容器差异 */ }
        }
        fallbackTouchId = null;
        fallbackTouchActive = false;
        pointerTouchId = null;
      };
      this._registerInputReset(resetPress);
      const touchStart = (e) => {
        if (fallbackTouchActive || pointerTouchId !== null || this._shouldSuppressTouchFallback(e)) return;
        const touch = this._firstInputTouch(e);
        if (!touch || !Number.isFinite(Number(touch.clientX)) || !Number.isFinite(Number(touch.clientY))) return;
        fallbackTouchId = touch.identifier === undefined ? null : touch.identifier;
        fallbackTouchActive = true;
        this._recordTouchFallback(e);
        if (press(e) === false) {
          fallbackTouchId = null;
          fallbackTouchActive = false;
        }
      };
      const touchEnd = (e) => {
        if (!fallbackTouchActive || this._shouldSuppressTouchFallback(e)) return;
        const changed = e && e.changedTouches;
        if (fallbackTouchId !== null && changed && Number(changed.length) > 0 &&
          !Array.from(changed).some((touch) => touch && touch.identifier === fallbackTouchId)) return;
        fallbackTouchId = null;
        fallbackTouchActive = false;
        release(e);
      };
      if (hasPointerEvents) {
        btn.addEventListener('pointerdown', (e) => {
          if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
          if (!Number.isFinite(Number(e.clientX)) || !Number.isFinite(Number(e.clientY))) return;
          if (e.pointerType === 'touch') {
            if (pointerTouchId !== null || this._shouldSuppressPointerTouch(e)) return;
            pointerTouchId = pointerOwner(e);
            this._recordPointerTouch(e, true);
          }
          e.preventDefault();
          if (press(e) === false) {
            pointerTouchId = null;
            if (e.pointerType === 'touch') this._recordPointerTouch(e, false);
          }
        }, { passive: false });
        const pointerEnd = (e) => {
          if (e.pointerType === 'touch') {
            this._recordPointerTouch(e, false);
            if (pointerTouchId !== pointerOwner(e)) return;
            pointerTouchId = null;
          }
          e.preventDefault(); release(e);
        };
        btn.addEventListener('pointerup', pointerEnd, { passive: false });
        btn.addEventListener('pointercancel', pointerEnd, { passive: false });
        // 按住时手指滑出按钮仍应释放（避免卡住持续开火）
        btn.addEventListener('pointerleave', (e) => {
          if (e.pointerType === 'touch') return;
          release(e);
        });
        if (typeof document !== 'undefined' && document.addEventListener) {
          const pointerEndAtDocument = (e) => {
            if (e && e.pointerType === 'touch') pointerEnd(e);
          };
          document.addEventListener('pointerup', pointerEndAtDocument, { passive: false });
          document.addEventListener('pointercancel', pointerEndAtDocument, { passive: false });
        }
      }
      // 也绑定 Touch Events：有些 WebView 只暴露 PointerEvent 构造器，
      // 实际触摸仍只派发 touchstart/touchend。与 Pointer 路径按触点坐标去重。
      btn.addEventListener('touchstart', touchStart, { passive: false });
      btn.addEventListener('touchend', touchEnd, { passive: false });
      btn.addEventListener('touchcancel', touchEnd, { passive: false });
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('touchend', touchEnd, { passive: false });
        document.addEventListener('touchcancel', touchEnd, { passive: false });
      }
      if (!hasPointerEvents && !isTouchDevice) {
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);
      }
    };

    // 动作键 → 模拟键盘
    const fireKey = (code, down) => {
      // 开始菜单/布局编辑期 player 与 weapons 尚未创建（真机报错
      // “Cannot read properties of null (reading 'keys')”的根因）。
      if (!this.player || !this.weapons) return;
      this.player.keys[code] = down;
      if (down && code === 'KeyR') this.weapons.startReload();
    };
    // 旋转态：动作键的方向语义仍需映射到内容坐标（逆时针，W→A→S→D→W）。
    const rotateTouchMoveKey = (c) => {
      const map = { KeyW: 'KeyA', KeyA: 'KeyS', KeyS: 'KeyD', KeyD: 'KeyW' };
      return map[c] || c;
    };
    touchControls.querySelectorAll('[data-key]').forEach(btn => {
      // 「蹲」按钮单独走 toggle 绑定（见下方 btnCrouch），不进通用按住逻辑
      if (btn.id === 'btnCrouch') return;
      const code = btn.dataset.key;
      if (btn.id === 'btnJump') {
        const pressJump = (e) => {
          e.preventDefault(); if (this._editLayout) return;
          btn.classList.add('active');
          if (btn.setPointerCapture && e.pointerId != null) {
            try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
          }
          const result = this.player.requestJump();
          this._syncStanceButtons();
          if (result === 'stand' && this.hud) this.hud.toast('站起');
        };
        const releaseJump = (e) => { e.preventDefault(); btn.classList.remove('active'); };
        bindPress(btn, pressJump, releaseJump);
        return;
      }
      const press = (e) => {
        e.preventDefault(); if (this._editLayout) return false;   // 编辑态：不标记触点、不驱动按键
        btn.classList.add('active');
        // 指针捕获：手指滑出按钮再松开也能收到 pointerup，防止按键卡死
        if (btn.setPointerCapture) { try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } }
        fireKey(this._rotated ? rotateTouchMoveKey(code) : code, true);
      };
      const release = (e) => { e.preventDefault(); btn.classList.remove('active'); fireKey(this._rotated ? rotateTouchMoveKey(code) : code, false); };
      bindPress(btn, press, release);
    });

    // 左右探头（传统 FPS）：按住探头、松手回正；走 bindPress 按住型语义。
    touchControls.querySelectorAll('[data-action="lean"]').forEach(btn => {
      const dir = btn.dataset.leanDir === 'right' ? 1 : -1;
      const press = (e) => {
        e.preventDefault(); if (this._editLayout) return false;   // 编辑态不驱动探头
        btn.classList.add('active');
        if (this.player) this.player.leanTarget = dir;
      };
      const release = (e) => {
        btn.classList.remove('active');
        if (this.player) this.player.leanTarget = 0;
      };
      bindPress(btn, press, release);
    });

    // 「蹲」按钮：tap 切换蹲/站（移动端持按式蹲不便操作，开关态 + 按钮常亮反馈）
    const crouchBtn = document.getElementById('btnCrouch');
    if (crouchBtn) {
      const tap = (e) => {
        e.preventDefault(); if (this._editLayout) return;
        const crouched = this.player.toggleCrouch();
        this._syncStanceButtons();
        if (this.hud) this.hud.toast(crouched ? '蹲下' : '站起');
      };
      const noop = () => {};
      bindPress(crouchBtn, tap, noop);
    }

    // 「卧」按钮：tap 切换卧倒/起身；卧姿移动速度更低、眼高更低，但不禁用射击。
    const proneBtn = document.getElementById('btnProne');
    if (proneBtn) {
      const tap = (e) => {
        e.preventDefault(); if (this._editLayout) return;
        const proned = this.player.toggleProne();
        this._syncStanceButtons();
        if (this.hud) this.hud.toast(proned ? '卧倒' : '起身');
      };
      const noop = () => {};
      bindPress(proneBtn, tap, noop);
    }

    // ---- 浮动虚拟摇杆（三角洲式）：左半屏任意处按下出现，拖动输出模拟量 ----
    // 用 Pointer Events 统一鼠标与触摸（skill 跨端指引推荐），桌面可测、真机可用
    const joyZone = document.getElementById('joyZone');
    const joyBase = document.getElementById('joyBase');
    const joyKnob = document.getElementById('joyKnob');
    if (joyZone && joyBase && joyKnob) {
      const joyDefaultParent = joyBase.parentNode;
      const joyDefaultNext = joyBase.nextSibling;
      const joyRadius = () => 46 * (this._ctrlScale || 1) * (this._layout.size || 1);   // 半径随控件缩放+自定义大小
      let joyId = null, cx = 0, cy = 0;
      const setKnob = (dx, dy) => {
        joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      };
      const joyStart = (x, y, id) => {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return false;
        joyId = id;
        cx = x; cy = y;
        const W = this._gw || window.innerWidth;
        const H = this._gh || window.innerHeight;
        const content = this._rotated ? { x: y, y: H - x } : { x, y };
        const scale = (this._ctrlScale || 0.85) * (this._layout.size || 1);
        this._placeCustom(
          joyBase,
          Math.max(20, Math.min(W - 20, content.x)),
          Math.max(20, Math.min(H - 20, content.y)),
          scale
        );
        joyZone.classList.add('active');
        setKnob(0, 0);
        return true;
      };
      const joyMove = (x, y) => {
        const R = joyRadius();
        let dx = x - cx, dy = y - cy;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx = dx / len * R; dy = dy / len * R; }
        // 旋转态：屏幕 delta 转内容 delta（content.x = dy, content.y = -dx），
        // 让 setKnob 视觉和 moveTouch 方向都跟玩家移动方向对齐
        const cdx = this._rotated ? dy : dx;
        const cdy = this._rotated ? -dx : dy;
        setKnob(cdx, cdy);
        // 手游式响应曲线：小死区、80% 行程满速，小幅推动也有明确反馈。
        const mag = Math.min(1, len / R);
        const directionLen = Math.min(len, R);
        const dead = CONFIG.player.joystickDeadzone || 0.06;
        const fullAt = CONFIG.player.joystickFullAt || 0.8;
        const normalized = Math.max(0, Math.min(1, (mag - dead) / Math.max(0.01, fullAt - dead)));
        const response = Math.pow(normalized, CONFIG.player.joystickCurve || 0.8);
        if (directionLen > 0 && response > 0) {
          this.player.moveTouch.x = (cdx / directionLen) * response;
          this.player.moveTouch.y = (-cdy / directionLen) * response;
        } else {
          this.player.moveTouch.x = 0;
          this.player.moveTouch.y = 0;
        }
      };
      const joyEnd = () => {
        joyId = null;
        joyZone.classList.remove('active');
        setKnob(0, 0);
        const saved = this._layout && this._layout.pos && this._layout.pos.joy;
        if (saved && saved.fx >= 0 && saved.fy >= 0) {
          const W = this._gw || window.innerWidth;
          const H = this._gh || window.innerHeight;
          this._placeCustom(joyBase, saved.fx * W, saved.fy * H,
            (this._ctrlScale || 0.85) * (this._layout.size || 1));
        } else {
          this._restoreDefault(joyBase, joyDefaultParent, joyDefaultNext);
        }
        if (this.player && this.player.moveTouch) {
          this.player.moveTouch.x = 0;
          this.player.moveTouch.y = 0;
        }
      };
      // 让设置/暂停/结算的统一清理能够重置闭包内的活动指针。
      this._resetVirtualJoystick = joyEnd;
      if (hasPointerEvents) {
        joyZone.addEventListener('pointerdown', (e) => {
          if (joyId !== null || this._editLayout) return;
          if (!Number.isFinite(Number(e.clientX)) || !Number.isFinite(Number(e.clientY))) return;
          if (e.pointerType === 'touch') {
            if (this._shouldSuppressPointerTouch(e)) return;
            this._recordPointerTouch(e, true);
          }
          e.preventDefault();
          // 捕获指针：拖出摇杆区后 move/up 仍派发给本元素（鼠标尤其需要）
          if (joyZone.setPointerCapture) {
            try { joyZone.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
          }
          joyStart(e.clientX, e.clientY, e.pointerId);
        });
        joyZone.addEventListener('pointermove', (e) => {
          if (joyId === null || e.pointerId !== joyId) return;
          if (!Number.isFinite(Number(e.clientX)) || !Number.isFinite(Number(e.clientY))) return;
          if (e.pointerType === 'touch') this._recordPointerTouch(e, true);
          e.preventDefault();
          for (const sample of this._pointerSamples(e)) {
            if (sample.pointerId !== undefined && sample.pointerId !== joyId) continue;
            joyMove(sample.clientX, sample.clientY);
          }
        });
        const joyPointerEnd = (e) => {
          if (e.pointerType === 'touch') this._recordPointerTouch(e, false);
          if (e.pointerId !== joyId) return;
          joyEnd();
        };
        joyZone.addEventListener('pointerup', joyPointerEnd);
        joyZone.addEventListener('pointercancel', joyPointerEnd);
        if (typeof document !== 'undefined' && document.addEventListener) {
          const joyPointerEndAtDocument = (e) => {
            if (joyId !== null && e && e.pointerId === joyId) joyPointerEnd(e);
          };
          document.addEventListener('pointerup', joyPointerEndAtDocument, { passive: true });
          document.addEventListener('pointercancel', joyPointerEndAtDocument, { passive: true });
        }
      }
      // 老 WebView 可能暴露 PointerEvent 但只派发 Touch Events，因此始终保留
      // 这组回退；活动 Pointer 触点与最近一次 Touch 触点由上层统一去重。
      joyZone.addEventListener('touchstart', (e) => {
        if (joyId !== null || this._editLayout || this._shouldSuppressTouchFallback(e)) return;
        const touch = readTouchPoints(e)[0];
        if (!touch || !Number.isFinite(Number(touch.clientX)) || !Number.isFinite(Number(touch.clientY))) return;
        this._recordTouchFallback(e);
        e.preventDefault();
        joyStart(Number(touch.clientX), Number(touch.clientY), touch.identifier);
      }, { passive: false });
      joyZone.addEventListener('touchmove', (e) => {
        if (this._shouldSuppressTouchFallback(e)) return;
        const touch = findTouchPoint(e, joyId);
        if (!touch || !Number.isFinite(Number(touch.clientX)) || !Number.isFinite(Number(touch.clientY))) return;
        e.preventDefault();
        joyMove(Number(touch.clientX), Number(touch.clientY));
      }, { passive: false });
      const joyTouchEnd = (e) => {
        if (this._shouldSuppressTouchFallback(e)) return;
        if (joyId === null || !findTouchPoint(e, joyId)) return;
        e.preventDefault();
        joyEnd();
      };
      joyZone.addEventListener('touchend', joyTouchEnd, { passive: false });
      joyZone.addEventListener('touchcancel', joyTouchEnd, { passive: false });
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('touchend', joyTouchEnd, { passive: false });
        document.addEventListener('touchcancel', joyTouchEnd, { passive: false });
      }
    }

    // FIRE 按钮：按下触发半自动 + 标记自动射击；松开停止自动。
    // 多个开火键共用一个 owner，避免第二根手指覆盖第一根手指的释放状态。
    touchControls.querySelectorAll('[data-action="fire"]').forEach(btn => {
      const allowDragLook = btn.dataset.fireLook !== 'false';
      const resetFire = () => {
        if (!this._fireOwner || this._fireOwner.btn !== btn) return;
        btn.classList.remove('active');
        this._fireOwner = null;
        this.weapons.setFiring(false);
        this._firePointerId = null;
        this._fireTouchId = null;
      };
      this._registerInputReset(resetFire);
      const press = (e) => {
        e.preventDefault(); if (this._editLayout) return false;   // 编辑态不进入开火链
        if (this._fireOwner && this._fireOwner.btn !== btn) return false;
        btn.classList.add('active');
        this.weapons.triggerSemi();   // 半自动：每次按下触发一次
        this.weapons.setFiring(true); // 自动：持续射击标记
        // 记录开火指针，用于"按住 FIRE 拖动也转视角"
        const touch = readTouchPoints(e)[0];
        this._firePointerId = (e.pointerId != null) ? e.pointerId : null;
        this._fireTouchId = touch ? touch.identifier : null;
        this._fireLastX = touch ? Number(touch.clientX) : Number(e.clientX);
        this._fireLastY = touch ? Number(touch.clientY) : Number(e.clientY);
        this._fireOwner = {
          btn,
          allowDragLook,
          pointerId: this._firePointerId,
          touchId: this._fireTouchId,
        };
        if (btn.setPointerCapture && e.pointerId != null) {
          try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        }
        return true;
      };
      const moveFireLook = (clientX, clientY, e) => {
        if (this.state !== 'playing' || !this._fireOwner ||
          this._fireOwner.btn !== btn || !allowDragLook) return;
        const x = Number(clientX), y = Number(clientY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const dx = x - this._fireLastX;
        const dy = y - this._fireLastY;
        this._fireLastX = x;
        this._fireLastY = y;
        // 视角滑动方向映射与 _onDocTouchMove 一致（整页旋转 90° 后屏幕系→内容系）
        this.player.onTouchLook(
          this._rotated ? dy : dx,
          this._rotated ? -dx : dy,
          CONFIG.player.fireDragSensitivityMul || 0.85
        );
      };
      const move = (e) => {
        if (!this._fireOwner || this._fireOwner.btn !== btn ||
          this._firePointerId === null || e.pointerId !== this._firePointerId) return;
        if (e.pointerType === 'touch') this._recordPointerTouch(e, true);
        for (const sample of this._pointerSamples(e)) {
          if (sample.pointerId !== undefined && sample.pointerId !== this._firePointerId) continue;
          moveFireLook(sample.clientX, sample.clientY, e);
        }
      };
      const moveTouch = (e) => {
        if (!this._fireOwner || this._fireOwner.btn !== btn || !allowDragLook ||
          this._fireTouchId === null || this._firePointerId !== null || this._shouldSuppressTouchFallback(e)) return;
        const touch = findTouchPoint(e, this._fireTouchId);
        if (!touch) return;
        moveFireLook(touch.clientX, touch.clientY, e);
      };
      const release = (e) => {
        if (!this._fireOwner || this._fireOwner.btn !== btn) return;
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.pointerType === 'touch') this._recordPointerTouch(e, false);
        const changed = e && e.changedTouches;
        if (changed && this._fireTouchId !== null) {
          const matches = Array.from(changed).some((touch) => touch.identifier === this._fireTouchId);
          if (!matches) return;
        }
        btn.classList.remove('active');
        this.weapons.setFiring(false);
        this._fireOwner = null;
        this._firePointerId = null;
        this._fireTouchId = null;
      };
      btn.addEventListener('pointermove', move, { passive: false });
      // Touch-only WebView 的 touchmove 可能落在 document，不能只绑在 FIRE 元素上；
      // 即使存在 PointerEvent 构造器也保留该 fallback，并由活动指针去重。
      document.addEventListener('touchmove', moveTouch, { passive: false });
      bindPress(btn, press, release);
      // 小红书 WebView 在切出按钮、切后台或合成触摸事件时，偶发不派发
      // 目标元素的 pointerup；全局兜底只处理当前 FIRE 指针，避免持续开火。
      const releaseIfFirePointer = (e) => {
        if (this._firePointerId !== null && e.pointerId === this._firePointerId) release(e);
      };
      window.addEventListener('pointerup', releaseIfFirePointer, { passive: false });
      window.addEventListener('pointercancel', releaseIfFirePointer, { passive: false });
      // 触点结束可能落在 document/window，或应用切后台时完全不回传给 FIRE 元素；
      // 按活动 identifier 精确释放，和 Pointer 路径共存时由 release 内部去重。
      const releaseIfFireTouch = (e) => {
        if (this._fireTouchId === null || this._shouldSuppressTouchFallback(e)) return;
        const changed = e && e.changedTouches;
        if (!changed || Array.from(changed).some((touch) => touch && touch.identifier === this._fireTouchId)) release(e);
      };
      document.addEventListener('touchend', releaseIfFireTouch, { passive: false });
      document.addEventListener('touchcancel', releaseIfFireTouch, { passive: false });
      window.addEventListener('blur', () => release(), { passive: true });
      window.addEventListener('pagehide', () => release(), { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') release();
      }, { passive: true });
    });

    // 武器切换按钮：按出战携带清单循环；投掷物耗尽后由武器系统回到上一把枪。
    touchControls.querySelectorAll('[data-action="weapon-cycle"]').forEach(btn => {
      const tap = (e) => {
        e.preventDefault(); if (this._editLayout) return;
        btn.classList.add('active');
        const cycle = this.weapons.getInventory();
        const idx = cycle.indexOf(this.weapons.currentId);
        this.weapons.switchTo(cycle[(idx + 1) % cycle.length]);
        setTimeout(() => btn.classList.remove('active'), 200);
      };
      const noop = () => {};
      bindPress(btn, tap, noop);
    });

    // 暂停按钮
    touchControls.querySelectorAll('[data-action="pause"]').forEach(btn => {
      const tap = (e) => {
        e.preventDefault(); if (this._editLayout) return;
        btn.classList.add('active');
        if (this.state === 'playing') {
          this._stopTouchActions();
          this.state = 'paused';
          this.hud.showPause();
        }
        setTimeout(() => btn.classList.remove('active'), 200);
      };
      const noop = () => {};
      bindPress(btn, tap, noop);
    });

    // 设置齿轮：打开设置中心
    touchControls.querySelectorAll('[data-action="settings"]').forEach(btn => {
      const tap = (e) => {
        e.preventDefault(); if (this._editLayout) return;
        btn.classList.add('active');
        this._openSettings();
        setTimeout(() => btn.classList.remove('active'), 200);
      };
      const noop = () => {};
      bindPress(btn, tap, noop);
    });

    // AWP 开镜/关镜：点按切换（内部判断当前武器是否带 fov，非狙击无操作）
    touchControls.querySelectorAll('[data-action="scope"]').forEach(btn => {
      const tap = (e) => {
        e.preventDefault(); if (this._editLayout) return;
        btn.classList.add('active');
        this.weapons.toggleScopeZoom();
        setTimeout(() => btn.classList.remove('active'), 200);
      };
      const noop = () => {};
      bindPress(btn, tap, noop);
    });

    // 武器槽（右下角 HUD，桌面/移动通用）：点击直接换枪，解决移动端换枪不便
    // 用 _bindTap 兼容不合成 click 的容器（如小红书 minitool）
    // 武器槽点击：绑定在容器上做事件委托——出战配置会重建槽位 DOM，
    // 逐槽绑定会在重建后失效。目标武器优先读 data-weapon-id，缺失时回退清单序号。
    const weaponSlotContainer = document.getElementById('weaponSlots');
    if (weaponSlotContainer) {
      this._bindTap(weaponSlotContainer, (e) => {
        if (this._editLayout) return;   // 布局编辑态：点击是拖动/选中控件，不切枪
        const target = e && e.target;
        const slot = target && typeof target.closest === 'function'
          ? target.closest('.slot') : null;
        if (!slot) return;
        const inventory = this.weapons.getInventory();
        const id = slot.dataset.weaponId || inventory[parseInt(slot.dataset.slot, 10) - 1];
        if (id) this.weapons.switchTo(id);
      });
    }
  }

  // ---------- 设置中心：自定义控件布局 ----------
  _graphicsPresetValues(presetId) {
    const graphicsConfig = (CONFIG && CONFIG.graphics) || {};
    const presets = graphicsConfig.presets || {};
    const touch = !!this._isTouchDevice;
    const lowEnd = !!this._lowEndDevice;
    let source;
    if (presetId === 'auto') {
      if (lowEnd) source = presets.performance || {};
      else source = {
        mobileDpr: CONFIG.mobilePixelRatioCap || 1.25,
        desktopDpr: CONFIG.desktopPixelRatioCap || 2,
        shadows: touch ? 'contact' : 'dynamic',
        effects: 'balanced',
        animation: 'balanced',
        mobileAnisotropy: 2,
        desktopAnisotropy: 4,
        autoPerformance: true,
      };
    } else {
      source = presets[presetId] || presets.balanced || {};
    }
    return {
      preset: presetId,
      renderScale: Number(touch ? source.mobileDpr : source.desktopDpr) || (touch ? 1.15 : 1.5),
      shadows: source.shadows || 'contact',
      effects: source.effects || 'balanced',
      animation: source.animation || 'balanced',
      anisotropy: Math.max(1, Math.round(Number(touch ? source.mobileAnisotropy : source.desktopAnisotropy) || 1)),
      autoPerformance: source.autoPerformance !== false,
    };
  }

  _normalizeGraphicsSettings(input) {
    const value = input && typeof input === 'object' ? input : {};
    const validPresets = ['auto', 'performance', 'balanced', 'quality', 'custom'];
    const preset = validPresets.includes(value.preset) ? value.preset : 'auto';
    if (preset !== 'custom') return this._graphicsPresetValues(preset);
    const maxDpr = this._isTouchDevice ? 1.35 : 2;
    const renderScale = Math.max(0.85, Math.min(maxDpr, Number(value.renderScale) || (this._isTouchDevice ? 1.15 : 1.5)));
    const shadows = ['off', 'contact', 'dynamic'].includes(value.shadows) ? value.shadows : 'contact';
    const effects = ['low', 'balanced', 'high'].includes(value.effects) ? value.effects : 'balanced';
    const animation = ['performance', 'balanced', 'smooth'].includes(value.animation) ? value.animation : 'balanced';
    const maxAnisotropy = this._isTouchDevice ? 4 : 8;
    return {
      preset,
      renderScale: Math.round(renderScale * 20) / 20,
      shadows,
      effects,
      animation,
      anisotropy: Math.max(1, Math.min(maxAnisotropy, Math.round(Number(value.anisotropy) || (this._isTouchDevice ? 2 : 4)))),
      autoPerformance: value.autoPerformance !== false,
    };
  }

  _loadGraphicsSettings() {
    const graphicsConfig = (CONFIG && CONFIG.graphics) || {};
    try {
      const raw = localStorage.getItem(graphicsConfig.storageKey || 'cs15_graphics_v1');
      if (raw) return this._normalizeGraphicsSettings(JSON.parse(raw));
    } catch (error) { /* 存储失败不影响游戏启动 */ }
    return this._graphicsPresetValues(graphicsConfig.defaultPreset || 'auto');
  }

  _saveGraphicsSettings() {
    const graphicsConfig = (CONFIG && CONFIG.graphics) || {};
    try {
      localStorage.setItem(graphicsConfig.storageKey || 'cs15_graphics_v1', JSON.stringify(this._graphics));
    } catch (error) { /* 存储失败时保留当前内存配置 */ }
  }

  _buildRenderProfile(settings) {
    const dynamicShadows = settings && settings.shadows === 'dynamic';
    return {
      antialias: !this._isTouchDevice,
      dprCap: Math.max(0.85, Number(settings && settings.renderScale) || 1),
      shadows: dynamicShadows,
      shadowMapSize: this._isTouchDevice ? 512 : 1024,
      shadowType: this._isTouchDevice ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap,
    };
  }

  _applyGraphicsBudgets() {
    const graphicsConfig = (CONFIG && CONFIG.graphics) || {};
    const perf = CONFIG.performance || (CONFIG.performance = {});
    const effectScales = graphicsConfig.effectScales || {};
    const animationProfiles = graphicsConfig.animationProfiles || {};
    perf.effectBudgetScale = Math.max(0.25, Math.min(1.25, Number(effectScales[this._graphics.effects]) || 1));
    perf.enemyAnimationProfile = animationProfiles[this._graphics.animation] || animationProfiles.balanced || null;
    window.CS15_EFFECT_QUALITY = this._graphics.effects;
    window.CS15_ENEMY_ANIMATION_QUALITY = this._graphics.animation;
  }

  _applyTextureFiltering() {
    if (!this.scene || !this.renderer) return;
    const capability = this.renderer.capabilities && typeof this.renderer.capabilities.getMaxAnisotropy === 'function'
      ? this.renderer.capabilities.getMaxAnisotropy() : 1;
    const target = Math.max(1, Math.min(capability || 1, Number(this._graphics.anisotropy) || 1));
    const seen = new Set();
    this.scene.traverse((object) => {
      const materials = object && object.material
        ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
      for (const material of materials) {
        if (!material) continue;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
          const texture = material[key];
          if (!texture || seen.has(texture)) continue;
          seen.add(texture);
          if (texture.anisotropy !== target) {
            texture.anisotropy = target;
            texture.needsUpdate = true;
          }
        }
      }
    });
  }

  _applyGraphicsSettings(persist = true, resetProtection = true) {
    this._graphics = this._normalizeGraphicsSettings(this._graphics);
    this._renderProfile = this._buildRenderProfile(this._graphics);
    CONFIG.shadowMapSize = this._renderProfile.shadowMapSize;
    this._applyGraphicsBudgets();
    const maxAnisotropy = this.renderer && this.renderer.capabilities && typeof this.renderer.capabilities.getMaxAnisotropy === 'function'
      ? this.renderer.capabilities.getMaxAnisotropy() : 1;
    window.CS15_TEXTURE_ANISOTROPY = Math.max(1, Math.min(maxAnisotropy || 1, this._graphics.anisotropy));
    window.CS15_CONTACT_SHADOWS_ENABLED = this._graphics.shadows === 'contact';
    window.CS15_DYNAMIC_SHADOWS_ENABLED = this._graphics.shadows === 'dynamic';
    if (resetProtection) {
      this._effectiveDpr = Math.min(window.devicePixelRatio || 1, this._renderProfile.dprCap);
      this._activeEnemyCap = Math.max(1, Math.floor((CONFIG.performance || {}).activeEnemyCap || 4));
      this._enemyCapBadWindows = 0;
    }
    if (this.renderer) {
      const dpr = Math.min(window.devicePixelRatio || 1, this._effectiveDpr, this._renderProfile.dprCap);
      if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
      this.renderer.shadowMap.enabled = this._renderProfile.shadows;
      this.renderer.shadowMap.type = this._renderProfile.shadowType;
    }
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object && object.isDirectionalLight) {
          object.castShadow = this._renderProfile.shadows;
          if (object.shadow && object.shadow.mapSize) {
            object.shadow.mapSize.set(this._renderProfile.shadowMapSize, this._renderProfile.shadowMapSize);
          }
        }
      });
      for (const enemy of [...(this.enemies || []), ...(this._enemyPool || [])]) {
        if (enemy && enemy._contactShadow) enemy._contactShadow.visible = this._graphics.shadows === 'contact';
        if (enemy && enemy.mesh && typeof enemy.mesh.traverse === 'function') {
          enemy.mesh.traverse((object) => {
            if (object && object.isMesh && object !== enemy._contactShadow) {
              object.castShadow = this._graphics.shadows === 'dynamic';
            }
          });
        }
      }
      this._applyTextureFiltering();
    }
    if (persist) this._saveGraphicsSettings();
    if (typeof this._syncGraphicsControls === 'function') this._syncGraphicsControls();
  }

  // 布局数据 { size: 1, sensitivity: 1, pos: { fire: {fx,fy}, ... } }，fx/fy 为内容尺寸的中心点分数（0~1），
  // 旋转/换机型重算像素仍成立；localStorage 容器内可用（device-capabilities 允许）
  _loadLayout() {
    const gameConfig = (typeof CONFIG !== 'undefined' && CONFIG) ||
      (typeof window !== 'undefined' && window.CONFIG) || {};
    const playerConfig = gameConfig.player || {};
    const enemyConfig = gameConfig.enemy || {};
    const aiConfig = gameConfig.ai || {};
    const waveConfig = gameConfig.waves || {};
    try {
      const raw = localStorage.getItem('cs15_layout_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        const d = parsed && typeof parsed === 'object' ? parsed : {};
        const normalizeControlValue = (value, min, max, step) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) return 1;
          const stepped = min + Math.round((numeric - min) / step) * step;
          return Number(Math.max(min, Math.min(max, stepped)).toFixed(2));
        };
        const availableStyles = window.CS15_CROSSHAIR_STYLE_IDS || ['classic', 'dot', 'circle', 'plus', 'tactical'];
        const healthLimit = Math.max(1, Math.round(Number(playerConfig.maxHealth) || 100));
        const normalizeDamage = (value, fallback) => {
          const numeric = Number(value);
          const safe = Number.isFinite(numeric) ? numeric : fallback;
          return Math.max(1, Math.min(healthLimit, Math.round(safe)));
        };
        // 每控件独立缩放（0.5~2.2）；非有限值/越界键直接丢弃。
        const normalizeSizes = (raw) => {
          const source = raw && typeof raw === 'object' ? raw : {};
          const sizes = {};
          for (const key of Object.keys(source)) {
            const numeric = Number(source[key]);
            if (typeof key === 'string' && key && Number.isFinite(numeric) &&
              numeric >= 0.5 && numeric <= 2.2) {
              sizes[key] = numeric;
            }
          }
          return sizes;
        };
        const enemyDamageMin = normalizeDamage(d.enemyDamageMin, Number(enemyConfig.damageMin) || 6);
        const enemyDamageMax = Math.max(enemyDamageMin,
          normalizeDamage(d.enemyDamageMax, Number(enemyConfig.damageMax) || enemyDamageMin));
        const armorDropChance = Math.max(0, Math.min(1,
          Number.isFinite(Number(d.armorDropChance))
            ? Number(d.armorDropChance)
            : Number(enemyConfig.armorDropChance) || 0));
        const difficultyIds = Object.keys(aiConfig.difficulties || {});
        const aiDifficulty = difficultyIds.includes(d.aiDifficulty)
          ? d.aiDifficulty : (aiConfig.difficultyDefault || 'normal');
        const waveWarningDuration = Math.max(3, Math.min(10,
          Math.round(Number.isFinite(Number(d.waveWarningDuration)) ? Number(d.waveWarningDuration) : Number(waveConfig.warningDuration) || 3)));
        return {
          // 必须与设置页 range 的 min/max/step 一致，避免旧存档让标签和实际值分叉。
          size: normalizeControlValue(d.size, 0.7, 1.4, 0.05),
          sensitivity: normalizeControlValue(d.sensitivity, 0.7, 1.5, 0.05),
          crosshairStyle: availableStyles.includes(d.crosshairStyle) ? d.crosshairStyle : 'classic',
          enemyDamageMin,
          enemyDamageMax,
          armorDropChance,
          aiDifficulty,
          waveWarningDuration,
          waveWarningSound: typeof d.waveWarningSound === 'boolean' ? d.waveWarningSound : waveConfig.warningSound !== false,
          waveWarningFlash: typeof d.waveWarningFlash === 'boolean' ? d.waveWarningFlash : waveConfig.warningFlash !== false,
          minimapEnabled: typeof d.minimapEnabled === 'boolean' ? d.minimapEnabled : true,
          minimapSize: Number.isFinite(Number(d.minimapSize))
            ? normalizeControlValue(d.minimapSize, 0.4, 1, 0.1) : 0.5,
          pos: d.pos || {},
          sizes: normalizeSizes(d.sizes),
        };
      }
    } catch (e) { /* localStorage 不可用时用内存态 */ }
    return {
      size: 1,
      sensitivity: 1,
      enemyDamageMin: Math.max(1, Math.min(100, Math.round(Number(enemyConfig.damageMin) || 6))),
      enemyDamageMax: Math.max(1, Math.min(100, Math.round(Number(enemyConfig.damageMax) || 12))),
      armorDropChance: Math.max(0, Math.min(1, Number(enemyConfig.armorDropChance) || 0)),
      aiDifficulty: aiConfig.difficultyDefault || 'normal',
      waveWarningDuration: Math.max(3, Math.min(10, Math.round(Number(waveConfig.warningDuration) || 3))),
      waveWarningSound: waveConfig.warningSound !== false,
      waveWarningFlash: waveConfig.warningFlash !== false,
      minimapEnabled: true,
      minimapSize: 0.5,
      crosshairStyle: 'classic',
      pos: {},
      sizes: {},
    };
  }

  _saveLayout() {
    try { localStorage.setItem('cs15_layout_v1', JSON.stringify(this._layout)); } catch (e) { /* 忽略 */ }
  }

  _applyEnemyDamageSettings(minValue, maxValue, persist = true) {
    const gameConfig = (typeof CONFIG !== 'undefined' && CONFIG) ||
      (typeof window !== 'undefined' && window.CONFIG) || {};
    const playerConfig = gameConfig.player || {};
    const enemyConfig = gameConfig.enemy || {};
    const healthLimit = Math.max(1, Math.round(Number(playerConfig.maxHealth) || 100));
    let low = Math.max(1, Math.min(healthLimit, Math.round(Number(minValue) || 1)));
    let high = Math.max(1, Math.min(healthLimit, Math.round(Number(maxValue) || low)));
    if (low > high) high = low;
    enemyConfig.damageMin = low;
    enemyConfig.damageMax = high;
    this._layout.enemyDamageMin = low;
    this._layout.enemyDamageMax = high;
    if (persist) this._saveLayout();
    return { min: low, max: high };
  }

  _applyArmorDropSettings(value, persist = true) {
    const gameConfig = (typeof CONFIG !== 'undefined' && CONFIG) ||
      (typeof window !== 'undefined' && window.CONFIG) || {};
    const enemyConfig = gameConfig.enemy || {};
    const numeric = Number(value);
    const fallback = Number(enemyConfig.armorDropChance) || 0;
    const chance = Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : fallback));
    enemyConfig.armorDropChance = chance;
    this._layout.armorDropChance = chance;
    if (persist) this._saveLayout();
    return chance;
  }

  _syncAIDifficulty(id) {
    const gameConfig = (typeof CONFIG !== 'undefined' && CONFIG) ||
      (typeof window !== 'undefined' && window.CONFIG) || {};
    const aiConfig = gameConfig.ai || {};
    const difficulties = aiConfig.difficulties || {};
    const fallback = aiConfig.difficultyDefault || 'normal';
    const selected = difficulties[id] ? id : fallback;

    this._layout.aiDifficulty = selected;
    const difficultyTargets = (this.enemies || []).concat(this._enemyPool || []);
    for (const enemy of difficultyTargets) {
      if (enemy && typeof enemy._applyDifficulty === 'function') {
        enemy._applyDifficulty(selected);
      }
    }
    // 待出生规格会跨设置操作保留；同步快照，避免稍后激活时恢复旧难度能力。
    for (const spec of this.spawnQueue || []) {
      if (spec) spec.difficulty = selected;
    }
    return selected;
  }

  _editableList() {
    if (this._editables) return this._editables;
    this._editables = [
      { key: 'fire',   el: document.getElementById('btnFireRight') || document.querySelector('.fire-btn') },
      { key: 'fireLeft', el: document.getElementById('btnFireLeft') },
      { key: 'jump',   el: document.getElementById('btnJump') },
      { key: 'crouch', el: document.getElementById('btnCrouch') },
      { key: 'prone',  el: document.getElementById('btnProne') },
      { key: 'reload', el: document.getElementById('btnReload') },
      { key: 'weapon', el: document.getElementById('btnWeaponCycle') },
      { key: 'leanL', el: document.getElementById('btnLeanLeft') },
      { key: 'leanR', el: document.getElementById('btnLeanRight') },
      { key: 'scope',  el: document.getElementById('btnScope') },
      { key: 'pause',  el: document.querySelector('#topControls .top-btn[data-action="pause"]') },
      { key: 'gear',   el: document.querySelector('#topControls .top-btn[data-action="settings"]') },
      { key: 'minimap', el: document.getElementById('minimapWrap') },
      // 右下角武器名/弹药/6 格武器槽整体可拖动、可独立缩放。
      { key: 'weaponHud', el: document.getElementById('weaponHud') },
      { key: 'joy',    el: document.getElementById('joyBase') },
      // 网页内“返回游戏”与小红书宿主退出键分离；仍可编辑位置，但会被
      // _placeCustom 钳制在宿主/刘海与系统手势安全带之外。
      { key: 'internalBack', el: document.getElementById('internalGameBackBtn') },
    ].filter(x => x.el);
    // 记录原始位置：恢复默认布局时物归原父节点
    for (const it of this._editables) {
      it.origParent = it.el.parentNode;
      it.origNext = it.el.nextSibling;
      // 返回按钮等需要保持高层级容器的控件，_placeCustom 据此决定是否可搬家。
      it.el.__cs15Home = it.el.parentNode;
    }
    return this._editables;
  }

  // 自定义定位公共路径：按钮挂到 #touchControls，小地图仍挂在 #hud。
  // 不用 position:fixed——手机 WebView 常不把旋转容器当作 fixed 的包含块，
  // 内容坐标会被按未旋转的竖屏视口解释，left 超出竖屏宽度 → 控件"消失"。
  // absolute 在旋转容器内的行为各内核一致。小地图不能移入 touchControls，
  // 因为桌面端该层按设备条件可能保持 hidden；同时它在日常游戏中不能抢视角。
  _placeCustom(el, x, y, scale) {
    const isMinimap = el && el.id === 'minimapWrap';
    const isBackBtn = el && el.id === 'internalGameBackBtn';
    if (isBackBtn) {
      // 返回按钮是游戏内二级页（设置/勋章）的固定返回入口，必须停留在 #gameRoot
      // 高层级（CSS z-index 260 > overlay 100）。不能像普通按钮那样进
      // #hud/#touchControls（z50）——否则设置遮罩打开时按钮被盖住而点不到。
      // 其原始父节点在 _editableList 初始化时经 __cs15Home 记下（body 子元素
      // 启动时统一移入 #gameRoot），此处只改坐标不换父容器。
      const home = el.__cs15Home || this.gameRoot || document.body;
      if (el.parentNode !== home) home.appendChild(el);
    } else {
      const host = isMinimap
        ? ((this.hud && this.hud.el) || document.getElementById('hud'))
        : document.getElementById('touchControls');
      if (host && el.parentNode !== host) host.appendChild(el);
    }
    const width = Number(this._gw) || Number(window.innerWidth) || 0;
    const height = Number(this._gh) || Number(window.innerHeight) || 0;
    const fallbackSizes = {
      internalGameBackBtn: [112, 48],
      minimapWrap: [208, 208],
      weaponHud: [170, 96],
      joyBase: [124, 124],
      btnFireLeft: [72, 72],
      btnFireRight: [92, 92],
      btnJump: [62, 62],
      btnCrouch: [54, 54],
      btnProne: [58, 58],
      btnReload: [58, 58],
      btnWeaponCycle: [48, 48],
      btnScope: [54, 54],
      btnLeanLeft: [46, 46],
      btnLeanRight: [46, 46],
    };
    const fallback = fallbackSizes[(el && el.id) || ''] || [58, 58];
    const renderedScale = Math.max(0.1, Math.abs(Number(scale) || 1));
    // 先应用目标缩放，再读取实际渲染尺寸；否则 resize/平板切换后会拿旧缩放钳制，
    // 新尺寸仍可能侵入宿主按钮或系统手势安全带。
    el.style.transform = 'translate(-50%, -50%) scale(' + renderedScale + ')';
    const rect = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    const rectWidth = rect && Number(rect.width);
    const rectHeight = rect && Number(rect.height);
    const offsetWidth = Number(el.offsetWidth);
    const offsetHeight = Number(el.offsetHeight);
    const logicalRectWidth = this._rotated ? rectHeight : rectWidth;
    const logicalRectHeight = this._rotated ? rectWidth : rectHeight;
    // 父层 display:none 时 rect/offset 都为 0；按控件最大设计尺寸估算，避免恢复显示后
    // 半个按钮重新压回小红书宿主退出区或底部系统手势区。offset 尺寸处于逻辑坐标，
    // 可避免旋转父层让 getBoundingClientRect 的宽高互换；再乘目标缩放得到最终占位。
    const renderedWidth = offsetWidth > 0
      ? offsetWidth * renderedScale
      : (logicalRectWidth > 0 ? logicalRectWidth : fallback[0] * renderedScale);
    const renderedHeight = offsetHeight > 0
      ? offsetHeight * renderedScale
      : (logicalRectHeight > 0 ? logicalRectHeight : fallback[1] * renderedScale);
    const halfWidth = Math.max(20, renderedWidth / 2);
    const halfHeight = Math.max(20, renderedHeight / 2);
    const safety = this._interactionInsets || { left: 0, right: 0, bottom: 0 };
    const leftLimit = Math.max(0, Number(safety.left) || 0) + halfWidth;
    const rightLimit = Math.max(leftLimit,
      width - Math.max(0, Number(safety.right) || 0) - halfWidth);
    const topLimit = halfHeight;
    const bottomLimit = Math.max(topLimit, height - Math.max(0, Number(safety.bottom) || 0) - halfHeight);
    const safeX = width > 0 ? Math.max(leftLimit, Math.min(rightLimit, Number(x) || leftLimit)) : x;
    const safeY = height > 0 ? Math.max(topLimit, Math.min(bottomLimit, Number(y) || topLimit)) : y;
    el.style.position = 'absolute';
    el.style.left = safeX + 'px';
    el.style.top = safeY + 'px';
    el.style.right = ''; el.style.bottom = '';
    el.style.transform = 'translate(-50%, -50%) scale(' + renderedScale + ')';
    el.style.zIndex = isBackBtn ? 260 : 60;
    // HUD 和 touchControls 默认 pointer-events:none；编辑态的 .edit-drag 会用
    // !important 临时开启小地图拖动，日常游戏仍让视角触摸穿透小地图。
    el.style.pointerEvents = isMinimap ? 'none' : (el.id === 'joyBase' ? '' : 'auto');
    return { x: safeX, y: safeY };
  }

  // 恢复某控件的 CSS 默认布局（含物归原父节点）
  _restoreDefault(el, origParent, origNext) {
    if (origParent && el.parentNode !== origParent) {
      try { origParent.insertBefore(el, origNext); } catch (e) { origParent.appendChild(el); }
    }
    el.style.position = '';
    el.style.left = ''; el.style.top = '';
    el.style.right = ''; el.style.bottom = '';
    el.style.transform = ''; el.style.zIndex = '';
    el.style.pointerEvents = '';
  }

  _applyMinimapSettings() {
    const W = this._gw || window.innerWidth;
    const H = this._gh || window.innerHeight;
    const shortSide = Math.min(W, H);
    let baseSize = 160;
    if (this._isTouchDevice) {
      if (shortSide >= 600) baseSize = Math.max(140, Math.min(208, W * 0.14));
      else if (H <= 380) baseSize = 84;
      else baseSize = 108;
    }
    const scale = Math.max(0.4, Math.min(1, Number(this._layout && this._layout.minimapSize) || 0.5));
    this.gameRoot.style.setProperty('--minimap-size', `${Math.round(baseSize * scale)}px`);
    if (this.hud && typeof this.hud.setMinimapVisible === 'function') {
      this.hud.setMinimapVisible(!this._layout || this._layout.minimapEnabled !== false);
    }
  }

  // 应用自定义布局：有自定义位置的控件挂到全屏控制层用 absolute 定位；没有的恢复 CSS 默认
  _applyLayout() {
    const W = this._gw || window.innerWidth;
    const H = this._gh || window.innerHeight;
    const size = (this._layout && this._layout.size) || 1;
    const controlScale = this._ctrlScale || 0.85;
    this.gameRoot.style.setProperty('--ui-size', size);
    this.gameRoot.style.setProperty('--action-cluster-width', (250 * controlScale * size) + 'px');
    this._applyMinimapSettings();
    const sizes = (this._layout && this._layout.sizes) || {};
    for (const { key, el, origParent, origNext } of this._editableList()) {
      const p = this._layout.pos && this._layout.pos[key];
      if (p && p.fx >= 0 && p.fy >= 0) {
        // 小地图尺寸由 minimapSize 单独控制，不能被按钮大小或设备按钮缩放再次放大。
        // 其余控件在全局缩放之上再乘各自的独立缩放（sizes[key]）。
        const s = key === 'minimap' ? 1 : controlScale * size * (Number(sizes[key]) || 1);
        this._placeCustom(el, p.fx * W, p.fy * H, s);
      } else {
        this._restoreDefault(el, origParent, origNext);
      }
    }
  }

  // 单控件最终缩放：设备系数 × 全局按钮大小 × 该控件独立缩放。
  _layoutItemScale(key) {
    const sizes = (this._layout && this._layout.sizes) || {};
    if (key === 'minimap') return 1;
    return (this._ctrlScale || 0.85) * ((this._layout && this._layout.size) || 1) * (Number(sizes[key]) || 1);
  }

  _layoutItemName(key) {
    return ({
      fire: '开火', fireLeft: '开火L', jump: '跳跃', crouch: '蹲下', prone: '卧倒',
      reload: '换弹', weapon: '换枪', scope: '开镜', pause: '暂停', gear: '设置',
      leanL: '探L', leanR: '探R',
      minimap: '小地图', joy: '摇杆', internalBack: '返回键', weaponHud: '武器弹药',
    })[key] || key;
  }

  // 编辑条选中某控件后渲染 －/＋ 独立缩放控制。
  _selectLayoutItem(key) {
    this._layoutSelected = key;
    const ctl = document.getElementById('layoutEditSizeCtl');
    const name = document.getElementById('layoutEditSizeName');
    const val = document.getElementById('layoutEditSizeVal');
    if (!ctl || !name || !val) return;
    ctl.classList.remove('hidden');
    name.textContent = this._layoutItemName(key);
    val.textContent = Math.round((((this._layout.sizes || {})[key]) || 1) * 100) + '%';
  }

  // 独立缩放：±10% 步进（0.6~2.2）；首次缩放时控件若还是默认布局，
  // 以当前渲染中心落位转为自定义定位，实现“原地变大变小”。
  _resizeLayoutItem(key, delta) {
    if (!this._layout || typeof this._layout !== 'object') return;
    // 只允许编辑清单内的控件产生缩放数据，未知键直接忽略。
    if (!key || !(this._editableList() || []).some((it) => it.key === key)) return;
    if (!this._layout.sizes || typeof this._layout.sizes !== 'object') this._layout.sizes = {};
    const current = Number(this._layout.sizes[key]) || 1;
    const next = Math.max(0.6, Math.min(2.2, Math.round((current + delta) * 100) / 100));
    if (next === current) return;
    if (!(this._layout.pos && this._layout.pos[key])) {
      const item = (this._editableList() || []).find((it) => it.key === key);
      const el = item && item.el;
      if (el && el.getBoundingClientRect) {
        const r = el.getBoundingClientRect();
        const W = this._gw || window.innerWidth;
        const H = this._gh || window.innerHeight;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const c = this._rotated ? { x: cy, y: H - cx } : { x: cx, y: cy };
        this._layout.pos[key] = {
          fx: Math.max(0, Math.min(1, c.x / W)),
          fy: Math.max(0, Math.min(1, c.y / H)),
        };
      }
    }
    this._layout.sizes[key] = next;
    const val = document.getElementById('layoutEditSizeVal');
    if (val) val.textContent = Math.round(next * 100) + '%';
    this._saveLayout();
    this._applyLayout();
  }

  _bindLayoutSizeControls() {
    if (this._layoutSizeBound) return;
    this._layoutSizeBound = true;
    this._bindTap(document.getElementById('layoutEditSmaller'), () => {
      if (this._layoutSelected) this._resizeLayoutItem(this._layoutSelected, -0.1);
    });
    this._bindTap(document.getElementById('layoutEditLarger'), () => {
      if (this._layoutSelected) this._resizeLayoutItem(this._layoutSelected, 0.1);
    });
  }

  // 原生 range 在部分移动 WebView 中受全局 touch-action/旋转容器影响，可能不派发可靠的拖动更新。
  // 这里保留原生 input 事件，同时用 Pointer/Touch 事件按可视轨道位置计算值，确保设置页真机可调。
  _bindRangeSlider(slider, valueLabel, onChange, options = {}) {
    if (!slider || !valueLabel) return;
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const step = Math.max(Number(slider.step || 1), Number.EPSILON);
    const outputScale = Number.isFinite(Number(options.scale)) ? Number(options.scale) : 0.01;
    const formatValue = typeof options.format === 'function'
      ? options.format
      : (value) => Math.round(value) + '%';

    const clampAndStep = (raw) => {
      const numeric = Number(raw);
      const safe = Number.isFinite(numeric) ? numeric : min;
      const stepped = min + Math.round((safe - min) / step) * step;
      return Math.max(min, Math.min(max, stepped));
    };
    const updateLabel = () => {
      valueLabel.textContent = formatValue(Number(slider.value));
    };
    const commit = (raw) => {
      const value = clampAndStep(raw);
      slider.value = String(value);
      updateLabel();
      onChange(Number((value * outputScale).toFixed(4)));
    };
    const commitNative = () => commit(slider.value);
    slider.addEventListener('input', commitNative);
    updateLabel();

    // 旋转态下，逻辑横向 range 在屏幕上变为纵向；用可视矩形而不是 offsetWidth 计算。
    const valueAtPoint = (clientX, clientY) => {
      if (!Number.isFinite(Number(clientX)) || !Number.isFinite(Number(clientY))) return slider.value;
      const rect = slider.getBoundingClientRect();
      const vertical = !!this._rotated;
      const start = vertical ? rect.top : rect.left;
      const length = vertical ? rect.height : rect.width;
      if (length <= 0) return slider.value;
      const point = vertical ? clientY : clientX;
      const ratio = Math.max(0, Math.min(1, (point - start) / length));
      return min + ratio * (max - min);
    };

    let activePointerId = null;
    let activeTouchId = null;
    const resetSlider = () => {
      if (activePointerId !== null && typeof slider.releasePointerCapture === 'function') {
        try { slider.releasePointerCapture(activePointerId); } catch (err) { /* 忽略容器差异 */ }
      }
      activePointerId = null;
      activeTouchId = null;
    };
    this._registerInputReset(resetSlider);
    const isPrimaryPointer = (e) => {
      if (e.pointerType === 'mouse') return e.button === 0;
      return e.isPrimary !== false;
    };
    const pointerDown = (e) => {
      // 一个滑块只消费一根手指，避免多指落下时后来的 pointer 覆盖当前拖动。
      if (!isPrimaryPointer(e) || activePointerId !== null) return;
      if (!Number.isFinite(Number(e.clientX)) || !Number.isFinite(Number(e.clientY))) return;
      if (e.pointerType === 'touch') {
        if (this._shouldSuppressPointerTouch(e)) return;
        this._recordPointerTouch(e, true);
      }
      e.preventDefault();
      e.stopPropagation();
      activePointerId = e.pointerId;
      try { slider.setPointerCapture(e.pointerId); } catch (err) { /* 不支持捕获时仍处理轨道事件 */ }
      commit(valueAtPoint(e.clientX, e.clientY));
    };
    const pointerMove = (e) => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      if (!Number.isFinite(Number(e.clientX)) || !Number.isFinite(Number(e.clientY))) return;
      if (e.pointerType === 'touch') this._recordPointerTouch(e, true);
      e.preventDefault();
      commit(valueAtPoint(e.clientX, e.clientY));
    };
    const pointerEnd = (e) => {
      if (e.pointerType === 'touch') this._recordPointerTouch(e, false);
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      e.preventDefault();
      activePointerId = null;
      try { slider.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    };

    const hasPointerEvents = 'PointerEvent' in window;
    if (hasPointerEvents) {
      slider.addEventListener('pointerdown', pointerDown, { passive: false });
      slider.addEventListener('pointermove', pointerMove, { passive: false });
      slider.addEventListener('pointerup', pointerEnd, { passive: false });
      slider.addEventListener('pointercancel', pointerEnd, { passive: false });
    }

    // 老 WebView 或只声明 PointerEvent 但不派发触摸 pointer 的容器，
    // 仍由 Touch Events 驱动滑块；活动 pointer 与 fallback 触点会去重。
    const findTouch = (touches) => Array.from(touches || []).find(t => t.identifier === activeTouchId) || null;
    slider.addEventListener('touchstart', (e) => {
      if (this._shouldSuppressTouchFallback(e)) return;
      const touch = e && e.changedTouches ? e.changedTouches[0] : null;
      // 一个滑块只消费一根手指，避免老 WebView 多指时覆盖正在拖动的触点。
      if (!touch || activeTouchId !== null ||
        !Number.isFinite(Number(touch.clientX)) || !Number.isFinite(Number(touch.clientY))) return;
      this._recordTouchFallback(e);
      e.preventDefault();
      e.stopPropagation();
      activeTouchId = touch.identifier;
      commit(valueAtPoint(touch.clientX, touch.clientY));
    }, { passive: false });
    slider.addEventListener('touchmove', (e) => {
      if (this._shouldSuppressTouchFallback(e)) return;
      const touch = findTouch(e && e.changedTouches);
      if (!touch || !Number.isFinite(Number(touch.clientX)) || !Number.isFinite(Number(touch.clientY))) return;
      e.preventDefault();
      commit(valueAtPoint(touch.clientX, touch.clientY));
    }, { passive: false });
    const touchEnd = (e) => {
      if (this._shouldSuppressTouchFallback(e)) return;
      const touch = findTouch(e && e.changedTouches);
      if (!touch) return;
      e.preventDefault();
      activeTouchId = null;
    };
    slider.addEventListener('touchend', touchEnd, { passive: false });
    slider.addEventListener('touchcancel', touchEnd, { passive: false });
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('touchend', touchEnd, { passive: false });
      document.addEventListener('touchcancel', touchEnd, { passive: false });
    }
    if (typeof document !== 'undefined' && document.addEventListener && hasPointerEvents) {
      const pointerEndAtDocument = (e) => {
        if (activePointerId !== null && e && e.pointerId === activePointerId) pointerEnd(e);
      };
      document.addEventListener('pointerup', pointerEndAtDocument, { passive: false });
      document.addEventListener('pointercancel', pointerEndAtDocument, { passive: false });
    }
  }

  _bindSettings() {
    const menu = document.getElementById('settingsMenu');
    if (!menu) return;
    this._bindSettingsScroll(menu);
    const querySettingsButtons = (selector) => document.querySelectorAll
      ? Array.from(document.querySelectorAll(selector)) : [];
    const graphicsPresetButtons = querySettingsButtons('[data-graphics-preset]');
    const shadowButtons = querySettingsButtons('[data-shadow-quality]');
    const effectButtons = querySettingsButtons('[data-effect-quality]');
    const animationButtons = querySettingsButtons('[data-animation-quality]');
    const renderScaleSlider = document.getElementById('renderScaleSlider');
    const renderScaleVal = document.getElementById('renderScaleVal');
    const autoPerformanceBtn = document.getElementById('autoPerformanceBtn');
    const graphicsStatus = document.getElementById('graphicsStatus');
    const presetNames = { auto: '自动', performance: '流畅', balanced: '平衡', quality: '高清', custom: '自定义' };
    const markCustom = () => { this._graphics.preset = 'custom'; };
    const syncGraphicsControls = () => {
      const graphics = this._graphics || {
        preset: 'auto', renderScale: this._isTouchDevice ? 1.25 : 2,
        shadows: this._isTouchDevice ? 'contact' : 'dynamic', effects: 'balanced', animation: 'balanced', autoPerformance: true,
      };
      graphicsPresetButtons.forEach((button) => {
        const active = button.dataset.graphicsPreset === graphics.preset;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      shadowButtons.forEach((button) => {
        const active = button.dataset.shadowQuality === graphics.shadows;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      effectButtons.forEach((button) => {
        const active = button.dataset.effectQuality === graphics.effects;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      animationButtons.forEach((button) => {
        const active = button.dataset.animationQuality === graphics.animation;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (renderScaleSlider) renderScaleSlider.value = String(Math.round(graphics.renderScale * 100));
      if (renderScaleVal) renderScaleVal.textContent = `${graphics.renderScale.toFixed(2)}×`;
      if (autoPerformanceBtn) {
        const active = graphics.autoPerformance !== false;
        autoPerformanceBtn.classList.toggle('active', active);
        autoPerformanceBtn.setAttribute('aria-pressed', String(active));
        autoPerformanceBtn.textContent = `自动保护：${active ? '开' : '关'}`;
      }
      if (graphicsStatus) {
        const actualDpr = this.renderer && this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : graphics.renderScale;
        graphicsStatus.textContent = `${presetNames[graphics.preset] || '自定义'} · ${Number(actualDpr).toFixed(2)}×`;
      }
    };
    this._syncGraphicsControls = syncGraphicsControls;
    if (renderScaleSlider && renderScaleVal) {
      renderScaleSlider.max = this._isTouchDevice ? '135' : '200';
      this._bindRangeSlider(renderScaleSlider, renderScaleVal, (value) => {
        markCustom();
        this._graphics.renderScale = value / 100;
        this._applyGraphicsSettings(true, true);
      }, { scale: 1, format: (value) => `${(value / 100).toFixed(2)}×` });
    }
    graphicsPresetButtons.forEach((button) => this._bindScrollableTap(button, () => {
      if (button.dataset.graphicsPreset === 'custom') markCustom();
      else this._graphics = this._graphicsPresetValues(button.dataset.graphicsPreset);
      this._applyGraphicsSettings(true, true);
    }));
    shadowButtons.forEach((button) => this._bindScrollableTap(button, () => {
      markCustom();
      this._graphics.shadows = button.dataset.shadowQuality;
      this._applyGraphicsSettings(true, true);
    }));
    effectButtons.forEach((button) => this._bindScrollableTap(button, () => {
      markCustom();
      this._graphics.effects = button.dataset.effectQuality;
      this._applyGraphicsSettings(true, true);
    }));
    animationButtons.forEach((button) => this._bindScrollableTap(button, () => {
      markCustom();
      this._graphics.animation = button.dataset.animationQuality;
      this._applyGraphicsSettings(true, true);
    }));
    if (autoPerformanceBtn) this._bindScrollableTap(autoPerformanceBtn, () => {
      markCustom();
      this._graphics.autoPerformance = !(this._graphics.autoPerformance !== false);
      this._applyGraphicsSettings(true, true);
    });
    syncGraphicsControls();
    const slider = document.getElementById('uiSizeSlider');
    const val = document.getElementById('uiSizeVal');
    slider.value = Math.round((this._layout.size || 1) * 100);
    this._bindRangeSlider(slider, val, (size) => {
      this._layout.size = size;
      this._saveLayout();
      this._applyLayout();
    });
    const minimapToggleBtn = document.getElementById('minimapToggleBtn');
    const minimapSizeSlider = document.getElementById('minimapSizeSlider');
    const minimapSizeVal = document.getElementById('minimapSizeVal');
    const syncMinimapControls = () => {
      const enabled = this._layout.minimapEnabled !== false;
      if (minimapToggleBtn) {
        minimapToggleBtn.classList.toggle('active', enabled);
        minimapToggleBtn.setAttribute('aria-pressed', String(enabled));
        minimapToggleBtn.textContent = `小地图：${enabled ? '开' : '关'}`;
      }
      if (minimapSizeSlider) minimapSizeSlider.disabled = !enabled;
    };
    if (minimapSizeSlider && minimapSizeVal) {
      minimapSizeSlider.value = String(Math.round((this._layout.minimapSize || 0.5) * 100));
      this._bindRangeSlider(minimapSizeSlider, minimapSizeVal, (size) => {
        this._layout.minimapSize = Math.max(0.4, Math.min(1, size));
        this._saveLayout();
        this._applyMinimapSettings();
      });
    }
    if (minimapToggleBtn) this._bindScrollableTap(minimapToggleBtn, () => {
      this._layout.minimapEnabled = !(this._layout.minimapEnabled !== false);
      syncMinimapControls();
      this._saveLayout();
      this._applyMinimapSettings();
    });
    syncMinimapControls();
    // 性能诊断悬浮层：真机量化 FPS/p50/p95/绘制调用/三角形数，用于验收优化效果。
    const perfDiagBtn = document.getElementById('perfDiagBtn');
    const syncPerfDiag = () => {
      const enabled = this._layout.perfDiag === true;
      if (perfDiagBtn) {
        perfDiagBtn.classList.toggle('active', enabled);
        perfDiagBtn.setAttribute('aria-pressed', String(enabled));
        perfDiagBtn.textContent = `性能诊断：${enabled ? '开' : '关'}`;
      }
      const overlay = document.getElementById('perfHud');
      if (overlay) overlay.classList.toggle('hidden', !enabled);
      this._diagFrameMs = [];
      this._diagLastFrameAt = 0;
      this._diagLastUpdate = 0;
    };
    if (perfDiagBtn) this._bindScrollableTap(perfDiagBtn, () => {
      this._layout.perfDiag = !(this._layout.perfDiag === true);
      syncPerfDiag();
      this._saveLayout();
    });
    syncPerfDiag();
    const sensitivitySlider = document.getElementById('sensitivitySlider');
    const sensitivityVal = document.getElementById('sensitivityVal');
    sensitivitySlider.value = Math.round((this._layout.sensitivity || 1) * 100);
    this._bindRangeSlider(sensitivitySlider, sensitivityVal, (sensitivity) => {
      this._layout.sensitivity = sensitivity;
      if (this.player) this.player.sensitivityScale = this._layout.sensitivity;
      this._saveLayout();
    });

    const enemyDamageMinSlider = document.getElementById('enemyDamageMinSlider');
    const enemyDamageMinVal = document.getElementById('enemyDamageMinVal');
    const enemyDamageMaxSlider = document.getElementById('enemyDamageMaxSlider');
    const enemyDamageMaxVal = document.getElementById('enemyDamageMaxVal');
    if (enemyDamageMinSlider && enemyDamageMinVal && enemyDamageMaxSlider && enemyDamageMaxVal) {
      const damage = this._applyEnemyDamageSettings(
        this._layout.enemyDamageMin, this._layout.enemyDamageMax, false
      );
      enemyDamageMinSlider.value = String(damage.min);
      enemyDamageMaxSlider.value = String(damage.max);
      const formatDamage = (value) => Math.round(value) + '点';
      const syncDamageControls = (next) => {
        enemyDamageMinSlider.value = String(next.min);
        enemyDamageMaxSlider.value = String(next.max);
        enemyDamageMinVal.textContent = formatDamage(next.min);
        enemyDamageMaxVal.textContent = formatDamage(next.max);
      };
      this._bindRangeSlider(enemyDamageMinSlider, enemyDamageMinVal, (minValue) => {
        const next = this._applyEnemyDamageSettings(minValue, Math.max(minValue, Number(enemyDamageMaxSlider.value)));
        syncDamageControls(next);
      }, { scale: 1, format: formatDamage });
      this._bindRangeSlider(enemyDamageMaxSlider, enemyDamageMaxVal, (maxValue) => {
        const next = this._applyEnemyDamageSettings(Math.min(Number(enemyDamageMinSlider.value), maxValue), maxValue);
        syncDamageControls(next);
      }, { scale: 1, format: formatDamage });
      syncDamageControls(damage);
    }
    const armorDropChanceSlider = document.getElementById('armorDropChanceSlider');
    const armorDropChanceVal = document.getElementById('armorDropChanceVal');
    if (armorDropChanceSlider && armorDropChanceVal) {
      const initialPercent = Math.round(this._applyArmorDropSettings(this._layout.armorDropChance, false) * 100);
      armorDropChanceSlider.value = String(initialPercent);
      this._bindRangeSlider(armorDropChanceSlider, armorDropChanceVal, (percent) => {
        const chance = this._applyArmorDropSettings(percent / 100);
        armorDropChanceVal.textContent = `${Math.round(chance * 100)}%`;
      }, { scale: 1, format: (percent) => `${Math.round(percent)}%` });
      armorDropChanceVal.textContent = `${initialPercent}%`;
    }
    const aiDifficultyButtons = document.querySelectorAll
      ? Array.from(document.querySelectorAll('[data-ai-difficulty]')) : [];
    const settingsConfig = (typeof CONFIG !== 'undefined' && CONFIG) ||
      (typeof window !== 'undefined' && window.CONFIG) || {};
    const availableDifficulties = (settingsConfig.ai && settingsConfig.ai.difficulties) || {};
    if (Object.keys(availableDifficulties).length > 0 && !availableDifficulties[this._layout.aiDifficulty]) {
      this._layout.aiDifficulty = (settingsConfig.ai && settingsConfig.ai.difficultyDefault) || 'normal';
    }
    const syncDifficulty = () => aiDifficultyButtons.forEach((button) => {
      const active = button.dataset.aiDifficulty === this._layout.aiDifficulty;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    syncDifficulty();
    aiDifficultyButtons.forEach((button) => this._bindScrollableTap(button, () => {
      if (!availableDifficulties[button.dataset.aiDifficulty]) return;
      // 同步活动实例、对象池和待出生规格，避免切档后混入旧难度能力。
      this._syncAIDifficulty(button.dataset.aiDifficulty);
      syncDifficulty();
      this._saveLayout();
    }));

    const warningDurationSlider = document.getElementById('waveWarningDurationSlider');
    const warningDurationVal = document.getElementById('waveWarningDurationVal');
    if (warningDurationSlider && warningDurationVal) {
      warningDurationSlider.value = String(this._layout.waveWarningDuration);
      this._bindRangeSlider(warningDurationSlider, warningDurationVal, (value) => {
        this._layout.waveWarningDuration = Math.max(3, Math.min(10, Math.round(value)));
        warningDurationVal.textContent = `${this._layout.waveWarningDuration}秒`;
        this._saveLayout();
      }, { scale: 1, format: (value) => `${Math.round(value)}秒` });
      warningDurationVal.textContent = `${this._layout.waveWarningDuration}秒`;
    }
    const bindWarningToggle = (id, key, label) => {
      const button = document.getElementById(id);
      if (!button) return;
      const sync = () => {
        const enabled = this._layout[key] !== false;
        button.classList.toggle('active', enabled);
        button.setAttribute('aria-pressed', String(enabled));
        button.textContent = `${label}：${enabled ? '开' : '关'}`;
      };
      sync();
      this._bindScrollableTap(button, () => {
        this._layout[key] = !(this._layout[key] !== false);
        sync();
        this._saveLayout();
      });
    };
    bindWarningToggle('waveWarningSoundBtn', 'waveWarningSound', '倒计时声音');
    bindWarningToggle('waveWarningFlashBtn', 'waveWarningFlash', '红色闪屏');

    const crosshairStyleOptions = document.getElementById('crosshairStyleOptions');
    const crosshairButtons = crosshairStyleOptions
      ? Array.from(crosshairStyleOptions.querySelectorAll('[data-crosshair-style]')) : [];
    const initialCrosshairStyle = this.hud && this.hud.setCrosshairStyle
      ? this.hud.setCrosshairStyle(this._layout.crosshairStyle) : (this._layout.crosshairStyle || 'classic');
    this._layout.crosshairStyle = initialCrosshairStyle;
    const syncCrosshairButtons = (style) => {
      crosshairButtons.forEach((button) => {
        const active = button.dataset.crosshairStyle === style;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    };
    syncCrosshairButtons(initialCrosshairStyle);
    crosshairButtons.forEach((button) => this._bindScrollableTap(button, () => {
      const style = this.hud && this.hud.setCrosshairStyle
        ? this.hud.setCrosshairStyle(button.dataset.crosshairStyle) : button.dataset.crosshairStyle;
      this._layout.crosshairStyle = style;
      syncCrosshairButtons(style);
      this._saveLayout();
    }));
    this._bindScrollableTap(document.getElementById('layoutEditBtn'), () => this._enterEditLayout());
    this._bindScrollableTap(document.getElementById('settingsMedalsBtn'), () => this._openMedalCenter('settings'));
    this._bindScrollableTap(document.getElementById('layoutResetBtn'), () => {
      this._layout = Object.assign({}, this._layout, { size: 1, pos: {}, sizes: {} });
      this._layoutSelected = null;
      this._saveLayout();
      slider.value = 100; val.textContent = '100%';
      this._applyLayout();
    });
    this._bindScrollableTap(document.getElementById('settingsCloseBtn'), () => this._closeSettings());
    // 暂停菜单里也放一个设置入口（桌面端触屏控件隐藏时靠它进设置）
    const pauseSet = document.getElementById('pauseSettingsBtn');
    if (pauseSet) this._bindTap(pauseSet, (e) => {
      e.stopPropagation();
      this.hud.hidePause();
      this._openSettings();
    });
  }

  // 全局 html/body 默认禁止浏览器手势；设置页打开时只放行其原生纵向滚动。
  _setSettingsScrollMode(enabled) {
    document.documentElement.classList.toggle('settings-open', enabled);
    document.body.classList.toggle('settings-open', enabled);
  }

  // 暂停/设置/结算时统一释放触摸动作，避免真机漏掉 pointerup 后自动武器继续开火，
  // 也避免摇杆和视角指针在切换页面后把下一次操作当成上一根手指的延续。
  _pauseForSystemInterruption() {
    this._stopTouchActions();
    // 选卡期间切后台：自动随机选一张并落账，恢复后从波次警告继续。
    if (this._upgradeActive && this.state === 'playing') this._finishUpgradePick(null, true);
    if (this.state === 'playing') {
      this.state = 'paused';
      if (this.hud && typeof this.hud.showPause === 'function') this.hud.showPause();
    }
  }

  _stopTouchActions() {
    this._resetInputOwners();
    // 检视旋转/缩放的活动指针一并释放，避免系统打断后拖拽状态残留。
    if (this._inspectPointers) this._inspectPointers.clear();
    if (this._inspect) { this._inspect.spin = true; this._inspect.pinchBase = 0; }
    if (this.weapons && typeof this.weapons.setFiring === 'function') this.weapons.setFiring(false);
    if (this._activePointerTouchIds instanceof Set) this._activePointerTouchIds.clear();
    this._pointerTouchActive = false;
    this._fireOwner = null;
    this._firePointerId = null;
    this._fireTouchId = null;
    this._mouseLookPointerId = null;
    this._mouseLookPointerType = null;
    this._lookTouchId = null;
    if (typeof this._resetVirtualJoystick === 'function') this._resetVirtualJoystick();
    if (this.player) {
      if (this.player.moveTouch) {
        this.player.moveTouch.x = 0;
        this.player.moveTouch.y = 0;
      }
      if (this.player.keys) {
        for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR', 'ShiftLeft', 'ControlLeft', 'KeyZ', 'KeyQ', 'KeyE']) {
          this.player.keys[code] = false;
        }
        this.player.leanTarget = 0;
      }
    }
    const controls = document.getElementById('touchControls');
    if (controls) {
      controls.querySelectorAll('[data-action="fire"].active, #btnJump.active, #btnReload.active, #btnWeaponCycle.active, #btnScope.active, #joyZone.active')
        .forEach((el) => el.classList.remove('active'));
    }
    this._syncStanceButtons();
  }

  _syncStanceButtons() {
    const crouchBtn = document.getElementById('btnCrouch');
    const proneBtn = document.getElementById('btnProne');
    if (!this.player) return;
    if (crouchBtn) crouchBtn.classList.toggle('active', !!this.player.crouchToggle && !this.player.proneToggle);
    if (proneBtn) proneBtn.classList.toggle('active', !!this.player.proneToggle);
  }

  _restoreSettingsOrigin() {
    const returnState = this._settingsReturnState;
    this._settingsReturnState = null;
    this._settingsFromPlay = false;
    if (returnState === 'playing') {
      if (this.hud && this.hud.hidePause) this.hud.hidePause();
      this.state = 'playing';
    } else if (returnState === 'paused') {
      this.state = 'paused';
      if (this.hud && this.hud.showPause) this.hud.showPause();
    } else if (returnState) {
      this.state = returnState;
    }
  }

  _openSettings() {
    const menu = document.getElementById('settingsMenu');
    if (!menu) return;
    if (!menu.classList.contains('hidden') && this._settingsReturnState != null) return;
    const origin = this.state;
    this._settingsReturnState = origin;
    this._settingsFromPlay = origin === 'playing';
    this._stopTouchActions();
    if (origin === 'playing') this.state = 'paused';
    if (this.hud && this.hud.hidePause) this.hud.hidePause();
    this._setSettingsScrollMode(true);
    menu.scrollTop = 0;
    menu.classList.remove('hidden');
    if (typeof this._syncGraphicsControls === 'function') this._syncGraphicsControls();
    this._syncInternalBackButton();
  }

  _closeSettings() {
    const menu = document.getElementById('settingsMenu');
    if (!menu || menu.classList.contains('hidden')) return;
    this._stopTouchActions();
    menu.classList.add('hidden');
    this._setSettingsScrollMode(false);
    this._restoreSettingsOrigin();
    this._syncInternalBackButton();
  }

  _enterEditLayout() {
    if (this._editLayout) return;
    this._stopTouchActions();
    this._setSettingsScrollMode(false);
    document.getElementById('settingsMenu').classList.add('hidden');
    document.getElementById('layoutEditBar').classList.remove('hidden');
    this._bindLayoutSizeControls();
    this._layoutSelected = null;
    const hud = (this.hud && this.hud.el) || document.getElementById('hud');
    const minimap = document.getElementById('minimapWrap');
    const mainMenu = document.getElementById('menu');
    // 设置可能从菜单或 HUD 隐藏态进入；编辑期间临时显示，退出时恢复精确的
    // 原始可见状态。主菜单遮罩也必须临时隐藏，否则它会盖住 HUD 并截获
    // 小地图/按钮的拖动事件；退出编辑后再按进入前状态恢复。
    this._layoutEditHudWasHidden = !!(hud && hud.classList.contains('hidden'));
    this._layoutEditMinimapWasHidden = !!(minimap && minimap.classList.contains('hidden'));
    this._layoutEditMenuWasHidden = !!(mainMenu && mainMenu.classList.contains('hidden'));
    if (hud) hud.classList.remove('hidden');
    if (minimap) minimap.classList.remove('hidden');
    if (mainMenu) mainMenu.classList.add('hidden');
    const touchControls = document.getElementById('touchControls');
    if (touchControls) touchControls.classList.remove('hidden');
    // 返回按钮在编辑期强制可见（无论游戏态路由如何），退出后由 _syncInternalBackButton 恢复。
    const backBtn = document.getElementById('internalGameBackBtn');
    this._layoutEditBackWasHidden = !!(backBtn && backBtn.classList.contains('hidden'));
    if (backBtn) backBtn.classList.remove('hidden');
    this._editLayout = true;
    // 快照进入编辑时的真实路由。退出编辑时若 _settingsReturnState 已被其它
    // 路径（如编辑期历史返回）清空，仍按此快照决定 touchControls 显隐，
    // 避免“从游戏进编辑→退出”被误判为回主菜单而隐藏全部按钮。
    this._layoutEditReturnState = this._settingsReturnState;
    for (const { el } of this._editableList()) el.classList.add('edit-drag');
  }

  _exitEditLayout() {
    const returnState = this._layoutEditReturnState != null
      ? this._layoutEditReturnState
      : this._settingsReturnState;
    this._layoutEditReturnState = null;
    const hudWasHidden = this._layoutEditHudWasHidden;
    const minimapWasHidden = this._layoutEditMinimapWasHidden;
    const menuWasHidden = this._layoutEditMenuWasHidden;
    this._editLayout = false;
    document.getElementById('layoutEditBar').classList.add('hidden');
    for (const { el } of this._editableList()) el.classList.remove('edit-drag');
    this._saveLayout();
    this._applyLayout();
    this._stopTouchActions();
    this._restoreSettingsOrigin();
    const hud = (this.hud && this.hud.el) || document.getElementById('hud');
    const minimap = document.getElementById('minimapWrap');
    const mainMenu = document.getElementById('menu');
    if (hud && hudWasHidden !== null) hud.classList.toggle('hidden', hudWasHidden);
    if (minimap && minimapWasHidden !== null) minimap.classList.toggle('hidden', minimapWasHidden);
    if (mainMenu && menuWasHidden !== null) mainMenu.classList.toggle('hidden', menuWasHidden);
    this._layoutEditHudWasHidden = null;
    this._layoutEditMinimapWasHidden = null;
    this._layoutEditMenuWasHidden = null;
    if (returnState !== 'playing' && returnState !== 'paused') {
      const touchControls = document.getElementById('touchControls');
      if (touchControls) touchControls.classList.add('hidden');
    }
    // 按退出后的真实路由恢复返回按钮显隐（编辑期曾被强制显示）。
    this._syncInternalBackButton();
  }

  // 编辑模式拖拽：Pointer 事件 + 捕获，拖动即改 fixed 中心点，松手存分数
  _bindLayoutEdit() {
    for (const { key, el } of this._editableList()) {
      el.addEventListener('pointerdown', (e) => {
        if (!this._editLayout) return;
        e.preventDefault();
        e.stopPropagation();
        if (el.setPointerCapture) {
          try { el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        }
        const W = this._gw || window.innerWidth;
        const H = this._gh || window.innerHeight;
        const r = el.getBoundingClientRect();
        // 抓取点相对控件中心的偏移（屏幕系，拖动时控件不跳变）
        const grabX = e.clientX - (r.left + r.width / 2);
        const grabY = e.clientY - (r.top + r.height / 2);
        // 屏幕 → 内容坐标：整页旋转 90° 时 left/top 是内容坐标系，
        // 直接用屏幕 clientX/Y 会导致「往右拖按钮往下跑」——必须换算
        const toContent = (sx, sy) => (
          this._rotated
            ? { x: sy, y: H - sx }   // 旋转态：内容x=屏幕y，内容y=内容高-屏幕x
            : { x: sx, y: sy }
        );
        const getHalfExtent = () => {
          // 返回按钮/武器弹药块实际尺寸较大，用真实半宽高钳制避免拖出屏幕一半。
          if (key !== 'minimap' && key !== 'internalBack' && key !== 'weaponHud') return { x: 20, y: 20 };
          const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          const width = Number(el.offsetWidth) || (rect && Number(rect.width)) || 0;
          const height = Number(el.offsetHeight) || (rect && Number(rect.height)) || 0;
          return {
            x: Math.min(W / 2, Math.max(0, width / 2)),
            y: Math.min(H / 2, Math.max(0, height / 2)),
          };
        };
        const clampContent = (c) => {
          const halfExtent = getHalfExtent();
          return {
            x: Math.max(halfExtent.x, Math.min(W - halfExtent.x, c.x)),
            y: Math.max(halfExtent.y, Math.min(H - halfExtent.y, c.y)),
          };
        };
        const apply = (sx, sy) => {
          const c = clampContent(toContent(sx, sy));
          return this._placeCustom(el, c.x, c.y, this._layoutItemScale(key));
        };
        this._selectLayoutItem(key);   // 按下即选中：编辑条出现 －/＋ 独立缩放
        const move = (ev) => apply(ev.clientX - grabX, ev.clientY - grabY);
        const up = (ev) => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          const c = apply(ev.clientX - grabX, ev.clientY - grabY) ||
            clampContent(toContent(ev.clientX - grabX, ev.clientY - grabY));
          this._layout.pos[key] = {
            fx: Math.max(0, Math.min(1, c.x / W)),
            fy: Math.max(0, Math.min(1, c.y / H)),
          };
          this._saveLayout();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      });
    }
    this._bindTap(document.getElementById('layoutEditDone'), () => this._exitEditLayout());
  }

  _resume() {
    if (this.state !== 'paused') return;
    this.hud.hidePause();
    this.state = 'playing';
  }

  // 程序化室内环境贴图（PMREM）：几面明暗不同的墙面 + 顶部亮面，
  // 让金属枪械/装甲产生真实反射层次
  _buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new THREE.Scene();
    // 地面（暗）
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x1a1a1e }));
    floor.position.y = -5;
    room.add(floor);
    // 顶部大亮面（模拟天光，金属的高光反射源）
    const top = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    top.rotation.x = Math.PI / 2;
    top.position.y = 5;
    room.add(top);
    // 四周不同明度的墙面，提供反射层次（冷灰蓝调，金属反射偏冷）
    const sideData = [
      { color: 0x5c6470, pos: [-5, 0, 0] },
      { color: 0x2a2e36, pos: [5, 0, 0] },
      { color: 0x1c2026, pos: [0, 0, -5] },
      { color: 0x3c424e, pos: [0, 0, 5] },
    ];
    for (const s of sideData) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: s.color }));
      wall.position.set(...s.pos);
      wall.lookAt(0, 0, 0);
      room.add(wall);
    }
    const tex = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    return tex;
  }

  // 首帧后只在菜单/结算等非战斗状态预热环境贴图；玩家已经开始游戏时延后，
  // 避免把一次性 GPU 工作插入射击和敌人更新的关键帧。
  _scheduleEnvironmentWarmup() {
    if (window.CS15_TOUCH || this._environmentReady || !this.renderer || !THREE.PMREMGenerator) return;
    const run = () => {
      this._environmentWarmupHandle = null;
      if (this._environmentReady) return;
      // 战斗中不插入 PMREM 的一次性 GPU 工作；结算后由 _endRun 重新安排。
      if (this.state === 'playing') return;
      try {
        this.scene.environment = this._buildEnvironment();
        this._environmentReady = true;
      } catch (e) {
        console.error('[cs15] env warmup failed', e);
        this._environmentReady = true;
      }
    };
    if (typeof window.requestIdleCallback === 'function') {
      this._environmentWarmupHandle = window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      this._environmentWarmupHandle = window.setTimeout(run, 320);
    }
  }

  _bindResize() {
    const isTouch = this._isTouchDevice;
    const rotateHint = document.getElementById('rotateHint');
    let lastW = 0, lastH = 0, timer = null;

    // 强制旋转开关：URL 加 rotate=1 可在桌面调试旋转布局
    const forceRotate = /[?&]rotate=1/.test(window.location.search);

    const applySize = () => {
      // 尺寸来源优先 visualViewport（容器地址栏/工具条收放时它先于 innerWidth 更新），异常时退回 innerWidth
      const vv = window.visualViewport;
      const vw = (vv && vv.width >= 100) ? vv.width : window.innerWidth;
      const vh = (vv && vv.height >= 100) ? vv.height : window.innerHeight;
      // 以视口实际宽高判断竖屏（容器可能虚报 orientation 信号，视口尺寸不会骗人）
      const viewportPortrait = vh > vw;
      // 触屏 + 竖屏视口 → 整页旋转 90° 强制横屏（容器 WebView 无法自己转横屏）
      const shouldRotate = (isTouch && viewportPortrait) || forceRotate;
      this._rotated = shouldRotate;
      document.body.classList.toggle('rotated', shouldRotate);
      document.documentElement.classList.toggle('rotated', shouldRotate);
      // 逻辑渲染尺寸：旋转态宽高互换，始终按横屏渲染
      const w = shouldRotate ? vh : vw;
      const h = shouldRotate ? vw : vh;

      // gameRoot 铺满视口；旋转态把「宽=视口高、高=视口宽」的内容顺时针转 90°
      const s = this.gameRoot.style;
      s.position = 'fixed'; s.top = '0'; s.left = '0';
      s.width = w + 'px';
      s.height = h + 'px';
      s.transformOrigin = '0 0';
      s.transform = shouldRotate ? 'rotate(90deg) translateY(-100%)' : 'none';

      // 控件缩放系数：以逻辑内容短边驱动，手机保持可点，平板按更大的触控面积放大。
      // 旧逻辑把上限锁在 1，导致平板上控件相对屏幕过小；动作簇和自定义布局共用该系数。
      const shortSide = Math.min(w, h);
      const ctrlScale = Math.max(0.68, Math.min(1.35, shortSide / 460));
      const isTabletViewport = isTouch && shortSide >= 600;
      this._ctrlScale = ctrlScale;
      if (this.player) this.player.touchLookReferencePx = shortSide;
      s.setProperty('--ctrl-scale', ctrlScale);
      s.setProperty('--joy-top-reserve', (72 * ctrlScale) + 'px');
      s.setProperty('--gw', w + 'px');
      s.setProperty('--gh', h + 'px');
      s.setProperty('--viewport-width', w + 'px');
      s.setProperty('--viewport-height', h + 'px');
      this._interactionInsets = this._computeInteractionInsets(shouldRotate, w, h, vw, vh, vv);
      s.setProperty('--interaction-safe-left', this._interactionInsets.left + 'px');
      s.setProperty('--interaction-safe-right', this._interactionInsets.right + 'px');
      s.setProperty('--interaction-safe-bottom', this._interactionInsets.bottom + 'px');
      document.body.classList.toggle('tablet', isTabletViewport);

      const logicalPortrait = !shouldRotate && viewportPortrait;
      document.body.classList.toggle('portrait', logicalPortrait);
      document.body.classList.toggle('landscape', !logicalPortrait);
      // 横屏提示：用可靠的视口尺寸信号（vh>vw，不依赖会误报的 CSS orientation 媒体查询）
      document.body.classList.toggle('hint-show', isTouch && viewportPortrait);
      // 仅真正以竖屏渲染时用加大 FOV 补偿窄视野；旋转态逻辑上是横屏
      // 开镜状态（AWP）优先：不因 resize 重置 FOV（真机 visualViewport resize 频繁，否则开镜瞬间被覆盖）
      const wDef = this.weapons && CONFIG.weapons[this.weapons.currentId];
      const scoped = this.weapons && this.weapons._scopeZoomed && wDef && wDef.fov;
      this.camera.fov = scoped ? wDef.fov : (logicalPortrait ? CONFIG.fovPortrait : CONFIG.fov);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      // 像素比仅在变化时更新；安卓档默认限制在 1.25，避免高分屏把 GPU 压满。
      const deviceDpr = Math.min(window.devicePixelRatio || 1, this._renderProfile.dprCap);
      const dpr = Math.min(deviceDpr, Number(this._effectiveDpr) || deviceDpr);
      if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
      // 尺寸变化时才 setSize，避免移动端 visualViewport resize 连发导致卡顿
      if (w !== lastW || h !== lastH) {
        lastW = w; lastH = h;
        this.renderer.setSize(w, h);
      }
      // 横屏提示显隐已由纯 CSS 媒体查询控制（触屏+竖屏自动显示；旋转态/横屏自动隐藏）
      // 自诊断（URL 加 ?debug=1）：显示视口/缩放/旋转，真机排查用
      const dbg = document.getElementById('debugBar');
      if (dbg && /[?&]debug=1/.test(window.location.search)) {
        document.body.classList.add('debug');
        dbg.textContent = `视口 ${Math.round(vw)}×${Math.round(vh)} | 内容 ${w|0}×${h|0} | 缩放 ${ctrlScale.toFixed(2)} | 旋转 ${shouldRotate ? '开' : '关'} | DPR ${window.devicePixelRatio}`;
      }

      // 记录内容尺寸并重应用自定义控件布局（分数→像素随尺寸重算）
      this._gw = w; this._gh = h;
      this._applyLayout();
      // 旋转/尺寸变化会使伤害飘字的内容高度缓存失效，立即刷新。
      if (this.hud && typeof this.hud.refreshLayoutCaches === 'function') {
        this.hud.refreshLayoutCaches();
      }
    };

    // 防抖：orientationchange 期间浏览器会连发多次 resize/visualViewport resize
    const schedule = (delay) => { clearTimeout(timer); timer = setTimeout(applySize, delay || 80); };
    window.addEventListener('resize', () => schedule(80));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => schedule(80));
    window.addEventListener('orientationchange', () => schedule(300));
    const screenOrientation = window.screen && window.screen.orientation;
    if (screenOrientation && screenOrientation.addEventListener) {
      screenOrientation.addEventListener('change', () => schedule(180));
    }

    // 保底：手动跳过横屏提示（即使方向检测异常也能进入游戏；hidden 优先于媒体查询）
    const continueBtn = document.getElementById('continuePortraitBtn');
    if (continueBtn) this._bindTap(continueBtn, () => {
      if (rotateHint) rotateHint.classList.add('hidden');
    });

    applySize();   // 初始化
    // 容器 WebView 尺寸可能在首帧后才稳定（晚到的布局），延迟再校准一次
    setTimeout(applySize, 400);
    setTimeout(applySize, 1200);
  }

  // ---------- 一局开始 ----------
  async _beginRun() {
    if (this.state === 'loading' || this._runtimeLoading) return;
    const returnState = this.state === 'over' ? 'over' : 'menu';
    // 必须在真实用户手势的同步调用栈内解锁音频；其余重资源工作随后异步进行。
    this.audio.init(this.camera, this.scene);
    this._stopTouchActions();
    this.state = 'loading';
    this._showLoading();
    await this._nextPaint();

    try {
      await this._ensureRuntime(this.selectedMapId || this.mapId);
    } catch (error) {
      console.error('[cs15] runtime initialization failed', error);
      this.state = returnState;
      this._hideLoading();
      this.hud.toast('游戏资源加载失败，请重新加载页面');
      return;
    }

    if (!this.gameMap || !this.player || !this.weapons || !this.pickups) {
      this.state = returnState;
      this._hideLoading();
      this.hud.toast('游戏初始化失败，请重新加载页面');
      return;
    }
    // 进入回合即锁定地图；重开胜利局仍沿用当前地图，死亡局则由结果页返回选择器。
    this._mapSelectionLocked = true;
    this._lastRunWon = false;
    this._syncMapPickers();
    this._stopTouchActions();
    this._settingsReturnState = null;
    this._settingsFromPlay = false;
    this.hud.hideMenu();
    this.hud.hideResult();
    this.hud.hidePause();
    this.hud.show();

    // 重置玩家与武器
    this.player.reset(this.gameMap.spawns.player);
    this._syncStanceButtons();
    if (Number.isFinite(this.gameMap.initialYaw)) {
      this.player.yaw = this.gameMap.initialYaw;
      this.player._syncCamera();
    }
    // 按出战配置重置武器：只携带所选主/副/近战 + 固定手雷，开局手持主武器。
    this.weapons.reset(this._loadout);
    this.hud.updateWeaponSlots(this.weapons.getInventory());
    // 检视模型缓存与战斗用第一人称模型同量级，进战斗前释放避免双份显存。
    this._disposeInspectModels();
    if (this._inspectActive()) this._closeWeaponInspect();
    this.pickups.reset();
    this.hud.updateVitals(this.player.health, this.player.armor);
    this.hud.updateWeapon(CONFIG.weapons[this.weapons.currentId], this.weapons.state);

    // 模型进入对象池，后续刷怪只重置状态，不在战斗帧重建骨骼与材质。
    for (const en of this.enemies) {
      en.deactivateForPool();
      this._enemyPool.push(en);
    }
    this.enemies.length = 0;
    await this._prewarmEnemyPool(4);
    this._applyGraphicsSettings(false, false);
    this._hideLoading();

    this.wave = 0;
    // 随机多关卡：每局随机总波次数
    this.totalWaves = Math.floor(CONFIG.waves.minWaves + Math.random() * (CONFIG.waves.maxWaves - CONFIG.waves.minWaves + 1));
    this.kills = 0;
    this.totalKills = 0;
    this._runUnlockedMedalIds.length = 0;
    this._acquiredUpgrades = [];
    this._upgradeActive = false;
    const upgradeOverlay = document.getElementById('upgradePick');
    if (upgradeOverlay) upgradeOverlay.classList.add('hidden');
    // 本局计分板与挑战统计（连杀窗口内的击杀时间戳用于连链判定）
    const runScoreCfg = CONFIG.runScore || {};
    this._runStats = {
      score: 0,
      headshots: 0,
      maxChain: 0,
      waveGrenadeKills: 0,
      chain: [],
      window: Number(runScoreCfg.chainWindow) || 4,
    };
    this._waveDamaged = false;
    this._waveGrenadeKills = 0;
    if (this.hud && typeof this.hud.setRunScore === 'function') this.hud.setRunScore(0);
    this.startTime = performance.now();
    this._lastPerfTime = this.startTime;
    this._perfFrames.length = 0;
    this._perfEvaluationFrames = 0;
    this._activeEnemyCap = Math.max(1, Math.floor((CONFIG.performance || {}).activeEnemyCap || 4));
    this._enemyCapBadWindows = 0;
    this._enemySpatialTimer = 0;
    this.state = 'playing';
    this._nextWave();
    requestAnimationFrame(() => this._markBoot('first_playable_frame'));
  }

  // hidden=true 时只启动倒计时不显示警告层（V2：选卡期间并行计时用），由选卡结束后再亮出。
  _startWaveWarning(hidden) {
    if (this._waveWarningActive || this.wave >= this.totalWaves) return false;
    const duration = Math.max(3, Math.min(10, Math.round(Number(this._layout.waveWarningDuration) || 3)));
    this._waveWarningActive = true;
    this._waveWarningRemaining = duration;
    this._waveWarningLastSecond = -1;
    const overlay = document.getElementById('waveWarning');
    if (overlay && hidden !== true) {
      overlay.classList.remove('hidden');
      overlay.classList.toggle('no-flash', this._layout.waveWarningFlash === false);
    }
    const waveLabel = document.getElementById('waveWarningWave');
    if (waveLabel) waveLabel.textContent = `第 ${this.wave + 1} 波`;
    this._updateWaveWarning(0);
    return true;
  }

  _hideWaveWarning() {
    this._waveWarningActive = false;
    const overlay = document.getElementById('waveWarning');
    if (overlay) overlay.classList.add('hidden');
  }

  _updateWaveWarning(dt) {
    if (!this._waveWarningActive) return;
    this._waveWarningRemaining = Math.max(0, this._waveWarningRemaining - Math.max(0, Number(dt) || 0));
    const second = Math.max(0, Math.ceil(this._waveWarningRemaining));
    const count = document.getElementById('waveWarningCount');
    if (count) count.textContent = second > 0 ? String(second) : 'GO';
    if (second !== this._waveWarningLastSecond) {
      this._waveWarningLastSecond = second;
      // V2：选卡期间只并行计时不播倒计时音，保持选卡节奏与旧行为一致。
      if (!this._upgradeActive && this._layout.waveWarningSound !== false &&
        this.audio && typeof this.audio.countdown === 'function') {
        this.audio.countdown(second, second === 0);
      }
    }
    if (this._waveWarningRemaining <= 0) {
      this._hideWaveWarning();
      // 防御：选卡未结束时冻结波次推进（警告时长钳位≥3s > 选卡 2s，正常不会触达），
      // 真触达则交给选卡结束后的 _continueAfterUpgradePick 立即补进下一波。
      if (this._upgradeActive) return;
      this._nextWave();
    }
  }

  // V2 选卡结束后的波次衔接：警告已在选卡期间并行倒计时——仍有剩余则亮出警告层
  // 继续等剩余；已被选卡耗尽（或未启动）则直接进入下一波。
  _continueAfterUpgradePick() {
    if (this._waveWarningActive) {
      const overlay = document.getElementById('waveWarning');
      if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.toggle('no-flash', this._layout.waveWarningFlash === false);
      }
      return;
    }
    this._nextWave();
  }

  _nextWave() {
    this._hideWaveWarning();
    this.wave++;
    if (this.wave > this.totalWaves) {
      this._endRun(true);
      return;
    }
    const W = CONFIG.waves;
    // 波次分层：进度超阈值进入精英/王牌层（后期敌人特别加强）
    const tier = (this.wave > Math.ceil(this.totalWaves * (W.aceWaveFrac != null ? W.aceWaveFrac : 0.75))) ? 2
               : (this.wave > Math.ceil(this.totalWaves * (W.eliteWaveFrac != null ? W.eliteWaveFrac : 0.45))) ? 1 : 0;
    const tierCfg = (CONFIG.enemyTiers && CONFIG.enemyTiers[tier]) || {};
    // 人数按关卡倍率增长；保留移动端上限，并继续使用队列分批创建模型。
    let count = Math.max(2, Math.round(
      W.baseCount * Math.pow(W.countMultiplier || 1.35, this.wave - 1)
    ));
    // 精英+波：人数再乘上浮、封顶放宽（后期更多敌人）
    if (tier > 0) count = Math.round(count * (W.eliteCountMul != null ? W.eliteCountMul : 1.35));
    count = Math.min(tier > 0 ? (W.eliteMaxCount != null ? W.eliteMaxCount : 18) : (W.maxCount != null ? W.maxCount : 99), count);
    const difficulty = ((CONFIG.ai && CONFIG.ai.difficulties) || {})[this._layout.aiDifficulty] || {};
    // tier 血量辨识：精英 ×1.2（AK 爆头一发仍成立）、王牌 ×1.6（AK 爆头两发、AWP 爆头一发）。
    // “血厚”是精英标识而非全体特征；压力主体来自人数/移速/行为（薄血快潮）。
    // 封顶次序：hpCap 在 jitter/难度 healthMul 之后、tierHpMul 之前生效，
    // 保证 tier 乘数不被封顶压平（精英 100×1.2=120、王牌 100×1.6=160）。
    const tierHpMul = tier === 2 ? (W.aceHpMul != null ? W.aceHpMul : 1.6)
                    : tier === 1 ? (W.eliteHpMul != null ? W.eliteHpMul : 1.2) : 1;
    const hp = Math.min(W.hpCap != null ? W.hpCap : 9999, Math.max(40, Math.round(
      (W.hpBase + (this.wave - 1) * W.hpPerWave) * (1 + (Math.random() - 0.5) * 2 * W.hpJitter)
    ) * (Number(difficulty.healthMul) || 1))) * tierHpMul;
    const speed = Math.min(
      (W.speedMax != null ? W.speedMax : Infinity) * (Number(difficulty.speedMul) || 1),
      Math.max(1.5, W.speedBase + (this.wave - 1) * W.speedPerWave + (Math.random() - 0.5) * 2 * W.speedJitter)
        * (Number(difficulty.speedMul) || 1));

    // 每波重置无伤判定与手雷波内击杀计数（挑战成就用）。
    this._waveDamaged = false;
    this._waveGrenadeKills = 0;

    this.hud.toast(`第 ${this.wave} 关：${count} 名敌人` + (tier > 0 ? ` · ${tierCfg.label || '精英'}来袭` : ''));
    this.audio.wave(this.wave);

    // 队列只保存参数；实际出生坐标在生成当帧按玩家当前位置重新校验。
    this.spawnQueue = [];
    for (let i = 0; i < count; i++) {
      this.spawnQueue.push({
        hp,
        speed,
        name: W.names[Math.floor(Math.random() * W.names.length)],
        tier,
        difficulty: this._layout.aiDifficulty,
      });
    }
    // 开局只同步创建一个敌人，其余敌人沿用队列间隔刷出，避免点击开始后同帧
    // 一次性创建多套模型、血条和命中代理造成真机长帧。
    this._spawnFromQueue(1);
    this.spawnTimer = 0.35;
    this._refreshScore();
  }

  _spawnFromQueue(n) {
    let spawned = 0;
    for (let i = 0; i < n && this.spawnQueue.length > 0; i++) {
      const spec = this.spawnQueue[0];
      const W = CONFIG.waves;
      const feet = this.player.getFeet();
      const occupied = this.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.position);
      const pos = this.gameMap.randomSpawn(
        feet.x, feet.z, W.minSpawnDistance || 16,
        occupied, (CONFIG.ai && CONFIG.ai.aiSpacing) || 0.9
      );
      if (!pos) break;
      this.spawnQueue.shift();
      const en = this._enemyPool.pop() || new Enemy(this.scene, this.gameMap, this.player, this.hud, {
        tier: spec.tier || 0,
        difficulty: spec.difficulty,
        pickups: this.pickups,
      });
      en.configureForSpawn({
        hp: spec.hp, speed: spec.speed, name: spec.name,
        tier: spec.tier || 0, difficulty: spec.difficulty, pickups: this.pickups,
      });
      en.map = this.gameMap;
      en.player = this.player;
      en.spatialHash = this._enemySpatialHash;
      if (!en.spawnAt(pos)) {
        en.deactivateForPool();
        this._enemyPool.push(en);
        this.spawnQueue.unshift(spec);
        break;
      }
      en.enemies = this.enemies;   // Enemy._avoidAI 需要的动态数组引用
      this.enemies.push(en);
      spawned++;
    }
    this._refreshScore();
    return spawned;
  }

  _refreshScore() {
    const alive = this._countAliveEnemies() + this.spawnQueue.length;
    const scoreKey = alive + '|' + this.kills + '|' + this.wave;
    if (scoreKey === this._scoreKey) return;
    this._scoreKey = scoreKey;
    this.hud.updateScore(alive, this.kills, this.wave);
  }

  _countAliveEnemies() {
    let count = 0;
    for (const enemy of this.enemies) if (enemy.alive) count++;
    return count;
  }

  // V1 补怪间隔：开局 respawnIntervalBase，随波次进度线性收紧到 respawnIntervalMin。
  // progress = clamp((wave-1)/(totalWaves-1), 0, 1)；单波局（totalWaves=1）不除零，恒为 Base。
  _respawnInterval() {
    const W = CONFIG.waves || {};
    const base = Number(W.respawnIntervalBase);
    if (!Number.isFinite(base)) return 2.5;   // 配置缺失时回退旧硬编码值
    const min = Number(W.respawnIntervalMin);
    if (!Number.isFinite(min)) return base;
    const total = this.totalWaves || 1;
    const progress = Math.max(0, Math.min(1, (this.wave - 1) / Math.max(1, total - 1)));
    return base + (min - base) * progress;
  }

  // 性能诊断悬浮层（设置页可开）：每帧采样帧耗时、每 0.5s 刷新一次文本。
  // 真机优化验收用——修复前后各测一局即可用数据对比，桌面端同样可用。
  _updatePerfDiag(now) {
    if (this._layout.perfDiag !== true) return;
    const dtMs = Math.max(0, Math.min(250, now - (this._diagLastFrameAt || now)));
    this._diagLastFrameAt = now;
    if (!Array.isArray(this._diagFrameMs)) this._diagFrameMs = [];
    this._diagFrameMs.push(dtMs);
    if (this._diagFrameMs.length > 120) this._diagFrameMs.shift();
    if (this.state !== 'playing') return;
    if (now - (this._diagLastUpdate || 0) < 500) return;
    this._diagLastUpdate = now;
    const overlay = document.getElementById('perfHud');
    if (!overlay) return;
    const sorted = this._diagFrameMs.slice().sort((a, b) => a - b);
    const pct = (p) => sorted.length
      ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] * 10) / 10
      : 0;
    const avg = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
    const fps = avg > 0 ? Math.round(1000 / avg) : 0;
    const info = this.renderer && this.renderer.info ? this.renderer.info.render : null;
    let enemies = 0;
    for (const en of this.enemies) if (en.alive) enemies++;
    overlay.textContent =
      'FPS ' + fps +
      ' | p50 ' + pct(0.5) + 'ms | p95 ' + pct(0.95) + 'ms' +
      ' | calls ' + (info ? info.calls : '-') +
      ' | tris ' + (info ? info.triangles : '-') +
      ' | dpr ' + (this.renderer ? this.renderer.getPixelRatio() : '-') +
      ' | 敌 ' + enemies;
  }

  // ---------- 主循环 ----------
  _loop() {
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    // 钳制 dt 防止切后台后大跳
    dt = Math.min(dt, 0.05);

    if (this.state === 'playing') {
      this._update(dt);
      this.renderer.render(this.scene, this.camera);
      this._sampleTouchPerformance(now);
      this._updatePerfDiag(now);
      this.hud.drawMinimap();
      this._lastIdleRender = now;
    } else if (this._inspectActive()) {
      // 检视打开期间满帧渲染检视场景（单模型 + 3 灯，成本远低于战斗帧）。
      // Bloom 就绪时走 composer（金属辉光），否则直接渲染。
      this._updateInspect(dt);
      if (this._inspectComposer) {
        this._inspectComposer.render();
      } else {
        this.renderer.render(this._inspectScene, this._inspectCamera);
      }
      this._lastIdleRender = now;
    } else if (now - this._lastIdleRender >= (CONFIG.idleRenderInterval || 100)) {
      this.renderer.render(this.scene, this.camera);
      this._lastIdleRender = now;
    }
  }

  // 真机性能保护使用滚动窗口分位数，避免单次 GC 或后台切换误触发。降级只在
  // 当前页面生命周期内单向进行：先逐级降低 DPR，严重长帧再关闭动态阴影。
  _sampleTouchPerformance(now) {
    if (!this._isTouchDevice || !this.renderer) return;
    const perf = CONFIG.performance || {};
    const frameWindow = Math.max(30, perf.frameWindow || 120);
    const evaluateEvery = Math.max(15, perf.evaluateEveryFrames || 60);
    const frameMs = Math.max(0, Math.min(250, now - this._lastPerfTime));
    this._lastPerfTime = now;
    this._perfFrames.push(frameMs);
    if (this._perfFrames.length > frameWindow) this._perfFrames.shift();
    this._perfEvaluationFrames++;
    if (this._perfFrames.length < frameWindow || this._perfEvaluationFrames < evaluateEvery) return;
    this._perfEvaluationFrames = 0;

    const sorted = this._perfFrames.slice().sort((a, b) => a - b);
    const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
    const p50 = percentile(0.50);
    const p95 = percentile(0.95);
    const p99 = percentile(0.99);
    const longFrames = this._perfFrames.filter(ms => ms >= (perf.longFrameMs || 50)).length;
    const severeFrames = this._perfFrames.filter(ms => ms >= (perf.severeFrameMs || 90)).length;

    const boot = window.CS15_BOOT || (window.CS15_BOOT = { marks: {} });
    const rendererInfo = this.renderer.info && this.renderer.info.render;
    boot.runtime = {
      sampleCount: sorted.length,
      p50: Math.round(p50 * 10) / 10,
      p95: Math.round(p95 * 10) / 10,
      p99: Math.round(p99 * 10) / 10,
      longFrames,
      severeFrames,
      pixelRatio: this.renderer.getPixelRatio(),
      shadows: !!this.renderer.shadowMap.enabled,
      calls: rendererInfo ? rendererInfo.calls : 0,
      triangles: rendererInfo ? rendererInfo.triangles : 0,
      activeEnemyCap: this._activeEnemyCap,
      graphicsPreset: this._graphics && this._graphics.preset,
      autoPerformance: !this._graphics || this._graphics.autoPerformance !== false,
      mapPerformance: this.gameMap && this.gameMap.performanceStats
        ? Object.assign({}, this.gameMap.performanceStats)
        : null,
      weaponPerformance: this.weapons && this.weapons.performanceStats
        ? Object.assign({}, this.weapons.performanceStats)
        : null,
    };

    if (this._graphics && this._graphics.autoPerformance === false) return;

    if (p95 > (perf.enemyCapDegradeMs || 38)) this._enemyCapBadWindows++;
    else this._enemyCapBadWindows = 0;
    if (this._enemyCapBadWindows >= Math.max(1, perf.enemyCapBadWindows || 3)) {
      this._activeEnemyCap = Math.min(
        this._activeEnemyCap,
        Math.max(1, Math.floor(perf.lowEndEnemyCap || 3))
      );
    }

    const currentDpr = this.renderer.getPixelRatio();
    const minDpr = perf.minPixelRatio || 0.85;
    if (p95 > (perf.dprDegradeMs || 24) && currentDpr > minDpr) {
      const nextDpr = Math.max(
        minDpr,
        Math.round((currentDpr - (perf.pixelRatioStep || 0.15)) * 100) / 100
      );
      if (nextDpr < currentDpr) {
        this._effectiveDpr = nextDpr;
        this.renderer.setPixelRatio(nextDpr);
        if (typeof this._syncGraphicsControls === 'function') this._syncGraphicsControls();
      }
    }
    if ((p95 > (perf.shadowDisableMs || 32) || p99 > (perf.severeFrameMs || 90)) &&
      this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false;
      this._renderProfile.shadows = false;
      if (typeof this._syncGraphicsControls === 'function') this._syncGraphicsControls();
    }
  }

  _update(dt) {
    if (this.state !== 'playing') return;
    // 强化三选一期间冻结战斗模拟（画面定格，仅倒计时推进），防止选卡时被偷袭。
    if (this._upgradeActive) {
      this._tickUpgradePick();
      // V2 波间压缩：波次警告与选卡并行倒计时（画面仍冻结，仅倒计时推进）。
      this._updateWaveWarning(dt);
      return;
    }

    // 玩家
    this.player.update(dt);
    // 武器
    this.weapons.update(dt);
    // 血包
    this.pickups.update(dt);
    if (this._waveWarningActive) this._updateWaveWarning(dt);

    // 敌人
    const feet = this.player.getFeet();
    const activeDifficulty = ((CONFIG.ai && CONFIG.ai.difficulties) || {})[this._layout.aiDifficulty] || {};
    if (activeDifficulty.useNavigation === true && this.gameMap &&
        typeof this.gameMap.updatePlayerFlowField === 'function') {
      this.gameMap.updatePlayerFlowField(feet.x, feet.z, dt);
    }
    this._enemySpatialTimer -= dt;
    if (this._enemySpatialTimer <= 0) {
      this._enemySpatialTimer = Math.max(0.05, Number((CONFIG.performance || {}).enemySpatialRefresh) || 0.1);
      this._enemySpatialHash.rebuild(this.enemies);
    }
    for (const en of this.enemies) en.update(dt);
    // 清理完全消失的敌人
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];
      if (!en.alive && !en.mesh.visible) {
        en.deactivateForPool();
        this._enemyPool.push(en);
        this.enemies.splice(i, 1);
      }
    }

    // 统计本帧击杀（对比上一帧血量总和简化处理 → 改用回调已在 weapon 内累加 kills）
    // 这里仅刷新计数
    this._refreshScore();

    // 间隔刷怪
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        // 场上存活敌人少于阈值就再刷
        const aliveCount = this._countAliveEnemies();
        if (aliveCount < this._activeEnemyCap) {
          const spawned = this._spawnFromQueue(1);
          // V1：补怪间隔随波次收紧（数值见 CONFIG.waves.respawnIntervalBase/Min）。
          this.spawnTimer = spawned ? this._respawnInterval() : 0.5;
        } else {
          this.spawnTimer = 1.0;
        }
      }
    }

    // 回合完成判定
    const aliveCount = this._countAliveEnemies();
    if (!this._waveWarningActive && this.spawnQueue.length === 0 && aliveCount === 0) {
      // 进入下一波（短暂延迟）
      this._waveCooldown = (this._waveCooldown != null ? this._waveCooldown : 0) + dt;
      if (this._waveCooldown > 1.0) {
        this._waveCooldown = 0;
        if (!this._waveDamaged) this._unlockChallenge('ch_wave_clean');
        if (this.wave >= this.totalWaves) this._endRun(true);
        else this._openUpgradePick();   // 清爽型强化：选完（或 2 秒超时随机）再进入下一波警告
      }
    } else {
      this._waveCooldown = 0;
    }

    // 玩家死亡
    if (!this.player.alive) {
      this._endRun(false);
    }
  }

  _endRun(win) {
    this._hideWaveWarning();
    this.state = 'over';
    if (!this._environmentReady) this._scheduleEnvironmentWarmup();
    this._lastRunWon = !!win;
    // 只有阵亡才解锁地图选择；胜利后的“再来一局”继续使用本局地图。
    this._mapSelectionLocked = !!win;
    this._syncMapPickers();
    this._stopTouchActions();
    if (this.weapons && typeof this.weapons.clearScopeZoom === 'function') {
      this.weapons.clearScopeZoom(true);
    }
    this.hud.hideClickHint();
    const time = ((performance.now() - this.startTime) / 1000) | 0;
    const mm = String((time / 60) | 0).padStart(2, '0');
    const ss = String(time % 60).padStart(2, '0');
    // 用回调累加的 totalKills（敌人倒地动画结束后会从数组移除，不能靠遍历统计）
    const totalKills = this.totalKills || 0;
    if (win) this.audio.win(); else this.audio.lose();
    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) restartBtn.textContent = win ? '再来一局' : '选择地图并重新开始';
    // 本局分数与历史最高分（最高分仅本机展示用途，核心玩法不依赖存储成功）。
    const score = (this._runStats && this._runStats.score) || 0;
    let best = score;
    try {
      const key = (CONFIG.runScore && CONFIG.runScore.bestStorageKey) || 'cs15_best_score_v1';
      const previous = Number(localStorage.getItem(key)) || 0;
      best = Math.max(previous, score);
      if (score > previous) localStorage.setItem(key, String(score));
    } catch (e) {
      // localStorage 不可用时仅缺历史最高展示，不影响结算。
      best = score;
    }
    const upgradeList = (this._acquiredUpgrades || []).join('、') || '—';
    // V4/V5：守到波次（胜局=总波次，败局=阵亡时正在防守的波次），供生涯高光与主题台词共用。
    const wavesReached = win ? this.totalWaves : this.wave;
    // V4 生涯高光：胜/负两路径都记录，勋章系统对各字段取生涯最大值并持久化。
    if (this.medalSystem && typeof this.medalSystem.recordRunStats === 'function') {
      this.medalSystem.recordRunStats({
        chain: (this._runStats && this._runStats.maxChain) || 0,
        headshots: (this._runStats && this._runStats.headshots) || 0,
        wave: wavesReached,
      });
    }
    // V5 结算主题台词：按胜负与守到波次分档（文案逐字冻结在 CONFIG.endLines）。
    const endCfg = CONFIG.endLines || {};
    const endLine = win ? endCfg.win
      : (wavesReached <= 3 ? endCfg.loseEarly
        : (wavesReached <= 7 ? endCfg.loseMid : endCfg.loseLate));
    const runStats = this._runStats || {};
    const highlight = `最长连杀 ${runStats.maxChain || 0} · 爆头 ${runStats.headshots || 0} · 守到第 ${wavesReached} 波`;
    this.hud.showResult(win, {
      '本局分数': score.toLocaleString('en-US'),
      '本局强化': upgradeList,
      '历史最高': best.toLocaleString('en-US'),
      '通关回合': win ? `${this.totalWaves} / ${this.totalWaves}` : `${this.wave - 1} / ${this.totalWaves}`,
      '累计击杀': totalKills,
      '生涯击杀': this.medalSystem.snapshot().careerKills,
      '存活时间': `${mm}:${ss}`,
    }, { endLine: typeof endLine === 'string' ? endLine : '', highlight });
    this.medalUI.setResult(this._runUnlockedMedalIds);
  }

  _openMedalCenter(returnState) {
    this._medalReturnState = returnState === 'over' || returnState === 'settings'
      ? returnState : 'menu';
    this._stopTouchActions();
    if (this._medalReturnState === 'over') {
      this.hud.hideResult();
    } else if (this._medalReturnState === 'settings') {
      const settings = document.getElementById('settingsMenu');
      if (settings) settings.classList.add('hidden');
    } else {
      this.hud.hideMenu();
    }
    this._setSettingsScrollMode(true);
    this.medalUI.openCenter();
    this._syncInternalBackButton();
  }

  _closeMedalCenter() {
    this.medalUI.closeCenter();
    if (this._medalReturnState === 'over') {
      this._setSettingsScrollMode(false);
      this.hud.result.classList.remove('hidden');
    } else if (this._medalReturnState === 'settings') {
      const settings = document.getElementById('settingsMenu');
      if (settings) settings.classList.remove('hidden');
      this._setSettingsScrollMode(true);
    } else {
      this._setSettingsScrollMode(false);
      this.hud.showMenu();
    }
    this._syncInternalBackButton();
  }

  _openMedalShare(medal) {
    this.medalUI.closeCenter();
    this._setSettingsScrollMode(true);
    this.medalShare.open(medal, {
      runKills: this.totalKills || 0,
      careerKills: this.medalSystem.snapshot().careerKills,
      mapId: this.mapId,
    });
    this._syncInternalBackButton();
  }

  _recordPlayerKill(event) {
    this.kills++;
    this.totalKills++;
    const result = this.medalSystem.recordKill(event);
    const newMedals = result.unlocked.concat(result.unlockedWeapons || []);
    for (const medal of newMedals) {
      if (!this._runUnlockedMedalIds.includes(medal.id)) this._runUnlockedMedalIds.push(medal.id);
    }
    if (this.medalUI && newMedals.length) this.medalUI.queueUnlocks(newMedals);
    if (!result.persisted && this.hud) this.hud.toast('勋章进度本局有效，当前环境无法保存');
    this._updateRunScoreAndChallenges(event);
  }

  // 连杀/分数计分板：窗口内连续击杀成链，链内逐杀递增加成；爆头双倍基础分。
  // 同时推进“凭实力”类挑战（单局杀数/爆头数/连杀链/手雷波内击杀）。
  _updateRunScoreAndChallenges(event) {
    const cfg = CONFIG.runScore || {};
    const stats = this._runStats;
    if (!stats) return;
    const now = performance.now() / 1000;
    const window = Number(cfg.chainWindow) || 4;
    stats.chain = stats.chain.filter((t) => now - t <= window);
    stats.chain.push(now);
    const chainLen = stats.chain.length;
    if (chainLen > stats.maxChain) stats.maxChain = chainLen;

    const headshot = !!(event && event.headshot);
    if (headshot) stats.headshots++;
    if (event && event.weaponId === 'grenade') {
      this._waveGrenadeKills = (this._waveGrenadeKills || 0) + 1;
      stats.waveGrenadeKills = this._waveGrenadeKills;
    }

    // V3 tier 计分：基础分按敌人分层取值（普通 100 / 精英 150 / 王牌 250），
    // tier 缺失或非法时回退统一基础分 cfg.base。爆头/连杀加成逻辑不变。
    const tierBaseTable = (cfg.tierBase && typeof cfg.tierBase === 'object') ? cfg.tierBase : {};
    const tierValue = Number(tierBaseTable[event && event.enemyTier]);
    const base = (Number.isFinite(tierValue) && tierValue > 0)
      ? tierValue : (Number(cfg.base) || 100);

    const chainBonus = Math.min(chainLen - 1, 4) * (Number(cfg.chainStep) || 50);
    stats.score += base + (headshot ? (Number(cfg.headshotBonus) || 100) : 0) + chainBonus;
    if (this.hud && typeof this.hud.setRunScore === 'function') this.hud.setRunScore(stats.score);

    // 连杀播报：2 连杀起播，≥6 连杀固定“势不可挡”。
    if (chainLen >= 2 && this.hud && typeof this.hud.showCombo === 'function') {
      const names = Array.isArray(cfg.comboNames) && cfg.comboNames.length
        ? cfg.comboNames : ['双杀', '三连杀', '四连击', '五连绝杀', '势不可挡'];
      const nameIdx = Math.min(chainLen - 2, names.length - 1);
      const sub = headshot ? `爆头 ×${stats.headshots}` : `${stats.score} 分`;
      this.hud.showCombo(names[nameIdx], sub);
    }

    // 技术挑战推进（一次性解锁；无伤清波在波次结束处判定）。
    if (this.kills >= 30) this._unlockChallenge('ch_run_30_kills');
    if (stats.headshots >= 10) this._unlockChallenge('ch_run_10_head');
    if (stats.maxChain >= 5) this._unlockChallenge('ch_chain_5');
    if (this._waveGrenadeKills >= 3) this._unlockChallenge('ch_grenade_3_wave');
    if ((this.medalSystem.weaponKillsOf('m9') || 0) >= 20) this._unlockChallenge('ch_m9_20');
  }

  _unlockChallenge(id) {
    if (!this.medalSystem || !this.medalSystem.recordChallenge(id)) return;
    const medal = this.medalSystem.getMedal(id);
    if (!medal) return;
    if (!this._runUnlockedMedalIds.includes(id)) this._runUnlockedMedalIds.push(id);
    if (this.medalUI) this.medalUI.queueUnlocks([medal]);
  }

  // ---------- 局内强化三选一（清爽型：战斗冻结 + 2 秒倒计时自动随机） ----------
  _openUpgradePick() {
    if (this.state !== 'playing') return;   // 入口守卫：仅战斗中开放选卡，防止菜单/暂停/结算误触
    const cfg = CONFIG.upgrades;
    if (!cfg || !Array.isArray(cfg.cards) || !cfg.cards.length) {
      this._startWaveWarning();
      return;
    }
    // 不放回抽取三张（同轮不重复），跨波可重复获得并叠乘。
    const pool = cfg.cards.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    this._upgradeChoices = pool.slice(0, 3);
    this._upgradeActive = true;
    this._upgradeDeadline = performance.now() + (Number(cfg.pickDuration) || 2) * 1000;
    // V2 波间压缩：选卡期间同步启动下一波警告倒计时（隐藏层，仅计时），选卡结束后衔接剩余时间。
    this._startWaveWarning(true);
    this._stopTouchActions();

    const overlay = document.getElementById('upgradePick');
    const container = document.getElementById('upgradeCards');
    if (container) {
      while (container.firstChild) container.removeChild(container.firstChild);
      const rarityLabel = { common: '标准', rare: '稀有', epic: '史诗' };
      for (const card of this._upgradeChoices) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `upgrade-card rarity-${card.rarity || 'common'}`;
        const rarity = document.createElement('span');
        rarity.className = 'up-rarity';
        rarity.textContent = rarityLabel[card.rarity] || '标准';
        btn.appendChild(rarity);
        const title = document.createElement('span');
        title.className = 'up-title';
        title.textContent = card.title;
        btn.appendChild(title);
        const desc = document.createElement('span');
        desc.className = 'up-desc';
        desc.textContent = card.desc;
        btn.appendChild(desc);
        this._bindTap(btn, () => this._finishUpgradePick(card, false));
        container.appendChild(btn);
      }
    }
    const hint = document.getElementById('upgradeHint');
    if (hint) hint.textContent = '战斗暂停 · 立即选择，超时将随机强化';
    if (overlay) overlay.classList.remove('hidden');
    this._markBoot('upgrade_pick_open');
  }

  // 倒计时推进（_update 冻结分支每帧调用）；到时自动随机选一张。
  _tickUpgradePick() {
    if (!this._upgradeActive) return;
    const duration = (Number((CONFIG.upgrades || {}).pickDuration) || 2) * 1000;
    const remaining = Math.max(0, this._upgradeDeadline - performance.now());
    const bar = document.getElementById('upgradeTimerBar');
    if (bar) bar.style.width = `${(remaining / duration) * 100}%`;
    if (remaining <= 0) this._finishUpgradePick(null, true);
  }

  _finishUpgradePick(card, auto) {
    if (this.state !== 'playing') return;   // 入口守卫：非战斗状态（暂停/结算）不落账、不推进波次
    if (!this._upgradeActive) return;
    this._upgradeActive = false;
    const choices = this._upgradeChoices || [];
    const picked = card || choices[Math.floor(Math.random() * choices.length)] || null;
    const overlay = document.getElementById('upgradePick');
    if (overlay) overlay.classList.add('hidden');
    this._upgradeChoices = null;
    if (!picked) {
      this._continueAfterUpgradePick();
      return;
    }
    this._applyUpgradeCard(picked, auto);
    this._continueAfterUpgradePick();
  }

  _applyUpgradeCard(card, auto) {
    const acquired = this._acquiredUpgrades || (this._acquiredUpgrades = []);
    acquired.push(card.title);
    if (card.kind === 'weapon' && this.weapons && typeof this.weapons.applyUpgrade === 'function') {
      this.weapons.applyUpgrade(card.key, card.value, card.mode);
    } else if (card.kind === 'player' && this.player && typeof this.player.applyUpgrade === 'function') {
      this.player.applyUpgrade(card.key, card.value, card.mode);
    }
    if (this.hud) this.hud.toast(`${auto ? '自动强化' : '强化'}：${card.title}`);
  }
}

// 启动
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.__game = game;   // 调试用
});
