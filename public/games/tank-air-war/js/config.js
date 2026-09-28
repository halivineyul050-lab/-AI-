// config.js —— 全局常量与坦克/飞机参数表
// 集中管理数值，便于后续平衡性调整（对齐 yiren-buche 的 config 风格）。
// 经典脚本（非 ES Module）：挂 window.CONFIG 供后续脚本取用。

const CONFIG = {
  // ---- 渲染 ----
  fov: 55,
  cameraHeight: 30,          // 俯视跟随相机高度
  cameraBack: 15,            // 相机后移量（俯视角约 63°）
  lookAhead: 6,              // 镜头朝炮口方向的预判偏移
  cameraLerp: 4.5,           // 相机跟随速率（/s）
  renderDistance: 220,
  mobilePixelRatioCap: 1.25,
  desktopPixelRatioCap: 2,
  idleRenderInterval: 100,   // 菜单/暂停态降到 10FPS 减少空耗

  // ---- 视角（tp=俯视跟随，fp=第一人称炮塔视角）----
  view: {
    fp: {
      fov: 68,               // 第一人称视野角（比俯视更广，增强临场感）
      eyeHeight: 3.26,       // 炮手视点高度（m，需高于炮塔顶面 2.4 避免穿模；3.26 可让自车炮塔顶面只压住画面最下缘）
      eyeBack: 0.80,         // 视点沿炮塔朝向后移量（m，让炮管出现在视野下缘）
      turnRate: 2.8,         // 摇杆/偏置转向速率（rad/s）
      pitchRate: 1.8,        // 摇杆/偏置俯仰速率（rad/s）
      mouseSens: 0.0026,     // 指针锁定下的鼠标灵敏度（rad/px）
      lookDeadzone: 0.12,    // 偏置转向死区（屏幕半宽的百分比）
      lookIdleStop: 1.20,    // 未锁定指针时，鼠标静止超过该时长即停转（s）。过短会让移动中一顿一顿
      lookHold: 0.30,        // 指针锁定下抑制自动瞄准的时长（s）
      assistPull: 1.2,       // 自动瞄准对视角的吸附速率（/s）
      assistYawMul: 0.35,    // 第一人称下水平吸附的额外折扣：yaw 被强行拉走像"视角失控"，只保留很轻的牵引
      bobAmp: 0.045,         // 行进起伏幅度（m）
    },
  },

  graphics: {
    // 画质档位：dprMul 乘在基准 DPR 上；auto 档不使用（按设备能力推导）
    presets: {
      performance: { dprMul: 0.5, shadows: false },
      quality:     { dprMul: 1.0, shadows: true },
    },
  },

  // ---- 性能预算（池化 + 降档）----
  performance: {
    maxShells: 40,           // 场上炮弹/火箭弹上限
    maxBombs: 16,            // 航弹上限
    maxExplosions: 14,
    maxTracers: 30,
    maxSparks: 6,            // 火花粒子系统数量（每系统一个 Points）
    sparksPerBurst: 14,
    maxSmokes: 20,
    maxRings: 8,
    evaluateEveryFrames: 90, // 每 N 帧评估一次平均帧时（采样用帧计数，不用时间窗口）
    dprDegradeMs: 26,        // 平均帧时超过该值 → 降 DPR
    minPixelRatio: 0.75,
    pixelRatioStep: 0.15,
    activeEnemyCap: 22,      // 同屏活跃敌人上限（移动端安全值）
    spatialCellSize: 6,      // 敌人空间哈希格宽（米）
  },

  // ---- 战场 ----
  arena: {
    half: 58,                // 半边长（米），边界墙在 ±half
    seed: 20260917,          // 固定种子：障碍布局每局一致，便于背版
    obstacles: [             // [x, z, 半宽, 半深, 高, 类型]
      [  0,   0,  3.0, 3.0, 2.6, 'bunker'],
      [-22,  16,  4.5, 2.4, 3.2, 'warehouse'],
      [ 24, -18,  4.5, 2.4, 3.2, 'warehouse'],
      [-26, -24,  2.2, 2.2, 2.0, 'rock'],
      [ 30,  26,  2.6, 2.0, 2.2, 'rock'],
      [ 12,  34,  3.4, 2.0, 2.4, 'container'],
      [-14, -38,  3.4, 2.0, 2.4, 'container'],
      [ 40,   4,  2.0, 2.0, 2.2, 'rock'],
      [-40,  -2,  2.4, 2.6, 2.0, 'rock'],
      [  8, -20,  2.0, 3.0, 1.6, 'container'],
      [-10,  28,  2.0, 3.0, 1.6, 'container'],
      [-36,  36,  3.0, 3.0, 2.8, 'bunker'],
      [ 38, -38,  3.0, 3.0, 2.8, 'bunker'],
      [ 20,  12,  1.8, 1.8, 1.8, 'rock'],
      [-18,  -8,  1.8, 1.8, 1.8, 'rock'],
    ],
  },

  // ---- 战场环境（每局开局随机抽一种；只改光影与雾，不动战斗数值）----
  environments: [
    {
      id: 'dusk', name: '黄昏平原',
      sky: 0x2b1e16, fog: 0x33261b, fogNear: 78, fogFar: 225,
      hemiSky: 0xa8815c, hemiGround: 0x1d1a14, hemiInt: 1.15,
      sun: 0xffbe80, sunInt: 2.1, ground: 0x8a7a62, star: false,
    },
    {
      id: 'night', name: '午夜战区',
      sky: 0x080b12, fog: 0x0b101a, fogNear: 55, fogFar: 185,
      hemiSky: 0x4a5f85, hemiGround: 0x0f1218, hemiInt: 0.62,
      sun: 0x9fb6dd, sunInt: 1.0, ground: 0x4e5666, star: true,
    },
    {
      id: 'sand', name: '沙暴前线',
      sky: 0x3b3023, fog: 0x6d563d, fogNear: 30, fogFar: 140,
      hemiSky: 0xc0a074, hemiGround: 0x2a2318, hemiInt: 1.3,
      sun: 0xffd9a0, sunInt: 1.7, ground: 0x9a8a6c, star: false,
    },
  ],

  // ---- 玩家坦克 ----
  player: {
    radius: 1.5,             // 车体碰撞半径（米）
    hitY: 1.0,               // 受击判定球心高度：敌方炮弹从 1.7~2.3m 平飞，
                             // 若球心留在 y=0 则重坦(2.25m)主炮永远打不中玩家
    maxHealth: 100,
    maxArmor: 50,            // 初始护甲上限（可被强化提升）
    speed: 11,               // m/s
    accel: 30,
    friction: 8,
    hullTurnRate: 3.2,       // 车体转向速率（rad/s）
    turretTurnRate: 5.2,     // 炮塔转向速率（rad/s）
    cannon: {
      damage: 55,
      splashRadius: 2.6,     // 命中点溅射半径
      splashDamageMul: 0.45, // 溅射边缘伤害折减：中心 = 1.0，作用半径边缘 = 该值
      speed: 62,             // 弹速 m/s（可被磁轨强化乘算）
      clipSize: 5,           // 弹夹容量
      reloadTime: 1.6,       // 装填时间（s）
      fireInterval: 0.5,     // 最小射击间隔（s）
      spread: 0.012,         // 固定散布（弧度）
      pitchMin: -0.30,       // 炮口俯角下限（rad，向下为负）
      pitchMax: 0.50,        // 炮口仰角上限（rad，约 28.6°，足够打 15m 高度轰炸机）
      aimRange: 46,          // 自动瞄准搜索半径（m）
      aimCone: 0.20,         // 手动瞄准时的俯仰辅助锥角（rad，约 11°）
      aimConePenalty: 30,    // 锥内选优时"偏离瞄准线"的距离惩罚系数
      critMul: 2.2,          // 暴击伤害倍率（穿甲弹芯触发时）
      burnTime: 4,           // 燃烧持续时长（s，燃烧战斗部）
      burnRatio: 0.18,       // 燃烧每秒伤害 = 该次命中伤害 × 此比例
    },
    ramCooldown: 0.6,        // 撞角触发间隔（s）
    shieldRecharge: 14,      // 反应装甲：每层护盾的充能间隔（s）
    splashTakenEdgeMul: 0.4, // 敌方溅射打到玩家时，边缘伤害折减系数
    mg: {
      // 高射机枪：全自动防空，过热机制
      damage: 7,
      interval: 0.09,
      range: 32,
      heatPerShot: 3.4,
      coolPerSec: 26,
      overheatLockTime: 1.6, // 过热卡壳时间
      spread: 0.03,
      airPriority: true,     // 优先锁定空中目标
    },
    joystickDeadzone: 0.08,
    joystickFullAt: 0.85,
  },

  // ---- 敌人（地面 + 空中）----
  // kind: tank(轻坦) / buggy(自爆突袭) / heavy(重坦) / artillery(自行火炮)
  //       jet(喷气战机) / bomber(轰炸机) / gunship(浮空炮艇 boss)
  enemies: {
    tank: {
      hp: 70, radius: 1.5, speed: 5.2, score: 100,
      keepDist: [13, 20],    // 交战距离带
      shell: { damage: 10, speed: 34, interval: 2.6, splash: 2.0 },
    },
    buggy: {
      hp: 40, radius: 1.0, speed: 10.5, score: 120,
      boomDamage: 26, boomRadius: 4.2, fuseDist: 3.2, fuseTime: 0.55,
    },
    heavy: {
      hp: 240, radius: 2.1, speed: 3.2, score: 250,
      shell: { damage: 16, speed: 30, interval: 3.4, splash: 2.6 },
      ramDamage: 18, ramCooldown: 1.2,
    },
    artillery: {
      hp: 90, radius: 1.7, speed: 4.0, score: 200,
      keepDist: [28, 40],
      shell: { damage: 22, splash: 4.5, interval: 5.0, flightTime: 2.2, warnRadius: 3.2 },
    },
    jet: {
      hp: 60, radius: 1.6, speed: 26, score: 150,
      altitude: 9, runLength: 46, rocket: { damage: 9, speed: 40, count: 4, interval: 0.14 },
      cooldown: [3.0, 5.5],
    },
    bomber: {
      hp: 130, radius: 2.2, speed: 14, score: 220,
      altitude: 15, bomb: { damage: 24, splash: 4.6, count: 3, interval: 0.5, fallTime: 1.5 },
      cooldown: [4.0, 6.5],
    },
    gunship: {
      hp: 900, radius: 3.2, speed: 6.5, score: 600,
      altitude: 10, keepDist: [18, 30],
      missile: { damage: 14, speed: 26, count: 6, interval: 0.12, salvoInterval: 5.5 },
    },
  },

  // ---- 敌人分层（tier 0 普通 / 1 精英 / 2 老练）----
  enemyTiers: {
    0: { label: '', hpMul: 1, speedMul: 1, scoreMul: 1, tint: null },
    1: { label: '精英', hpMul: 1.6, speedMul: 1.08, scoreMul: 1.5, tint: 0xff5e3a },
    2: { label: '老练', hpMul: 2.4, speedMul: 1.16, scoreMul: 2.2, tint: 0xffd23a },
  },

  // ---- 难度（主菜单选择；分档记录战绩）----
  // countMul 乘在单波生成总量上，hpMul/speedMul 乘在敌人成长曲线上，
  // playerHpMul/playerArmorMul 调玩家容错，dropMul 调补给掉率，scoreMul 调计分。
  difficulty: {
    recruit: {
      id: 'recruit', name: '新兵', tag: '敌潮更薄，容错更高 · 适合熟悉操作',
      countMul: 0.78, hpMul: 0.8, speedMul: 0.94,
      playerHpMul: 1.35, playerArmorMul: 1.4, dropMul: 1.35, scoreMul: 0.8,
    },
    veteran: {
      id: 'veteran', name: '老兵', tag: '标准战场节奏 · 推荐',
      countMul: 1, hpMul: 1, speedMul: 1,
      playerHpMul: 1, playerArmorMul: 1, dropMul: 1, scoreMul: 1,
    },
    hell: {
      id: 'hell', name: '地狱', tag: '敌潮更凶、装甲更薄 · 一次失误就是终点',
      countMul: 1.28, hpMul: 1.32, speedMul: 1.1,
      playerHpMul: 0.78, playerArmorMul: 0.7, dropMul: 0.7, scoreMul: 1.5,
    },
  },
  difficultyOrder: ['recruit', 'veteran', 'hell'],

  // ---- 波次 ----
  waves: {
    introDuration: 2.4,      // 波次横幅时长
    intermission: 3.2,       // 波间休整
    baseCount: 6,            // 第 1 波基准数量
    countPerWave: 1.6,       // 每波增员
    maxCount: 30,            // 单波总量上限
    spawnIntervalBase: 1.5,  // 开局补怪间隔
    spawnIntervalMin: 0.65,  // 末段补怪间隔
    hpPerWave: 0.085,        // 敌 HP 每波 +8.5%
    hpCap: 2.6,
    speedPerWave: 0.02,      // 敌速每波 +2%
    speedCap: 1.35,
    eliteWaveFrac: 0.30,     // 波次进度 > 30% 出精英
    veteranWaveFrac: 0.62,   // > 62% 出老练
    eliteChance: 0.14,       // 单体精英概率（随进度递增）
    veteranChance: 0.06,
    gunshipEveryWaves: 5,    // 每 5 波浮空炮艇压场
    clearScoreBonus: 150,    // 通关基础奖励
    clearScorePerWave: 60,   // 每波递增奖励
    threatHpPerLevel: 300,   // boss 血条"威胁等级"的每级 HP 基数（原先硬编码在 hud.js）
    // 生成仁慈：低血量期降生成压力（对齐铁战线 MERCY_CFG 思路）
    mercy: { hpThreshold: 0.3, spawnSlow: 1.55, crowdRatio: 0.85 },
    // 波次开局释放阀：开局 4 秒内生成提速 1.6 倍，制造"来势汹汹"的第一印象
    releaseValve: { duration: 4, mul: 1.6 },
  },

  // ---- 波次主题（8 主题循环，权重决定本波敌型构成）----
  waveThemes: [
    { id: 'ground',   name: '地面集群', weights: { tank: 7, buggy: 3, jet: 0.6, bomber: 0 } },
    { id: 'armor',    name: '装甲突击', weights: { tank: 5, heavy: 2.4, buggy: 1, jet: 0.4 } },
    { id: 'airraid',  name: '空袭警报', weights: { tank: 2, buggy: 1, jet: 4.5, bomber: 2.2 } },
    { id: 'blitz',    name: '快速突进', weights: { tank: 2, buggy: 6, jet: 1.6, artillery: 0.8 } },
    { id: 'siege',    name: '重装推进', weights: { tank: 3, heavy: 3.2, artillery: 1.6, bomber: 0.6 } },
    { id: 'combined', name: '立体混编', weights: { tank: 3, buggy: 2, heavy: 1.4, jet: 2, bomber: 1, artillery: 1 } },
    { id: 'aa',       name: '防空作战', weights: { tank: 1.6, jet: 5.5, bomber: 3, artillery: 0.6 } },
    { id: 'elite',    name: '精锐打击', weights: { tank: 2.4, heavy: 2, buggy: 2, jet: 2, artillery: 1.2 }, eliteBias: 0.35 },
  ],

  // ---- 补给 ----
  pickup: {
    healAmount: 40,
    armorAmount: 40,
    pickupRadius: 2.4,
    lifetime: 26,             // 掉落物存在时长
    eliteDropChance: 1.0,     // 精英必掉
    normalDropChance: 0.07,
    airdropInterval: 45,      // 空投周期（s），对齐铁战线补给节奏
  },

  // ---- 连杀与得分 ----
  runScore: {
    chainWindow: 4,           // 连杀判定窗口（s）
    chainStep: 50,            // 链内每杀加成
    chainCap: 200,
    comboNames: ['双杀！', '三连绝杀！', '四连超凡！', '五连无双！', '势不可挡！'],
  },

  // ---- 击杀播报条（挂接 #kill-feed）----
  killFeed: {
    max: 5,                  // 同时最多显示行数
    life: 3.6,               // 单行存活时长（s）
  },

  // ---- 战斗反馈 ----
  feedback: {
    lowHpRatio: 0.3,         // 低血警戒阈值（占最大生命比例）
    heartbeat: 1.05,         // 低血心跳间隔（s）
    dmgPool: 24,             // 伤害飘字并发上限
    dmgLife: 0.85,           // 飘字存活时长（s）
    // 触发飘字/命中标记的伤害来源（机枪与燃烧 DoT 频次过高，不做飘字）
    numberSources: ['主炮', '主炮 · 暴击', '溅射', '导弹', '撞角', '电磁脉冲', '殉爆'],
    markerSources: ['主炮', '主炮 · 暴击', '导弹', '撞角'],
    // 慢镜：Boss 入场 / Boss 被击破
    slowmoEnter: { scale: 0.42, time: 1.05 },
    slowmoKill: { scale: 0.28, time: 1.45 },
  },

  // ---- 主动技能（可手动释放的大招）----
  abilities: {
    emp: {
      id: 'emp', key: 'Q', name: '电磁脉冲',
      cooldown: 32,          // 冷却（s）
      radius: 26,            // 作用半径（m）
      damage: 95,            // 对范围内敌军的直接伤害
      stunTime: 2.2,         // 瘫痪时长（s，期间敌人不移动不开火）
      clearShells: true,     // 是否同时清除范围内来袭弹药
      desc: '以自身为中心释放电磁脉冲：瘫痪并灼伤范围内全部敌军，同时清空来袭弹药',
    },
  },

  // ---- 结算主题台词（胜利=无尽模式不设终点，只有失败分档）----
  endLines: {
    loseEarly: '防线还没捂热。下一局，从第一炮开始。',
    loseMid: '守到这里，已经不容易。他们记住你了。',
    loseLate: '就差几波。钢铁的意志，他们记住了你的番号。',
  },

  // ---- 强化（三选一，每波清空后弹出）----
  // mode: mul=乘算叠加 / add=加算 / instant=即时生效
  upgrades: {
    pickDuration: 2.5,        // 倒计时自动随机
    railSpeedMul: 1.35,       // 磁轨加速：弹速乘算系数
    rerolls: 1,               // 每波可重掷次数（换一批卡）
    skipScore: 120,           // 跳过强化的补偿分数
    skipArmor: 15,            // 跳过强化的补偿护甲
    cards: [
      { id: 'up_damage',  rarity: 'common', title: '高爆弹芯',   desc: '主炮伤害 +20%',                 kind: 'cannon', key: 'damageMul',   value: 1.2,  mode: 'mul', max: 5 },
      { id: 'up_multi',   rarity: 'rare',   title: '双联炮管',   desc: '每次击发 +1 发弹丸（扇形展开）', kind: 'cannon', key: 'projectiles', value: 1,    mode: 'add', max: 3 },
      { id: 'up_rail',    rarity: 'epic',   title: '磁轨加速',   desc: '弹速 +35%，可贯穿 1 个目标',     kind: 'cannon', key: 'pierce',      value: 1,    mode: 'add', max: 3 },
      { id: 'up_rate',    rarity: 'common', title: '加速供弹机', desc: '射速 +15%，装填 -13%',           kind: 'cannon', key: 'rateMul',     value: 1.15, mode: 'mul', max: 5 },
      { id: 'up_clip',    rarity: 'rare',   title: '扩容弹舱',   desc: '弹夹容量 +2（立即补满）',        kind: 'cannon', key: 'clipAdd',     value: 2,    mode: 'add', max: 4 },
      { id: 'up_splash',  rarity: 'rare',   title: '溅射战斗部', desc: '爆炸范围 +25%',                  kind: 'cannon', key: 'splashMul',   value: 1.25, mode: 'mul', max: 3 },
      { id: 'up_mg',      rarity: 'common', title: '空冷机枪',   desc: '机枪伤害 +25%，散热 +20%',       kind: 'mg',     key: 'mgMul',       value: 1.25, mode: 'mul', max: 4 },
      { id: 'up_armor',   rarity: 'rare',   title: '复合装甲',   desc: '装甲上限 +25 并立即回满',        kind: 'player', key: 'armorMax',    value: 25,   mode: 'instant', max: 4 },
      { id: 'up_repair',  rarity: 'common', title: '纳米修复',   desc: '立即修复 45% 机体',              kind: 'player', key: 'heal',        value: 0.45, mode: 'instant', max: 99 },
      { id: 'up_engine',  rarity: 'common', title: '推进引擎',   desc: '移动速度 +12%',                  kind: 'player', key: 'speedMul',    value: 1.12, mode: 'mul', max: 4 },
      { id: 'up_missile', rarity: 'epic',   title: '导弹巢',     desc: '每 7 秒自动齐射 2 枚防空导弹',    kind: 'player', key: 'missilePod',  value: 1,    mode: 'add', max: 3 },
      { id: 'up_ram',     rarity: 'rare',   title: '爆破撞角',   desc: '撞击敌军伤害 +40，受自爆伤害 -25%', kind: 'player', key: 'ram',       value: 1,    mode: 'add', max: 2 },
      // ---- 新增：暴击 / 破甲 / 燃烧 / 吸血 / 护盾 / 磁力 ----
      { id: 'up_crit',    rarity: 'rare',   title: '穿甲弹芯',   desc: '主炮 15% 概率触发暴击（伤害 ×2.2）', kind: 'cannon', key: 'crit',      value: 0.15, mode: 'add', max: 4 },
      { id: 'up_ap',      rarity: 'common', title: '破甲装药',   desc: '对精英/老练目标伤害 +25%',        kind: 'cannon', key: 'apMul',     value: 1.25, mode: 'mul', max: 4 },
      { id: 'up_burn',    rarity: 'epic',   title: '燃烧战斗部', desc: '主炮命中点燃目标 4 秒，每秒 18% 炮伤', kind: 'cannon', key: 'burn',   value: 1,    mode: 'add', max: 3 },
      { id: 'up_vamp',    rarity: 'rare',   title: '纳米吸血',   desc: '每次击杀回复 5% 最大生命',        kind: 'player', key: 'vamp',      value: 0.05, mode: 'add', max: 4 },
      { id: 'up_shield',  rarity: 'epic',   title: '反应装甲',   desc: '每 14 秒充能一层护盾，格挡一次伤害', kind: 'player', key: 'shield',    value: 1,    mode: 'add', max: 3 },
      { id: 'up_magnet',  rarity: 'common', title: '磁力拾取',   desc: '8 米内的补给自动飞向你（每级 +8m）', kind: 'player', key: 'magnet',  value: 8,    mode: 'add', max: 3 },
    ],
  },

  // ---- 存档 ----
  records: {
    storageKey: 'tankwar_records_v1',
    settingsKey: 'tankwar_settings_v1',
  },
};

// 工具：限制范围 / 插值（与 yiren-buche 同名约定）
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const angleLerp = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
// 有符号最小角差（a-b，落在 -π..π）
const angleDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// 确定性伪随机（mulberry32）：同一 seed → 同一战场景观（集装箱配色 / 岩石朝向）。
// 仅用于"外观随机"，不参与战斗数值，保证每局障碍外观一致、可背版。
function makeRandom(seed) {
  let s = (seed >>> 0) || 1;
  return function random() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

window.CONFIG = CONFIG;
window.clamp = clamp;
window.lerp = lerp;
window.rand = rand;
window.randInt = randInt;
window.dist2D = dist2D;
window.angleLerp = angleLerp;
window.angleDiff = angleDiff;
window.makeRandom = makeRandom;
