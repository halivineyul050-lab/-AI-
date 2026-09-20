// models.js —— 程序化低多边形建模（零外部模型文件）
// 所有单位用 three.js 基础几何拼装：玩家坦克、敌方坦克/战机/轰炸机/炮艇、
// 障碍物、补给箱。几何体与材质全局缓存，实例只引用，配合对象池零 GC 压力。
// 朝向约定：所有单位本地 +Z 为前向，yaw = atan2(dx, dz)。

class ModelFactory {
  constructor(rng) {
    this._mats = new Map();   // 材质缓存：color+flags → material
    this._geos = new Map();   // 几何缓存：name → geometry
    // 外观用随机源：默认系统随机，传入 seed 生成器后每局景观一致
    this.rng = typeof rng === 'function' ? rng : Math.random;
  }

  mat(color, opts = {}) {
    // 缓存键必须覆盖所有会改变材质外观的参数，否则"同色不同发光"会被错误复用
    const emissive = opts.emissive || 0;
    const key = `${color}|${opts.metalness || 0}|${opts.roughness ?? 0.75}|${emissive}|${opts.emissiveIntensity ?? 1}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}`;
    if (!this._mats.has(key)) {
      const m = new THREE.MeshStandardMaterial({
        color,
        metalness: opts.metalness ?? 0.35,
        roughness: opts.roughness ?? 0.75,
        flatShading: true,
      });
      if (emissive) {
        m.emissive = new THREE.Color(emissive);
        m.emissiveIntensity = opts.emissiveIntensity ?? 1;
      }
      if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity ?? 0.6; }
      this._mats.set(key, m);
    }
    return this._mats.get(key);
  }

  box(w, h, d) {
    const key = `b${w}x${h}x${d}`;
    if (!this._geos.has(key)) this._geos.set(key, new THREE.BoxGeometry(w, h, d));
    return this._geos.get(key);
  }

  // hSeg / openEnded 必须参与缓存键，否则同尺寸开口/封闭圆柱会互相串用
  cyl(rt, rb, h, seg = 10, hSeg = 1, openEnded = false) {
    const key = `c${rt}_${rb}_${h}_${seg}_${hSeg}_${openEnded ? 1 : 0}`;
    if (!this._geos.has(key)) this._geos.set(key, new THREE.CylinderGeometry(rt, rb, h, seg, hSeg, openEnded));
    return this._geos.get(key);
  }

  _mesh(geo, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    return m;
  }

  // ---------- 玩家坦克 ----------
  // 返回 { root, hullGroup, turret, gunPivot, muzzle, mgPivot, missilePods, trackL, trackR, trackBaseY }
  // hullGroup 装车体与履带：第一人称时整体隐藏，只留炮塔+炮管形成"炮手视角"。
  // gunPivot 承载炮管并在俯仰时绕 X 轴旋转，muzzle 随之外移（弹道与视角一致）。
  buildPlayerTank() {
    const F = this;
    const root = new THREE.Group();
    const armorCol = 0x5c6b52;    // 军绿装甲
    const darkCol = 0x2e3529;
    const accent = F.mat(0xff7a1a, { emissive: 0xff7a1a, emissiveIntensity: 0.9 });

    // 履带
    const trackBaseY = 0.36;      // 履带基准高度（player.js 履带微动共用此值）
    const trackGeo = F.box(0.62, 0.72, 4.4);
    const trackMat = F.mat(0x1c1f1a, { roughness: 0.95, metalness: 0.1 });
    const trackL = F._mesh(trackGeo, trackMat, -1.12, trackBaseY, 0);
    const trackR = F._mesh(trackGeo, trackMat, 1.12, trackBaseY, 0);

    // 车体（含履带，打包进 hullGroup）
    const hullGroup = new THREE.Group();
    hullGroup.add(trackL, trackR);
    const hull = F._mesh(F.box(2.1, 0.7, 4.2), F.mat(armorCol), 0, 1.0, 0);
    hullGroup.add(hull);
    // 首上斜甲（视觉件）
    const glacis = F._mesh(F.box(2.1, 0.5, 1.0), F.mat(armorCol), 0, 1.28, 1.75);
    glacis.rotation.x = -0.5;
    hullGroup.add(glacis);
    // 尾部引擎格栅
    hullGroup.add(F._mesh(F.box(1.8, 0.24, 0.7), F.mat(darkCol), 0, 1.42, -1.7));
    // 侧裙板荧光标识
    hullGroup.add(F._mesh(F.box(0.05, 0.16, 0.9), accent, -1.06, 1.0, 0.4));
    hullGroup.add(F._mesh(F.box(0.05, 0.16, 0.9), accent, 1.06, 1.0, 0.4));
    root.add(hullGroup);

    // 炮塔（独立旋转）
    const turret = new THREE.Group();
    turret.position.set(0, 1.55, -0.15);
    const tBase = F._mesh(F.cyl(1.02, 1.18, 0.55, 12), F.mat(armorCol), 0, 0.18, 0);
    turret.add(tBase);
    const tBody = F._mesh(F.box(1.5, 0.5, 2.0), F.mat(armorCol), 0, 0.6, 0.1);
    turret.add(tBody);

    // 炮管枢轴：绕本地 X 轴俯仰
    const gunPivot = new THREE.Group();
    gunPivot.position.set(0, 0.62, 0);
    const barrel = F._mesh(F.cyl(0.11, 0.14, 3.0, 8), F.mat(darkCol, { metalness: 0.5, roughness: 0.5 }), 0, 0, 2.1);
    barrel.rotation.x = Math.PI / 2;
    gunPivot.add(barrel);
    const brake = F._mesh(F.cyl(0.17, 0.17, 0.4, 8), F.mat(darkCol, { metalness: 0.5 }), 0, 0, 3.4);
    brake.rotation.x = Math.PI / 2;
    gunPivot.add(brake);
    // 炮口锚点（子弹出生点）
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, 3.65);
    gunPivot.add(muzzle);
    turret.add(gunPivot);

    // 车长机枪座（防空机枪视觉）
    const mgPivot = new THREE.Group();
    mgPivot.position.set(-0.55, 1.0, -0.5);
    const mgBody = F._mesh(F.box(0.16, 0.18, 1.1), F.mat(0x23261f, { metalness: 0.6, roughness: 0.4 }), 0, 0, 0.3);
    mgPivot.add(mgBody);
    const mgBarrel = F._mesh(F.cyl(0.045, 0.045, 1.0, 6), F.mat(0x16180f), 0, 0.02, 1.3);
    mgBarrel.rotation.x = Math.PI / 2;
    mgPivot.add(mgBarrel);
    turret.add(mgPivot);
    // 导弹巢（强化后启用视觉：靠 add 控制可见）
    const missilePods = new THREE.Group();
    missilePods.position.set(0.62, 1.0, -0.6);
    for (let i = 0; i < 2; i++) {
      const pod = F._mesh(F.box(0.3, 0.3, 0.9), F.mat(0x3a4238), (i - 0.5) * 0.4, 0, 0);
      missilePods.add(pod);
    }
    missilePods.visible = false;
    turret.add(missilePods);

    root.add(turret);
    return { root, hullGroup, turret, gunPivot, muzzle, mgPivot, missilePods, trackL, trackR, trackBaseY };
  }

  // ---------- 敌方地面单位 ----------
  buildEnemyTank(kind) {
    const F = this;
    const root = new THREE.Group();
    const spec = {
      tank:      { body: 0x6b5a4a, dark: 0x2b241d, hull: [2.0, 0.62, 3.8], track: [0.55, 0.62, 4.0], turretR: 0.95, barrelLen: 2.4 },
      heavy:     { body: 0x54514e, dark: 0x232120, hull: [2.6, 0.9, 4.8], track: [0.72, 0.85, 5.0], turretR: 1.35, barrelLen: 3.0 },
      artillery: { body: 0x5a5648, dark: 0x26241d, hull: [2.1, 0.6, 3.6], track: [0.55, 0.6, 3.8], turretR: 0.85, barrelLen: 3.4 },
    }[kind];

    const trackMat = F.mat(0x1a1c17, { roughness: 0.95, metalness: 0.1 });
    const bodyMat = F.mat(spec.body);
    const darkMat = F.mat(spec.dark, { metalness: 0.5, roughness: 0.5 });

    root.add(F._mesh(F.box(spec.track[0], spec.track[1], spec.track[2]), trackMat, -spec.hull[0] / 2, spec.track[1] / 2, 0));
    root.add(F._mesh(F.box(spec.track[0], spec.track[1], spec.track[2]), trackMat, spec.hull[0] / 2, spec.track[1] / 2, 0));
    root.add(F._mesh(F.box(spec.hull[0], spec.hull[1], spec.hull[2]), bodyMat, 0, spec.track[1] + spec.hull[1] / 2 - 0.1, 0));

    const turret = new THREE.Group();
    const baseY = spec.track[1] + spec.hull[1];
    turret.position.set(0, baseY, kind === 'artillery' ? -0.5 : 0);
    turret.add(F._mesh(F.cyl(spec.turretR * 0.85, spec.turretR, 0.5, 10), bodyMat, 0, 0.22, 0));
    const barrelLen = spec.barrelLen;
    const barrel = F._mesh(F.cyl(0.1, 0.13, barrelLen, 8), darkMat, 0, 0.5, barrelLen / 2 + 0.3);
    barrel.rotation.x = Math.PI / 2;
    turret.add(barrel);
    if (kind === 'heavy') {
      const b2 = F._mesh(F.cyl(0.1, 0.13, barrelLen, 8), darkMat, 0.42, 0.42, barrelLen / 2 + 0.3);
      b2.rotation.x = Math.PI / 2;
      turret.add(b2);
    }
    if (kind === 'artillery') {
      barrel.rotation.x = Math.PI / 2 - 0.5;  // 仰角（update 中按具名字段维护）
    }
    const muzzle = new THREE.Object3D();
    muzzle.position.set(kind === 'heavy' ? 0.21 : 0, 0.5, barrelLen + 0.5);
    turret.add(muzzle);
    root.add(turret);
    return { root, turret, muzzle, barrel };
  }

  // 自爆突袭车：轻型四轮小车 + 顶部炸药束
  buildBuggy() {
    const F = this;
    const root = new THREE.Group();
    const bodyMat = F.mat(0x7a4632, { roughness: 0.7 });
    root.add(F._mesh(F.box(1.3, 0.5, 2.0), bodyMat, 0, 0.62, 0));
    root.add(F._mesh(F.box(1.0, 0.35, 0.8), F.mat(0x3a2a20), 0, 1.0, -0.2));
    const wheelGeo = F.cyl(0.34, 0.34, 0.26, 8);
    const wheelMat = F.mat(0x14150f, { roughness: 0.95, metalness: 0.05 });
    [[-0.72, 0.7], [0.72, 0.7], [-0.72, -0.7], [0.72, -0.7]].forEach(([x, z]) => {
      const w = F._mesh(wheelGeo, wheelMat, x, 0.34, z);
      w.rotation.z = Math.PI / 2;
      root.add(w);
    });
    // 炸药束（红色警示）
    const dyn = F.mat(0xc23a2a, { emissive: 0x551208, emissiveIntensity: 0.8 });
    for (let i = 0; i < 3; i++) {
      const d = F._mesh(F.cyl(0.09, 0.09, 0.7, 6), dyn, (i - 1) * 0.22, 1.32, -0.2);
      root.add(d);
    }
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 1.0, 1.0);
    root.add(muzzle);
    return { root, turret: root, muzzle };
  }

  // ---------- 敌方空中单位 ----------
  // 喷气战机：三角翼 + 双垂尾
  buildJet() {
    const F = this;
    const root = new THREE.Group();
    const bodyMat = F.mat(0x4a525c, { metalness: 0.55, roughness: 0.45 });
    const darkMat = F.mat(0x23282e, { metalness: 0.5, roughness: 0.5 });
    // 机身
    const fus = F._mesh(F.cyl(0.34, 0.52, 4.4, 8), bodyMat, 0, 0, 0);
    fus.rotation.x = Math.PI / 2;
    root.add(fus);
    // 机头锥
    const nose = F._mesh(F.cyl(0.02, 0.34, 1.1, 8), darkMat, 0, 0, 2.7);
    nose.rotation.x = Math.PI / 2;
    root.add(nose);
    // 主翼（三角）
    const wingShape = new THREE.BufferGeometry();
    wingShape.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, -1.8,  -3.4, 0, 1.2,  0, 0, 1.2,
      0, 0, -1.8,  0, 0, 1.2,  3.4, 0, 1.2,
    ]), 3));
    wingShape.computeVertexNormals();
    const wings = new THREE.Mesh(wingShape, F.mat(0x3d444d, { metalness: 0.55, roughness: 0.45 }));
    root.add(wings);
    // 双垂尾
    [[-0.5], [0.5]].forEach(([x]) => {
      const tail = F._mesh(F.box(0.08, 1.0, 1.1), darkMat, x, 0.5, -1.6);
      root.add(tail);
    });
    // 尾喷口（发光）
    root.add(F._mesh(F.cyl(0.3, 0.26, 0.3, 8), F.mat(0xff8a3a, { emissive: 0xff6a1a, emissiveIntensity: 2 }), 0, 0, -2.35));
    return { root };
  }

  // 轰炸机：双发布局 + 弹舱
  buildBomber() {
    const F = this;
    const root = new THREE.Group();
    const bodyMat = F.mat(0x50603f, { metalness: 0.4, roughness: 0.6 });
    const darkMat = F.mat(0x2a3222);
    const fus = F._mesh(F.cyl(0.7, 0.9, 7.0, 8), bodyMat, 0, 0, 0);
    fus.rotation.x = Math.PI / 2;
    root.add(fus);
    const nose = F._mesh(F.cyl(0.05, 0.7, 1.6, 8), darkMat, 0, 0, 4.2);
    nose.rotation.x = Math.PI / 2;
    root.add(nose);
    // 平直翼 + 双发
    root.add(F._mesh(F.box(11.5, 0.16, 2.2), bodyMat, 0, 0.1, 0.4));
    [-2.6, 2.6].forEach((x) => {
      const nac = F._mesh(F.cyl(0.42, 0.42, 2.0, 8), darkMat, x, 0.05, 0.4);
      nac.rotation.x = Math.PI / 2;
      root.add(nac);
      const prop = F._mesh(F.box(2.6, 0.12, 0.06), F.mat(0x14170f), x, 0.05, 1.5);
      root.add(prop);
      if (!root.userData.props) root.userData.props = [];
      root.userData.props.push(prop);
    });
    // 双垂尾
    [-1.1, 1.1].forEach((x) => root.add(F._mesh(F.box(0.1, 1.3, 1.2), darkMat, x, 0.8, -3.0)));
    return { root };
  }

  // 浮空炮艇 boss：粗机身 + 旋翼 + 武器挂架
  buildGunship() {
    const F = this;
    const root = new THREE.Group();
    const bodyMat = F.mat(0x3f3a45, { metalness: 0.6, roughness: 0.4 });
    const darkMat = F.mat(0x1e1b24, { metalness: 0.6, roughness: 0.4 });
    const warn = F.mat(0xff4a2a, { emissive: 0xff2a1a, emissiveIntensity: 1.6 });
    // 主舱体
    root.add(F._mesh(F.box(3.0, 1.6, 7.2), bodyMat, 0, 0, 0));
    root.add(F._mesh(F.box(2.4, 1.0, 2.2), bodyMat, 0, 0.2, 3.8));
    // 座舱
    root.add(F._mesh(F.box(1.8, 0.7, 1.2), F.mat(0x8adfff, { emissive: 0x2a5a6a, emissiveIntensity: 0.5, roughness: 0.2 }), 0, 0.1, 4.9));
    // 短翼挂架
    root.add(F._mesh(F.box(7.0, 0.24, 1.4), darkMat, 0, -0.3, 0.6));
    [[-3.2], [3.2]].forEach(([x]) => {
      const pod = F._mesh(F.cyl(0.3, 0.3, 1.6, 8), darkMat, x, -0.55, 0.6);
      pod.rotation.x = Math.PI / 2;
      root.add(pod);
    });
    // 尾梁 + 尾桨
    const boom = F._mesh(F.box(0.5, 0.5, 3.4), bodyMat, 0, 0.3, -4.8);
    root.add(boom);
    const tailRotor = F._mesh(F.box(0.1, 2.0, 0.24), darkMat, 0.35, 0.55, -6.4);
    root.add(tailRotor);
    // 主旋翼
    const rotorHub = F._mesh(F.cyl(0.3, 0.3, 0.5, 8), darkMat, 0, 1.05, 0.5);
    root.add(rotorHub);
    const rotor = new THREE.Group();
    rotor.position.set(0, 1.32, 0.5);
    for (let i = 0; i < 4; i++) {
      const blade = F._mesh(F.box(9.4, 0.07, 0.5), darkMat, 0, 0, 0);
      blade.rotation.y = (i / 4) * Math.PI * 2;
      rotor.add(blade);
    }
    root.add(rotor);
    // 警示灯
    root.add(F._mesh(F.cyl(0.14, 0.14, 0.2, 6), warn, 0, 0.9, -2.2));
    root.userData.rotor = rotor;
    root.userData.tailRotor = tailRotor;
    return { root };
  }

  // ---------- 场景物件 ----------
  buildObstacle(type, hw, hd, h) {
    const F = this;
    const g = new THREE.Group();
    if (type === 'bunker') {
      g.add(F._mesh(F.box(hw * 2, h, hd * 2), F.mat(0x4c5048, { roughness: 0.9, metalness: 0.15 }), 0, h / 2, 0));
      g.add(F._mesh(F.box(hw * 2.2, 0.3, hd * 2.2), F.mat(0x3a3e37), 0, h, 0));
      g.add(F._mesh(F.box(hw * 1.2, 0.5, 0.2), F.mat(0x23261f), 0, h * 0.55, hd));
    } else if (type === 'warehouse') {
      g.add(F._mesh(F.box(hw * 2, h, hd * 2), F.mat(0x5c5248, { roughness: 0.85, metalness: 0.2 }), 0, h / 2, 0));
      // 屋顶条纹
      for (let i = -2; i <= 2; i++) {
        g.add(F._mesh(F.box(hw * 2 * 0.94, 0.12, 0.3), F.mat(0x39332c), 0, h + 0.06, i * hd * 0.4));
      }
      g.add(F._mesh(F.box(0.2, h * 0.7, hd * 1.1), F.mat(0x2c2722), hw, h * 0.35, 0));
    } else if (type === 'container') {
      const col = Math.random() < 0.5 ? 0x8a4432 : 0x2f5a6b;
      g.add(F._mesh(F.box(hw * 2, h, hd * 2), F.mat(col, { roughness: 0.7, metalness: 0.4 }), 0, h / 2, 0));
      g.add(F._mesh(F.box(hw * 2 + 0.06, 0.14, 0.14), F.mat(0x1e2024), 0, h * 0.72, hd));
      g.add(F._mesh(F.box(hw * 2 + 0.06, 0.14, 0.14), F.mat(0x1e2024), 0, h * 0.28, hd));
    } else { // rock
      const geo = new THREE.DodecahedronGeometry(Math.max(hw, hd), 0);
      const m = F._mesh(geo, F.mat(0x555a52, { roughness: 0.95, metalness: 0.05 }), 0, h * 0.55, 0);
      m.scale.set(hw / Math.max(hw, hd), h / (Math.max(hw, hd) * 1.1), hd / Math.max(hw, hd));
      m.rotation.y = F.rng() * Math.PI;
      g.add(m);
    }
    return g;
  }

  buildPickup(kind) {
    const F = this;
    const g = new THREE.Group();
    const isHeal = kind === 'heal';
    const col = isHeal ? 0xd8dad6 : 0x3d5a80;
    const mark = isHeal ? 0xc23a2a : 0x4aa8ff;
    g.add(F._mesh(F.box(1.1, 0.8, 1.1), F.mat(col, { roughness: 0.6, metalness: 0.3 }), 0, 0.4, 0));
    // 标识块
    g.add(F._mesh(F.box(0.62, 0.2, 0.05), F.mat(mark, { emissive: mark, emissiveIntensity: 0.7 }), 0, 0.5, 0.56));
    g.add(F._mesh(F.box(0.2, 0.62, 0.05), F.mat(mark, { emissive: mark, emissiveIntensity: 0.7 }), 0, 0.5, 0.56));
    // 旋转信标（主循环里驱动）
    const beacon = F._mesh(F.cyl(0.5, 0.62, 2.6, 10, 1, true),
      F.mat(isHeal ? 0x35d058 : 0x4aa8ff, { transparent: true, opacity: 0.22, emissive: isHeal ? 0x1a8a3a : 0x1a5a9a, emissiveIntensity: 0.9 }),
      0, 1.4, 0);
    g.add(beacon);
    g.userData.beacon = beacon;
    return g;
  }

  // 地面贴图：暗色沥青 + 微噪点 + 警示网格（程序化 canvas）
  makeGroundTexture() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#2b2f34';
    ctx.fillRect(0, 0, S, S);
    // 噪点
    for (let i = 0; i < 2600; i++) {
      const v = randInt(38, 64);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    // 裂缝线（短裂隙，避免通长大直线）
    ctx.strokeStyle = 'rgba(14,15,18,0.42)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      ctx.beginPath();
      let x = Math.random() * S, y = Math.random() * S;
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += rand(-28, 28); y += rand(-28, 28);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 边缘网格线（平铺时形成战场坐标网格）
    ctx.strokeStyle = 'rgba(104, 114, 126, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 14);
    tex.anisotropy = 4;
    return tex;
  }

  // 墙面警示条纹贴图
  makeStripeTexture() {
    const W = 128, H = 128;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#3a3e37';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c9922a';
    // 斜条纹：平行四边形顶点必须两两平行，否则退化成三角形留下缺口
    for (let i = -2; i < 8; i++) {
      ctx.save();
      ctx.translate(i * 32, 0);
      ctx.beginPath();
      ctx.moveTo(0, H); ctx.lineTo(16, H); ctx.lineTo(16 + H, 0); ctx.lineTo(H, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 1);
    return tex;
  }
}

window.ModelFactory = ModelFactory;
