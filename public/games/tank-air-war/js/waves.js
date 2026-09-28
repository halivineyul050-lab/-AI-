// waves.js —— 波次主题循环 + 生成调度（释放阀 / 生成仁慈 / 边缘刷怪）
// 数值口径对齐铁战线：威胁随波次与波内进度爬升，低血量期降生成压力。

class WaveManager {
  constructor() {
    this.wave = 0;
    this.theme = null;
    this.queue = [];          // 待生成敌型
    this.spawnTimer = 0;
    this.state = 'idle';      // idle / intro / active / cleared
    this.stateTimer = 0;
    this.waveTime = 0;
    this.totalQueued = 0;
    // 难度档位（由 Game 在开局时注入；缺省按老兵，保证独立调用也不炸）
    this.diff = CONFIG.difficulty.veteran;
    this.onWaveIntro = null;  // (themeName, waveNum) => void
    this.onWaveClear = null;  // (waveNum) => void
    this.onBossIncoming = null;
  }

  setDifficulty(id) {
    this.diff = CONFIG.difficulty[id] || CONFIG.difficulty.veteran;
  }


  get progress() {
    // 波内进度：已生成占比
    return this.totalQueued > 0 ? 1 - this.queue.length / this.totalQueued : 1;
  }

  startNext() {
    this.wave++;
    const W = CONFIG.waves;
    // 主题：8 主题循环
    this.theme = CONFIG.waveThemes[(this.wave - 1) % CONFIG.waveThemes.length];

    // 数量：基准 + 每波增员，封顶后再乘难度系数
    const d = this.diff || CONFIG.difficulty.veteran;
    const total = Math.min(W.maxCount, Math.round((W.baseCount + (this.wave - 1) * W.countPerWave) * d.countMul));
    this.totalQueued = total;

    // 按权重抽取敌型构成
    this.queue = [];
    const weights = this.theme.weights;
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const weightSum = entries.reduce((s, [, w]) => s + w, 0);
    for (let i = 0; i < total; i++) {
      let r = Math.random() * weightSum;
      for (const [kind, w] of entries) {
        r -= w;
        if (r <= 0) { this.queue.push(kind); break; }
      }
    }

    this.state = 'intro';
    this.stateTimer = W.introDuration;
    this.waveTime = 0;
    this.spawnTimer = 0;  // intro 结束立即出第一波敌人

    if (this.onWaveIntro) this.onWaveIntro(this.theme.name, this.wave);

    // 每 5 波 boss 压场（intro 结束时落地）
    if (this.wave % CONFIG.waves.gunshipEveryWaves === 0 && this.onBossIncoming) {
      this.onBossIncoming(this.wave);
    }
  }

  // 敌 HP/速度随波次成长（再乘难度系数）
  get waveScale() {
    const W = CONFIG.waves;
    const d = this.diff || CONFIG.difficulty.veteran;
    return {
      hp: Math.min(W.hpCap, 1 + (this.wave - 1) * W.hpPerWave) * d.hpMul,
      speed: Math.min(W.speedCap, 1 + (this.wave - 1) * W.speedPerWave) * d.speedMul,
    };
  }

  // 单体阶层概率
  pickTier() {
    const W = CONFIG.waves;
    const p = this.progress;
    const eliteBias = this.theme.eliteBias || 0;
    const eliteChance = (p > W.eliteWaveFrac ? W.eliteChance + p * 0.12 : 0) + eliteBias;
    const veteranChance = p > W.veteranWaveFrac ? W.veteranChance + p * 0.05 : 0;
    const r = Math.random();
    if (r < veteranChance) return 2;
    if (r < veteranChance + eliteChance) return 1;
    return 0;
  }

  update(dt, world) {
    if (this.state === 'idle') return;
    this.waveTime += dt;

    if (this.state === 'intro') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.state = 'active';
      return;
    }

    if (this.state === 'active') {
      // 生成间隔：随波内进度从 Base 收紧到 Min
      const W = CONFIG.waves;
      let interval = lerp(W.spawnIntervalBase, W.spawnIntervalMin, this.progress);
      // 释放阀：波次开局提速（不与仁慈叠乘，取较大压力方向）
      const valveActive = this.waveTime < W.releaseValve.duration;
      if (valveActive) interval /= W.releaseValve.mul;
      // 生成仁慈：玩家低血量期降压力
      const lowHp = world.player.health < world.player.maxHealth * W.mercy.hpThreshold;
      if (lowHp) interval *= W.mercy.spawnSlow;
      // 活跃敌上限（仁慈期收紧）
      let cap = CONFIG.performance.activeEnemyCap;
      if (lowHp) cap = Math.round(cap * W.mercy.crowdRatio);

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.queue.length > 0 && world.enemyMgr.countAlive() < cap) {
        this.spawnTimer = interval;
        const kind = this.queue.shift();
        this._spawnAtEdge(kind, world);
      }

      // 波次肃清判定
      if (this.queue.length === 0 && world.enemyMgr.countAlive() === 0) {
        this.state = 'cleared';
        this.stateTimer = CONFIG.waves.intermission;
        const bonus = CONFIG.waves.clearScoreBonus + this.wave * CONFIG.waves.clearScorePerWave;
        if (this.onWaveClear) this.onWaveClear(this.wave, bonus);
      }
    } else if (this.state === 'cleared') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.startNext();
    }
  }

  _spawnAtEdge(kind, world) {
    const half = CONFIG.arena.half;
    const p = world.player.position;
    // 以玩家为圆心的远距环上取点，夹回场内
    const ang = Math.random() * Math.PI * 2;
    const dist = rand(42, 55);
    let x = clamp(p.x + Math.cos(ang) * dist, -half + 4, half - 4);
    let z = clamp(p.z + Math.sin(ang) * dist, -half + 4, half - 4);
    // 夹回后太近就再推远
    if (dist2D(x, z, p.x, p.z) < 30) {
      x = clamp(p.x - Math.cos(ang) * dist, -half + 4, half - 4);
      z = clamp(p.z - Math.sin(ang) * dist, -half + 4, half - 4);
    }
    const tier = this.pickTier();
    // 显式传入 world；不再覆写高度（各机型 activate 已按 base.altitude 设好，
    // 轰炸机还会在 _newLine 里重置位置与高度，覆写本也无效）
    world.enemyMgr.spawn(kind, x, z, tier, this.waveScale, world);
    // 雷达来向预警（记录最近一次刷怪方位）
    world.incomingAngle = Math.atan2(x - p.x, z - p.z);
  }

  // 卡池取空时的显式跳过接口（取代外部直接改 state）
  skipToCleared() {
    if (this.state === 'cleared' || this.state === 'idle') return;
    this.state = 'cleared';
    this.stateTimer = CONFIG.waves.intermission;
  }

  // 结算用：波次结束（死亡）时停止
  stop() {
    this.state = 'idle';
    this.queue.length = 0;
  }
}

window.WaveManager = WaveManager;
