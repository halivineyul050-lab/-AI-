// audio.js —— 程序化音效与 BGM（Web Audio API，零采样文件）
// 对齐 yiren-buche 的 AudioFX 设计：振荡器 + 噪声合成，首次用户交互后初始化，
// 页面重新可见时 resume，绝不阻塞游戏逻辑。
// 提供：cannon / mg / enemyShot / explosion / jetFlyby / bombWhistle / reload /
//       pickup / waveHorn / combo / hitPlayer / uiClick / bgm

class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
    this.enabled = true;
    this.volume = 0.7;
    this._noiseBuf = null;
    this._bgmPlaying = false;
    this._bgmTimer = null;
  }

  // 首次用户交互后初始化（浏览器自动播放策略）
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.16;
      this.bgmGain.connect(this.master);
      this._noiseBuf = this._makeNoise(1.2);
    } catch (e) {
      this.enabled = false;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // 页面重新可见时恢复被系统挂起的 AudioContext
  resumeIfNeeded() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) { /* 静默 */ }
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

  // 白噪声 burst：经带通滤波 + 指数衰减
  _noiseBurst(dur, freq, q, gain, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    const t = this._now() + when;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // 低频 thump：正弦扫频（爆炸/炮击的体感来源）
  _thump(freq, dur, gain, endFreqMul = 0.4, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const g = this.ctx.createGain();
    const t = this._now() + when;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * endFreqMul), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // 短促方波点击（机械感）
  _click(freq, dur, gain, when = 0, type = 'square') {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const g = this.ctx.createGain();
    const t = this._now() + when;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // 玩家主炮：低频轰鸣 + 中频噪声
  cannon() {
    if (!this.ctx) return;
    this._thump(120, 0.22, 0.55, 0.3);
    this._noiseBurst(0.14, 900, 0.6, 0.4);
    this._noiseBurst(0.05, 2600, 1.2, 0.2);
  }

  // 机枪：短促哒哒声
  mg() {
    if (!this.ctx) return;
    this._noiseBurst(0.05, 1900, 1.1, 0.16);
    this._thump(210, 0.04, 0.12, 0.5);
  }

  // 导弹发射：噪声嗖声 + 高频滑落
  missile() {
    if (!this.ctx) return;
    this._noiseBurst(0.3, 3200, 0.7, 0.14);
    this._click(880, 0.18, 0.08, 0, 'sawtooth');
  }

  // 敌方开火（音量按距离感弱化，只做衰减不做定位，避免开销）
  enemyShot(dist) {
    if (!this.ctx) return;
    const att = clamp(1 - dist / 70, 0.12, 1);
    this._thump(95, 0.18, 0.3 * att, 0.35);
    this._noiseBurst(0.1, 700, 0.8, 0.22 * att);
  }

  // 爆炸：大噪声 + 深低频
  explosion(big = false) {
    if (!this.ctx) return;
    const s = big ? 1.5 : 1;
    this._noiseBurst(0.5 * s, 420, 0.45, 0.5 * s);
    this._thump(70, 0.4 * s, 0.6 * s, 0.25);
    this._noiseBurst(0.16, 1800, 0.9, 0.18 * s);
  }

  // 喷气机掠过：锯齿波扫频（伪多普勒）
  jetFlyby() {
    if (!this.ctx) return;
    if (!this.enabled) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const g = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1400;
    const t = this._now();
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(760, t + 0.9);
    osc.frequency.exponentialRampToValueAtTime(240, t + 1.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    osc.connect(filt).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 1.9);
  }

  // 航弹下落啸声：正弦下滑
  bombWhistle() {
    if (!this.ctx) return;
    if (!this.enabled) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const g = this.ctx.createGain();
    const t = this._now();
    osc.frequency.setValueAtTime(1750, t);
    osc.frequency.exponentialRampToValueAtTime(480, t + 1.35);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 1.45);
  }

  // 装填完成：两声机械咔哒
  reload() {
    if (!this.ctx) return;
    this._click(320, 0.05, 0.14);
    this._click(520, 0.06, 0.14, 0.09);
  }

  // 拾取补给：上行双音
  pickup() {
    if (!this.ctx) return;
    this._click(660, 0.09, 0.12, 0, 'sine');
    this._click(990, 0.12, 0.12, 0.09, 'sine');
  }

  // 受击（玩家被命中）：闷响
  hitPlayer() {
    if (!this.ctx) return;
    this._thump(180, 0.14, 0.3, 0.4);
    this._noiseBurst(0.08, 500, 0.9, 0.16);
  }

  // 撞角撞击：金属闷响 + 短噪声（区别于被动受击，用于爆破撞角主动命中）
  ram() {
    if (!this.ctx) return;
    this._thump(150, 0.16, 0.34, 0.35);
    this._noiseBurst(0.12, 950, 0.7, 0.2);
    this._click(240, 0.06, 0.1, 0.01, 'square');
  }

  // 反应装甲：格挡（清脆金属环）
  shieldBreak() {
    if (!this.ctx) return;
    this._click(1180, 0.1, 0.1, 0, 'triangle');
    this._click(1760, 0.14, 0.08, 0.03, 'triangle');
    this._noiseBurst(0.1, 2600, 0.6, 0.08);
  }

  // 反应装甲：重新充能（轻量上行提示）
  shieldReady() {
    if (!this.ctx) return;
    this._click(880, 0.08, 0.05, 0, 'sine');
    this._click(1320, 0.1, 0.045, 0.06, 'sine');
  }

  // 电磁脉冲：低频冲击 + 高频噪声 + 双音扫频
  emp() {
    if (!this.ctx) return;
    this._thump(70, 0.55, 0.42, 0.25);
    this._noiseBurst(0.5, 3200, 0.35, 0.3);
    this._click(1568, 0.35, 0.06, 0, 'sawtooth');
    this._click(2093, 0.3, 0.05, 0.08, 'sawtooth');
  }

  // 低血心跳：两下闷响（间隔 0.19s）
  heartbeat() {
    if (!this.ctx) return;
    this._thump(58, 0.14, 0.26, 0.5);
    this._thump(48, 0.2, 0.2, 0.45, 0.19);
  }

  // 强化重掷：下行两声
  reroll() {
    if (!this.ctx) return;
    this._click(420, 0.06, 0.09, 0, 'square');
    this._click(300, 0.08, 0.09, 0.06, 'square');
  }

  // 波次号角：铜管感（方波和弦）
  waveHorn(final = false) {    if (!this.ctx) return;
    const base = final ? 196 : 147;
    this._click(base, 0.4, 0.1, 0, 'square');
    this._click(base * 1.5, 0.4, 0.08, 0.02, 'square');
    if (final) this._click(base * 2, 0.5, 0.08, 0.16, 'square');
  }

  // 连杀播报：短促上行
  combo(level) {
    if (!this.ctx) return;
    const f = 520 + level * 110;
    this._click(f, 0.08, 0.1, 0, 'sine');
    this._click(f * 1.33, 0.1, 0.1, 0.07, 'sine');
  }

  // 升级选择确认
  upgradePick() {
    if (!this.ctx) return;
    this._click(523, 0.09, 0.12, 0, 'sine');
    this._click(659, 0.09, 0.12, 0.08, 'sine');
    this._click(784, 0.14, 0.12, 0.16, 'sine');
  }

  // 失败低鸣
  lose() {
    if (!this.ctx) return;
    this._click(220, 0.5, 0.1, 0, 'sawtooth');
    this._click(165, 0.7, 0.1, 0.3, 'sawtooth');
    this._thump(90, 0.9, 0.3, 0.5, 0.3);
  }

  uiClick() {
    if (!this.ctx) return;
    this._click(700, 0.04, 0.08);
  }

  // ---- BGM：4 小节工业脉冲循环（定时器调度，非精确节拍但足够氛围）----
  // 结构：低音脉冲（每拍）+ 噪声军鼓（2/4拍）+ 微弱十六分帽。压制在低增益不抢音效。
  startBGM() {
    if (!this.ctx || this._bgmPlaying) return;
    this._bgmPlaying = true;
    const bpm = 112;
    const beat = 60 / bpm;
    let step = 0;
    const schedule = () => {
      if (!this._bgmPlaying) return;
      const s = step % 16;
      // 低音脉冲：A1 系小调行进
      const bassSeq = [55, 55, 0, 55, 0, 55, 65.4, 0, 55, 55, 0, 55, 0, 49, 0, 0];
      const f = bassSeq[s];
      if (f > 0 && this.enabled) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        const g = this.ctx.createGain();
        const t = this._now();
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.85);
        osc.connect(g).connect(this.bgmGain);
        osc.start(t);
        osc.stop(t + beat);
      }
      // 军鼓噪声：第 4、12 步
      if ((s === 4 || s === 12) && this.enabled) {
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = 1800;
        filt.Q.value = 0.8;
        const g = this.ctx.createGain();
        const t = this._now();
        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        src.connect(filt).connect(g).connect(this.bgmGain);
        src.start(t);
        src.stop(t + 0.15);
      }
      step++;
      this._bgmTimer = setTimeout(schedule, beat * 1000);
    };
    schedule();
  }

  stopBGM() {
    this._bgmPlaying = false;
    if (this._bgmTimer) { clearTimeout(this._bgmTimer); this._bgmTimer = null; }
  }
}

window.AudioFX = AudioFX;
