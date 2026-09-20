// enemies.js —— 敌方单位：AI 状态机 + 对象池管理
// 地面：tank(轻坦保持距离射击) / buggy(自爆冲锋) / heavy(重坦碾压+双炮)
//       artillery(远程抛射落点预警)
// 空中：jet(喷气机直线掠袭打火箭) / bomber(临空投弹) / gunship(浮空炮艇 boss)
// 全部对象池复用；精英/老练用头顶色标区分（共享材质不可实例化染色）。

// 归因给玩家的伤害来源（用于战报统计与飘字过滤）
const ENEMY_PLAYER_SOURCES = ['主炮', '主炮 · 暴击', '溅射', '机枪', '导弹', '撞角', '电磁脉冲', '燃烧', '殉爆'];
const isPlayerSource = (s) => ENEMY_PLAYER_SOURCES.indexOf(s) >= 0;
// 播报条里的武器名（去掉"主炮 · 暴击"这类修饰）
const feedSourceName = (s) => String(s || '战损').split(' · ')[0];

class Enemy {
  constructor(model) {
    this.root = model.root;
    this.turret = model.turret || null;
    this.muzzle = model.muzzle || null;
    this.barrel = model.barrel || null;
    this.model = model;
    this.velocity = new THREE.Vector3();
    this.alive = false;
    this.isAir = false;
    this.kind = 'tank';
  }

  // 从池里唤醒（world 供空中单位初始化航线）
  activate(kind, x, z, tier, waveScale, cfg, world) {
    this.kind = kind;
    this.tier = tier;
    this.isAir = ['jet', 'bomber', 'gunship'].includes(kind);
    // cfg 是整张敌人配置表：必须按 kind 二次取表，否则拿到的是 cfg.altitude = undefined
    const table = cfg || CONFIG.enemies;
    const base = table[kind] || CONFIG.enemies[kind];
    this.baseCfg = base;
    const tierCfg = CONFIG.enemyTiers[tier] || CONFIG.enemyTiers[0];
    this.maxHp = Math.round(base.hp * tierCfg.hpMul * waveScale.hp);
    this.hp = this.maxHp;
    this.speed = base.speed * tierCfg.speedMul * waveScale.speed;
    this.score = Math.round(base.score * tierCfg.scoreMul);
    this.radius = base.radius;
    this.alive = true;
    this.position = this.root.position;
    // 空中单位高度兜底：任何配置缺失都退回 0 而不是 undefined（undefined 会污染 position.y 成 NaN）
    const alt = Number.isFinite(base.altitude) ? base.altitude : 0;
    // 陆地单位显式置 0：避免 altitude 长期为 undefined，被下游 Number.isFinite 判成"坏值"
    this.altitude = this.isAir ? alt : 0;
    this.position.set(x, this.altitude, z);
    this.velocity.set(0, 0, 0);
    this.root.visible = true;
    this.root.scale.set(1, 1, 1);
    this.deadThisFrame = false;

    // 头顶阶层色标
    if (!this._tierMark) {
      const geo = new THREE.OctahedronGeometry(0.42, 0);
      this._tierMark = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      this.root.add(this._tierMark);
    }
    this._tierMark.visible = tier > 0;
    if (tier > 0) {
      this._tierMark.position.y = kind === 'gunship' ? 3.4 : 3.1;
      this._tierMark.material.color.setHex(tierCfg.tint);
    }

    this.state = 'idle';
    this.stateTimer = 0;
    this.fireTimer = rand(0.6, 1.6);   // 开场留反应窗口
    this.fuseTimer = -1;
    this.ramTimer = 0;
    this._hitFlash = 0;
    // 燃烧 DoT / 电磁脉冲瘫痪（池化复用必须逐次复位，否则上一局的状态会残留）
    this.burnTime = 0;
    this.burnDps = 0;
    this.stunTime = 0;
  }

  takeDamage(amount, source, world) {
    if (!this.alive) return;
    const P = world ? world.player : null;
    // 破甲装药：对精英/老练目标增伤（按受击目标阶层判定，故不能烘焙进炮弹伤害）
    if (P && this.tier > 0 && isPlayerSource(source)) amount *= P.mods.apMul;
    const before = this.hp;
    this.hp -= amount;
    this._hitFlash = 0.1;

    // 战报统计：只记玩家造成的伤害，且不超过目标剩余血量（避免溢出虚高）
    if (world && world.stats && isPlayerSource(source)) {
      world.stats.damageDealt += Math.min(amount, Math.max(0, before));
    }
    // 燃烧战斗部：主炮直击命中即点燃（溅射不点燃）
    if (P && P.mods.burn > 0 && source.indexOf('主炮') === 0) {
      const C = CONFIG.player.cannon;
      this.burnTime = C.burnTime;
      this.burnDps = amount * C.burnRatio * P.mods.burn;
    }

    const lethal = this.hp <= 0;
    // 反馈层：飘字与命中标记。机枪（11 发/秒）与燃烧（每帧）不做飘字，否则刷屏
    if (world && world.hud && CONFIG.feedback) {
      if (CONFIG.feedback.numberSources.indexOf(source) >= 0) {
        world.hud.spawnDamage(this.position, Math.min(amount, Math.max(1, before)), {
          crit: source.indexOf('暴击') >= 0, kill: lethal,
        });
      }
      if (CONFIG.feedback.markerSources.indexOf(source) >= 0) world.hud.hitMarker(lethal);
    }

    if (lethal) this.die(world, source);
    else if (Math.random() < 0.5) {
      world.effects.sparkBurst(this.position, 5, 0xffd080);
    }
  }

  die(world, source) {
    if (!this.alive) return;
    this.alive = false;
    this.root.visible = false;
    const big = this.kind === 'gunship' || this.kind === 'heavy' || this.kind === 'bomber';
    world.effects.explosion(this.position, big ? 2.2 : 1.3, { big });
    world.audio.explosion(big);
    if (world.hud) world.hud.pushKill(feedSourceName(source), this.kind, this.tier);
    if (this.kind === 'gunship') {
      // boss 击破：慢镜演出（由 Game 接管时间缩放）
      if (world.onBossDown) world.onBossDown(this);
      // boss 连环殉爆（重开/退出后不再补炸新局地面）
      for (let i = 0; i < 4; i++) {
        const p = this.position.clone().add(new THREE.Vector3(rand(-2.5, 2.5), rand(-1, 1), rand(-2.5, 2.5)));
        setTimeout(() => {
          if (world.state && world.state !== 'playing') return;
          world.effects.explosion(p, 1.4);
        }, 90 * (i + 1));
      }
    }
    world.onEnemyKilled(this, source);
  }

  // 通用：朝目标 yaw 平滑（含车体模型旋转）
  _turnTo(targetYaw, dt, rate) {
    this.root.rotation.y = angleLerp(this.root.rotation.y, targetYaw, Math.min(1, rate * dt));
  }

  // 炮塔朝向玩家（相对车体的角度），避免"炮口朝前、炮弹横飞"的视觉错位
  _aimTurret(world, dt, rate = 3.2) {
    if (!this.turret) return;
    const p = world.player.position;
    const want = Math.atan2(p.x - this.position.x, p.z - this.position.z) - this.root.rotation.y;
    this.turret.rotation.y = angleLerp(this.turret.rotation.y, want, Math.min(1, rate * dt));
  }

  _separate(world, dt) {
    // 邻居推挤（地面单位）：复用实例级缓冲，避免每帧每敌新建数组
    if (this.isAir) return;
    const buf = this._nnBuf || (this._nnBuf = []);
    const neighbors = world.queryNeighbors(this.position.x, this.position.z, this.radius * 2.2, buf);
    for (const o of neighbors) {
      if (o === this || !o.alive || o.isAir) continue;
      const dx = this.position.x - o.position.x;
      const dz = this.position.z - o.position.z;
      const d = Math.hypot(dx, dz) || 0.01;
      const minD = this.radius + o.radius;
      if (d < minD) {
        const push = (minD - d) / d * 0.5;
        const fx = world.collideCircle(this.position.x + dx * push, this.position.z + dz * push, this.radius);
        this.position.x = fx.x; this.position.z = fx.z;
      }
    }
  }

  update(dt, world) {} // 子类实现
}

// ---------- 轻坦：保持距离带游走 + 直射炮 ----------
class EnemyTank extends Enemy {
  update(dt, world) {
    const cfg = CONFIG.enemies.tank;
    const p = world.player.position;
    const dx = p.x - this.position.x, dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    const yaw = Math.atan2(dx, dz);
    this._turnTo(yaw, dt, 2.4);

    const [minD, maxD] = cfg.keepDist;
    let mvx = 0, mvz = 0;
    if (dist > maxD) { mvx = dx / dist; mvz = dz / dist; }
    else if (dist < minD) { mvx = -dx / dist * 0.7; mvz = -dz / dist * 0.7; }
    else {
      // 距离带内横向游走（绕打）
      const t = performance.now() * 0.0004 + this._strafeSeed;
      mvx = Math.cos(t) * 0.55 * (dz / dist);
      mvz = Math.cos(t) * 0.55 * (-dx / dist);
    }
    const nx = this.position.x + mvx * this.speed * dt;
    const nz = this.position.z + mvz * this.speed * dt;
    const fixed = world.collideCircle(nx, nz, this.radius);
    this.position.x = fixed.x; this.position.z = fixed.z;
    this._separate(world, dt);

    // 炮塔指向玩家 + 开火（需要视线）
    this._aimTurret(world, dt, 3.2);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && dist < maxD * 1.3 && world.hasLOS(this.position.x, this.position.z, p.x, p.z)) {
      this.fireTimer = cfg.shell.interval * rand(0.85, 1.2);
      const muzzlePos = this.muzzle.getWorldPosition(new THREE.Vector3());
      const lead = dist / cfg.shell.speed;
      const tx = p.x + world.player.velocity.x * lead;
      const tz = p.z + world.player.velocity.z * lead;
      const dir = new THREE.Vector3(tx - muzzlePos.x, 0, tz - muzzlePos.z).normalize();
      world.spawnEnemyShell(muzzlePos, dir, cfg.shell, this.position);
      world.audio.enemyShot(dist);
    }
  }
}
EnemyTank.prototype._strafeSeed = 0;

// ---------- 重坦：缓慢推进 + 重炮 + 接触碾压 ----------
class EnemyHeavy extends Enemy {
  update(dt, world) {
    const cfg = CONFIG.enemies.heavy;
    const p = world.player.position;
    const dx = p.x - this.position.x, dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    this._turnTo(Math.atan2(dx, dz), dt, 1.6);

    if (dist > 12) {
      const nx = this.position.x + dx / dist * this.speed * dt;
      const nz = this.position.z + dz / dist * this.speed * dt;
      const fixed = world.collideCircle(nx, nz, this.radius);
      this.position.x = fixed.x; this.position.z = fixed.z;
    }
    this._separate(world, dt);

    // 炮塔指向玩家
    this._aimTurret(world, dt, 1.8);

    // 接触碾压
    this.ramTimer -= dt;
    if (dist < this.radius + CONFIG.player.radius + 0.4 && this.ramTimer <= 0) {
      this.ramTimer = cfg.ramCooldown;
      world.damagePlayer(cfg.ramDamage, '重型碾压机甲');
      world.effects.shake(0.4);
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && dist < 34 && world.hasLOS(this.position.x, this.position.z, p.x, p.z)) {
      this.fireTimer = cfg.shell.interval * rand(0.9, 1.1);
      const muzzlePos = this.muzzle.getWorldPosition(new THREE.Vector3());
      const lead = dist / cfg.shell.speed;
      const dir = new THREE.Vector3(
        p.x + world.player.velocity.x * lead - muzzlePos.x, 0,
        p.z + world.player.velocity.z * lead - muzzlePos.z,
      ).normalize();
      world.spawnEnemyShell(muzzlePos, dir, cfg.shell, this.position);
      world.audio.enemyShot(dist);
    }
  }
}

// ---------- 自爆突袭车：直线冲锋 + 近距引信殉爆 ----------
class EnemyBuggy extends Enemy {
  update(dt, world) {
    const cfg = CONFIG.enemies.buggy;
    const p = world.player.position;
    const dx = p.x - this.position.x, dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    this._turnTo(Math.atan2(dx, dz), dt, 5);

    // 引信已点燃：继续冲，闪烁警示
    if (this.fuseTimer >= 0) {
      this.fuseTimer -= dt;
      this.root.visible = Math.floor(this.fuseTimer * 12) % 2 === 0;
      if (this.fuseTimer <= 0) this._detonate(world);
      return;
    }

    const nx = this.position.x + dx / dist * this.speed * dt;
    const nz = this.position.z + dz / dist * this.speed * dt;
    const fixed = world.collideCircle(nx, nz, this.radius);
    this.position.x = fixed.x; this.position.z = fixed.z;
    this._separate(world, dt);

    if (dist < cfg.fuseDist) {
      this.fuseTimer = cfg.fuseTime;
      world.audio._click(1200, 0.1, 0.1);
    }
  }

  _detonate(world) {
    const cfg = CONFIG.enemies.buggy;
    this.alive = false;
    this.root.visible = false;
    world.effects.explosion(this.position, 1.6, { big: true });
    world.audio.explosion(true);
    const d = dist2D(this.position.x, this.position.z, world.player.position.x, world.player.position.z);
    if (d < cfg.boomRadius + CONFIG.player.radius) {
      const dmg = cfg.boomDamage * (1 - world.player.blastResist) * (1 - d / (cfg.boomRadius + CONFIG.player.radius) * 0.4);
      world.damagePlayer(dmg, '自爆突袭车');
    }
    // 殉爆波及邻近敌人（连锁爽点）
    for (const o of world.enemies) {
      if (o !== this && o.alive && !o.isAir) {
        const od = dist2D(this.position.x, this.position.z, o.position.x, o.position.z);
        if (od < cfg.boomRadius) o.takeDamage(45, '殉爆', world);
      }
    }
    world.onEnemyKilled(this, '自爆');
  }
}

// ---------- 自行火炮：远距抛射，落点预警圈 ----------
class EnemyArtillery extends Enemy {
  update(dt, world) {
    const cfg = CONFIG.enemies.artillery;
    const p = world.player.position;
    const dx = p.x - this.position.x, dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    this._turnTo(Math.atan2(dx, dz), dt, 1.8);

    const [minD, maxD] = cfg.keepDist;
    if (dist < minD) {
      const nx = this.position.x - dx / dist * this.speed * dt;
      const nz = this.position.z - dz / dist * this.speed * dt;
      const fixed = world.collideCircle(nx, nz, this.radius);
      this.position.x = fixed.x; this.position.z = fixed.z;
    } else if (dist > maxD + 8) {
      const nx = this.position.x + dx / dist * this.speed * dt;
      const nz = this.position.z + dz / dist * this.speed * dt;
      const fixed = world.collideCircle(nx, nz, this.radius);
      this.position.x = fixed.x; this.position.z = fixed.z;
    }
    this._separate(world, dt);

    // 炮塔指向玩家 + 炮管仰起（用具名字段，不再依赖 children 索引）
    this._aimTurret(world, dt, 2.0);
    if (this.barrel) this.barrel.rotation.x = Math.PI / 2 - 0.5;

    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && dist > minD * 0.7) {
      this.fireTimer = cfg.shell.interval * rand(0.9, 1.15);
      const lead = cfg.shell.flightTime;
      const tx = clamp(p.x + world.player.velocity.x * lead * rand(0.75, 1.05), -CONFIG.arena.half, CONFIG.arena.half);
      const tz = clamp(p.z + world.player.velocity.z * lead * rand(0.75, 1.05), -CONFIG.arena.half, CONFIG.arena.half);
      world.spawnArcShell(this.position.clone().setY(1.8), new THREE.Vector3(tx, 0, tz), cfg.shell);
      world.audio.enemyShot(dist);
    }
  }
}

// ---------- 喷气战机：掠袭航线（approach → run → egress）----------
class EnemyJet extends Enemy {
  activate(kind, x, z, tier, waveScale, cfg, world) {
    super.activate(kind, x, z, tier, waveScale, cfg, world);
    this.state = 'approach';
    this._pickRun(world ? world.player.position : { x: 0, z: 0 });
    this.fireCount = 0;
    this.fireGap = 0;
  }

  _pickRun(p) {
    const cfg = this.baseCfg;
    this.altitude = cfg.altitude;
    // 掠袭航线：穿过玩家附近的直线
    const ang = Math.atan2(p.z - this.position.z, p.x - this.position.x) + rand(-0.5, 0.5);
    const half = cfg.runLength / 2;
    this.runStart = new THREE.Vector3(p.x - Math.cos(ang) * half, cfg.altitude, p.z - Math.sin(ang) * half);
    this.runDir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    this.runProgress = 0;
  }

  update(dt, world) {
    const cfg = CONFIG.enemies.jet;
    const p = world.player.position;

    if (this.state === 'approach') {
      const to = new THREE.Vector3().subVectors(this.runStart, this.position);
      to.y = 0;
      const d = to.length();
      if (d < 4) {
        this.state = 'run';
        this.runProgress = 0;
        world.audio.jetFlyby();
      } else {
        to.normalize();
        this.position.addScaledVector(to, this.speed * dt);
        this.root.rotation.y = Math.atan2(to.x, to.z);
        this.root.rotation.z = 0;
      }
    } else if (this.state === 'run') {
      const step = this.speed * dt;
      this.position.addScaledVector(this.runDir, step);
      this.runProgress += step;
      this.root.rotation.y = Math.atan2(this.runDir.x, this.runDir.z);
      this.root.rotation.z = 0;
      // 航线上接近玩家时打火箭
      const alongDist = Math.hypot(p.x - this.position.x, p.z - this.position.z);
      this.fireGap -= dt;
      if (alongDist < 22 && this.fireCount < cfg.rocket.count && this.fireGap <= 0) {
        this.fireGap = cfg.rocket.interval;
        this.fireCount++;
        const from = this.position.clone();
        const aim = new THREE.Vector3(
          p.x + world.player.velocity.x * 0.35 - from.x, 0.8 - from.y,
          p.z + world.player.velocity.z * 0.35 - from.z,
        ).normalize();
        world.spawnEnemyShell(from, aim, { damage: cfg.rocket.damage, speed: cfg.rocket.speed, splash: 1.6 }, this.position, true);
      }
      if (this.runProgress >= CONFIG.enemies.jet.runLength) {
        this.state = 'egress';
        this.egressTarget = new THREE.Vector3(
          clamp(p.x + rand(-70, 70), -95, 95), cfg.altitude,
          clamp(p.z + rand(-70, 70), -95, 95),
        );
        this.fireCount = 0;
      }
    } else { // egress
      const to = new THREE.Vector3().subVectors(this.egressTarget, this.position);
      to.y = 0;
      const d = to.length();
      if (d < 5) {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this._pickRun(p);
          this.state = 'approach';
          this.stateTimer = rand(cfg.cooldown[0], cfg.cooldown[1]);
        }
      } else {
        to.normalize();
        this.position.addScaledVector(to, this.speed * 0.75 * dt);
        this.root.rotation.y = Math.atan2(to.x, to.z);
        this.root.rotation.z = 0.35; // 转弯坡度
      }
    }
    this.root.position.y = this.altitude + Math.sin(performance.now() * 0.002 + this._bobSeed) * 0.4;
  }
}
EnemyJet.prototype._bobSeed = 0;

// ---------- 轰炸机：横穿战场临空投弹 ----------
class EnemyBomber extends Enemy {
  activate(kind, x, z, tier, waveScale, cfg, world) {
    super.activate(kind, x, z, tier, waveScale, cfg, world);
    this._newLine(world ? world.player.position : { x: 0, z: 0 });
    this.dropCount = 0;
    this.dropGap = 0;
  }

  _newLine(p) {
    const cfg = this.baseCfg;
    this.altitude = cfg.altitude;
    const ang = Math.random() * Math.PI * 2;
    const R = 90;
    this.position.set(p.x - Math.cos(ang) * R, cfg.altitude, p.z - Math.sin(ang) * R);
    this.lineDir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    this.lineDist = 0;
    this.maxLineDist = R * 2;
    this.dropArmed = false;
  }

  update(dt, world) {
    const cfg = CONFIG.enemies.bomber;
    const p = world.player.position;
    this.position.addScaledVector(this.lineDir, this.speed * dt);
    this.position.y = this.altitude;   // 显式维持巡航高度（否则受击抖动会逐帧累加）
    this.lineDist += this.speed * dt;
    this.root.rotation.y = Math.atan2(this.lineDir.x, this.lineDir.z);
    if (this.root.userData.props) {
      for (const prop of this.root.userData.props) prop.rotation.z += dt * 30;
    }

    const dist = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    // 预计飞临玩家上空 → 开始投弹序列
    if (!this.dropArmed && dist < 26) {
      this.dropArmed = true;
      this.dropCount = 0;
      this.dropGap = 0;
      world.audio.bombWhistle();
    }
    if (this.dropArmed && this.dropCount < cfg.bomb.count) {
      this.dropGap -= dt;
      if (this.dropGap <= 0) {
        this.dropGap = cfg.bomb.interval;
        this.dropCount++;
        const lead = cfg.bomb.fallTime;
        const tx = clamp(p.x + world.player.velocity.x * lead * rand(0.7, 1.1), -CONFIG.arena.half, CONFIG.arena.half);
        const tz = clamp(p.z + world.player.velocity.z * lead * rand(0.7, 1.1), -CONFIG.arena.half, CONFIG.arena.half);
        world.spawnBomb(new THREE.Vector3(tx, 0, tz), cfg.bomb, this.position.clone());
      }
    }
    if (this.lineDist >= this.maxLineDist) {
      this._newLine(p);
    }
  }
}

// ---------- 浮空炮艇 boss：环绕悬停 + 导弹齐射 ----------
class EnemyGunship extends Enemy {
  // 注意签名必须与基类一致（含 world）：否则后移的实参会被当成 cfg，导致 altitude = undefined
  activate(kind, x, z, tier, waveScale, cfg, world) {
    super.activate(kind, x, z, tier, waveScale, cfg, world);
    this.altitude = this.baseCfg.altitude;   // = CONFIG.enemies.gunship.altitude
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.salvoTimer = 2.5;
    this.missileCount = 0;
    this.missileGap = 0;
  }

  update(dt, world) {
    const cfg = CONFIG.enemies.gunship;
    const p = world.player.position;

    // 环绕玩家漂移，保持距离带
    const dx = p.x - this.position.x, dz = p.z - this.position.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    const [minD, maxD] = cfg.keepDist;
    this.orbitAngle += dt * 0.35;
    let mvx = Math.cos(this.orbitAngle) * 0.6;
    let mvz = Math.sin(this.orbitAngle) * 0.6;
    if (dist > maxD) { mvx += dx / dist * 0.8; mvz += dz / dist * 0.8; }
    else if (dist < minD) { mvx -= dx / dist * 0.8; mvz -= dz / dist * 0.8; }
    this.position.x += mvx * this.speed * dt;
    this.position.z += mvz * this.speed * dt;
    this.position.y = this.altitude + Math.sin(performance.now() * 0.0016) * 0.7;
    this.root.rotation.y = angleLerp(this.root.rotation.y, Math.atan2(dx, dz), Math.min(1, 2 * dt));

    // 旋翼动画
    if (this.root.userData.rotor) this.root.userData.rotor.rotation.y += dt * 22;
    if (this.root.userData.tailRotor) this.root.userData.tailRotor.rotation.x += dt * 30;

    // 导弹齐射
    this.salvoTimer -= dt;
    if (this.salvoTimer <= 0) {
      this.missileCount = 0;
      this.missileGap = 0;
      this.salvoTimer = cfg.missile.salvoInterval;
      this._salving = true;
    }
    if (this._salving) {
      this.missileGap -= dt;
      if (this.missileGap <= 0) {
        this.missileGap = cfg.missile.interval;
        this.missileCount++;
        const from = this.position.clone();
        from.y -= 1;
        const lead = dist / cfg.missile.speed;
        const dir = new THREE.Vector3(
          p.x + world.player.velocity.x * lead - from.x, 0.8 - from.y,
          p.z + world.player.velocity.z * lead - from.z,
        ).normalize();
        world.spawnEnemyShell(from, dir, { damage: cfg.missile.damage, speed: cfg.missile.speed, splash: 2.2 }, this.position, true);
        world.audio.missile();
        if (this.missileCount >= cfg.missile.count) this._salving = false;
      }
    }

    // 血条上报
    world.updateBossBar(this);
  }
}

// ---------- 管理器：池化 + 批量调度 ----------
class EnemyManager {
  constructor(scene, factory) {
    this.scene = scene;
    this.factory = factory;
    this.pools = { tank: [], buggy: [], heavy: [], artillery: [], jet: [], bomber: [], gunship: [] };
    this.active = [];
    // 简单空间哈希（用于分离推挤）
    this._cell = CONFIG.performance.spatialCellSize;
    this._cells = new Map();
  }

  _builders(kind) {
    switch (kind) {
      case 'tank': return this.factory.buildEnemyTank('tank');
      case 'buggy': return this.factory.buildBuggy();
      case 'heavy': return this.factory.buildEnemyTank('heavy');
      case 'artillery': return this.factory.buildEnemyTank('artillery');
      case 'jet': return this.factory.buildJet();
      case 'bomber': return this.factory.buildBomber();
      case 'gunship': return this.factory.buildGunship();
    }
  }

  _acquire(kind) {
    const pool = this.pools[kind];
    for (const e of pool) if (!e.alive) return e;
    const model = this._builders(kind);
    let e;
    switch (kind) {
      case 'tank': e = new EnemyTank(model); break;
      case 'buggy': e = new EnemyBuggy(model); break;
      case 'heavy': e = new EnemyHeavy(model); break;
      case 'artillery': e = new EnemyArtillery(model); break;
      case 'jet': e = new EnemyJet(model); break;
      case 'bomber': e = new EnemyBomber(model); break;
      case 'gunship': e = new EnemyGunship(model); break;
    }
    this.scene.add(e.root);
    pool.push(e);
    return e;
  }

  spawn(kind, x, z, tier, waveScale, world) {
    const e = this._acquire(kind);
    e.activate(kind, x, z, tier, waveScale, CONFIG.enemies, world || window.game);
    if (e instanceof EnemyTank) e._strafeSeed = Math.random() * 100;
    if (e instanceof EnemyJet) e._bobSeed = Math.random() * 100;
    this.active.push(e);
    return e;
  }

  countAlive() {
    let n = 0;
    for (const e of this.active) if (e.alive) n++;
    return n;
  }

  hasBoss() {
    for (const e of this.active) if (e.alive && e.kind === 'gunship') return e;
    return null;
  }

  _rebuildHash() {
    this._cells.clear();
    for (const e of this.active) {
      if (!e.alive || e.isAir) continue;
      const k = `${Math.floor(e.position.x / this._cell)},${Math.floor(e.position.z / this._cell)}`;
      let arr = this._cells.get(k);
      if (!arr) { arr = []; this._cells.set(k, arr); }
      arr.push(e);
    }
  }

  queryNeighbors(x, z, radius, out) {
    out = out || [];
    out.length = 0;
    const r = Math.ceil(radius / this._cell);
    const gx = Math.floor(x / this._cell), gz = Math.floor(z / this._cell);
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const arr = this._cells.get(`${gx + i},${gz + j}`);
        if (arr) for (const e of arr) out.push(e);
      }
    }
    return out;
  }

  update(dt, world) {
    this._rebuildHash();
    const invDt = dt > 0.0001 ? 1 / dt : 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (!e.alive) {
        this.active.splice(i, 1);
        continue;
      }
      // 记录移动前位置：所有敌方移动都是直写 position，velocity 必须在这里回填，
      // 否则自动瞄准的"预判提前量"永远乘 0（此前 velocity 只在激活时被置零）。
      const px = e.position.x, pz = e.position.z;
      if (e.stunTime > 0) {
        // 电磁脉冲瘫痪：不移动、不开火、不转向；空中单位原地悬停
        e.stunTime -= dt;
        if (e.isAir) e.position.y = e.altitude;
        if (Math.random() < dt * 12) world.effects.sparkBurst(e.position, 3, 0x66d0ff);
      } else {
        e.update(dt, world);
      }
      // 燃烧 DoT：每帧扣血，只做烟尘反馈（飘字交给 takeDamage 的来源过滤挡掉）
      if (e.burnTime > 0) {
        e.burnTime -= dt;
        e.takeDamage(e.burnDps * dt, '燃烧', world);
        if (Math.random() < dt * 6) world.effects.smokePuff(e.position);
      }
      const vlim = e.speed * 2;   // 航线重置/传送会造成瞬时尖峰，限幅避免提前量爆表
      e.velocity.x = clamp((e.position.x - px) * invDt, -vlim, vlim);
      e.velocity.z = clamp((e.position.z - pz) * invDt, -vlim, vlim);

      // 受击反馈：用缩放脉冲代替 y 轴抖动（position === root.position，写 y 会逐帧累加）
      if (e._hitFlash > 0) {
        e._hitFlash -= dt;
        const k = e._hitFlash > 0 ? Math.sin(e._hitFlash * 80) * 0.045 : 0;
        e.root.scale.set(1 + k, 1 + k, 1 + k);
      } else if (e.root.scale.x !== 1) {
        e.root.scale.set(1, 1, 1);
      }
    }
  }

  reset() {
    for (const e of this.active) {
      e.alive = false;
      e.root.visible = false;
    }
    this.active.length = 0;
  }
}

window.EnemyManager = EnemyManager;
