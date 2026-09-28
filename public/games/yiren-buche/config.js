// config.js —— 全局常量与武器/敌人参数表
// 集中管理数值，便于后续平衡性调整

const CONFIG = {
  // ---- 渲染 ----
  fov: 75,
  fovPortrait: 88,          // 竖屏水平视野补偿（竖屏 aspect<1，垂直 FOV 需加大才不会太窄）
  renderDistance: 250,      // 地图实际尺寸远小于 250m，缩短远裁面提升移动端深度精度
  shadowMapSize: 1024,      // 启动时由设备档位覆盖：安卓 512 / 桌面 1024
  mobilePixelRatioCap: 1.25,
  desktopPixelRatioCap: 2,
  idleRenderInterval: 100,  // 菜单/暂停态降到 10 FPS，减少无意义的 GPU 占用
  graphics: {
    storageKey: 'cs15_graphics_v1',
    defaultPreset: 'auto',
    presets: {
      performance: {
        mobileDpr: 0.85, desktopDpr: 1.25, shadows: 'off', effects: 'low',
        animation: 'performance', mobileAnisotropy: 1, desktopAnisotropy: 1, autoPerformance: true,
      },
      balanced: {
        mobileDpr: 1.15, desktopDpr: 1.5, shadows: 'contact', effects: 'balanced',
        animation: 'balanced', mobileAnisotropy: 2, desktopAnisotropy: 4, autoPerformance: true,
      },
      quality: {
        mobileDpr: 1.35, desktopDpr: 2, shadows: 'dynamic', effects: 'high',
        animation: 'smooth', mobileAnisotropy: 4, desktopAnisotropy: 8, autoPerformance: true,
      },
    },
    effectScales: { low: 0.5, balanced: 1, high: 1.25 },
    animationProfiles: {
      performance: { nearDistance: 9, farDistance: 20, nearInterval: 1 / 30, midInterval: 1 / 20, farInterval: 1 / 10 },
      balanced: { nearDistance: 12, farDistance: 25, nearInterval: 0, midInterval: 1 / 30, farInterval: 1 / 15 },
      smooth: { nearDistance: 15, farDistance: 32, nearInterval: 0, midInterval: 1 / 60, farInterval: 1 / 30 },
    },
  },
  // 移动端性能预算：效果全部池化，碰撞沿轨迹分步而不是逐三角形查询。
  performance: {
    collisionStep: 0.2,
    maxTracers: 24,
    maxImpacts: 24,
    maxHitSparks: 30,
    maxShells: 12,
    muzzleDuration: 0.075,
    frameWindow: 120,
    evaluateEveryFrames: 60,
    dprDegradeMs: 24,
    shadowDisableMs: 32,
    longFrameMs: 50,
    severeFrameMs: 90,
    minPixelRatio: 0.85,
    pixelRatioStep: 0.15,
    activeEnemyCap: 4,
    lowEndEnemyCap: 3,
    enemyCapDegradeMs: 38,
    enemyCapBadWindows: 3,
    enemySpatialCellSize: 2,
    enemySpatialRefresh: 0.1,
    effectBudgetScale: 1,
    enemyAnimationProfile: null,
  },

  // ---- 小红书横屏触控安全带 ----
  // 宿主退出键与系统手势不属于网页控件，游戏只负责让自己的可交互区域避让。
  inputSafety: {
    landscapeLeftReserve: 88,   // 宿主默认退出键 + 刘海/圆角区域
    landscapeBottomReserve: 32, // 横屏系统手势条区域
  },

  // ---- 生涯击杀勋章 ----
  // 图片保持为包内 512×512 WebP；中文和击杀数字由 DOM / Canvas 绘制，
  // 不把文字烘焙进图片，便于分享卡片与游戏界面复用同一套资源。
  medals: {
    storageKey: 'cs15_medals_v1',
    shareCard: { width: 1080, height: 1440, jpegQuality: 0.9 },
    list: [
      { id: 'first_edge', kills: 25, title: '初露锋芒', image: 'medal_01.webp', accent: '#c58a54' },
      { id: 'vanguard', kills: 100, title: '百战先锋', image: 'medal_02.webp', accent: '#cbd5df' },
      { id: 'veteran', kills: 300, title: '战区老兵', image: 'medal_03.webp', accent: '#c69a4b' },
      { id: 'elite', kills: 750, title: '不撤精英', image: 'medal_04.webp', accent: '#d84040' },
      { id: 'ace', kills: 1500, title: '孤胆王牌', image: 'medal_05.webp', accent: '#e1b953' },
      { id: 'one_man_stand', kills: 3000, title: '一人不撤', image: 'medal_06.webp', accent: '#f04a32' },
    ],
    // 枪械专精勋章：按“该武器生涯击杀数”解锁，独立于上面的生涯总击杀勋章。
    // image 留空 = 贴图待补，界面先用占位视觉（weaponId 缩写 + 主题色描边）。
    weaponMastery: {
      kills: 100,
      list: [
        { id: 'mastery_ak47', weaponId: 'ak47', type: 'weapon', title: 'AK-47 专精', accent: '#d97706' },
        { id: 'mastery_m249', weaponId: 'm249', type: 'weapon', title: 'M249 专精', accent: '#3d8996' },
        { id: 'mastery_awp', weaponId: 'awp', type: 'weapon', title: 'AWP 专精', accent: '#8b5cf6' },
      ],
    },
    // 挑战成就：一次性行为解锁（区别于击杀阈值型勋章），记录在存档 challenges 字段。
    challenges: [
      { id: 'ch_run_30_kills', type: 'challenge', title: '杀意纵横', desc: '单局击杀 30 名敌人', accent: '#f04a32' },
      { id: 'ch_run_10_head', type: 'challenge', title: '百步穿杨', desc: '单局爆头击杀 10 次', accent: '#e1b953' },
      { id: 'ch_chain_5', type: 'challenge', title: '连战连捷', desc: '单局达成 5 连杀', accent: '#d97706' },
      { id: 'ch_wave_clean', type: 'challenge', title: '不动如山', desc: '完整清空一波且未受任何伤害', accent: '#4ade60' },
      { id: 'ch_grenade_3_wave', type: 'challenge', title: '雷神之怒', desc: '单波用手榴弹击杀 3 名敌人', accent: '#65a30d' },
      { id: 'ch_m9_20', type: 'challenge', title: '白刃夺魂', desc: 'M9 刺刀生涯击杀 20 名敌人', accent: '#94a3b8' },
    ],
  },

  // ---- 连杀与分数（技术爽感计分板）----
  // 分数 = tier 基础分 + 爆头 100 + 连杀加成（连杀窗口内第 n 杀 +min(n-1,4)×50）。
  runScore: {
    base: 100,           // tier 缺失/未知时的基础分回退值
    headshotBonus: 100,
    // tier 基础分（V3）：普通 100 / 精英 150 / 王牌 250，打高价值目标应得更多分。[待测试]
    tierBase: { 0: 100, 1: 150, 2: 250 },
    chainWindow: 4,      // 连杀判定窗口（秒）：窗口内连续击杀计入同一连杀链
    chainStep: 50,       // 链内每多一杀的额外加成
    chainCap: 200,       // 连杀加成封顶
    bestStorageKey: 'cs15_best_score_v1',
    // 连杀播报文案（中文绝杀风）：下标 = 连杀数-2（2 连杀起播报），超出取最后一项。
    comboNames: ['双杀！', '三连绝杀！', '四连超凡！', '五连无双！', '势不可挡！'],
  },

  // ---- 结算页主题台词（V5）：按 胜利 / 失败时守到的波次分档。文案为产品冻结内容，逐字使用。----
  endLines: {
    win: '一个人，守住了。这就是「一人不撤」。',
    loseEarly: '阵地还没捂热。下一局，从第一枪开始。',   // 失败且 wave≤3
    loseMid: '守到这里，已经不容易。他们记住你了。',     // 失败且 4≤wave≤7
    loseLate: '就差几波。他们记住了你的名字。',         // 失败且 wave≥8
  },

  // ---- 局内强化（Roguelite 三选一，清爽型：每波必弹、2 秒倒计时自动随机）----
  // 效果仅当局生效；kind=weapon 的 key 由 WeaponSystem.applyUpgrade 解释，
  // kind=player 的 key 由 Player.applyUpgrade 解释。mul=乘算叠加，add=加算，instant=即时。
  upgrades: {
    pickDuration: 2,
    cards: [
      { id: 'up_damage', rarity: 'common', title: '穿甲弹头', desc: '武器伤害 +15%', kind: 'weapon', key: 'damageMul', value: 1.15, mode: 'mul' },
      { id: 'up_firerate', rarity: 'common', title: '轻量击锤', desc: '射速 +12%', kind: 'weapon', key: 'fireRateMul', value: 1.12, mode: 'mul' },
      { id: 'up_speed', rarity: 'common', title: '疾行背包', desc: '移动速度 +10%', kind: 'player', key: 'speedMul', value: 1.1, mode: 'mul' },
      { id: 'up_reload', rarity: 'rare', title: '快拔弹匣', desc: '换弹时间 -20%', kind: 'weapon', key: 'reloadTimeMul', value: 0.8, mode: 'mul' },
      { id: 'up_mag', rarity: 'rare', title: '扩容弹匣', desc: '弹匣容量 +30%（立即补满）', kind: 'weapon', key: 'magMul', value: 1.3, mode: 'mul' },
      { id: 'up_armor', rarity: 'rare', title: '陶瓷插板', desc: '护盾上限 +25 并立即回满', kind: 'player', key: 'armorMax', value: 25, mode: 'instant' },
      { id: 'up_headshot', rarity: 'epic', title: '处决直觉', desc: '爆头伤害倍率 +0.5', kind: 'weapon', key: 'headMultBonus', value: 0.5, mode: 'add' },
      { id: 'up_heal', rarity: 'epic', title: '战地军医', desc: '立即恢复全部生命', kind: 'player', key: 'healFull', value: 1, mode: 'instant' },
      { id: 'up_resupply', rarity: 'epic', title: '弹药空投', desc: '手雷 +2 且当前武器备弹补满', kind: 'weapon', key: 'resupply', value: 2, mode: 'instant' },
    ],
  },

  // ---- 出战配置（启动页选枪）----
  // 全部武器进入选择页（列表按 CONFIG.weapons[id].slot 动态生成，新武器自动出现）；
  // 每件可独立勾选携带，默认全部携带（与经典 1–6 切换一致）。「首发」决定开局手持。
  loadout: {
    storageKey: 'cs15_loadout_v1',
    default: { carried: ['usp', 'ak47', 'awp', 'm249', 'm9', 'grenade'], start: 'usp' },
  },

  // ---- 地图 ----
  // 地图选择器只暴露已经接入完整出生点、视觉层、碰撞和射线逻辑的地图。
  // 新局开始后由 main.js 锁定当前选择，玩家死亡后才允许重新选择。
  map: {
    defaultId: 'container-port',
    name: '港口集装箱仓库',
    // 港口碰撞由 0.5m 栅格生成；向真实表面内收，抵消单元外扩造成的空气墙。
    portCollisionInset: 0.18,
    choices: [
      {
        id: 'container-port',
        name: '港口集装箱仓库',
        description: '集装箱通道与高低掩体，适合中远距离交战',
      },
      {
        id: 'classic',
        name: '经典竞技场',
        description: '西侧仓库、东侧仓库与中央长廊，路线更紧凑',
      },
    ],
  },

  // ---- 玩家 ----
  player: {
    height: 1.7,            // 站立眼高
    radius: 0.35,           // 碰撞半径
    walkSpeed: 7.5,         // m/s
    runSpeed: 11,           // 加速跑（未实装，留接口）
    crouchSpeed: 3.5,
    crouchDrop: 0.5,        // 下蹲眼高降低量（1.7→1.2，视觉可感知）
    proneSpeed: 2.2,        // 卧姿匍匐速度，明显低于蹲伏但仍可持续移动
    proneDrop: 0.98,        // 卧姿眼高降低量（1.7→0.72）
    stanceTransitionSpeed: 9,
    proneBobScale: 0.35,
    jumpVelocity: 7.2,
    gravity: 22,
    accelGround: 18,        // 更快达到目标速度，减轻触控“拖沓感”
    accelAir: 2.4,          // 空中控制（CS 空中转向受限）
    friction: 11,
    maxHealth: 100,
    maxArmor: 100,
    mouseSensitivity: 0.0025,
    touchSensitivity: 0.008,   // 逻辑短边归一化后的基础灵敏度；设置页仍可按个人习惯缩放
    touchReferenceShortSide: 460, // 同样占屏比例的滑动在手机/平板得到一致转角
    touchMaxDeltaRatio: 0.35,  // 丢帧/坐标跳变时限制单个采样，避免突然甩镜
    fireDragSensitivityMul: 0.85, // 按住 FIRE 拖动时略降，兼顾追枪稳定性
    scopeSensitivityMul: 0.72,    // AWP 开镜后降低转向速度，避免放大视野过度甩动
    // 左右探头（传统 FPS）：眼位与弹道起点侧移 + 相机滚转；Q/E 与移动端按钮驱动。
    leanOffset: 0.45,       // 探头侧向眼位偏移（米），碰撞体不动
    leanRoll: 0.2,          // 相机滚转角（弧度，约 11.5°，方向与探头侧相反）
    leanSpeed: 10,          // 探头姿态收敛速率（帧率无关阻尼）
    joystickDeadzone: 0.06,
    joystickFullAt: 0.80,       // 推到 80% 半径即满速
    joystickCurve: 0.80,        // <1：小幅推动也能快速起步
    viewBobSettleSpeed: 12,     // 停步后只衰减幅度，不再改变步态相位
  },

  // ---- 武器定义 ----
  // type: semi(半自动) / auto(全自动)
  // spread: 弹道散布角度(弧度)；
  weapons: {
    usp: {
      id: 'usp', name: 'Glock-18', slot: 1,
      type: 'semi',
      damage: 30, headMult: 4, legMult: 0.75, armMult: 1, gunMult: 0.5,
      armorPen: 0.47,        // 新增：穿甲 47%（若引擎现有逻辑读不到则仅作数据记录，不加新机制）
      fireRate: 0.15,        // 400 RPM 半自动
      magSize: 20, reserve: 120,
      reloadTime: 2.3,
      spread: 0.008, spreadMove: 0.05,
      recoil: { x: 0.010, y: 0.015, recover: 0.12 },   // recover: 视角回正速率 rad/s（数据驱动）
      recoilPattern: 'light',      // light: 轻微上抬，左右摆动小
      range: 200,
      autoReload: true,
      // 距离衰减（米：<=falloffStart 满伤，>=falloffEnd 衰减至 falloffMin 倍率）
      falloffStart: 10, falloffEnd: 50, falloffMin: 0.5,
      // 连发散布（Glock-18 半自动无累积）
      spreadInc: 0.0, spreadMax: 0.012, spreadDecay: 0.0,
      switchTime: 0.3,      // 切枪动画+冷却时长（秒）
      // 枪模后坐（viewKick）：push=后缩位移(m)、pitch=上挑角(rad)、yaw=左右扭(rad)、decay=回位速率(/s)
      viewKick: { push: 0.10, pitch: 0.055, yaw: 0.02, decay: 7 },
      // 弹壳抛壳口（枪模局部坐标，localToWorld 转换）
      shell: { x: 0.25, y: -0.135, z: -0.50 },
    },
    ak47: {
      id: 'ak47', name: 'AK-47', slot: 2,
      type: 'auto',
      damage: 30, headMult: 4, legMult: 0.75, armMult: 1, gunMult: 0.5,
      fireRate: 0.099,
      magSize: 30, reserve: 90,
      reloadTime: 2.4,
      spread: 0.012, spreadMove: 0.07,
      recoil: { x: 0.020, y: 0.028, recover: 0.05 },   // 慢恢复 → 需压枪
      recoilPattern: 'heavy',      // heavy: 竖向上扬为主 + 随机左右摆
      range: 250,
      autoReload: true,
      falloffStart: 10, falloffEnd: 50, falloffMin: 0.5,
      spreadInc: 0.004, spreadMax: 0.045, spreadDecay: 0.06,   // 连发累积 0.004/发，停止后快速恢复
      switchTime: 0.3,
      viewKick: { push: 0.17, pitch: 0.10, yaw: 0.05, decay: 5 },
      shell: { x: 0.05, y: 0.005, z: -0.10 },
    },
    // AWP 狙击步枪（栓动式 + 瞄准镜放大）：单发伤害高、射速慢、射程远；
    // 切到 AWP 时 camera.fov 降到 45° 实现"瞄准镜放大镜"远程狙击观察
    awp: {
      id: 'awp', name: 'AWP', slot: 3,
      type: 'semi',           // 栓动单发
      damage: 140, headMult: 1.5, legMult: 0.6, armMult: 0.8, gunMult: 0.4,
      fireRate: 0.85,        // 栓动拉栓周期（蓝图：球形拉柄 0.85s/发）
      magSize: 5, reserve: 20,
      reloadTime: 3.0,        // 5 发单排替换（蓝图）
      moveSpeedMul: 0.75,    // 携带移速惩罚 -25%（蓝图：重型武器平衡）
      spread: 0.001, spreadMove: 0.0,   // 几乎零散布（精准狙击）
      recoil: { x: 0.045, y: 0.055, recover: 0.02 },  // 强后坐、慢恢复
      recoilPattern: 'heavy',
      range: 500,            // 超远射程
      autoReload: false,
      falloffStart: 50, falloffEnd: 300, falloffMin: 0.7,  // 远距离衰减很小
      spreadInc: 0.0, spreadMax: 0.0, spreadDecay: 0.0,   // 单发无连发散布
      switchTime: 0.5,
      fov: 45,               // 瞄准镜放大（FOV 减小 = 放大；默认 75°，AWP 45°）
      viewKick: { push: 0.24, pitch: 0.18, yaw: 0.03, decay: 3.6 },
      shell: { x: 0.06, y: 0.0, z: -0.12 },
    },
    // M249 班用机枪：100 发持续火力，以更慢移动、长换弹和较大连射散布换取压制能力。
    m249: {
      id: 'm249', name: 'M249', slot: 4,
      kind: 'firearm', type: 'auto',
      damage: 32, headMult: 3.5, legMult: 0.72, armMult: 0.95, gunMult: 0.45,
      fireRate: 0.08,
      magSize: 100, reserve: 200,
      reloadTime: 5.1,
      moveSpeedMul: 0.78,
      spread: 0.017, spreadMove: 0.08,
      recoil: { x: 0.024, y: 0.032, recover: 0.045 },
      recoilPattern: 'heavy',
      range: 280,
      autoReload: true,
      falloffStart: 18, falloffEnd: 90, falloffMin: 0.55,
      spreadInc: 0.0035, spreadMax: 0.055, spreadDecay: 0.05,
      switchTime: 0.48,
      viewKick: { push: 0.18, pitch: 0.085, yaw: 0.055, decay: 4.6 },
      shell: { x: 0.06, y: 0.01, z: -0.12 },
    },
    // 用户提供的 M9 资产实际是 M9 刺刀，不是 Beretta M9 手枪；按近战武器接入。
    m9: {
      id: 'm9', name: 'M9 刺刀', slot: 5,
      kind: 'melee', type: 'semi',
      damage: 65, headMult: 1.5, legMult: 0.75, armMult: 1, gunMult: 0.5,
      fireRate: 0.55,
      magSize: 0, reserve: 0,
      reloadTime: 0, reloadable: false,
      moveSpeedMul: 1.05,
      spread: 0, spreadMove: 0,
      recoil: { x: 0, y: 0, recover: 0 },
      recoilPattern: 'none',
      range: 2.6,
      autoReload: false,
      spreadInc: 0, spreadMax: 0, spreadDecay: 0,
      switchTime: 0.22,
      viewKick: { push: 0.02, pitch: 0.02, yaw: 0.1, decay: 6.5 },
    },
    // M26 破片手榴弹：每局携带两枚，有限库存、延时爆炸并受墙体遮挡。
    grenade: {
      id: 'grenade', name: 'M26 手榴弹', slot: 6,
      kind: 'grenade', type: 'semi',
      damage: 145, headMult: 1, legMult: 1, armMult: 1, gunMult: 1,
      fireRate: 0.9,
      magSize: 2, reserve: 0,
      reloadTime: 0, reloadable: false,
      moveSpeedMul: 0.95,
      spread: 0, spreadMove: 0,
      recoil: { x: 0, y: 0, recover: 0 },
      recoilPattern: 'none',
      range: 24,
      blastRadius: 7,
      fuseTime: 2.7,
      throwSpeed: 15,
      gravity: 18,
      bounce: 0.42,
      autoReload: false,
      spreadInc: 0, spreadMax: 0, spreadDecay: 0,
      switchTime: 0.35,
      viewKick: { push: 0.03, pitch: 0.03, yaw: 0.04, decay: 7 },
    },
  },

  // ---- 敌人 ----
  enemy: {
    radius: 0.4,
    height: 1.8,
    maxHealth: 100,
    moveSpeed: 3.2,
    chaseSpeed: 4.6,
    fireRange: 45,
    fireInterval: 0.7,      // 开火间隔
    burstCount: 3,          // 一次点射击数
    burstDelay: 0.12,
    damage: 8,              // 兼容旧配置的基准值
    // 设置页调整的是普通身体射击的基础伤害，按玩家 100 点生命值校准；
    // 精英/王牌的 damageAdd 与爆头倍率仍在基础范围之外单独生效。
    damageMin: 6,
    damageMax: 12,
    headshotMultiplier: 3,
    hitChance: 0.45,        // 命中率(玩家在视野内时)
    sightRange: 70,
    fov: Math.PI * 0.55,    // 视野半角
    reactionTime: 0.35,     // 发现玩家到开火延迟
    // 死亡掉落护甲概率（18%）：每波约 3-8 敌（平均 5）→ 每波约 0.9 个护甲（+45 护盾）
    // 与一波战斗实际损耗（护甲 50% 吸收，约 12-32 点）基本匹配并略有余量，
    // 保证护盾是需运营的稀缺资源，不会溢出（35% 时每波 +87 严重溢出、护盾永远满）
    armorDropChance: 0.18,
    // 每次敌人死亡独立判定一次手榴弹掉落；爆头三件套之外也会参与该判定。
    grenadeDropChance: 0.15,
    // 敌人使用有限弹匣；备弹耗尽后才会主动搜索地图弹药包，换弹有明确读秒。
    ammo: {
      magazineSize: 18,
      reserveSize: 54,
      reloadTime: 2.2,
      postReloadDelay: 0.45,
      reloadMoveSpeedMul: 0.55,
      pickupSearchRadius: 28,
      pickupRange: 1.4,
      pickupAmount: 36,
      searchInterval: 0.45,
      healthSeekRatio: 0.55,
      ammoSeekRatio: 0.45,
    },
  },

  // ---- AI 融合（three-cs）----
  ai: {
    losMode: 'seg',   // 视线判定：'seg' = 2D 线段轻量判定（raycast 兜底）；'ray' = 原 3D 射线（回退开关）
    losSegY: 1.55,    // 参与遮挡的墙体最低高度：掩体箱 maxY<此值不遮视线（维持现有 raycast 行为）
    aiSpacing: 0.9,   // AI-AI 最小间距（米），_avoidAI 阈值；< 两敌碰撞半径和(0.4+0.4)即可生效
    squeezeGapFactor: 1.15, // 缝隙挤压判定：两侧平行墙间距 < 圆直径×该系数 视为挤压缝（出生/导航/占位/推挤/脱困共用）
    navigationCellSize: 1.0,
    navigationRefresh: 0.65,
    playerFlowRefresh: 0.35,
    containmentCheckInterval: 0.18,
    rushStartDistance: 12,
    rushStopDistance: 7.5,
    rushDuration: 0.9,
    rushSpeedMul: 2.15,
    rushEvadeDuration: 1.25,
    difficultyDefault: 'normal',
    difficulties: {
      // 只有灾难级开启主动搜人、主动争抢补给和 A*/玩家流场导航。
      // 四档数值倍率独立保留；这三个能力字段是行为门禁的唯一配置来源。
      easy: { label: '简单', healthMul: 0.82, speedMul: 0.88, damageMul: 0.68, accuracyMul: 0.72, reactionMul: 1.45, fireIntervalMul: 1.25, autoHunt: false, seekPickups: false, useNavigation: false },
      normal: { label: '中等', healthMul: 1, speedMul: 1, damageMul: 1, accuracyMul: 1, reactionMul: 1, fireIntervalMul: 1, autoHunt: false, seekPickups: false, useNavigation: false },
      hard: { label: '困难', healthMul: 1.2, speedMul: 1.12, damageMul: 1.18, accuracyMul: 1.18, reactionMul: 0.8, fireIntervalMul: 0.86, autoHunt: false, seekPickups: false, useNavigation: false },
      // 灾难级血量仅微调（1.48→1.2，血量压平路线）；压迫感由主动搜人、
      // 争抢补给与 A*/玩家流场包抄这些行为差异承载。
      catastrophe: { label: '灾难级', healthMul: 1.2, speedMul: 1.24, damageMul: 1.42, accuracyMul: 1.36, reactionMul: 0.58, fireIntervalMul: 0.7, autoHunt: true, seekPickups: true, useNavigation: true },
    },
  },

  // ---- 回合（随机多关卡：每局随机波次数 + 每波随机敌人数/血量/速度）----
  // 数值哲学（2026-09-11 定稿“薄血快潮”）：血量全程压平——普通兵 AK 爆头
  // 一发、AWP 全程一枪一个；压力来自人数/移速/行为，而不是血量对抗。
  waves: {
    minWaves: 8,            // 关卡数量下限（原来 4~7 太短，玩家反馈不够玩）
    maxWaves: 12,
    baseCount: 3,          // 第 1 波基准人数
    countMultiplier: 1.22, // 每过一关按倍率增长（血量压平后人数承载部分压力）
    maxCount: 24,          // 移动端安全上限；排队生成避免同帧创建全部模型
    minSpawnDistance: 16,  // 敌人出生点与玩家至少相距 16 米
    warningDuration: 3,    // 波次之间的红色警告倒计时，设置页允许 3–10 秒（V2 压缩波间死时间：默认 5→3）[待测试]
    // ---- 补怪间隔随波次收紧（V1）：开局 Base，逐波线性逼近 Min，压力由补怪节奏承载。[待测试] ----
    respawnIntervalBase: 2.5,   // 第 1 波补怪间隔（秒）
    respawnIntervalMin: 1.2,    // 末波补怪间隔（秒）
    warningSound: true,
    warningFlash: true,
    hpBase: 70,            // 第 1 波基准血量（薄血：AK 身体 3 发、爆头 1 发）
    hpPerWave: 4,          // 每波微增，曲线全程压平（第 8 波 98，仍爆头一发）
    hpJitter: 0.2,         // 血量随机浮动 ±20%
    hpCap: 100,            // 血量封顶（AK 爆头 120/一发、AWP 140/一发全程成立）
    speedBase: 2.8,        // 第 1 波基准速度
    speedPerWave: 0.35,    // 每波递增速度
    speedJitter: 0.12,     // 速度随机浮动
    speedMax: 4.8,         // 速度封顶（玩家走速 7.5，敌人追击 1.3 倍速超过 6.2 就追不上）
    names: ['Phantom', 'Viper', 'Ghost', 'Reaper', 'Fang', 'Echo', 'Talon', 'Raven'],
    // ---- 后期强化：按波次进度分层（wave/totalWaves 超过阈值进入对应层级）----
    eliteWaveFrac: 0.45,    // 波次进度 > 45% → tier 1 精英
    aceWaveFrac: 0.75,      // 波次进度 > 75% → tier 2 王牌
    eliteCountMul: 1.15,    // 精英+波在倍率增长基础上再小幅增加
    eliteMaxCount: 28,      // 精英+波人数封顶
    // ---- tier 血量辨识：精英 ×1.2（≤AK 爆头 120，一发仍是）----
    // ---- 王牌 ×1.6（需 2 发爆头，优先处理精英成为技术决策）----
    eliteHpMul: 1.2,
    aceHpMul: 1.6,
  },

  // ---- 敌人分层强化（tier 0 普通 / 1 精英 / 2 王牌）----
  enemyTiers: {
    0: {},
    1: { label: '精英', burstBonus: 2,   fireIntervalMul: 0.85, hitChanceAdd: 0.06, damageAdd: 2,
         rush: true, push: true,  melee: true, meleeDamage: 16 },
    2: { label: '王牌', burstBonus: 3,   fireIntervalMul: 0.70, hitChanceAdd: 0.12, damageAdd: 4,
         rush: true, push: true,  melee: true, meleeDamage: 24 },
  },

  // ---- 补给包（血包 + 弹药包 + 手榴弹包 + 敌人掉落物）----
  pickup: {
    healAmount: 50,         // 每次回血量
    armorAmount: 50,        // 护盾点数：每次拾取增加量（敌人掉落）
    grenadeAmount: 1,       // 手榴弹专用补给包每次补 1 枚，WeaponSystem 再按 2 枚上限封顶
    pickupRadius: 1.4,      // 拾取半径（米）
    respawnTime: 15,        // 拾取后重生秒数
    // 血包固定点位 [x, z]，均避开墙体/掩体与出生点
    spawns: [
      [0, 3.4],      // 中央长廊（中央木箱旁）
      [-10, 8],      // 上半区西侧
      [18, -8],      // 下半区东侧
      [-20, -6],     // 下半区西侧出生区旁
    ],
    // 弹药包：一次补给的备用弹量（按枪械各自封顶在初始储备）
    ammo: {
      usp: 24,       // USP +2 弹匣
      ak47: 60,      // AK-47 +2 弹匣
      awp: 10,       // AWP +2 弹匣（5 发×2）
      m249: 100,     // M249 +1 弹链箱；近战和手榴弹不由普通弹药包补充
    },
    // 弹药包固定点位（与血包错开，覆盖两房 + 长廊两端；已对照墙体/掩体留出碰撞间距）
    ammoSpawns: [
      [-6, -2.6],    // 中央长廊 CT 端（避开 z=-4 隔墙）
      [12, 8],       // 上半区 T 侧
      [-18, -12],    // 西侧仓库内
      [22, 6.5],     // 东侧出生区旁（避开 z=4 隔墙）
    ],
    // 手榴弹专用固定点位：与血包/弹药包错开，切图时仍由 PickupSystem 做安全校正。
    grenadeSpawns: [
      [0, -18],      // 下侧中央通道
      [0, 18],       // 上侧中央通道
    ],
  },
};

// 工具：限制范围
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;

// 经典脚本全局暴露（依赖顺序：config 最先加载，后续脚本通过 window 命名空间取用）
window.CONFIG = CONFIG;
window.clamp = clamp;
window.lerp = lerp;
