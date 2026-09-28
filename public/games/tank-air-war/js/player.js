// player.js —— 玩家坦克：移动物理 / 炮塔瞄准 / 主炮与防空机枪 / 强化应用 / 受损与护甲
// 坐标约定：地面 XZ 平面，本地 +Z 前向；yaw = atan2(dx, dz)；pitch > 0 为炮口上仰。
// 视角：tp=俯视跟随（默认）/ fp=第一人称炮塔视角；两种视角共用同一套炮口解算，
//       因此"准星指向哪里、炮弹就打向哪里"在两种视角下都成立。

class PlayerTank {
  constructor(scene, factory, effects, audio) {
    this.effects = effects;
    this.audio = audio;

    const model = factory.buildPlayerTank();
    this.model = model;
    this.root = model.root;
    this.hullGroup = model.hullGroup;
    this.turret = model.turret;
    this.gunPivot = model.gunPivot;
    this.muzzle = model.muzzle;
    this.mgPivot = model.mgPivot;
    this.missilePods = model.missilePods;
    this.trackBaseY = model.trackBaseY;
    scene.add(this.root);

    this.position = this.root.position;
    this.velocity = new THREE.Vector3();
    this.hullYaw = 0;
    this.turretYaw = 0;
    this.gunPitch = 0;
    this.mgYaw = 0;
    this.viewMode = 'tp';

    this.alive = true;
    this.maxHealth = CONFIG.player.maxHealth;
    this.health = this.maxHealth;
    this.armorMax = CONFIG.player.maxArmor;
    this.armor = this.armorMax;

    // 主炮状态
    this.clip = CONFIG.player.cannon.clipSize;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.recoil = 0;

    // 机枪状态
    this.mgHeat = 0;
    this.mgLocked = false;
    this.mgLockTimer = 0;
    this.mgCooldown = 0;
    this.mgTarget = null;

    // 导弹巢 / 撞角
    this.missileTimer = 0;
    this.ramTimer = 0;

    // 强化等级表：cardId → 层数
    this.upgradeLevels = {};
    // 强化后的乘算属性
    this.mods = {
      damageMul: 1, rateMul: 1, splashMul: 1, projectiles: 0, pierce: 0,
      clipAdd: 0, mgMul: 1, speedMul: 1, missilePod: 0, ram: 0, shellSpeedMul: 1,
      crit: 0, apMul: 1, burn: 0, vamp: 0, shield: 0, magnet: 0,
    };

    // 反应装甲：已充能层数 / 下一层的充能计时
    this.shieldCharges = 0;
    this.shieldTimer = 0;
    this.shieldFlash = 0;

    this.aimTarget = null;   // 本帧解算出的瞄准目标（供 HUD / 视角复用）
    this.lastHitBy = null;   // 死因记录
    this.lastDamageBlocked = false; // 上一次受击是否被反应装甲格挡
    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
  }

  get clipSize() { return CONFIG.player.cannon.clipSize + this.mods.clipAdd; }
  get shellSpeed() { return CONFIG.player.cannon.speed * this.mods.shellSpeedMul; }

  reset(x, z) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.hullYaw = Math.PI;      // 朝向 -Z? 初始朝 +Z，玩家出生面向场地中心即可
    this.turretYaw = this.hullYaw;
    this.gunPitch = 0;
    this.alive = true;
    this.maxHealth = CONFIG.player.maxHealth;
    this.health = this.maxHealth;
    this.armorMax = CONFIG.player.maxArmor;
    this.armor = this.armorMax;
    this.clip = this.clipSize;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.mgHeat = 0;
    this.mgLocked = false;
    this.mgLockTimer = 0;
    this.missileTimer = 0;
    this.ramTimer = 0;
    this.aimTarget = null;
    this.upgradeLevels = {};
    Object.assign(this.mods, {
      damageMul: 1, rateMul: 1, splashMul: 1, projectiles: 0, pierce: 0,
      clipAdd: 0, mgMul: 1, speedMul: 1, missilePod: 0, ram: 0, shellSpeedMul: 1,
      crit: 0, apMul: 1, burn: 0, vamp: 0, shield: 0, magnet: 0,
    });
    this.shieldCharges = 0;
    this.shieldTimer = 0;
    this.shieldFlash = 0;
    this.missilePods.visible = false;
    this.root.rotation.set(0, this.hullYaw, 0);
    this.turret.rotation.y = 0;
    this.gunPivot.rotation.x = 0;
    this.lastHitBy = null;
    this.lastDamageBlocked = false;
    this.syncVisibility();
  }

  // ---------- 视角 ----------
  setViewMode(mode) {
    this.viewMode = mode === 'fp' ? 'fp' : 'tp';
    this.syncVisibility();
  }

  // 第一人称隐藏车体与履带（避免近裁剪穿模），保留炮塔/炮管作为炮手视野参照
  syncVisibility() {
    this.hullGroup.visible = this.viewMode !== 'fp';
    this.root.visible = this.alive;
  }

  // ---------- 强化 ----------
  applyUpgrade(card) {
    this.upgradeLevels[card.id] = (this.upgradeLevels[card.id] || 0) + 1;
    switch (card.key) {
      case 'damageMul': this.mods.damageMul *= card.value; break;
      case 'rateMul': this.mods.rateMul *= card.value; break;
      case 'splashMul': this.mods.splashMul *= card.value; break;
      case 'projectiles': this.mods.projectiles += card.value; break;
      case 'pierce':
        this.mods.pierce += card.value;
        // 磁轨加速：贯穿 + 弹速同步提档（卡面承诺的 "+35% 弹速"）
        this.mods.shellSpeedMul *= CONFIG.upgrades.railSpeedMul;
        break;
      case 'clipAdd':
        this.mods.clipAdd += card.value;
        this.clip = this.clipSize;
        break;
      case 'mgMul': this.mods.mgMul *= card.value; break;
      case 'speedMul': this.mods.speedMul *= card.value; break;
      case 'missilePod':
        this.mods.missilePod += card.value;
        this.missilePods.visible = true;
        break;
      case 'ram': this.mods.ram += card.value; break;
      case 'crit': this.mods.crit += card.value; break;
      case 'apMul': this.mods.apMul *= card.value; break;
      case 'burn': this.mods.burn += card.value; break;
      case 'vamp': this.mods.vamp += card.value; break;
      case 'magnet': this.mods.magnet += card.value; break;
      case 'shield':
        this.mods.shield += card.value;
        // 拿卡立即充能一层，避免"拿了没感觉"
        this.shieldCharges = Math.min(this.mods.shield, this.shieldCharges + 1);
        if (this.shieldTimer <= 0) this.shieldTimer = CONFIG.player.shieldRecharge;
        break;
      case 'armorMax':
        this.armorMax += card.value;
        this.armor = this.armorMax;
        break;
      case 'heal':
        this.health = Math.min(this.maxHealth, this.health + this.maxHealth * card.value);
        break;
    }
  }

  // ---------- 受损 ----------
  takeDamage(amount, source) {
    if (!this.alive) return false;
    this.lastHitBy = source;
    this.lastDamageBlocked = false;
    // 反应装甲：一层护盾完整格挡一次伤害（含溅射），消耗后进入重新充能
    if (this.shieldCharges > 0) {
      this.shieldCharges--;
      this.shieldFlash = 0.4;
      this.lastDamageBlocked = true;
      this.effects.sparkBurst(this._tmpV.set(this.position.x, 1.7, this.position.z), 14, 0x66d0ff);
      this.audio.shieldBreak();
      return false;
    }
    let remain = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remain * 0.65); // 护甲吸收 65%
      this.armor = Math.max(0, this.armor - absorbed);
      remain -= absorbed;
    }
    this.health -= remain;
    this.audio.hitPlayer();
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  // ---------- 主更新 ----------
  // input: { moveX, moveZ, aimDir(null=自动), firing, fp, lookYaw, lookPitch }
  update(dt, world, input) {
    if (!this.alive) return;
    const P = CONFIG.player;
    const C = P.cannon;

    // ---- 移动 ----
    const speed = P.speed * this.mods.speedMul;
    let inX = input.moveX, inZ = input.moveZ;
    if (input.fp) {
      // 第一人称：移动转为视线相对（"上"= 炮塔正前方），否则俯视下的方向感会错乱
      const fx = Math.sin(this.turretYaw), fz = Math.cos(this.turretYaw);
      const rx = -Math.cos(this.turretYaw), rz = Math.sin(this.turretYaw);
      const mx = input.moveX, mz = input.moveZ;
      inX = mx * rx - mz * fx;
      inZ = mx * rz - mz * fz;
    }
    const desiredX = inX * speed;
    const desiredZ = inZ * speed;
    // 地面加速/摩擦（指数阻尼，帧率无关）
    const accel = P.accel;
    this.velocity.x += (desiredX - this.velocity.x) * Math.min(1, accel * dt / speed * 1.2);
    this.velocity.z += (desiredZ - this.velocity.z) * Math.min(1, accel * dt / speed * 1.2);
    if (inX === 0 && inZ === 0) {
      const damp = Math.max(0, 1 - P.friction * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    const fixed = world.collideCircle(nx, nz, P.radius);
    this.position.x = fixed.x;
    this.position.z = fixed.z;

    // 车体朝移动方向平滑转向
    const moveLen = Math.hypot(this.velocity.x, this.velocity.z);
    if (moveLen > 0.8) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.hullYaw = angleLerp(this.hullYaw, targetYaw, Math.min(1, P.hullTurnRate * dt));
    }
    this.root.rotation.y = this.hullYaw;

    // 履带视觉微动（基准高度来自模型，避免两处各写一份常量）
    const trackOffset = Math.sin(performance.now() * 0.02) * 0.03 * (moveLen > 0.5 ? 1 : 0);
    this.model.trackL.position.y = this.trackBaseY + trackOffset;
    this.model.trackR.position.y = this.trackBaseY - trackOffset;

    // ---- 炮塔瞄准（yaw + pitch）----
    let aimYaw;
    let wantPitch = 0;
    if (input.fp) {
      // 第一人称：炮塔与炮口直接由视角驱动（不做平滑，保证"所见即所射"）
      this.turretYaw = input.lookYaw;
      this.gunPitch = clamp(input.lookPitch, C.pitchMin, C.pitchMax);
      this.aimTarget = null;
      aimYaw = this.turretYaw;
    } else {
      let target;
      if (input.aimDir !== null) {
        // 手动瞄准：yaw 完全交给玩家，俯仰在瞄准锥内自动配平（否则打不到空中单位）
        aimYaw = input.aimDir;
        target = this._targetNearYaw(world, aimYaw);
      } else {
        target = this._pickAimTarget(world);
        aimYaw = target ? this._leadYaw(target) : this.hullYaw;
      }
      this.aimTarget = target;
      if (target) wantPitch = this._pitchTo(target);
      this.turretYaw = angleLerp(this.turretYaw, aimYaw, Math.min(1, P.turretTurnRate * dt));
      this.gunPitch = lerp(this.gunPitch, clamp(wantPitch, C.pitchMin, C.pitchMax), Math.min(1, 6 * dt));
    }

    // 炮塔世界朝向 = 车体 yaw + 炮塔相对角；模型层炮塔只存相对角
    let rel = (this.turretYaw - this.hullYaw) % (Math.PI * 2);
    if (rel > Math.PI) rel -= Math.PI * 2;
    if (rel < -Math.PI) rel += Math.PI * 2;
    this.turret.rotation.y = rel;
    this.gunPivot.rotation.x = -this.gunPitch;

    // 后坐力回弹
    this.recoil = Math.max(0, this.recoil - dt * 3.5);
    this.turret.position.z = -0.15 - this.recoil * 0.45;

    // ---- 主炮开火 ----
    this.fireCooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.clip = this.clipSize;
        this.audio.reload();
      }
    }
    if (input.firing && this.fireCooldown <= 0 && this.reloadTimer <= 0 && this.clip > 0) {
      this._fireCannon(world);
    }

    // ---- 防空机枪 ----
    this._updateMG(dt, world);

    // ---- 爆破撞角：车身撞上地面敌军造成撞击伤害（越野撞角流的核心爽点）----
    this.ramTimer = Math.max(0, this.ramTimer - dt);
    if (this.mods.ram > 0 && moveLen > 3 && this.ramTimer <= 0) {
      let hit = false;
      for (const e of world.enemies) {
        if (!e.alive || e.isAir) continue;
        const d = dist2D(this.position.x, this.position.z, e.position.x, e.position.z);
        if (d < e.radius + P.radius + 0.3) { e.takeDamage(this.ramDamage, '撞角', world); hit = true; }
      }
      if (hit) {
        this.ramTimer = P.ramCooldown;
        this.effects.sparkBurst(this._tmpV.set(this.position.x, 1.2, this.position.z), 8, 0xffd080);
        this.effects.shake(0.18);
        this.audio.ram();
      }
    }

    // ---- 导弹巢 ----
    if (this.mods.missilePod > 0) {
      this.missileTimer -= dt;
      if (this.missileTimer <= 0) {
        this._fireMissiles(world);
        this.missileTimer = 7 - (this.mods.missilePod - 1) * 1.5;
      }
    }

    // ---- 反应装甲：按间隔逐层充能 ----
    if (this.mods.shield > 0 && this.shieldCharges < this.mods.shield) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.shieldCharges++;
        this.shieldTimer = CONFIG.player.shieldRecharge;
        this.effects.sparkBurst(this._tmpV.set(this.position.x, 1.8, this.position.z), 10, 0x66d0ff);
        this.audio.shieldReady();
      }
    }
    if (this.shieldFlash > 0) this.shieldFlash -= dt;

    // 低血烟迹
    if (this.health < this.maxHealth * 0.35 && Math.random() < dt * 6) {
      this.effects.smokePuff(this._tmpV.set(this.position.x, 1.8, this.position.z));
    }
  }

  // 最近目标（空中单位权重拉近：优先处理空袭威胁）
  _pickAimTarget(world) {
    const C = CONFIG.player.cannon;
    let best = null, bestD = C.aimRange;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const d = dist2D(this.position.x, this.position.z, e.position.x, e.position.z);
      const effD = e.isAir ? d * 0.75 : d;
      if (effD < bestD) { bestD = effD; best = e; }
    }
    return best;
  }

  // 手动瞄准时：在瞄准锥内挑一个"挨得最近 + 最正对"的目标，仅用于配平俯仰
  _targetNearYaw(world, yaw) {
    const C = CONFIG.player.cannon;
    let best = null, bestScore = Infinity;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const dx = e.position.x - this.position.x;
      const dz = e.position.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d > C.aimRange) continue;
      const off = Math.abs(angleDiff(Math.atan2(dx, dz), yaw));
      if (off > C.aimCone) continue;
      const score = d + off * C.aimConePenalty;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  // 提前量解算：用敌方真实速度（EnemyManager 每帧回填 velocity）+ 当前弹速
  _leadYaw(target) {
    const t = dist2D(this.position.x, this.position.z, target.position.x, target.position.z) / this.shellSpeed;
    const v = target.velocity;
    const px = target.position.x + (v ? v.x * t : 0);
    const pz = target.position.z + (v ? v.z * t : 0);
    return Math.atan2(px - this.position.x, pz - this.position.z);
  }

  // 目标高度 → 炮口俯仰角（以炮口世界坐标为原点，含炮塔位置偏移）
  _pitchTo(target) {
    const m = this.muzzle.getWorldPosition(this._tmpV2);
    const horiz = dist2D(m.x, m.z, target.position.x, target.position.z) || 0.01;
    return Math.atan2((target.position.y + 1.0) - m.y, horiz);
  }

  _fireCannon(world) {
    const C = CONFIG.player.cannon;
    this.fireCooldown = C.fireInterval / this.mods.rateMul;
    this.clip--;
    if (this.clip <= 0) this.reloadTimer = C.reloadTime / this.mods.rateMul;
    this.recoil = 1;

    const muzzlePos = this.muzzle.getWorldPosition(new THREE.Vector3());
    const count = 1 + this.mods.projectiles;
    const spread = C.spread;
    const speed = this.shellSpeed;
    // 穿甲弹芯：整次击发共享一次暴击判定（多弹丸不会"一半暴击一半不爆"）
    const crit = this.mods.crit > 0 && Math.random() < this.mods.crit;
    const damage = C.damage * this.mods.damageMul * (crit ? C.critMul : 1);
    if (world.stats) world.stats.shotsFired += count;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i - (count - 1) / 2) * 0.09 : 0;
      const yaw = this.turretYaw + off + rand(-spread, spread);
      const pitch = this.gunPitch + rand(-spread, spread);
      const cp = Math.cos(pitch);
      // 三维弹道：pitch 让主炮可以真正打到 9~15m 高度的空中单位
      const dir = new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
      world.spawnPlayerShell(muzzlePos, dir, {
        damage,
        speed,
        splash: C.splashRadius * this.mods.splashMul,
        pierce: this.mods.pierce,
        crit,
      });
    }
    if (crit) this.effects.sparkBurst(muzzlePos, 10, 0xff6a3a);
    this.effects.explosion(muzzlePos, 0.35, { noCrater: true });
    this.audio.cannon();
    this.effects.shake(0.12);
  }

  _updateMG(dt, world) {
    const M = CONFIG.player.mg;
    this.mgCooldown -= dt;
    // 散热 / 过热锁定
    if (this.mgLocked) {
      this.mgLockTimer -= dt;
      if (this.mgLockTimer <= 0) { this.mgLocked = false; this.mgHeat = 0; }
    } else {
      this.mgHeat = Math.max(0, this.mgHeat - M.coolPerSec * (1 + (this.mods.mgMul - 1) * 0.8) * dt);
    }

    // 目标选择：优先空中
    let best = null, bestD = M.range;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (!e.isAir && !M.airPriority) continue;
      const d = dist2D(this.position.x, this.position.z, e.position.x, e.position.z);
      const effD = (M.airPriority && e.isAir) ? d * 0.6 : d;
      if (effD < bestD) { bestD = effD; best = e; }
    }
    this.mgTarget = best;
    if (!best) return;

    // 机枪座转向目标
    const dx = best.position.x - this.position.x;
    const dz = best.position.z - this.position.z;
    const targetWorldYaw = Math.atan2(dx, dz);
    let rel = (targetWorldYaw - this.hullYaw - this.turret.rotation.y) % (Math.PI * 2);
    if (rel > Math.PI) rel -= Math.PI * 2;
    if (rel < -Math.PI) rel += Math.PI * 2;
    this.mgYaw = angleLerp(this.mgYaw, rel, Math.min(1, 8 * dt));
    this.mgPivot.rotation.y = this.mgYaw;

    if (this.mgLocked || this.mgCooldown > 0) return;

    // 开火：hitscan + 曳光
    this.mgCooldown = M.interval;
    this.mgHeat += M.heatPerShot;
    if (this.mgHeat >= 100) {
      this.mgLocked = true;
      this.mgLockTimer = M.overheatLockTime;
    }
    const muzzlePos = this.mgPivot.getWorldPosition(this._tmpV2);
    muzzlePos.y += 0.05;
    const aimPos = best.position.clone();
    // 散布：按距离换算成可见的近失抖动（命中率仍由 hitChance 决定）
    const jr = M.spread * bestD;
    aimPos.x += rand(-jr, jr);
    aimPos.z += rand(-jr, jr);
    aimPos.y += rand(-0.2, 0.2);
    // 距离越远越容易脱靶
    const hitChance = clamp(1.15 - bestD / M.range * 0.55, 0.3, 0.92);
    this.effects.tracer(muzzlePos, aimPos);
    // 11 发/秒的射击节奏下抽样发声，避免音频节点瞬时过载
    if (Math.random() < 0.55) this.audio.mg();
    if (Math.random() < hitChance) {
      best.takeDamage(M.damage * this.mods.mgMul, '机枪', world);
    }
  }

  _fireMissiles(world) {
    const targets = world.enemies.filter((e) => e.alive && (e.isAir || e.kind === 'heavy'));
    if (targets.length === 0) return;
    const muzzlePos = this.missilePods.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < 2; i++) {
      const t = targets[randInt(0, targets.length - 1)];
      const dir = new THREE.Vector3(t.position.x - muzzlePos.x, t.position.y + 1 - muzzlePos.y, t.position.z - muzzlePos.z).normalize();
      world.spawnMissile(muzzlePos, dir, { damage: 42, speed: 34, target: t });
    }
    this.audio.missile();
  }

  // 撞角：主动撞击地面敌军的伤害（由 update 中的接触检测消费）
  get ramDamage() { return this.mods.ram * 40; }
  // 撞角附带的抗爆（自爆突袭车殉爆减免）
  get blastResist() { return this.mods.ram > 0 ? 0.25 : 0; }
}

window.PlayerTank = PlayerTank;
