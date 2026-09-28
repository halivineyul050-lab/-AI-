// pickup.js —— 补给包拾取系统（血包 + 弹药包 + 手榴弹包 + 敌人掉落物）
// 职责：地图上摆放补给（悬浮旋转），玩家走近自动拾取生效，
//       拾取后进入重生倒计时，倒计时结束重新出现。
// 满血/满弹药/满护甲时不消耗（保留在场上，避免浪费）。
// 经典脚本（非 ES Module）：THREE / CONFIG 由前置脚本挂到 window 提供

class Pickup {
  constructor(scene, pos, type = 'health', isDynamic = false) {
    this.pos = pos;
    this.type = type;                       // 'health' 血包 / 'ammo' 弹药包 / 'grenade' 手榴弹包 / 'armor' 护甲
    this.isDynamic = isDynamic;             // 动态掉落物：不重生，新局清理
    this.amount = type === 'health' ? CONFIG.pickup.healAmount
      : type === 'grenade' ? CONFIG.pickup.grenadeAmount : 0;
    this.respawnTime = CONFIG.pickup.respawnTime;
    this.active = true;
    this._timer = 0;
    this._spin = Math.random() * Math.PI * 2;
    this._buildMesh(scene);
  }

  _buildMesh(scene) {
    const g = new THREE.Group();

    if (this.type === 'ammo') {
      // ---- 弹药包：军绿弹药箱 + 顶部弹头（黄铜色）+ 琥珀色光晕 ----
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.18, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x4a5d3a, roughness: 0.6, metalness: 0.1 })
      );
      crate.position.y = 0.05;
      crate.castShadow = true;
      g.add(crate);

      // 三枚立起的弹头
      const bulletMat = new THREE.MeshStandardMaterial({ color: 0xd8a531, roughness: 0.35, metalness: 0.6 });
      for (let i = -1; i <= 1; i++) {
        const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), bulletMat);
        bullet.position.set(i * 0.09, 0.16, 0);
        g.add(bullet);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 6), bulletMat);
        tip.position.set(i * 0.09, 0.25, 0);
        g.add(tip);
      }

      // 琥珀色光晕（与血包的红色区分，远距离可辨）
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 16),
        new THREE.MeshBasicMaterial({ color: 0xffc24d, transparent: true, opacity: 0.22, depthWrite: false })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      g.add(glow);
    } else if (this.type === 'grenade') {
      // ---- 手榴弹包：独立军绿补给箱 + 两枚 M26 轮廓 + 红色警示环 ----
      const crateMat = new THREE.MeshStandardMaterial({ color: 0x53623d, roughness: 0.62, metalness: 0.16 });
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.32), crateMat);
      crate.position.y = 0.06;
      crate.castShadow = true;
      g.add(crate);

      const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x68734b, roughness: 0.72, metalness: 0.25 });
      const capMat = new THREE.MeshStandardMaterial({ color: 0xa2a55c, roughness: 0.42, metalness: 0.5 });
      for (let i = -1; i <= 1; i += 2) {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.16, 8), grenadeMat);
        body.position.set(i * 0.105, 0.23, 0);
        g.add(body);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.035, 8), capMat);
        cap.position.set(i * 0.105, 0.33, 0);
        g.add(cap);
      }

      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.37, 0.55, 16),
        new THREE.MeshBasicMaterial({ color: 0xff5b4d, transparent: true, opacity: 0.28, depthWrite: false })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      g.add(glow);
    } else if (this.type === 'armor') {
      // ---- 护甲（敌人掉落）：军绿防弹背心板 + 蓝色护盾光晕 ----
      // 背心前板
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x3f5a3c, roughness: 0.45, metalness: 0.35 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.22, 0.10), plateMat);
      plate.position.y = 0.08;
      plate.castShadow = true;
      g.add(plate);
      // 斜切肩部（两小块前倾板，营造背心轮廓）
      const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x35493a, roughness: 0.5, metalness: 0.3 });
      for (const side of [-1, 1]) {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.10), shoulderMat);
        sh.position.set(side * 0.15, 0.19, 0);
        sh.rotation.z = side * 0.25;
        g.add(sh);
      }
      // 中央护盾标志（浅蓝圆片，视觉识别为"护盾"）
      const shieldMat = new THREE.MeshStandardMaterial({ color: 0x7ec0ff, roughness: 0.3, metalness: 0.5, emissive: 0x2a6a9e, emissiveIntensity: 0.25 });
      const shieldDot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.014, 16), shieldMat);
      shieldDot.rotation.x = Math.PI / 2;
      shieldDot.position.set(0, 0.08, 0.052);
      g.add(shieldDot);
      // 蓝色光晕（与血包红、弹药琥珀区分）
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 16),
        new THREE.MeshBasicMaterial({ color: 0x4a90e2, transparent: true, opacity: 0.22, depthWrite: false })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      g.add(glow);
    } else {
      // ---- 血包：白底医疗箱 + 红色十字 + 红色光晕 ----
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.16, 0.26),
        new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, metalness: 0.05 })
      );
      box.position.y = 0.05;
      box.castShadow = true;
      g.add(box);

      const crossMat = new THREE.MeshStandardMaterial({ color: 0xd83030, roughness: 0.4 });
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.12), crossMat);
      vBar.position.y = 0.09;
      g.add(vBar);
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.12), crossMat);
      hBar.position.y = 0.09;
      g.add(hBar);

      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 16),
        new THREE.MeshBasicMaterial({ color: 0xff6666, transparent: true, opacity: 0.22, depthWrite: false })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      g.add(glow);
    }

    g.position.set(this.pos.x, 0.6, this.pos.z);
    this.mesh = g;
    scene.add(g);
  }

  // 每帧更新：旋转/浮动 + 拾取检测 + 重生计时
  update(dt, player, hud, audio, weapons) {
    if (this.active) {
      this._spin += dt * 1.6;
      this.mesh.rotation.y = this._spin;
      this.mesh.position.y = 0.6 + Math.sin(this._spin * 0.7) * 0.06;

      // 拾取检测（水平距离）
      const dx = player.position.x - this.pos.x;
      const dz = player.position.z - this.pos.z;
      if (dx * dx + dz * dz < CONFIG.pickup.pickupRadius * CONFIG.pickup.pickupRadius) {
        if (this.type === 'ammo') {
          if (!weapons) return;
          const r = weapons.addAmmo(CONFIG.pickup.ammo);
          if (!r.added) return;             // 全满：不消耗
          hud.toast('弹药补给 ' + r.parts.join(' / '));
          if (audio) audio.heal();
        } else if (this.type === 'grenade') {
          if (!weapons || typeof weapons.addGrenades !== 'function') return;
          const r = weapons.addGrenades(this.amount);
          if (!r || !r.added) return;       // 2 枚满库存时保留在场上
          hud.toast(`手榴弹 +${r.amount}`);
          if (audio) audio.heal();
        } else if (this.type === 'armor') {
          // 护盾点数：满盾不消耗，保留在场上
          if (player.armor >= CONFIG.player.maxArmor) return;
          player.addArmor(CONFIG.pickup.armorAmount);
          hud.toast(`护盾 +${CONFIG.pickup.armorAmount}`);
          if (audio) audio.heal();
        } else {
          // 满血不消耗，保留在场上
          if (player.health >= CONFIG.player.maxHealth) return;
          player.heal(this.amount);
          hud.toast(`+${this.amount} HP`);
          if (audio) audio.heal();
        }
        this.consume();
      }
    } else {
      this._timer -= dt;
      if (this._timer <= 0) {
        this.active = true;
        this.mesh.visible = true;
      }
    }
  }

  reset() {
    this.active = true;
    this.mesh.visible = true;
    this._timer = 0;
  }

  // 玩家和敌人共用同一条消耗路径，避免敌人取弹时绕过重生/动态掉落规则。
  consume() {
    if (!this.active) return false;
    this.active = false;
    this.mesh.visible = false;
    // 动态掉落物不重生；固定点位进入重生倒计时。
    this._timer = this.isDynamic ? Infinity : this.respawnTime;
    return true;
  }
}

class PickupSystem {
  constructor(scene, gameMap, player, hud, audio, weapons) {
    this.scene = scene;
    this.gameMap = gameMap;
    this.player = player;
    this.hud = hud;
    this.audio = audio;
    this.weapons = weapons;
    this.pickups = [];
    this._buildFixedPickups();
  }

  _buildFixedPickups() {
    for (const [x, z] of CONFIG.pickup.spawns) {
      this.pickups.push(new Pickup(this.scene, this._safeGroundPosition(x, z), 'health'));
    }
    for (const [x, z] of CONFIG.pickup.ammoSpawns) {
      this.pickups.push(new Pickup(this.scene, this._safeGroundPosition(x, z), 'ammo'));
    }
    for (const [x, z] of CONFIG.pickup.grenadeSpawns || []) {
      this.pickups.push(new Pickup(this.scene, this._safeGroundPosition(x, z), 'grenade'));
    }
  }

  // 地图切换后同一组逻辑补给点也要经过当前地图碰撞层校正，避免新地图的箱体
  // 把弹药包生成在不可达结构内部，敌人和玩家都只能看到却拿不到。
  _safeGroundPosition(x, z, reservedPoints = [], reservedMinDist = 0) {
    if (this.gameMap && typeof this.gameMap.findNearestFree === 'function') {
      const safe = this.gameMap.findNearestFree(x, z, 0.35, 10, reservedPoints, reservedMinDist);
      if (safe) return { x: safe.x, z: safe.z };
    }
    return { x, z };
  }

  _disposePickup(pk) {
    if (!pk || !pk.mesh) return;
    this.scene.remove(pk.mesh);
    const textures = new Set();
    pk.mesh.traverse((object) => {
      if (object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
      const material = object.material;
      const materials = Array.isArray(material) ? material : [material];
      for (const mat of materials) {
        if (!mat) continue;
        for (const key of Object.keys(mat)) {
          const value = mat[key];
          if (value && value.isTexture) textures.add(value);
        }
        if (mat.dispose) mat.dispose();
      }
    });
    for (const texture of textures) texture.dispose();
  }

  // 地图切换只在未开始或玩家死亡后发生；固定补给必须跟随新地图重建，
  // 否则旧地图的拾取物会残留在新地图坐标层中。
  setMap(gameMap) {
    this.gameMap = gameMap;
    for (const pk of this.pickups) this._disposePickup(pk);
    this.pickups.length = 0;
    this._buildFixedPickups();
  }

  // 敌人死亡掉落护甲（动态拾取物，新局清理、不重生）
  addDynamic(pk) {
    this.pickups.push(pk);
  }

  // 同次掉落的物品使用独立环形点位，并把已放置点传给地图安全搜索，
  // 避免爆头四件套或护甲+手榴弹在墙体校正后重新重叠。
  dropBundle(pos, types = ['ammo', 'health', 'armor']) {
    if (!pos) return [];
    const offsets = [
      [-0.72, 0], [0, 0.72], [0.72, 0], [0, -0.72],
      [-0.52, -0.52], [0.52, 0.52], [-0.52, 0.52], [0.52, -0.52],
    ];
    const minDistance = 0.72;
    const usedPositions = [];
    const dropped = [];
    types.forEach((type, index) => {
      const start = index % offsets.length;
      let safe = null;
      for (let attempt = 0; attempt < offsets.length; attempt++) {
        const offset = offsets[(start + attempt) % offsets.length];
        const candidate = this._safeGroundPosition(
          Number(pos.x) + offset[0], Number(pos.z) + offset[1], usedPositions, minDistance
        );
        const separated = usedPositions.every((point) => {
          const dx = candidate.x - point.x, dz = candidate.z - point.z;
          return dx * dx + dz * dz >= minDistance * minDistance - 1e-6;
        });
        if (separated) { safe = candidate; break; }
      }
      // 极端狭窄地图没有可用安全候选时仍保留掉落，使用当前环位，
      // 让拾取链不断；正常地图会在上面的安全搜索中提前返回分离点。
      if (!safe) {
        const offset = offsets[start];
        safe = { x: Number(pos.x) + offset[0], z: Number(pos.z) + offset[1] };
      }
      const pickup = new Pickup(this.scene, safe, type, true);
      this.addDynamic(pickup);
      dropped.push(pickup);
      usedPositions.push(safe);
    });
    return dropped;
  }

  // 敌人只搜索已经在自己附近的弹药包；返回最近的活动补给，避免每帧创建临时数组。
  findNearestActive(type, x, z, maxDistance = Infinity) {
    let nearest = null;
    let nearestSq = maxDistance * maxDistance;
    for (const pk of this.pickups) {
      if (!pk || !pk.active || pk.type !== type) continue;
      const dx = pk.pos.x - x;
      const dz = pk.pos.z - z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq <= nearestSq) {
        nearestSq = distanceSq;
        nearest = pk;
      }
    }
    return nearest;
  }

  // 供 AI 做补给降级与可达性筛选：按距离返回活动补给，避免“最近一个在墙后”
  // 时整类补给被错误判定为不可用。列表很小，只在节流后的搜索时创建。
  findActiveCandidates(types, x, z, maxDistance = Infinity) {
    const accepted = new Set(Array.isArray(types) ? types : [types]);
    const maxDistanceSq = maxDistance * maxDistance;
    const result = [];
    for (const pickup of this.pickups) {
      if (!pickup || !pickup.active || !accepted.has(pickup.type)) continue;
      const dx = pickup.pos.x - x, dz = pickup.pos.z - z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq <= maxDistanceSq) result.push({ pickup, distanceSq });
    }
    result.sort((a, b) => a.distanceSq - b.distanceSq);
    return result.map((entry) => entry.pickup);
  }

  // 敌人抵达弹药包时补入自己的备用弹量；弹药包由 Pickup 自己负责进入重生计时。
  collectAmmoForEnemy(enemy, pickup) {
    return this.collectForEnemy(enemy, pickup);
  }

  // 敌人会根据自身状态争抢血包或弹药包；满状态不浪费补给。
  collectForEnemy(enemy, pickup) {
    if (!enemy || !pickup || !pickup.active) return false;
    if (pickup.type === 'health') {
      const maxHealth = Math.max(1, Number(enemy.maxHealth) || 1);
      const current = Math.max(0, Number(enemy.health) || 0);
      if (current >= maxHealth) return false;
      enemy.health = Math.min(maxHealth, current + Math.max(1, Number(CONFIG.pickup.healAmount) || 1));
      if (typeof enemy._drawBar === 'function') enemy._drawBar();
      pickup.consume();
      return true;
    }
    if (!enemy || !pickup || !pickup.active || pickup.type !== 'ammo') return false;
    const reserveMax = Math.max(0, Number(enemy.reserveMax) || 0);
    const current = Math.max(0, Number(enemy.reserve) || 0);
    if (current >= reserveMax) return false;
    const amount = Math.max(1, Number(CONFIG.enemy.ammo.pickupAmount) || 1);
    enemy.reserve = Math.min(reserveMax, current + amount);
    pickup.consume();
    return true;
  }

  update(dt) {
    for (const pk of this.pickups) pk.update(dt, this.player, this.hud, this.audio, this.weapons);
  }

  // 新一局开始时所有补给恢复；动态掉落物（敌人掉的护甲）移除
  reset() {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (pk.isDynamic) {
        this._disposePickup(pk);
        this.pickups.splice(i, 1);
      } else {
        pk.reset();
      }
    }
  }

  dispose() {
    for (const pk of this.pickups) this._disposePickup(pk);
    this.pickups.length = 0;
  }
}

// 经典脚本全局暴露（依赖顺序：… → audio → pickup → main）
window.PickupSystem = PickupSystem;
