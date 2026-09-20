// main.js —— 入口与主游戏循环
// 职责：渲染器/场景/相机、世界 API（碰撞/视线/弹道）、触控与键鼠输入、
//        波次流程（intro → 生成 → 肃清 → 三选一 → 下一波）、连杀计分、结算与本地纪录。
// 经典脚本（非 ES Module）：依赖 THREE / CONFIG / HUD / AudioFX / 各系统全局类。

// ---------- 弹道系统（池化） ----------
// 类型：shell(直射炮弹，双阵营) / rocket(敌方火箭) / arc(抛射炮弹) / bomb(航弹) / missile(玩家导弹)
class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this._poolShell = [];
    this._poolMissile = [];
    this._poolBomb = [];
    for (let i = 0; i < CONFIG.performance.maxShells; i++) this._poolShell.push(this._makeShellMesh());
    for (let i = 0; i < 12; i++) this._poolMissile.push(this._makeMissileMesh());
    for (let i = 0; i < CONFIG.performance.maxBombs; i++) this._poolBomb.push(this._makeBombMesh());
  }

  _makeShellMesh() {
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd070 });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  _makeMissileMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xdde4ea }));
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0xff8a3a }));
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -0.6;
    g.add(flame);
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  _makeBombMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.1, 1.0, 6), new THREE.MeshBasicMaterial({ color: 0x3a3f36 }));
    g.add(body);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.24), new THREE.MeshBasicMaterial({ color: 0x22261f }));
    fin.position.y = 0.5;
    g.add(fin);
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  _grab(pool) {
    for (const m of pool) if (!m.visible) return m;
    return null;
  }

  // 玩家主炮弹（dir 为三维向量，可带俯仰打空中目标）
  spawnPlayerShell(pos, dir, spec) {
    const mesh = this._grab(this._poolShell);
    if (!mesh) return;
    mesh.material.color.setHex(0xffd070);
    mesh.visible = true;
    mesh.position.copy(pos);
    this.active.push({
      kind: 'shell', mesh, team: 'player',
      pos: pos.clone(), vel: dir.clone().normalize().multiplyScalar(spec.speed),
      damage: spec.damage, splash: spec.splash, pierce: spec.pierce || 0,
      crit: !!spec.crit, life: 3, lastHit: null,
    });
  }

  // 敌方直射弹（isRocket=true 换弹形与颜色，仍是直线弹）
  spawnEnemyShell(pos, dir, shellCfg, fromPos, isRocket = false) {
    const mesh = this._grab(this._poolShell);
    if (!mesh) return;
    mesh.material.color.setHex(isRocket ? 0xff6a4a : 0xff9a5a);
    mesh.visible = true;
    mesh.position.copy(pos);
    this.active.push({
      kind: isRocket ? 'rocket' : 'eshell', mesh, team: 'enemy',
      pos: pos.clone(), vel: dir.clone().normalize().multiplyScalar(shellCfg.speed),
      damage: shellCfg.damage, splash: shellCfg.splash || 1.8,
      life: 4, fromPos: fromPos ? fromPos.clone() : null,
    });
  }

  // 抛射炮弹：抛物线 from → to，落点预警圈
  spawnArcShell(from, to, shellCfg, world) {
    const mesh = this._grab(this._poolShell);
    if (!mesh) return;
    mesh.material.color.setHex(0xffb060);
    mesh.visible = true;
    (world || window.game).effects.telegraph(to, shellCfg.warnRadius || 3.2, shellCfg.flightTime);
    this.active.push({
      kind: 'arc', mesh, team: 'enemy',
      from: from.clone(), to: to.clone(),
      flightTime: shellCfg.flightTime, t: 0,
      damage: shellCfg.damage, splash: shellCfg.splash,
      arcH: 10 + from.distanceTo(to) * 0.12,
      pos: from.clone(), vel: new THREE.Vector3(),
      life: 9,
    });
  }

  // 航弹：从投弹点落到目标点，落点预警圈
  spawnBomb(targetPos, bombCfg, fromPos, world) {
    const mesh = this._grab(this._poolBomb);
    if (!mesh) return;
    mesh.visible = true;
    mesh.position.copy(fromPos);
    (world || window.game).effects.telegraph(targetPos, bombCfg.splash + 0.8, bombCfg.fallTime);
    this.active.push({
      kind: 'bomb', mesh, team: 'enemy',
      from: fromPos.clone(), to: targetPos.clone(),
      flightTime: bombCfg.fallTime, t: 0,
      damage: bombCfg.damage, splash: bombCfg.splash,
      pos: fromPos.clone(), vel: new THREE.Vector3(),
      life: 9,
    });
  }

  // 玩家防空导弹：轻微追踪
  spawnMissile(pos, dir, spec) {
    const mesh = this._grab(this._poolMissile);
    if (!mesh) return;
    mesh.visible = true;
    mesh.position.copy(pos);
    this.active.push({
      kind: 'missile', mesh, team: 'player',
      pos: pos.clone(), vel: dir.clone().normalize().multiplyScalar(spec.speed),
      damage: spec.damage, splash: 3.2, target: spec.target || null,
      life: 4.5, lastHit: null,
    });
  }

  update(dt, world) {
    const half = CONFIG.arena.half + 8;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.life -= dt;

      if (b.kind === 'arc' || b.kind === 'bomb') {
        // 参数化抛物线
        b.t += dt / b.flightTime;
        if (b.t >= 1) {
          this._explode(b, world, b.to);
          this._release(i);
          continue;
        }
        const t = b.t;
        b.pos.lerpVectors(b.from, b.to, t);
        b.pos.y = lerp(b.from.y, 0.2, t) + 4 * b.arcH * t * (1 - t);
        b.mesh.position.copy(b.pos);
        if (b.kind === 'bomb') b.mesh.rotation.x += dt * 3;
        continue;
      }

      // 直线弹：导弹轻微追踪
      if (b.kind === 'missile' && b.target && b.target.alive) {
        const to = new THREE.Vector3().subVectors(b.target.position, b.pos).normalize().multiplyScalar(b.vel.length());
        b.vel.lerp(to, Math.min(1, dt * 3.5));
      }
      const prevX = b.pos.x, prevY = b.pos.y, prevZ = b.pos.z;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      if (b.kind === 'missile') {
        b.mesh.lookAt(b.pos.x * 2 - prevX, b.pos.y * 2 - prevY, b.pos.z * 2 - prevZ);
      } else {
        b.mesh.lookAt(b.pos.x + b.vel.x, b.pos.y + b.vel.y, b.pos.z + b.vel.z);
      }

      // 出界 / 超时
      if (b.life <= 0 || Math.abs(b.pos.x) > half || Math.abs(b.pos.z) > half) {
        this._release(i);
        continue;
      }

      // 障碍 / 地面命中
      if (b.pos.y <= 0.15 || world.hitObstacle(b.pos.x, b.pos.z, 0.3, b.pos.y)) {
        this._explode(b, world, b.pos);
        this._release(i);
        continue;
      }

      // 命中判定
      if (b.team === 'player') {
        let consumed = false;
        for (const e of world.enemies) {
          if (!e.alive || e === b.lastHit) continue;
          if (this._segHitsSphere(prevX, prevY, prevZ, b.pos, e.position, e.radius + 0.3)) {
            // 命中率统计：直击才算命中（溅射不计入分母/分子）
            if (world.stats) world.stats.shotsHit++;
            e.takeDamage(b.damage, b.crit ? '主炮 · 暴击' : '主炮', world);
            b.lastHit = e;
            if (b.pierce > 0) {
              b.pierce--;      // 贯穿后继续飞行
            } else {
              consumed = true; // 无贯穿：命中即爆
              break;
            }
          }
        }
        if (consumed) {
          this._explode(b, world, b.pos);
          this._release(i);
          continue;
        }
      } else {
        // 敌方弹 vs 玩家（受击球心抬到车体中部高度，见 CONFIG.player.hitY）
        const p = world.player;
        if (p.alive && this._segHitsSphere(prevX, prevY, prevZ, b.pos, p.position, CONFIG.player.radius + 0.25, CONFIG.player.hitY)) {
          world.damagePlayer(b.damage, b.fromPos ? '敌军直射火力' : '敌军火力');
          this._explode(b, world, b.pos);
          this._release(i);
          continue;
        }
      }
    }
  }

  _segHitsSphere(x0, y0, z0, end, center, radius, centerY) {
    // 点到线段最近距离（3D）
    // centerY 可显式指定球心高度；任何配置缺失导致 y 为 NaN 时退化为 0，
    // 避免 NaN 比较恒为假让目标"永远打不中"。
    const cy = Number.isFinite(centerY) ? centerY : (Number.isFinite(center.y) ? center.y : 0);
    const dx = end.x - x0, dy = end.y - y0, dz = end.z - z0;
    const fx = x0 - center.x, fy = y0 - cy, fz = z0 - center.z;
    const a = dx * dx + dy * dy + dz * dz;
    let t = a > 0 ? -(fx * dx + fy * dy + fz * dz) / a : 0;
    t = clamp(t, 0, 1);
    const cx = x0 + dx * t - center.x;
    const ccy = y0 + dy * t - cy;
    const cz = z0 + dz * t - center.z;
    return cx * cx + ccy * ccy + cz * cz <= radius * radius;
  }

  _explode(b, world, at) {
    world.effects.explosion(at, b.splash ? Math.min(2.4, 0.6 + b.splash * 0.35) : 1, { big: b.splash >= 3 });
    world.audio.explosion(b.splash >= 3);
    const P = CONFIG.player;
    if (b.team === 'player') {
      // 范围伤害（不含已直击目标的双倍结算）
      for (const e of world.enemies) {
        if (!e.alive || e === b.lastHit) continue;
        const d = dist2D(at.x, at.z, e.position.x, e.position.z);
        const rr = b.splash + e.radius;
        if (d < rr) e.takeDamage(b.damage * lerp(1, P.cannon.splashDamageMul, d / rr), '溅射', world);
      }
    } else {
      const p = world.player;
      if (p.alive) {
        const d = dist2D(at.x, at.z, p.position.x, p.position.z);
        const rr = (b.splash || 2) + P.radius;
        if (d < rr) world.damagePlayer(b.damage * lerp(1, P.splashTakenEdgeMul, d / rr), '范围爆炸');
      }
    }
  }

  _release(i) {
    const b = this.active[i];
    b.mesh.visible = false;
    this.active.splice(i, 1);
  }

  // 电磁脉冲：清空场上敌方直射弹与火箭（抛射弹/航弹在飞行中，不做拦截）
  clearEnemyOrdnance() {
    let n = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      if (b.team === 'enemy' && (b.kind === 'eshell' || b.kind === 'rocket')) {
        this._release(i);
        n++;
      }
    }
    return n;
  }

  reset() {
    for (const b of this.active) b.mesh.visible = false;
    this.active.length = 0;
  }
}

// ---------- 主游戏 ----------
class Game {
  constructor() {
    this.state = 'menu';   // menu / playing / upgrade / pause / result
    this.score = 0;
    this.kills = 0;
    this.runTime = 0;
    this.chainCount = 0;
    this.chainTimer = 0;
    this.bestChain = 0;    // 本局最高连杀（结算战报）
    this.incomingAngle = null;
    this.upgradeOpen = false;
    this.upgradeCards = [];
    this.upgradeTimer = 0;
    this.rerollsLeft = 0;  // 本波剩余重掷次数

    // 主动技能 / 慢镜 / 镜头冲击
    this.abilityCd = 0;
    this._slowmo = 0;
    this._slowmoScale = 1;
    this._fovKick = 0;
    this._heartbeatT = 0;

    // 本局难度与环境
    this.diffCfg = CONFIG.difficulty.veteran;
    this.env = null;
    this.stats = this._newStats();

    // 新手引导
    this.tutorial = { active: false, step: 0 };
    this._tutState = { moved: 0, aimed: false, fired: false };

    this.records = this._loadRecords();
    this.settings = this._loadSettings();

    this._initThree();
    this._initWorld();
    this._initInput();
    this._bindUI();

    this.clock = new THREE.Clock();
    this._frameTimes = [];
    this._framesSinceEval = 0;
    this._idleAcc = 0;
    this._dpr = Math.min(window.devicePixelRatio || 1, this._isMobile() ? CONFIG.mobilePixelRatioCap : CONFIG.desktopPixelRatioCap);
    this.renderer.setPixelRatio(this._dpr);
    this._shadowsOn = !this._isMobile();

    window.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this._openPause();
      this.audio.resumeIfNeeded();
    });

    this._loop = this._loop.bind(this);
    this._resize();
    requestAnimationFrame(this._loop);
  }

  _isMobile() { return /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && window.innerWidth < 900); }

  // 单局战斗统计（结算战报用）
  _newStats() {
    return { shotsFired: 0, shotsHit: 0, damageDealt: 0, damageTaken: 0, killsByKind: {} };
  }

  // ---------- three 初始化 ----------
  _initThree() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this._isMobile(), powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x11151c);
    this.scene.fog = new THREE.Fog(0x11151c, 100, 230);

    this.camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, 0.5, CONFIG.renderDistance);
    this.camera.position.set(0, CONFIG.cameraHeight, CONFIG.cameraBack);
    this.camera.lookAt(0, 0, -4);

    // 灯光（基础值，开局会被战场环境系统覆盖）
    this.hemi = new THREE.HemisphereLight(0x9fb4d0, 0x23261f, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.0);
    this.sun.position.set(40, 60, 25);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.far = 180;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // 用固定种子驱动外观随机：同一 seed → 同一套集装箱配色与岩石朝向（可背版）
    this.factory = new ModelFactory(makeRandom(CONFIG.arena.seed));
  }

  _initWorld() {
    const half = CONFIG.arena.half;
    this.audio = new AudioFX();

    // 地面
    const groundTex = this.factory.makeGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.groundMat = ground.material;
    this.scene.add(ground);

    // 边界墙（警示条纹）
    const stripe = this.factory.makeStripeTexture();
    const wallMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.8, metalness: 0.2 });
    const wallGeo = new THREE.BoxGeometry(half * 2 + 2, 3.2, 1.6);
    [[0, -half - 0.8, 0], [0, half + 0.8, Math.PI], [-half - 0.8, 0, Math.PI / 2], [half + 0.8, 0, -Math.PI / 2]].forEach(([x, z, ry]) => {
      const w = new THREE.Mesh(wallGeo, wallMat);
      w.position.set(x, 1.6, z);
      w.rotation.y = ry;
      this.scene.add(w);
    });

    // 障碍物
    this.obstacles = [];
    for (const [x, z, hw, hd, h, type] of CONFIG.arena.obstacles) {
      const g = this.factory.buildObstacle(type, hw, hd, h);
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.obstacles.push({ x, z, hw, hd, h });
    }

    // 特效
    this.effects = new Effects(this.scene);

    // 玩家
    this.player = new PlayerTank(this.scene, this.factory, this.effects, this.audio);
    this.player.reset(0, 24);

    // 系统
    this.enemyMgr = new EnemyManager(this.scene, this.factory);
    this.projectiles = new Projectiles(this.scene);
    this.pickups = new PickupManager(this.scene, this.factory);
    this.waves = new WaveManager();
    this.hud = new HUD();

    // 波次事件
    this.waves.onWaveIntro = (themeName, waveNum) => {
      this.hud.showWaveBanner(`第 ${waveNum} 波 · ${themeName}`, CONFIG.waves.introDuration);
      this.audio.waveHorn(waveNum % CONFIG.waves.gunshipEveryWaves === 0);
      this.incomingAngle = null;
    };
    this.waves.onBossIncoming = () => {
      // intro 结束后 boss 从远端进场。定时器必须可取消：否则重开新局后
      // 上一局的回调仍会触发，把 boss 直接塞进新的一局。
      clearTimeout(this._bossTimer);
      this._bossTimer = setTimeout(() => {
        this._bossTimer = null;
        if (this.state !== 'playing') return;
        const half2 = CONFIG.arena.half;
        const p = this.player.position;
        const ang = Math.random() * Math.PI * 2;
        this.enemyMgr.spawn('gunship',
          clamp(p.x + Math.cos(ang) * 48, -half2 + 6, half2 - 6),
          clamp(p.z + Math.sin(ang) * 48, -half2 + 6, half2 - 6),
          0, this.waves.waveScale, this);
        this.hud.showWaveBanner('警告 · 浮空炮艇进场', 2.6);
        this.audio.waveHorn(true);
        // 入场演出：短暂慢镜 + 镜头拉近 + 震屏（不改变任何战斗数值）
        const F = CONFIG.feedback.slowmoEnter;
        this._slowmo = F.time;
        this._slowmoScale = F.scale;
        this._fovKick = 12;
        this.effects.shake(0.7);
      }, CONFIG.waves.introDuration * 1000);
    };
    this.waves.onWaveClear = (waveNum, bonus) => {
      this.score += bonus;
      this._openUpgradePick();
    };

    // 主菜单背景下也应用随机战场环境（开局会再抽一次，避免菜单与首局重复）
    this._pickEnvironment();
  }

  // ---------- 世界 API ----------
  // 圆形碰撞：场地边界 + 障碍 AABB 外扩
  collideCircle(x, z, r) {
    const half = CONFIG.arena.half - r;
    x = clamp(x, -half, half);
    z = clamp(z, -half, half);
    for (const o of this.obstacles) {
      const ex = o.hw + r, ez = o.hd + r;
      const dx = x - o.x, dz = z - o.z;
      if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
        const px = ex - Math.abs(dx), pz = ez - Math.abs(dz);
        if (px < pz) x = o.x + Math.sign(dx || 1) * ex;
        else z = o.z + Math.sign(dz || 1) * ez;
      }
    }
    return { x, z };
  }

  hitObstacle(x, z, r, y = 0) {
    for (const o of this.obstacles) {
      // 高空弹道飞越屋顶不判撞
      if (y >= o.h + 0.5) continue;
      if (Math.abs(x - o.x) < o.hw + r && Math.abs(z - o.z) < o.hd + r) return true;
    }
    return false;
  }

  // 2D 视线：与障碍圆近似求交（轻量 seg 判定，对齐 yiren-buche losMode:'seg' 思路）
  hasLOS(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz || 1;
    for (const o of this.obstacles) {
      if (o.h < 1.4) continue; // 低矮障碍不挡视线
      const t = clamp(((o.x - x1) * dx + (o.z - z1) * dz) / len2, 0, 1);
      const cx = x1 + dx * t - o.x, cz = z1 + dz * t - o.z;
      const rr = Math.max(o.hw, o.hd) * 0.9;
      if (cx * cx + cz * cz < rr * rr) return false;
    }
    return true;
  }

  findOpenSpotNear(center, minR, maxR) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = rand(minR, maxR);
      const x = clamp(center.x + Math.cos(a) * d, -CONFIG.arena.half + 4, CONFIG.arena.half - 4);
      const z = clamp(center.z + Math.sin(a) * d, -CONFIG.arena.half + 4, CONFIG.arena.half - 4);
      if (!this.hitObstacle(x, z, 3)) return { x, z };
    }
    return { x: clamp(center.x + 8, -CONFIG.arena.half + 4, CONFIG.arena.half - 4), z: center.z };
  }

  queryNeighbors(x, z, radius, out) {
    return this.enemyMgr.queryNeighbors(x, z, radius, out);
  }

  spawnPlayerShell(pos, dir, spec) { this.projectiles.spawnPlayerShell(pos, dir, spec); }
  spawnEnemyShell(pos, dir, spec, fromPos, isRocket) { this.projectiles.spawnEnemyShell(pos, dir, spec, fromPos, isRocket); }
  spawnArcShell(from, to, cfg) { this.projectiles.spawnArcShell(from, to, cfg, this); }
  spawnBomb(target, cfg, from) { this.projectiles.spawnBomb(target, cfg, from, this); }
  spawnMissile(pos, dir, spec) { this.projectiles.spawnMissile(pos, dir, spec); }

  get enemies() { return this.enemyMgr.active; }

  damagePlayer(amount, source) {
    if (this.state !== 'playing' || !this.player.alive) return;
    const hpBefore = this.player.health;
    const died = this.player.takeDamage(amount, source);
    // 被反应装甲格挡的伤害不计入"承受伤害"，也不震屏（改用蓝色火花反馈）
    if (!this.player.lastDamageBlocked) {
      this.stats.damageTaken += Math.max(0, Math.min(amount, hpBefore));
      this.effects.shake(0.25);
    }
    if (died) this._endRun();
  }

  onEnemyKilled(enemy, source) {
    this.kills++;
    if (this.stats.killsByKind) this.stats.killsByKind[enemy.kind] = (this.stats.killsByKind[enemy.kind] || 0) + 1;
    // 连杀链
    if (this.chainTimer > 0) this.chainCount++;
    else this.chainCount = 1;
    this.chainTimer = CONFIG.runScore.chainWindow;
    if (this.chainCount > this.bestChain) this.bestChain = this.chainCount;
    const chainBonus = Math.min(this.chainCount - 1, 4) * CONFIG.runScore.chainStep;
    // 难度分倍率乘在最终得分上，便于三档横向比较
    this.score += Math.round((enemy.score + chainBonus) * this.diffCfg.scoreMul);
    if (this.chainCount >= 2) {
      const names = CONFIG.runScore.comboNames;
      this.hud.showCombo(names[Math.min(this.chainCount - 2, names.length - 1)]);
      this.audio.combo(this.chainCount);
    }
    // 纳米吸血：击杀回复最大生命的一定比例
    const vamp = this.player.mods.vamp;
    if (vamp > 0 && this.player.alive) {
      const before = this.player.health;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + this.player.maxHealth * vamp);
      if (this.player.health > before + 0.01) {
        this.effects.sparkBurst(this.player.position.clone().setY(1.8), 6, 0x35d058);
      }
    }
    this.pickups.rollDrop(enemy, this);
  }

  // boss 被击破：慢镜 + 镜头拉近 + 横幅（表现力，不改数值）
  onBossDown() {
    const F = CONFIG.feedback;
    this._slowmo = F.slowmoKill.time;
    this._slowmoScale = F.slowmoKill.scale;
    this._fovKick = 9;
    this.effects.shake(0.9);
    this.hud.showWaveBanner('浮空炮艇 · 击破', 2.2);
  }

  // ---------- 主动技能：电磁脉冲 ----------
  _castEMP() {
    if (this.state !== 'playing' || !this.player.alive) return false;
    if (this.abilityCd > 0) {
      this.hud.showPickup(`电磁脉冲冷却中 · 还需 ${Math.ceil(this.abilityCd)} 秒`);
      return false;
    }
    const A = CONFIG.abilities.emp;
    this.abilityCd = A.cooldown;
    const p = this.player.position;
    this.effects.empBlast(p, A.radius);
    this.audio.emp();
    let hit = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist2D(p.x, p.z, e.position.x, e.position.z);
      if (d < A.radius + e.radius) {
        e.stunTime = Math.max(e.stunTime || 0, A.stunTime);
        e.takeDamage(A.damage, '电磁脉冲', this);
        hit++;
      }
    }
    const cleared = A.clearShells ? this.projectiles.clearEnemyOrdnance() : 0;
    this.hud.hitMarker(true);
    this.hud.showPickup(`电磁脉冲 · 瘫痪 ${hit} 个目标${cleared ? ` · 清除 ${cleared} 发来袭弹药` : ''}`);
    this.hud.updateAbility(this.abilityCd);
    return true;
  }

  updateBossBar(enemy) { this.hud.updateBossBar(enemy); }

  // ---------- 输入 ----------
  _initInput() {
    this.keys = new Set();
    this.moveX = 0;
    this.moveZ = 0;
    this.firing = false;
    this._mouseHeld = false;
    this._fireBtnHeld = false;
    this._aimJoyFiring = false;
    this.aimStickActive = false;
    this.aimDirFromStick = null;
    this.mouseAimTime = -10;
    this.mouseDir = null;
    this._mousePos = { x: 0.5, y: 0.5 };
    this._pointerLocked = false;
    this.fpYaw = 0;            // 第一人称视角角
    this.fpPitch = 0;
    this._fpLookHold = 0;      // 指针锁定下抑制自动瞄准的剩余时长
    this._fpLook = null;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if ((e.code === 'Escape' || e.code === 'KeyP') && (this.state === 'playing' || this.state === 'pause')) {
        this.state === 'playing' ? this._openPause() : this._resume();
      }
      if (e.code === 'KeyV') {
        this._setView(this.settings.view === 'fp' ? 'tp' : 'fp');
        this.hud.showPickup(this.settings.view === 'fp'
          ? '第一人称 · 点击画面锁定鼠标，V 键切回'
          : '俯视跟随 · 按 V 切第一人称');
      }
      if (e.code === 'Space') e.preventDefault();
      // 主动技能：电磁脉冲（战斗中随时可放，冷却由 _castEMP 内部判定）
      if (e.code === 'KeyQ') this._castEMP();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // 切窗/失焦时清空输入状态：否则按住 W 切出去再回来会一直前进
    window.addEventListener('blur', () => {
      this.keys.clear();
      this._mouseHeld = false;
      this._fireBtnHeld = false;
      this.firing = false;
    });

    const canvas = document.getElementById('game-canvas');
    this._canvas = canvas;
    canvas.addEventListener('mousemove', (e) => this._updateMouseAim(e));
    // 鼠标移出行进画面（去点顶部按钮等 HUD 控件）时立刻停止偏置转向，
    // 否则"移向暂停键 → 视角猛地上仰"会非常突兀
    canvas.addEventListener('mouseleave', () => { this.mouseAimTime = -1e9; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.audio.init();
        // 第一人称：点击画面即请求指针锁定，随后用相对位移控制视角
        if (this.settings.view === 'fp' && !this._pointerLocked && this.state === 'playing') this._tryPointerLock();
        this._mouseHeld = true;
      }
      this._updateMouseAim(e);
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this._mouseHeld = false; });

    // 指针锁定下的相对鼠标视角（第一人称主控方式）
    window.addEventListener('mousemove', (e) => {
      if (!this._pointerLocked || this.settings.view !== 'fp' || this.state !== 'playing') return;
      const F = CONFIG.view.fp;
      const C = CONFIG.player.cannon;
      this.fpYaw -= e.movementX * F.mouseSens;                      // 视角右转 = yaw 减小
      this.fpPitch = clamp(this.fpPitch - e.movementY * F.mouseSens, C.pitchMin, C.pitchMax);
      this._fpLookHold = F.lookHold;
    });
    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = document.pointerLockElement === canvas;
      this._syncLockHint();
    });

    // 触控：左 zone = 移动摇杆（动态原点），右 zone = 瞄准/视角摇杆，另有独立开火键。
    // 关键修复：事件必须绑在 zone 自身上。此前绑在 #hud 做委托，但 .hud 是 pointer-events:none，
    // 且全屏 canvas 是 .hud 的兄弟节点（不是后代），触摸命中 canvas 后事件根本冒泡不到 #hud，
    // 于是左摇杆移动、右摇杆瞄准推射全部失效。现在 .touch-zone 在 CSS 上开启 pointer-events。
    this._joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this._aimJoy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    const zoneL = document.getElementById('touch-zone-left');
    const zoneR = document.getElementById('touch-zone-right');
    const joyBase = document.getElementById('joy-base');
    const joyKnob = document.getElementById('joy-knob');

    const zoneStart = (isLeft) => (e) => {
      if (this.state !== 'playing' || e.pointerType === 'mouse') return;
      if (isLeft) {
        if (this._joy.active) return;
        this._joy.active = true;
        this._joy.id = e.pointerId;
        this._joy.ox = e.clientX; this._joy.oy = e.clientY;
        this._joy.x = 0; this._joy.y = 0;
        joyBase.classList.remove('hidden');
        joyBase.style.left = `${e.clientX - 59}px`;
        joyBase.style.top = `${e.clientY - 59}px`;
        joyKnob.style.transform = 'translate(-50%, -50%)';
      } else {
        if (this._aimJoy.active) return;
        this._aimJoy.active = true;
        this._aimJoy.id = e.pointerId;
        this._aimJoy.ox = e.clientX; this._aimJoy.oy = e.clientY;
        this._aimJoy.x = 0; this._aimJoy.y = 0;
      }
      // 指针捕获：手指滑出 zone 边界后仍持续接收事件
      if (e.target.setPointerCapture) {
        try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* 忽略：部分浏览器拒绝 */ }
      }
    };
    const zoneMove = (e) => {
      const R = 46;
      if (this._joy.active && e.pointerId === this._joy.id) {
        let dx = e.clientX - this._joy.ox, dy = e.clientY - this._joy.oy;
        const d = Math.hypot(dx, dy) || 1e-6;
        const cl = Math.min(d, R);
        const nx = dx / d, ny = dy / d;
        // 满量程阈值来自配置：推到 joystickFullAt 比例即达到满速（此前该配置项零读取）
        const amp = clamp((cl / R) / CONFIG.player.joystickFullAt, 0, 1);
        this._joy.x = nx * amp;
        this._joy.y = ny * amp;
        joyKnob.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
      } else if (this._aimJoy.active && e.pointerId === this._aimJoy.id) {
        let dx = e.clientX - this._aimJoy.ox, dy = e.clientY - this._aimJoy.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        this._aimJoy.x = dx / R; this._aimJoy.y = dy / R;
        if (d > 10) {
          // 屏幕上推 = 世界 -Z：worldDir = (dx, dy)
          this.aimDirFromStick = Math.atan2(dx, dy);
          this.aimStickActive = true;
          this._aimJoyFiring = true;
          this._tutState.aimed = true;   // 引导第 2 步（移动端）
        }
      }
    };
    const pointerEnd = (e) => {
      if (this._joy.active && e.pointerId === this._joy.id) {
        this._joy.active = false;
        this._joy.x = 0; this._joy.y = 0;
        joyBase.classList.add('hidden');
      }
      if (this._aimJoy.active && e.pointerId === this._aimJoy.id) {
        this._aimJoy.active = false;
        this.aimStickActive = false;
        this._aimJoyFiring = false;
        this.aimDirFromStick = null;
      }
    };
    zoneL.addEventListener('pointerdown', zoneStart(true));
    zoneR.addEventListener('pointerdown', zoneStart(false));
    // move/up 挂 window：拖出 zone 后仍能继续操纵
    window.addEventListener('pointermove', zoneMove);
    window.addEventListener('pointerup', pointerEnd);
    window.addEventListener('pointercancel', pointerEnd);

    // 开火键
    const fireBtn = document.getElementById('btn-fire');
    fireBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._fireBtnHeld = true;
      fireBtn.classList.add('firing');
    });
    const fireEnd = (e) => {
      this._fireBtnHeld = false;
      fireBtn.classList.remove('firing');
    };
    fireBtn.addEventListener('pointerup', fireEnd);
    fireBtn.addEventListener('pointercancel', fireEnd);
    fireBtn.addEventListener('pointerleave', fireEnd);

    document.getElementById('btn-pause').addEventListener('click', () => {
      if (this.state === 'playing') this._openPause();
    });
    // 视角切换按钮（触屏主要入口；桌面也可用 V 键）
    document.getElementById('btn-view').addEventListener('click', () => {
      this.audio.uiClick();
      this._setView(this.settings.view === 'fp' ? 'tp' : 'fp');
    });
  }

  _updateMouseAim(e) {
    this._mousePos.x = e.clientX / window.innerWidth;
    this._mousePos.y = e.clientY / window.innerHeight;
    this.mouseAimTime = performance.now() / 1000;
    if (this.settings.view === 'fp') return;   // 第一人称用视角角，不做地面反投影
    if (this._isMobile()) return;
    // 相机固定朝 -Z 俯视，把鼠标点反投影到 y=1.2 平面
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = (1.2 - ray.ray.origin.y) / ray.ray.direction.y;
    if (t > 0) {
      const hit = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
      const p = this.player.position;
      this.mouseDir = Math.atan2(hit.x - p.x, hit.z - p.z);
      this.mouseAimTime = performance.now() / 1000;
      this._tutState.aimed = true;   // 引导第 2 步：完成一次瞄准
    }
  }

  _gatherInput(dt) {
    const fp = this.settings.view === 'fp';
    // 键盘移动
    let kx = 0, kz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;

    // 开火源聚合：开火键 / 鼠标左键 / 空格 / 右摇杆推向
    this.firing = this._fireBtnHeld || this._mouseHeld || this.keys.has('Space') || this._aimJoyFiring;

    // 移动合成：键盘 + 摇杆（摇杆乘灵敏度）
    const sens = this.settings.sens;
    let mx = kx + this._joy.x * sens, mz = kz + this._joy.y * sens;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    if (len < CONFIG.player.joystickDeadzone) { mx = 0; mz = 0; }
    this.moveX = mx;
    this.moveZ = mz;

    if (!fp) {
      // 瞄准优先级：右摇杆 > 最近 2.5s 内的鼠标 > （辅助开→自动 / 辅助关→随车体）
      const now = performance.now() / 1000;
      if (this.aimStickActive) {
        this._aimDir = this.aimDirFromStick;
      } else if (this.mouseDir !== null && now - this.mouseAimTime < 2.5) {
        this._aimDir = this.mouseDir;
      } else if (this.settings.assist) {
        this._aimDir = null; // 自动瞄准
      } else {
        this._aimDir = this.player.hullYaw;
      }
      this._fpLook = null;
      return;
    }

    // ---- 第一人称视角：由"指针锁定相对位移"或"偏置/摇杆转向速率"驱动 ----
    const F = CONFIG.view.fp;
    const C = CONFIG.player.cannon;
    this._fpLookHold = Math.max(0, this._fpLookHold - dt);

    let lx = 0, ly = 0;
    if (this.aimStickActive) { lx = this._aimJoy.x; ly = this._aimJoy.y; }
    const now = performance.now() / 1000;
    const offsetLive = !this._pointerLocked && (now - this.mouseAimTime < F.lookIdleStop);
    if (offsetLive) {
      // 兜底方案（指针锁定不可用 / 玩家还没点画面）：鼠标偏离屏幕中心的量作为转向速率。
      // 判据是"鼠标最近还在动"——阈值用 lookIdleStop（1.2s）而非过去的 0.35s：
      // 0.35s 太短，鼠标慢慢推向屏幕边缘的过程中只要停顿一下就停转，手感一顿一顿。
      const ox = (this._mousePos.x - 0.5) * 2;
      const oy = (this._mousePos.y - 0.5) * 2;
      if (Math.abs(ox) > F.lookDeadzone) lx = ox;
      if (Math.abs(oy) > F.lookDeadzone) ly = oy;
    }
    if (lx !== 0) this.fpYaw -= lx * F.turnRate * dt;                                   // 右转 = yaw 减小
    if (ly !== 0) this.fpPitch = clamp(this.fpPitch - ly * F.pitchRate * dt, C.pitchMin, C.pitchMax);

    // 自动瞄准：无手动视角输入时软性吸附最近目标（第一人称下的"辅助瞄准"）。
    // offsetLive 也必须算作"玩家在操作"——否则停手 1.2s 后视角就被吸附接管，玩家只感到"视角自己乱转"。
    const manual = lx !== 0 || ly !== 0 || this._fpLookHold > 0 || offsetLive;
    if (!manual && this.settings.assist) {
      const t = this.player._pickAimTarget(this);
      if (t) {
        const k = Math.min(1, F.assistPull * dt);
        // 水平吸附再打个折：yaw 被强行扭走等于画面自己转，观感上像"视角失控"，此处只留轻微牵引
        this.fpYaw = angleLerp(this.fpYaw, this.player._leadYaw(t), k * F.assistYawMul);
        this.fpPitch = lerp(this.fpPitch, clamp(this.player._pitchTo(t), C.pitchMin, C.pitchMax), k);
      }
    }
    this._fpLook = { yaw: this.fpYaw, pitch: this.fpPitch };
  }

  // ---------- 视角切换 ----------
  _setView(mode) {
    this.settings.view = mode === 'fp' ? 'fp' : 'tp';
    this._saveSettings();
    this._applyView();
  }

  _applyView() {
    const fp = this.settings.view === 'fp';
    const wantFov = fp ? CONFIG.view.fp.fov : CONFIG.fov;
    if (this.camera.fov !== wantFov) {
      this.camera.fov = wantFov;
      this.camera.updateProjectionMatrix();
    }
    this.player.setViewMode(fp ? 'fp' : 'tp');
    this.hud.setViewMode(fp ? 'fp' : 'tp');
    document.querySelectorAll('#seg-view .seg').forEach((b) => b.classList.toggle('active', b.dataset.view === this.settings.view));
    const vb = document.getElementById('btn-view');
    if (vb) vb.textContent = fp ? 'FP' : 'TP';
    if (fp) {
      // 从当前炮塔朝向接管视角，避免切视角瞬间跳变
      this.fpYaw = this.player.turretYaw;
      this.fpPitch = this.player.gunPitch;
      // 关键：这里【绝不】自动请求指针锁定。
      // 一旦锁定，鼠标被 canvas 独占，HUD 上所有按钮（本键 / 暂停 / 开火）都收不到点击，
      // 玩家点完 TP 就"被困"在第一人称里，误以为切换坏了。
      // 锁定改由玩家主动点击画面触发（见 canvas 的 mousedown 绑定）。
    } else {
      this._exitPointerLock();
    }
    this._syncLockHint();
  }

  // 把"鼠标是否已锁定"回显到 HUD，避免玩家遇到"鼠标不见了 / 按钮点不动"却毫无提示
  _syncLockHint() {
    this.hud.setLockState(this.settings.view === 'fp' && this._pointerLocked);
  }

  _tryPointerLock() {
    if (this._isMobile()) return;
    const c = this._canvas || this.renderer.domElement;
    if (document.pointerLockElement === c || !c.requestPointerLock) return;
    try {
      const p = c.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { /* 用户拒绝或浏览器不支持 */ });
    } catch (e) { /* 忽略：退化为偏置转向 */ }
  }

  _exitPointerLock() {
    if (document.pointerLockElement && document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (e) { /* 忽略 */ }
    }
  }

  // ---------- UI 绑定 ----------
  _bindUI() {
    const $ = (id) => document.getElementById(id);
    const show = (id) => $(id).classList.add('show');
    const hide = (id) => $(id).classList.remove('show');

    $('btn-start').addEventListener('click', () => { this.audio.init(); this.audio.uiClick(); this._startRun(); });
    $('btn-records').addEventListener('click', () => { this.audio.init(); this.audio.uiClick(); this._fillRecords(); show('records-panel'); });
    $('btn-records-close').addEventListener('click', () => { this.audio.uiClick(); hide('records-panel'); });
    $('btn-records-reset').addEventListener('click', () => {
      this.records = this._newRecords();
      localStorage.setItem(CONFIG.records.storageKey, JSON.stringify(this.records));
      this._fillRecords();
    });
    $('btn-settings').addEventListener('click', () => { this.audio.init(); this.audio.uiClick(); show('settings-panel'); });
    $('btn-settings-close').addEventListener('click', () => { this.audio.uiClick(); hide('settings-panel'); });
    $('btn-help').addEventListener('click', () => { this.audio.init(); this.audio.uiClick(); show('help-panel'); });
    $('btn-help-close').addEventListener('click', () => { this.audio.uiClick(); hide('help-panel'); });

    // 设置
    const applyGfx = (preset) => {
      this.settings.gfx = preset;
      this._saveSettings();
      this._applyGraphics();
      document.querySelectorAll('#seg-graphics .seg').forEach((b) => b.classList.toggle('active', b.dataset.gfx === preset));
    };
    document.querySelectorAll('#seg-graphics .seg').forEach((b) => {
      b.addEventListener('click', () => { this.audio.uiClick(); applyGfx(b.dataset.gfx); });
    });
    document.querySelectorAll('#seg-assist .seg').forEach((b) => {
      b.addEventListener('click', () => {
        this.audio.uiClick();
        this.settings.assist = b.dataset.assist === '1';
        this._saveSettings();
        document.querySelectorAll('#seg-assist .seg').forEach((x) => x.classList.toggle('active', x === b));
      });
    });
    const vol = $('setting-volume');
    vol.addEventListener('input', () => {
      this.settings.volume = vol.value / 100;
      this.audio.setVolume(this.settings.volume);
      this._saveSettings();
    });
    const sens = $('setting-sens');
    sens.addEventListener('input', () => {
      this.settings.sens = sens.value / 100;
      this._saveSettings();
    });
    // 视角（俯视 / 第一人称）
    document.querySelectorAll('#seg-view .seg').forEach((b) => {
      b.addEventListener('click', () => { this.audio.uiClick(); this._setView(b.dataset.view); });
    });
    // 战斗反馈（伤害飘字 / 命中标记 / 低血警戒）
    document.querySelectorAll('#seg-feedback .seg').forEach((b) => {
      b.addEventListener('click', () => {
        this.audio.uiClick();
        this.settings.feedback = b.dataset.fb === '1';
        this._saveSettings();
        document.querySelectorAll('#seg-feedback .seg').forEach((x) => x.classList.toggle('active', x === b));
        if (!this.settings.feedback) this.hud.clearFeedback();
      });
    });

    // 难度（主菜单）：选择即写入设置，并刷新档位说明
    const applyDifficulty = (id) => {
      if (!CONFIG.difficulty[id]) return;
      this.settings.difficulty = id;
      this._saveSettings();
      document.querySelectorAll('#seg-difficulty .seg').forEach((b) => b.classList.toggle('active', b.dataset.diff === id));
      const tag = document.getElementById('difficulty-tag');
      if (tag) {
        tag.textContent = CONFIG.difficulty[id].tag;
        tag.className = 'difficulty-tag' + (id === 'hell' ? ' hell' : id === 'recruit' ? ' recruit' : '');
      }
    };
    document.querySelectorAll('#seg-difficulty .seg').forEach((b) => {
      b.addEventListener('click', () => { this.audio.init(); this.audio.uiClick(); applyDifficulty(b.dataset.diff); });
    });

    // 强化：重掷 / 跳过
    $('btn-reroll').addEventListener('click', () => this._rerollUpgrade());
    $('btn-skip').addEventListener('click', () => { this.audio.uiClick(); this._skipUpgrade(); });

    // 主动技能按钮（HUD）
    const empBtn = $('btn-emp');
    if (empBtn) {
      empBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.audio.init();
        this._castEMP();
      });
    }

    // 新手引导
    $('btn-tut-next').addEventListener('click', () => this._advanceTutorial());
    $('btn-tut-skip').addEventListener('click', () => { this.audio.uiClick(); this._stopTutorial(true); });

    // 回填
    applyDifficulty(this.settings.difficulty || 'veteran');
    document.querySelectorAll('#seg-graphics .seg').forEach((b) => b.classList.toggle('active', b.dataset.gfx === this.settings.gfx));
    document.querySelectorAll('#seg-assist .seg').forEach((b) => b.classList.toggle('active', (b.dataset.assist === '1') === !!this.settings.assist));
    document.querySelectorAll('#seg-view .seg').forEach((b) => b.classList.toggle('active', b.dataset.view === this.settings.view));
    document.querySelectorAll('#seg-feedback .seg').forEach((b) => b.classList.toggle('active', (b.dataset.fb === '1') === !!this.settings.feedback));
    vol.value = Math.round(this.settings.volume * 100);
    sens.value = Math.round(this.settings.sens * 100);
    // 关键：把已保存的音量真正写进 AudioContext 增益。
    // 此前只回填了滑块显示值，刷新页面后界面显示 20% 而实际仍按 70% 播放。
    this.audio.setVolume(this.settings.volume);

    // 暂停
    $('btn-resume').addEventListener('click', () => { this.audio.uiClick(); this._resume(); });
    $('btn-restart').addEventListener('click', () => { this.audio.uiClick(); hide('pause-panel'); this._startRun(); });
    $('btn-quit').addEventListener('click', () => { this.audio.uiClick(); hide('pause-panel'); this._toMenu(); });

    // 结算
    $('btn-again').addEventListener('click', () => { this.audio.uiClick(); hide('result-panel'); this._startRun(); });
    $('btn-result-menu').addEventListener('click', () => { this.audio.uiClick(); hide('result-panel'); this._toMenu(); });
  }

  _applyGraphics() {
    const mobile = this._isMobile();
    const preset = CONFIG.graphics.presets[this.settings.gfx];
    if (preset) {
      // 档位全部读取 CONFIG.graphics.presets（此前配置存在但行为硬编码）
      this._shadowsOn = preset.shadows;
      const target = this._dpr * preset.dprMul;
      this.renderer.setPixelRatio(clamp(target, CONFIG.performance.minPixelRatio, this._dpr));
    } else { // auto：按设备能力推导
      this._shadowsOn = !mobile;
      this.renderer.setPixelRatio(this._dpr);
    }
    this.renderer.shadowMap.enabled = this._shadowsOn;
    this.sun.castShadow = this._shadowsOn;
    this.player.root.traverse((o) => { if (o.isMesh) { o.castShadow = this._shadowsOn; o.receiveShadow = false; } });
    this.scene.traverse((o) => { if (o.isMesh && o.parent === this.scene) o.receiveShadow = this._shadowsOn && o.geometry.type === 'PlaneGeometry'; });
  }

  // 战场环境：只改光照/雾/地面色，不触碰任何战斗数值与配置
  _applyEnvironment(env) {
    const e = env || this.env || CONFIG.environments[0];
    this.env = e;
    this.scene.background = new THREE.Color(e.sky);
    this.scene.fog = new THREE.Fog(e.fog, e.fogNear, e.fogFar);
    this.hemi.color.setHex(e.hemiSky);
    this.hemi.groundColor.setHex(e.hemiGround);
    this.hemi.intensity = e.hemiInt;
    this.sun.color.setHex(e.sun);
    this.sun.intensity = e.sunInt;
    if (this.groundMat) this.groundMat.color.setHex(e.ground);
  }

  // ---------- 存档 ----------
  _loadRecords() {
    // 与默认值合并：缺失字段不会变成 undefined 污染结算面板
    const defaults = { bestWave: 0, bestScore: 0, bestTime: 0, totalKills: 0, totalRuns: 0, byDiff: {} };
    try {
      const raw = localStorage.getItem(CONFIG.records.storageKey);
      if (raw) {
        const merged = Object.assign(defaults, JSON.parse(raw));
        if (!merged.byDiff || typeof merged.byDiff !== 'object') merged.byDiff = {};
        return merged;
      }
    } catch (e) { /* 忽略 */ }
    return defaults;
  }

  _newRecords() {
    return { bestWave: 0, bestScore: 0, bestTime: 0, totalKills: 0, totalRuns: 0, byDiff: {} };
  }

  _saveRecords() {
    try { localStorage.setItem(CONFIG.records.storageKey, JSON.stringify(this.records)); } catch (e) { /* 忽略 */ }
  }

  _loadSettings() {
    // 与默认值合并：老版本存档没有 view 等新字段时不会读到 undefined
    const defaults = { gfx: 'auto', assist: true, volume: 0.7, sens: 1, view: 'tp', feedback: true, difficulty: 'veteran' };
    try {
      const raw = localStorage.getItem(CONFIG.records.settingsKey);
      if (raw) return Object.assign(defaults, JSON.parse(raw));
    } catch (e) { /* 忽略 */ }
    return defaults;
  }

  _saveSettings() {
    try { localStorage.setItem(CONFIG.records.settingsKey, JSON.stringify(this.settings)); } catch (e) { /* 忽略 */ }
  }

  _fillRecords() {
    const g = document.getElementById('records-grid');
    const r = this.records;
    const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    // 用 DOM 节点 + textContent 取代 innerHTML 拼接：
    // localStorage 反序列化值不再进入 HTML 解析流程（消除 self-XSS 面）
    const rows = [
      ['最远波次', r.bestWave], ['最高得分', r.bestScore],
      ['最长生存', fmtTime(r.bestTime)], ['出场次数', r.totalRuns],
      ['生涯击杀', r.totalKills], ['场均击杀', r.totalRuns ? Math.round(r.totalKills / r.totalRuns) : 0],
    ];
    g.textContent = '';
    for (const [label, val] of rows) {
      const card = document.createElement('div');
      card.className = 'record-card';
      const num = document.createElement('span');
      num.className = 'record-num';
      num.textContent = String(val);
      const lab = document.createElement('span');
      lab.className = 'record-label';
      lab.textContent = label;
      card.append(num, lab);
      g.append(card);
    }

    // 分难度最佳（三档各自独立记录）
    const dd = document.getElementById('records-diff');
    if (!dd) return;
    dd.textContent = '';
    const head = document.createElement('div');
    head.className = 'rd-head';
    head.textContent = '分难度最佳战绩';
    dd.append(head);
    for (const id of CONFIG.difficultyOrder) {
      const d = CONFIG.difficulty[id];
      const b = (r.byDiff && r.byDiff[id]) || { bestWave: 0, bestScore: 0, runs: 0 };
      const row = document.createElement('div');
      row.className = 'rd-row';
      const name = document.createElement('span');
      name.className = 'rd-name' + (id === 'hell' ? ' hell' : '');
      name.textContent = d.name;
      const stat = document.createElement('span');
      stat.className = 'rd-stat';
      stat.textContent = `最远 ${b.bestWave} 波 · 最高 ${b.bestScore} 分 · 出战 ${b.runs || 0} 局`;
      row.append(name, stat);
      dd.append(row);
    }
  }

  // ---------- 流程 ----------
  _startRun() {
    document.getElementById('menu').classList.remove('show');
    this.hud.show();
    clearTimeout(this._bossTimer);      // 丢弃上一局挂起的 boss 进场回调
    this._bossTimer = null;
    this.effects.reset();               // 清掉上一局残留的弹坑/预警圈/曳光
    this.hud.clearFeedback();           // 清掉上一局的击杀播报/飘字/低血红晕
    this.player.reset(0, 24);
    this.enemyMgr.reset();
    this.projectiles.reset();
    this.pickups.reset();
    this.waves.stop();
    this.waves.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.runTime = 0;
    this.chainCount = 0;
    this.chainTimer = 0;
    this.bestChain = 0;
    this._fpLookHold = 0;
    this._frameTimes.length = 0;
    this._framesSinceEval = 0;
    this.stats = this._newStats();

    // 难度：注入 WaveManager 并调整玩家容错（敌人数值在 waves 里按 diffCfg 计算）
    this.diffCfg = CONFIG.difficulty[this.settings.difficulty] || CONFIG.difficulty.veteran;
    this.waves.setDifficulty(this.diffCfg.id);
    this.player.maxHealth = Math.max(1, Math.round(CONFIG.player.maxHealth * this.diffCfg.playerHpMul));
    this.player.health = this.player.maxHealth;
    this.player.armorMax = Math.max(1, Math.round(CONFIG.player.maxArmor * this.diffCfg.playerArmorMul));
    this.player.armor = this.player.armorMax;

    // 战场环境：随机抽一种，尽量不与上一局重复
    this._pickEnvironment();

    // 主动技能与镜头
    this.abilityCd = 0;
    this._slowmo = 0;
    this._fovKick = 0;
    this._heartbeatT = 0;
    this.rerollsLeft = 0;
    this.hud.updateAbility(0);

    this.state = 'playing';
    this.audio.setVolume(this.settings.volume);
    this.audio.startBGM();
    this._applyGraphics();
    this._applyView();                  // 复位视角：模型可见性/相机 FOV/准星
    this.waves.startNext();
    this.hud.showPickup(`${this.diffCfg.name} · ${this.env.name}`);
    this._maybeStartTutorial();
  }

  _pickEnvironment() {
    const list = CONFIG.environments;
    let env = list[randInt(0, list.length - 1)];
    if (list.length > 1 && env === this.env) env = list[(list.indexOf(env) + 1) % list.length];
    this._applyEnvironment(env);
  }

  _toMenu() {
    this.state = 'menu';
    clearTimeout(this._bossTimer);
    this._bossTimer = null;
    this._exitPointerLock();
    this._stopTutorial(false);
    this.hud.hide();
    this.hud.hideBossBar();
    this.hud.setLowHp(false);
    this.waves.stop();
    this.audio.stopBGM();
    document.getElementById('menu').classList.add('show');
  }

  // ---------- 新手引导 ----------
  // 首次进入战斗时分步提示；步骤由"是否真的做了这个动作"驱动，也可手动下一步/跳过。
  _tutorialSeen() {
    if (this._tutSeenCache) return true;
    // 读不到（file:// 下部分浏览器禁用 localStorage）就当作没看过：
    // 宁可多提示一次，也不要因为异常而对新玩家永远不提示。
    try { return localStorage.getItem('tankwar_tutorial_v1') === '1'; } catch (e) { return false; }
  }

  _markTutorialSeen() {
    this._tutSeenCache = true;   // 本次会话内一定记住
    try { localStorage.setItem('tankwar_tutorial_v1', '1'); } catch (e) { /* 忽略 */ }
  }

  _tutSteps() {
    const mob = this._isMobile();
    return [
      {
        title: '① 驾驶', mobDesc: '用<b>左侧摇杆</b>推动坦克前进。',
        desc: '用 <b>W A S D</b>（或方向键）驾驶坦克。',
        ok: () => this._tutState.moved > 3,
      },
      {
        title: '② 瞄准', mobDesc: '用<b>右侧摇杆</b>推方向，炮塔随之转向。',
        desc: '移动鼠标即可转动炮塔，<b>准星所指就是弹着点</b>。',
        ok: () => this._tutState.aimed,
      },
      {
        title: '③ 开火', mobDesc: '点右下角<b>开火键</b>，弹夹 5 发打空自动装填。',
        desc: '按<b>鼠标左键</b>或空格开炮，弹夹 5 发打空自动装填。',
        ok: () => this.stats.shotsFired > 0,
      },
      {
        title: '④ 视角 · 技能 · 强化',
        mobDesc: '按 <b>V</b>（或顶部 FP 键）切第一人称；<b>EMP</b> 键放大招。',
        desc: '按 <b>V</b> 切第一人称炮塔视角，<b>Q</b> 释放电磁脉冲。清空一波后可<b>三选一</b>强化，不满意能重掷。',
        ok: () => false, manual: true,
      },
    ];
  }

  _maybeStartTutorial() {
    if (this._tutorialSeen()) return;
    this.tutorial.active = true;
    this.tutorial.step = 0;
    this._tutState = { moved: 0, aimed: false };
    this._renderTutorial();
  }

  _renderTutorial() {
    const steps = this._tutSteps();
    const st = steps[this.tutorial.step];
    if (!st) { this._stopTutorial(true); return; }
    const box = document.getElementById('tutorial');
    if (!box) return;
    box.classList.remove('hidden');
    document.getElementById('tut-step').textContent = `${this.tutorial.step + 1} / ${steps.length}`;
    document.getElementById('tut-title').textContent = st.title;
    // 文案来自本文件内置字面量，不含任何外部输入
    document.getElementById('tut-desc').innerHTML = this._isMobile() ? st.mobDesc : st.desc;
    document.getElementById('btn-tut-next').textContent =
      this.tutorial.step === steps.length - 1 ? '开始作战' : '下一步';
  }

  _advanceTutorial() {
    this.tutorial.step++;
    if (this.tutorial.step >= this._tutSteps().length) { this._stopTutorial(true); return; }
    this.audio.uiClick();
    this._renderTutorial();
  }

  _stopTutorial(persist) {
    const box = document.getElementById('tutorial');
    if (box) box.classList.add('hidden');
    if (this.tutorial.active && persist) this._markTutorialSeen();
    this.tutorial.active = false;
  }

  _tickTutorial() {
    if (!this.tutorial.active) return;
    const st = this._tutSteps()[this.tutorial.step];
    if (!st) { this._stopTutorial(true); return; }
    if (!st.manual && st.ok()) this._advanceTutorial();
  }

  _openPause() {
    if (this.state !== 'playing') return;
    this.state = 'pause';
    this._exitPointerLock();
    document.getElementById('pause-panel').classList.add('show');
  }

  _resume() {
    if (this.state !== 'pause') return;
    this.state = 'playing';
    document.getElementById('pause-panel').classList.remove('show');
    this.audio.resumeIfNeeded();
    // 同 _applyView：恢复时不自动夺走鼠标，否则一回到战斗 HUD 就全点不动
    this._syncLockHint();
  }

  _endRun() {
    this.state = 'result';
    clearTimeout(this._bossTimer);
    this._bossTimer = null;
    this._exitPointerLock();
    this._stopTutorial(true);
    this.waves.stop();
    this.audio.stopBGM();
    this.audio.lose();
    this.hud.hideBossBar();
    this.hud.setLowHp(false);
    this._slowmo = 0;
    this._fovKick = 0;

    // 殉爆演出 + 隐藏玩家
    this.effects.explosion(this.player.position.clone().setY(1.2), 2.6, { big: true });
    this.audio.explosion(true);
    this.player.alive = false;
    this.player.root.visible = false;

    // 纪录：总档 + 当前难度分档
    const r = this.records;
    const wave = this.waves.wave;
    r.totalRuns++;
    r.totalKills += this.kills;
    const newWave = wave > r.bestWave;
    const newScore = this.score > r.bestScore;
    const newTime = this.runTime > r.bestTime;
    r.bestWave = Math.max(r.bestWave, wave);
    r.bestScore = Math.max(r.bestScore, this.score);
    r.bestTime = Math.max(r.bestTime, this.runTime);
    if (!r.byDiff) r.byDiff = {};
    const bucket = r.byDiff[this.diffCfg.id] || (r.byDiff[this.diffCfg.id] = { bestWave: 0, bestScore: 0, runs: 0 });
    bucket.runs++;
    const diffBest = wave > bucket.bestWave || this.score > bucket.bestScore;
    bucket.bestWave = Math.max(bucket.bestWave, wave);
    bucket.bestScore = Math.max(bucket.bestScore, this.score);
    this._saveRecords();

    // 结算文案
    const lines = CONFIG.endLines;
    const line = wave <= 3 ? lines.loseEarly : wave <= 7 ? lines.loseMid : lines.loseLate;
    document.getElementById('result-line').textContent = line;
    document.getElementById('result-wave').textContent = wave;
    document.getElementById('result-score').textContent = this.score;
    document.getElementById('result-kills').textContent = this.kills;
    const mm = Math.floor(this.runTime / 60), ss = String(Math.floor(this.runTime % 60)).padStart(2, '0');
    document.getElementById('result-time').textContent = `${mm}:${ss}`;
    const cause = this.player.lastHitBy || '战线终点';
    document.getElementById('result-death').textContent = `死因：${cause}`;

    // ---- 详细战报 ----
    const s = this.stats;
    const acc = s.shotsFired > 0 ? Math.round(s.shotsHit / s.shotsFired * 100) : 0;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('result-acc', `${acc}%`);
    set('result-chain', this.bestChain);
    set('result-dealt', Math.round(s.damageDealt));
    set('result-taken', Math.round(s.damageTaken));
    const ctx = document.getElementById('result-context');
    if (ctx) {
      ctx.textContent = '';
      const b1 = document.createElement('b');
      b1.textContent = this.diffCfg.name;
      const b2 = document.createElement('b');
      b2.textContent = this.env ? this.env.name : '未知战场';
      ctx.append('难度 ', b1, ' · 战场 ', b2, ` · 主炮 ${s.shotsFired} 发 / 命中 ${s.shotsHit}`);
    }
    // 本局强化构成
    const up = document.getElementById('result-upgrades');
    if (up) {
      up.textContent = '';
      const owned = CONFIG.upgrades.cards.filter((c) => (this.player.upgradeLevels[c.id] || 0) > 0);
      if (owned.length === 0) {
        const chip = document.createElement('span');
        chip.className = 'ru-chip';
        chip.textContent = '本局未获取强化';
        up.append(chip);
      } else {
        for (const c of owned) {
          const chip = document.createElement('span');
          chip.className = 'ru-chip';
          const t = document.createElement('b');
          t.textContent = c.title;
          chip.append(t, ` ×${this.player.upgradeLevels[c.id]}`);
          up.append(chip);
        }
      }
    }

    const bestParts = [];
    if (newWave) bestParts.push('最远波次 ★');
    if (newScore) bestParts.push('最高得分 ★');
    if (newTime) bestParts.push('最长生存 ★');
    if (diffBest) bestParts.push(`${this.diffCfg.name}档纪录 ★`);
    document.getElementById('result-best').textContent = bestParts.length ? `新纪录！${bestParts.join(' · ')}` : '';

    setTimeout(() => document.getElementById('result-panel').classList.add('show'), 900);
  }

  // ---------- 强化三选一 ----------
  _openUpgradePick() {
    const pool = CONFIG.upgrades.cards.filter((c) => (this.player.upgradeLevels[c.id] || 0) < c.max);
    if (pool.length === 0) {
      // 卡池取空：走 WaveManager 的显式接口（不再跨模块直写 state），并给出提示
      this.hud.showPickup('强化已全部满级 · 直接进入下一波');
      this.waves.skipToCleared();
      return;
    }
    this.rerollsLeft = CONFIG.upgrades.rerolls;
    this.upgradeTimer = CONFIG.upgrades.pickDuration;
    this.upgradeOpen = true;
    this.state = 'upgrade';
    this._drawUpgradeCards();
    document.getElementById('upgrade-panel').classList.add('show');
    this._syncUpgradeButtons();
  }

  // 抽卡并渲染（重掷复用同一入口）。用 DOM 构建而非 innerHTML 拼接，与存档改造保持一致。
  _drawUpgradeCards() {
    const bag = CONFIG.upgrades.cards.filter((c) => (this.player.upgradeLevels[c.id] || 0) < c.max);
    const cards = [];
    while (cards.length < 3 && bag.length > 0) {
      cards.push(bag.splice(randInt(0, bag.length - 1), 1)[0]);
    }
    this.upgradeCards = cards;
    const wrap = document.getElementById('upgrade-cards');
    wrap.textContent = '';
    cards.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = `up-card rarity-${c.rarity}`;
      el.dataset.i = String(i);
      const rar = document.createElement('div');
      rar.className = 'up-rarity';
      rar.textContent = c.rarity === 'epic' ? '史诗' : c.rarity === 'rare' ? '稀有' : '普通';
      const title = document.createElement('div');
      title.className = 'up-title';
      title.textContent = c.title;
      const desc = document.createElement('div');
      desc.className = 'up-desc';
      desc.textContent = c.desc;
      const lv = document.createElement('div');
      lv.className = 'up-lv';
      lv.textContent = `当前等级 ${this.player.upgradeLevels[c.id] || 0} / ${c.max}`;
      el.append(rar, title, desc, lv);
      el.addEventListener('click', () => this._pickUpgrade(i));
      wrap.append(el);
    });
  }

  _syncUpgradeButtons() {
    const rb = document.getElementById('btn-reroll');
    const left = document.getElementById('reroll-left');
    if (left) left.textContent = String(this.rerollsLeft);
    if (rb) {
      rb.classList.toggle('disabled', this.rerollsLeft <= 0);
      rb.disabled = this.rerollsLeft <= 0;
    }
    const sr = document.getElementById('skip-reward');
    if (sr) sr.textContent = String(Math.round(CONFIG.upgrades.skipScore * this.diffCfg.scoreMul));
  }

  _rerollUpgrade() {
    if (!this.upgradeOpen || this.rerollsLeft <= 0) return;
    this.rerollsLeft--;
    this.audio.reroll();
    this.upgradeTimer = CONFIG.upgrades.pickDuration;   // 重掷后重新计时，避免刚换完就被自动选走
    this._drawUpgradeCards();
    this._syncUpgradeButtons();
  }

  _skipUpgrade() {
    if (!this.upgradeOpen) return;
    const U = CONFIG.upgrades;
    const gain = Math.round(U.skipScore * this.diffCfg.scoreMul);
    this.upgradeOpen = false;
    this.score += gain;
    this.player.armor = Math.min(this.player.armorMax, this.player.armor + U.skipArmor);
    this.audio.upgradePick();
    this.hud.showPickup(`跳过强化 · +${gain} 分 · 装甲 +${U.skipArmor}`);
    document.getElementById('upgrade-panel').classList.remove('show');
    this.state = 'playing';
  }

  _pickUpgrade(i) {
    if (!this.upgradeOpen) return;
    const card = this.upgradeCards[i];
    this.upgradeOpen = false;
    this.player.applyUpgrade(card);
    this.audio.upgradePick();
    this.hud.showPickup(`强化生效：${card.title}`);
    document.getElementById('upgrade-panel').classList.remove('show');
    this.state = 'playing';
  }

  _tickUpgrade(dt) {
    this.upgradeTimer -= dt;
    document.getElementById('upgrade-timer').textContent = `${Math.ceil(Math.max(0, this.upgradeTimer))} 秒后自动选择`;
    if (this.upgradeTimer <= 0) {
      this._pickUpgrade(randInt(0, this.upgradeCards.length - 1));
    }
  }

  _tickLowHp(dt) {
    const p = this.player;
    const low = p.alive && p.health < p.maxHealth * CONFIG.feedback.lowHpRatio;
    this.hud.setLowHp(low);
    if (!low) { this._heartbeatT = 0; return; }
    this._heartbeatT -= dt;
    if (this._heartbeatT <= 0) {
      this._heartbeatT = CONFIG.feedback.heartbeat;
      this.audio.heartbeat();
    }
  }

  _baseFov() { return this.settings.view === 'fp' ? CONFIG.view.fp.fov : CONFIG.fov; }

  // ---------- 主循环 ----------
  _loop() {
    requestAnimationFrame(this._loop);
    const rawDt = this.clock.getDelta();
    const t0 = performance.now();

    if (this.state === 'playing' || this.state === 'upgrade') {
      let dt = Math.min(rawDt, 0.05);
      // 慢镜：只缩放置游戏时间。rawDt 不参与缩放，帧率采样与 runTime 口径保持真实
      if (this._slowmo > 0) {
        this._slowmo -= rawDt;
        dt *= this._slowmoScale;
        if (this._slowmo <= 0) this._slowmoScale = 1;
      }
      if (this.state === 'playing') {
        this.runTime += dt;
        this.chainTimer -= dt;
        this.abilityCd = Math.max(0, this.abilityCd - dt);

        this._gatherInput(dt);
        const fp = this.settings.view === 'fp';
        this.player.update(dt, this, {
          moveX: this.moveX,
          moveZ: this.moveZ,
          aimDir: this._aimDir,
          firing: this.firing,
          fp,
          lookYaw: fp && this._fpLook ? this._fpLook.yaw : 0,
          lookPitch: fp && this._fpLook ? this._fpLook.pitch : 0,
        });

        this.waves.update(dt, this);
        this.enemyMgr.update(dt, this);
        this.projectiles.update(dt, this);
        this.pickups.update(dt, this);

        // boss 血条随 boss 存活自动隐藏
        if (!this.enemyMgr.hasBoss()) this.hud.hideBossBar();

        if (this.chainTimer <= 0) this.chainCount = 0;
        // 引导进度：累计实际位移（>3m 视为"会开了"）
        if (this.tutorial.active) {
          this._tutState.moved += Math.hypot(this.player.velocity.x, this.player.velocity.z) * dt;
          this._tickTutorial();
        }
        this._tickLowHp(dt);
        this.hud.update(this.player, this.waves.wave, this.waves.theme ? this.waves.theme.name : '', this.score, this.kills);
        this.hud.updateAbility(this.abilityCd);
        this.hud.drawRadar(this.player, this.enemyMgr.active, this.pickups.active, this.incomingAngle, t0);
      } else {
        this._tickUpgrade(dt);
      }
      this.effects.update(dt);
      this.hud.tickFeedback(dt, this.camera);
      this._updateCamera(dt);
    }

    // 菜单/暂停/结算：降频渲染（10FPS），省电
    let render = true;
    if (this.state === 'menu' || this.state === 'pause' || this.state === 'result') {
      this._idleAcc += rawDt;
      if (this._idleAcc < CONFIG.idleRenderInterval / 1000) render = false;
      else this._idleAcc = 0;
    }
    if (render) this.renderer.render(this.scene, this.camera);

    // 自动降档（仅 playing 采样）
    if (this.state === 'playing') {
      // 只采样"整帧墙钟间隔"：原先把本帧 CPU 耗时与墙钟相加，再去和 dprDegradeMs 比较，
      // 阈值语义被污染（CPU 越快越容易误判为流畅）。
      this._frameTimes.push(rawDt * 1000);
      if (this._frameTimes.length > 60) this._frameTimes.shift();
      if (++this._framesSinceEval >= CONFIG.performance.evaluateEveryFrames) {
        this._framesSinceEval = 0;
        const avg = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
        if (avg > CONFIG.performance.dprDegradeMs && this._dpr > CONFIG.performance.minPixelRatio && this.settings.gfx === 'auto') {
          this._dpr = Math.max(CONFIG.performance.minPixelRatio, this._dpr - CONFIG.performance.pixelRatioStep);
          this.renderer.setPixelRatio(this._dpr);
        }
        this._frameTimes.length = 0;
      }
    }
  }

  // ---------- 相机 ----------
  _updateCamera(dt) {
    const p = this.player.position;
    const s = this.effects.shakeAmt;
    const sx = s > 0 ? rand(-s, s) * 0.5 : 0;
    const sy = s > 0 ? rand(-s, s) * 0.3 : 0;
    // 镜头冲击（Boss 入场 / 击破）：临时拉近 FOV 后自动回落。
    // 只改 fov，不调 _applyView —— 后者会把第一人称视角重置回炮塔朝向，造成画面跳变。
    if (this._fovKick > 0.01) {
      this._fovKick = Math.max(0, this._fovKick - dt * 14);
      const want = this._baseFov() - this._fovKick;
      if (Math.abs(this.camera.fov - want) > 0.01) {
        this.camera.fov = want;
        this.camera.updateProjectionMatrix();
      }
    } else if (this._fovKick !== 0) {
      this._fovKick = 0;
      const base = this._baseFov();
      if (Math.abs(this.camera.fov - base) > 0.01) {
        this.camera.fov = base;
        this.camera.updateProjectionMatrix();
      }
    }
    // 太阳跟随（阴影范围贴着玩家）——两种视角共用
    this.sun.position.set(p.x + 40, 60, p.z + 25);
    this.sun.target.position.set(p.x, 0, p.z);

    if (this.settings.view === 'fp') {
      // 第一人称：视点挂在炮塔上，朝向 = 炮塔 yaw + 炮口俯仰，因此"准星所指即炮口所向"
      const F = CONFIG.view.fp;
      const yaw = this.player.turretYaw;
      const pitch = this.player.gunPitch;
      const cp = Math.cos(pitch);
      const fx = Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = Math.cos(yaw) * cp;
      // 行进起伏（悬挂感）：速度越快、颠簸越明显
      const spd = Math.hypot(this.player.velocity.x, this.player.velocity.z);
      const spdT = clamp(spd / (CONFIG.player.speed * this.player.mods.speedMul || 1), 0, 1);
      this._fpBob = (this._fpBob || 0) + dt * (4 + spdT * 10);
      const bob = Math.sin(this._fpBob) * F.bobAmp * spdT;
      const ex = p.x - Math.sin(yaw) * F.eyeBack;
      const ez = p.z - Math.cos(yaw) * F.eyeBack;
      const ey = F.eyeHeight + bob;
      this.camera.position.set(ex + sx, ey + sy * 0.5, ez);
      this.camera.lookAt(ex + fx * 24, ey + fy * 24, ez + fz * 24);
      return;
    }

    // 预判：镜头朝炮塔方向轻微偏移
    const look = this.player.turretYaw;
    const targetX = p.x + Math.sin(look) * CONFIG.lookAhead;
    const targetZ = p.z + Math.cos(look) * CONFIG.lookAhead;
    const k = Math.min(1, CONFIG.cameraLerp * dt);
    this._camX = lerp(this._camX ?? targetX, targetX, k);
    this._camZ = lerp(this._camZ ?? targetZ, targetZ, k);

    this.camera.position.set(this._camX + sx, CONFIG.cameraHeight, this._camZ + CONFIG.cameraBack + sy);
    this.camera.lookAt(this._camX, 0, this._camZ - 4);
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
