// effects.js —— 特效池：爆炸 / 曳光 / 火花 / 烟尘 / 落点预警圈 / 弹坑 / 屏幕震动
// 全部池化复用，纹理用 Canvas 程序化生成（径向渐变等），零图片文件。
// 帧内特效数量受 CONFIG.performance 约束，低端机自动减载。

class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shakeAmt = 0;

    // 程序化纹理
    this.texFlash = this._makeRadialTex('rgba(255,240,200,1)', 'rgba(255,150,40,0.55)', 'rgba(255,120,20,0)');
    this.texSmoke = this._makeRadialTex('rgba(120,118,112,0.85)', 'rgba(70,68,64,0.5)', 'rgba(40,40,40,0)');
    this.texGlow = this._makeRadialTex('rgba(255,190,120,0.9)', 'rgba(255,120,30,0.4)', 'rgba(255,100,20,0)');

    // 池
    this._poolFlash = [];
    this._poolSmoke = [];
    this._poolTracer = [];
    this._poolRing = [];
    this._poolCrater = [];
    this._sparkSystems = [];
    this._lights = [];
    this._active = [];

    const maxFx = CONFIG.performance;
    for (let i = 0; i < maxFx.maxExplosions * 2; i++) this._poolFlash.push(this._makeSprite(this.texFlash, THREE.AdditiveBlending));
    for (let i = 0; i < maxFx.maxSmokes; i++) this._poolSmoke.push(this._makeSprite(this.texSmoke, THREE.NormalBlending));
    for (let i = 0; i < maxFx.maxTracers; i++) this._poolTracer.push(this._makeTracer());
    for (let i = 0; i < maxFx.maxRings; i++) this._poolRing.push(this._makeRing());
    for (let i = 0; i < 10; i++) this._poolCrater.push(this._makeCrater());
    for (let i = 0; i < maxFx.maxSparks; i++) this._sparkSystems.push(this._makeSparks(maxFx.sparksPerBurst));
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 30, 2);
      l.visible = false;
      this.scene.add(l);
      this._lights.push({ light: l, life: 0, maxLife: 1, intensity: 0 });
    }
  }

  _makeRadialTex(inner, mid, outer) {
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.45, mid);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(cv);
  }

  _makeSprite(tex, blending) {
    const m = new THREE.SpriteMaterial({ map: tex, blending, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(m);
    s.visible = false;
    this.scene.add(s);
    return s;
  }

  _makeTracer() {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 1);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9 }));
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  _makeRing() {
    const geo = new THREE.RingGeometry(0.85, 1, 28);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  _makeCrater() {
    const geo = new THREE.CircleGeometry(1, 20);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0e0f11, transparent: true, opacity: 0.55, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  _makeSparks(count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffb050, size: 0.22, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    pts.frustumCulled = false;
    this.scene.add(pts);
    return { pts, vel: new Float32Array(count * 3), count, life: 0, maxLife: 1 };
  }

  _grab(pool) {
    for (const it of pool) if (!it.visible) return it;
    return null; // 池耗尽静默丢弃，保帧率
  }

  // 爆炸：火球 + 烟 + 冲击环 + 火花 + 光源 + 震屏
  explosion(pos, size = 1, opts = {}) {
    const flash = this._grab(this._poolFlash);
    if (flash) {
      flash.position.copy(pos);
      flash.scale.setScalar(0.5);
      flash.material.opacity = 1;
      flash.visible = true;
      this._active.push({ obj: flash, life: 0.28, kind: 'flash', size: size * 3.2 });
    }
    const smokeN = Math.min(3, Math.ceil(size));
    for (let i = 0; i < smokeN; i++) {
      const sm = this._grab(this._poolSmoke);
      if (!sm) break;
      sm.position.set(pos.x + rand(-0.6, 0.6), pos.y + rand(0, 0.5), pos.z + rand(-0.6, 0.6));
      sm.material.opacity = 0.85;
      sm.material.rotation = Math.random() * Math.PI * 2;
      sm.visible = true;
      this._active.push({ obj: sm, life: rand(0.9, 1.4), kind: 'smoke', size: size * rand(1.8, 2.6), vy: rand(1.4, 2.6) });
    }
    if (pos.y < 2) {
      const ring = this._grab(this._poolRing);
      if (ring) {
        ring.position.set(pos.x, 0.08, pos.z);
        ring.scale.setScalar(0.4);
        // 显式复位为爆炸红：环是共享池，电磁脉冲用过之后会残留青色
        ring.material.color.setHex(0xff5533);
        ring.material.opacity = 0.65;
        ring.visible = true;
        this._active.push({ obj: ring, life: 0.5, kind: 'ring', size: size * 4.5 });
      }
      if (!opts.noCrater) {
        const cr = this._grab(this._poolCrater);
        if (cr) {
          cr.position.set(pos.x, 0.06 + Math.random() * 0.02, pos.z);
          cr.scale.setScalar(size * rand(0.9, 1.3));
          cr.material.opacity = 0.5;
          cr.rotation.z = Math.random() * Math.PI * 2;
          cr.visible = true;
          this._active.push({ obj: cr, life: 9, kind: 'crater' });
        }
      }
    }
    this.sparkBurst(pos, Math.min(16, 8 + size * 4));
    this._flashLight(pos, size, 0xffa040);
    this.shake(opts.big ? 0.5 : Math.min(0.3, 0.1 * size));
  }

  _flashLight(pos, size, color) {
    let best = this._lights[0];
    for (const l of this._lights) if (l.life <= best.life) best = l;
    // 颜色必须每次显式指定：请求同一盏灯时若沿用上一次的色值，暖橙爆闪会变成蓝的
    if (color !== undefined) best.light.color.setHex(color);
    best.light.position.copy(pos); best.light.position.y += 1;
    best.baseIntensity = 26 * size;
    best.light.intensity = best.baseIntensity;
    best.light.distance = 12 + size * 8;
    best.light.visible = true;
    best.life = best.maxLife = 0.22;
  }

  sparkBurst(pos, count = 12, color = 0xffb050) {
    let sys = null;
    for (const s of this._sparkSystems) if (s.life <= 0) { sys = s; break; }
    if (!sys) return;
    sys.pts.material.color.setHex(color);
    const posArr = sys.pts.geometry.attributes.position.array;
    const n = Math.min(count, sys.count);
    for (let i = 0; i < sys.count; i++) {
      if (i < n) {
        posArr[i * 3] = pos.x; posArr[i * 3 + 1] = pos.y; posArr[i * 3 + 2] = pos.z;
        const a = Math.random() * Math.PI * 2, up = rand(2, 7), sp = rand(3, 10);
        sys.vel[i * 3] = Math.cos(a) * sp;
        sys.vel[i * 3 + 1] = up;
        sys.vel[i * 3 + 2] = Math.sin(a) * sp;
      } else {
        posArr[i * 3 + 1] = -100; // 藏到地下
      }
    }
    sys.pts.geometry.attributes.position.needsUpdate = true;
    sys.pts.material.opacity = 0.95;
    sys.pts.visible = true;
    sys.life = sys.maxLife = 0.55;
    sys.n = n;
  }

  // 机枪曳光：两点间的细长条，60-90ms 淡出
  tracer(from, to) {
    const t = this._grab(this._poolTracer);
    if (!t) return;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.3) return;
    t.position.copy(from).addScaledVector(dir, 0.5);
    t.scale.set(1, 1, len);
    t.lookAt(to);
    t.material.opacity = 0.85;
    t.visible = true;
    this._active.push({ obj: t, life: 0.07, kind: 'tracer' });
  }

  // 落点预警圈（炮击/航弹落点，敌我通用语义：红=危险）
  telegraph(pos, radius, life, color = 0xff5533) {
    const ring = this._grab(this._poolRing);
    if (!ring) return;
    ring.position.set(pos.x, 0.1, pos.z);
    ring.scale.setScalar(radius);
    ring.material.color.setHex(color);
    ring.material.opacity = 0.55;
    ring.visible = true;
    this._active.push({ obj: ring, life, kind: 'warn', size: radius });
  }

  // 电磁脉冲：蓝色扩散冲击环 + 青色爆闪（同一盏灯必须先显式给色，见 _flashLight 注释）
  empBlast(pos, radius) {
    const ring = this._grab(this._poolRing);
    if (ring) {
      ring.position.set(pos.x, 0.14, pos.z);
      ring.material.color.setHex(0x66d0ff);
      ring.scale.setScalar(radius * 0.35);
      ring.material.opacity = 0.9;
      ring.visible = true;
      this._active.push({ obj: ring, life: 0.7, kind: 'emp', size: radius });
    }
    this._flashLight(pos, Math.min(3.5, radius * 0.12), 0x66d0ff);
    this.sparkBurst(pos.clone().setY(1.5), 16, 0x66d0ff);
    this.shake(0.55);
  }

  // 低血量烟迹
  smokePuff(pos) {    const sm = this._grab(this._poolSmoke);
    if (!sm) return;
    sm.position.copy(pos);
    sm.material.opacity = 0.5;
    sm.material.rotation = Math.random() * Math.PI * 2;
    sm.scale.setScalar(0.8);
    sm.visible = true;
    this._active.push({ obj: sm, life: rand(0.7, 1.1), kind: 'smoke', size: 1.6, vy: rand(1.0, 1.8) });
  }

  shake(amount) {
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount);
  }

  update(dt) {
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.4);

    for (let i = this._active.length - 1; i >= 0; i--) {
      const a = this._active[i];
      a.life -= dt;
      const t = Math.max(0, a.life);
      if (a.life <= 0) {
        a.obj.visible = false;
        this._active.splice(i, 1);
        continue;
      }
      if (a.kind === 'flash') {
        const k = 1 - t / 0.28;
        a.obj.scale.setScalar(0.5 + a.size * k);
        a.obj.material.opacity = 1 - k;
      } else if (a.kind === 'smoke') {
        a.obj.position.y += a.vy * dt;
        a.obj.scale.setScalar(a.size * (1 + (1 - t / 1.4) * 0.8));
        a.obj.material.opacity = Math.min(0.85, t * 1.6) * 0.85;
      } else if (a.kind === 'ring') {
        const k = 1 - t / 0.5;
        a.obj.scale.setScalar(0.4 + a.size * k);
        a.obj.material.opacity = 0.65 * (1 - k);
      } else if (a.kind === 'warn') {
        const pulse = 0.35 + 0.25 * Math.sin(a.life * 14);
        a.obj.material.opacity = pulse;
        a.obj.scale.setScalar(a.size * (0.9 + 0.1 * Math.sin(a.life * 14)));
      } else if (a.kind === 'emp') {
        const k = 1 - t / 0.7;
        a.obj.scale.setScalar(a.size * (0.35 + 0.65 * k));
        a.obj.material.opacity = 0.9 * (1 - k);
      } else if (a.kind === 'crater') {
        a.obj.material.opacity = Math.min(0.5, a.life * 0.3);
      } else if (a.kind === 'tracer') {
        a.obj.material.opacity = t / 0.07 * 0.85;
      }
    }

    for (const s of this._sparkSystems) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.pts.visible = false; continue; }
      const posArr = s.pts.geometry.attributes.position.array;
      for (let i = 0; i < s.n; i++) {
        s.vel[i * 3 + 1] -= 14 * dt;
        posArr[i * 3] += s.vel[i * 3] * dt;
        posArr[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
        posArr[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
        if (posArr[i * 3 + 1] < 0.05) posArr[i * 3 + 1] = 0.05;
      }
      s.pts.geometry.attributes.position.needsUpdate = true;
      s.pts.material.opacity = (s.life / s.maxLife) * 0.95;
    }

    for (const l of this._lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      if (l.life <= 0) { l.light.visible = false; continue; }
      // 按时间衰减（原先按帧乘 0.86，帧率越高衰减越快，30/60/120fps 观感不一致）
      const k = l.life / l.maxLife;
      l.light.intensity = (l.baseIntensity || 0) * k * k;
    }
  }

  // 结算 / 重开时清理：弹坑、预警圈、曳光等"悬停中"的特效必须一并回收，
  // 否则 effects.update 停摆期间它们会静止挂在场上，并在新局继续存在数秒。
  reset() {
    for (const a of this._active) a.obj.visible = false;
    this._active.length = 0;
    for (const s of this._sparkSystems) { s.life = 0; s.pts.visible = false; }
    for (const l of this._lights) { l.life = 0; l.light.visible = false; l.light.intensity = 0; }
    this.shakeAmt = 0;
  }
}

window.Effects = Effects;
