// audio.js —— 程序化音效（Web Audio API）
// 不依赖任何音频文件，全部用振荡器 + 噪声合成
// 提供：shot(枪声) / hit(命中) / hurt(受伤) / enemyShot(敌人开火) / reload / wave / medalUnlock / win / lose
// 经典脚本（非 ES Module）：无 import/export，挂到 window 供 main 使用

class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    // 3D 空间音频（three-cs 融合）：AudioListener 挂相机 + PositionalAudio 池
    this.listener = null;   // THREE.AudioListener（挂相机）
    this._paPool = [];      // PositionalAudio 池
    this._paCursor = 0;
  }

  // 首次用户交互后初始化（浏览器策略）
  // 扩展签名 init(camera, scene)：camera 挂 AudioListener，scene 挂 PositionalAudio 池
  // （原有 ctx/master/noiseBuf 逻辑保留，3D 部分整体 try/catch，失败静默降级）
  init(camera, scene) {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      // 噪声缓冲（预生成 1s 白噪声）
      this._noiseBuf = this._makeNoise(1.0);
    } catch (e) {
      this.enabled = false;
    }
    // ctx 创建失败 → 跳过 3D 空间音频初始化（防御：无 AudioContext 时 PositionalAudio 无法工作）
    if (!this.ctx) return;
    // 3D 空间音频：AudioListener 挂相机 + PositionalAudio 池（无音频文件，纯合成 buffer）
    try {
      this.listener = new THREE.AudioListener();
      if (camera) camera.add(this.listener);
      this._paPool = [];
      for (let i = 0; i < 6; i++) {
        const pa = new THREE.PositionalAudio(this.listener);
        pa.setBuffer(this._makeShotBuffer());
        pa.setRefDistance(8);
        pa.setRolloffFactor(1.2);
        pa.setMaxDistance(60);
        if (scene) scene.add(pa);          // 必须有世界矩阵，PositionalAudio 才计算方位
        this._paPool.push(pa);
      }
    } catch (e) { this.listener = null; this._paPool = []; }
  }

  // 页面重新可见时恢复被系统挂起的 AudioContext；只 resume 已存在的 ctx，
  // 绝不在此新建（保持“用户手势前不初始化音频”的不变量）。
  resumeIfNeeded() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        // resume 返回 Promise；无用户手势时可能被浏览器拒绝，
        // 静默吞掉拒绝，避免触发全局 unhandledrejection 错误浮层。
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) { /* 同步异常同样忽略，不影响游戏 */ }
    }
  }

  _makeNoise(dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _now() { return this.ctx.currentTime; }

  // 通用：白噪声 burst（枪声主体）
  _noiseBurst(dur, freq, q, gain) {
    if (!this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    const t = this._now();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  // 低频 thump（枪声低频）
  _thump(freq, dur, gain) {
    if (!this.enabled) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const g = this.ctx.createGain();
    const t = this._now();
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  shot(weaponId) {
    if (!this.ctx) return;
    if (weaponId === 'm249') {
      this._noiseBurst(0.10, 1450, 0.72, 0.56);
      this._thump(105, 0.11, 0.5);
    } else if (weaponId === 'ak47') {
      this._noiseBurst(0.12, 1800, 0.8, 0.6);
      this._thump(140, 0.12, 0.5);
    } else {
      this._noiseBurst(0.09, 2400, 1.0, 0.45);
      this._thump(220, 0.08, 0.35);
    }
  }

  melee(hit) {
    if (!this.ctx) return;
    this._noiseBurst(hit ? 0.075 : 0.055, hit ? 760 : 1500, 0.9, hit ? 0.3 : 0.2);
    if (hit) this._thump(95, 0.07, 0.24);
  }

  grenadeThrow() {
    if (!this.ctx) return;
    this._noiseBurst(0.07, 1050, 0.8, 0.2);
    this._thump(130, 0.06, 0.12);
  }

  explosion() {
    if (!this.ctx) return;
    this._noiseBurst(0.42, 430, 0.45, 0.72);
    this._thump(58, 0.5, 0.76);
  }

  enemyShot() {
    if (!this.ctx) return;
    // 远处枪声：更闷、更小
    this._noiseBurst(0.08, 900, 0.6, 0.18);
    this._thump(110, 0.07, 0.15);
  }

  // 合成 0.12s 枪声 buffer（指数衰减白噪声），供 PositionalAudio 播放
  _makeShotBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    return buf;
  }

  // 3D 敌枪声：按敌人世界坐标播放；listener/池不可用或异常 → 回退全局 enemyShot()
  enemyShot3D(pos) {
    if (!this.enabled || !this.ctx || !this.listener || this._paPool.length === 0) {
      this.enemyShot();
      return;
    }
    try {
      const pa = this._paPool[this._paCursor];
      this._paCursor = (this._paCursor + 1) % this._paPool.length;
      pa.position.copy(pos);   // pos 为场景世界坐标（Vector3），与 DOM 旋转无关
      pa.stop();
      pa.play();
    } catch (e) {
      this.enemyShot();        // 兜底：全局播放
    }
  }

  hit(head, killed) {
    if (!this.ctx) return;
    // 命中：短促高频“叮”；爆头更高；击杀叠加琶音
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    const g = this.ctx.createGain();
    const t = this._now();
    osc.frequency.setValueAtTime(head ? 1400 : 900, t);
    g.gain.setValueAtTime(head ? 0.3 : 0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
    // 击杀琶音（上行三音）
    if (killed) {
      [523, 659, 784].forEach((f, i) => this._tone(f, i * 0.05, 0.12, 'triangle', 0.22));
    }
  }

  // 空仓“咔嗒”（dry fire）
  dryFire() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    const g = this.ctx.createGain();
    const t = this._now();
    osc.frequency.setValueAtTime(180, t);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + 0.035);
  }

  // 切枪音（USP 轻短 / AK 厚重）
  switch(weaponId) {
    if (!this.ctx) return;
    if (weaponId === 'ak47' || weaponId === 'm249') {
      this._noiseBurst(0.07, 700, 0.7, 0.25);
      this._thump(150, 0.06, 0.2);
    } else {
      this._noiseBurst(0.05, 1000, 0.9, 0.18);
    }
  }

  // 墙击音（concrete 闷 / wood 脆，暂统一 concrete）
  wallHit(type) {
    if (!this.ctx) return;
    this._noiseBurst(0.06, type === 'wood' ? 1600 : 800, 0.7, 0.15);
  }

  hurt() {
    if (!this.ctx) return;
    this._noiseBurst(0.2, 500, 0.5, 0.3);
    this._thump(90, 0.2, 0.3);
  }

  heal() {
    if (!this.ctx) return;
    // 拾取血包：明亮上行琶音
    [660, 880, 990].forEach((f, i) => this._tone(f, i * 0.06, 0.12, 'sine', 0.2));
  }

  reload() {
    if (!this.ctx) return;
    // 两次咔哒
    const click = (delay) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      const g = this.ctx.createGain();
      const t = this._now() + delay;
      osc.frequency.setValueAtTime(300, t);
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc.connect(g).connect(this.master);
      osc.start(t); osc.stop(t + 0.03);
    };
    click(0); click(0.15); click(0.5);
  }

  wave(n) {
    if (!this.ctx) return;
    const notes = [440, 554, 659];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const g = this.ctx.createGain();
      const t = this._now() + i * 0.12;
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g).connect(this.master);
      osc.start(t); osc.stop(t + 0.25);
    });
  }

  // 波次警告：普通秒数使用短促双音，GO 使用更高、更长的确认音。
  countdown(value, final = false) {
    if (!this.ctx || !this.enabled) return;
    if (final || value <= 0) {
      this._tone(880, 0, 0.18, 'square', 0.24);
      this._tone(1320, 0.08, 0.24, 'sawtooth', 0.18);
      return;
    }
    this._tone(value <= 3 ? 560 : 420, 0, 0.09, 'square', 0.2);
    this._tone(value <= 3 ? 760 : 540, 0.07, 0.08, 'triangle', 0.13);
  }

  medalUnlock() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((frequency, index) => {
      this._tone(frequency, index * 0.075, 0.28, index < 3 ? 'triangle' : 'sine', 0.16);
    });
  }

  win() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone(f, i * 0.12, 0.3, 'triangle', 0.25));
  }

  lose() {
    if (!this.ctx) return;
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => this._tone(f, i * 0.18, 0.4, 'sawtooth', 0.22));
  }

  _tone(freq, delay, dur, type, gain) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const g = this.ctx.createGain();
    const t = this._now() + delay;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur);
  }
}

// 经典脚本全局暴露（依赖顺序：… → hud → audio → pickup → main）
window.AudioFX = AudioFX;
