// enemy.js —— 敌方机器人
// 行为：巡逻/追击玩家、视线检测（被墙挡住则看不见）、点射开火、受击掉血、死亡倒地
// 追击与抢补给共用 GameMap 的 A* 路径，局部移动仍保留连续碰撞与滑墙。
// 经典脚本（非 ES Module）：THREE / CONFIG 由前置脚本挂到 window 提供

class Enemy {
  constructor(scene, gameMap, player, hud, opts = {}) {
    this.scene = scene;
    this.map = gameMap;
    this.player = player;
    this.hud = hud;
    this.pickups = opts.pickups || null;   // 拾取系统（抢补给与死亡掉落共用）

    this.name = opts.name || 'Phantom';
    this.height = CONFIG.enemy.height;
    this.radius = CONFIG.enemy.radius;
    this.maxHealth = opts.hp || CONFIG.enemy.maxHealth;
    this.health = this.maxHealth;
    this.speed = opts.speed || CONFIG.enemy.moveSpeed;
    this.alive = true;

    // 分层强化（tier 0 普通 / 1 精英 / 2 王牌，由波次进度决定）
    this.tier = opts.tier || 0;
    const T = (CONFIG.enemyTiers && CONFIG.enemyTiers[this.tier]) || {};
    this.tierLabel = T.label || '';
    this.burstBonus = T.burstBonus || 0;            // 点射延长
    this.fireIntervalMul = T.fireIntervalMul != null ? T.fireIntervalMul : 1;  // 开火更快
    this.hitChanceAdd = T.hitChanceAdd || 0;        // 命中更高
    this.damageAdd = T.damageAdd || 0;              // 单发更痛
    this.canRush = !!T.rush;                        // 冲刺突进
    this.canPush = !!T.push;                        // 近身不后撤、压近
    this.canMelee = !!T.melee;                      // 近战重击
    this.meleeDamage = T.meleeDamage || 14;
    this.rushCooldown = 2.5 + Math.random() * 3;    // 首次冲锋随机延迟
    this.rushTime = 0;
    this.rushEvadeTime = 0;
    this.meleeCooldown = 0;
    this._applyDifficulty(opts.difficulty);

    // 敌人也受弹药经济约束：一个弹匣打完必须读条换弹，备弹用尽后才会寻找地图补给。
    const ammoCfg = CONFIG.enemy.ammo || {};
    this.magazineSize = Math.max(1, Math.floor(Number(ammoCfg.magazineSize) || 18));
    this.reserveMax = Math.max(this.magazineSize, Math.floor(Number(ammoCfg.reserveSize) || this.magazineSize * 3));
    this.magazine = this.magazineSize;
    this.reserve = this.reserveMax;
    this.reloadTimer = 0;
    this.reloadRecoverTimer = 0;
    this._ammoTarget = null;
    this._ammoSearchTimer = Math.random() * (Number(ammoCfg.searchInterval) || 0.45);
    this._ammoPickupCooldown = 0;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = Math.PI;       // 朝向（绕 Y）

    // AI 状态
    this.state = 'idle';         // idle / engage / dead
    this.seePlayer = false;
    this.lastSeenPos = new THREE.Vector3();
    this.reactionTimer = 0;
    this._huntDelay = 0.4 + Math.random() * 0.8;
    this.fireCooldown = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 1 + Math.random() * 2;
    this.deathTimer = 0;

    // 卡墙防御状态
    this._lastPos = new THREE.Vector3();
    this._lastValidPos = new THREE.Vector3();
    this._stuckTimer = 0;
    this._containmentTimer = Math.random() * 0.12;
    this._escapeTimer = 0;
    this._escapeDir = 0;
    this._wantsMove = false;

    // 高频 AI 计算复用临时向量，避免普通安卓在战斗中持续触发垃圾回收卡顿。
    this._tmpEye = new THREE.Vector3();
    this._tmpTo = new THREE.Vector3();
    this._tmpFlat = new THREE.Vector3();
    this._tmpFwd = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3();
    this._tmpMove = new THREE.Vector3();
    this._tmpAux = new THREE.Vector3();
    this._eye2 = { x: 0, z: 0 };
    this._target2 = { x: 0, z: 0 };
    this._seeTimer = Math.random() * 0.12;
    this._avoidTimer = Math.random() * 0.1;
    this._nearbyEnemies = [];
    this.spatialHash = null;
    this._rigUpdateAccumulator = 0;
    this._deathAge = 0;

    this._path = null;
    this._pathIndex = 0;
    this._pathRefreshTimer = Math.random() * 0.3;
    this._pathTarget = new THREE.Vector3(Infinity, 0, Infinity);

    this._buildMesh();
  }

  _applyDifficulty(id) {
    const difficulties = (CONFIG.ai && CONFIG.ai.difficulties) || {};
    this.difficultyId = difficulties[id] ? id : ((CONFIG.ai && CONFIG.ai.difficultyDefault) || 'normal');
    this.difficulty = difficulties[this.difficultyId] || {};
    this.difficultyDamageMul = Number(this.difficulty.damageMul) || 1;
    this.difficultyAccuracyMul = Number(this.difficulty.accuracyMul) || 1;
    this.difficultyReactionMul = Number(this.difficulty.reactionMul) || 1;
    // 主动行为由难度显式门禁控制；默认缺省为关闭，避免新难度意外获得灾难级能力。
    this.autoHunt = this.difficulty.autoHunt === true;
    this.seekPickups = this.difficulty.seekPickups === true;
    this.useNavigation = this.difficulty.useNavigation === true;
    const tierCfg = (CONFIG.enemyTiers && CONFIG.enemyTiers[this.tier]) || {};
    const tierFireIntervalMul = tierCfg.fireIntervalMul != null ? Number(tierCfg.fireIntervalMul) : 1;
    this.fireIntervalMul = (Number.isFinite(tierFireIntervalMul) ? tierFireIntervalMul : 1) *
      (Number(this.difficulty.fireIntervalMul) || 1);
    if (!this.seekPickups) this._clearPickupSearch();
    if (!this.useNavigation) this._clearNavigationState();
  }

  _clearPickupSearch() {
    this._ammoTarget = null;
    this._ammoSearchTimer = 0;
    this._ammoPickupCooldown = 0;
  }

  _clearNavigationState() {
    this._path = null;
    this._pathIndex = 0;
    this._pathRefreshTimer = 0;
    if (this._pathTarget && typeof this._pathTarget.set === 'function') {
      this._pathTarget.set(Infinity, 0, Infinity);
    }
  }

  // 同一强度层的敌人模型可以复用；这里只更新战斗参数，不重建骨骼、材质和血条。
  configureForSpawn(opts = {}) {
    this.name = opts.name || this.name || 'Phantom';
    this.maxHealth = Math.max(1, Number(opts.hp) || CONFIG.enemy.maxHealth);
    this.speed = Math.max(0.1, Number(opts.speed) || CONFIG.enemy.moveSpeed);
    this.tier = Math.max(0, Math.floor(Number(opts.tier) || 0));
    const tierCfg = (CONFIG.enemyTiers && CONFIG.enemyTiers[this.tier]) || {};
    this.tierLabel = tierCfg.label || '';
    this.burstBonus = tierCfg.burstBonus || 0;
    this.hitChanceAdd = tierCfg.hitChanceAdd || 0;
    this.damageAdd = tierCfg.damageAdd || 0;
    this.canRush = !!tierCfg.rush;
    this.canPush = !!tierCfg.push;
    this.canMelee = !!tierCfg.melee;
    this.meleeDamage = tierCfg.meleeDamage || 14;
    this.fireIntervalMul = tierCfg.fireIntervalMul != null ? tierCfg.fireIntervalMul : 1;
    this._applyDifficulty(opts.difficulty);
    this.pickups = opts.pickups || this.pickups;
  }

  _buildMesh() {
    if (!window.CS15EnemyRig || !window.CS15EnemyRig.available) {
      this._buildLegacyMesh();
      return;
    }
    try {
      const instance = window.CS15EnemyRig.create({ tier: this.tier, name: this.name });
      if (!instance) {
        this._buildLegacyMesh();
        return;
      }
      const g = instance.root;
      this._rigInstance = instance;
      this._sharedEnemyAssets = true;

      // 血条仍属于敌人实例；人体、护甲、贴图和命中代理由共享骨骼系统管理。
      const barCanvas = document.createElement('canvas');
      barCanvas.width = 64; barCanvas.height = 8;
      this._barCanvas = barCanvas;
      this._barCtx = barCanvas.getContext('2d');
      this._barTex = new THREE.CanvasTexture(barCanvas);
      const barMat = new THREE.SpriteMaterial({ map: this._barTex, depthTest: false });
      this._barSprite = new THREE.Sprite(barMat);
      this._barSprite.scale.set(1.2, 0.15, 1);
      this._barSprite.position.y = 2.1;
      this._barSprite.visible = false;
      g.add(this._barSprite);
      this._drawBar();

      // 接触阴影对象始终预建但按档位显隐，使桌面/触屏在运行中切换
      // “动态阴影 ↔ 接触阴影”时无需重建敌人模型。
      const blobGeo = new THREE.CircleGeometry(0.55, 16);
      const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.02;
      blob.visible = window.CS15_CONTACT_SHADOWS_ENABLED === true;
      g.add(blob);
      this._contactShadow = blob;

      this.mesh = g;
      this.scene.add(g);
      this.hitMeshes = instance.hitMeshes;
      for (const mesh of this.hitMeshes) mesh.userData.enemy = this;
      this._walkPhase = 0;
    } catch (error) {
      console.warn('[Enemy] 平衡骨骼模型创建失败，回退旧模型：', error);
      this._rigInstance = null;
      this._sharedEnemyAssets = false;
      this._buildLegacyMesh();
    }
  }

  _buildLegacyMesh() {
    const g = new THREE.Group();

    // 材质（偏真实人体：战术装甲灰蓝 + 皮肤 + 深色衣裤 + 靴子）
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x4f5a68, roughness: 0.55, metalness: 0.25 });
    const armorDarkMat = new THREE.MeshStandardMaterial({ color: 0x3c4652, roughness: 0.6, metalness: 0.2 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x383c42, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9b892, roughness: 0.6 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x181a1e, roughness: 0.8 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x0d1116, roughness: 0.15, metalness: 0.7 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1f1f24, roughness: 0.55, metalness: 0.35 });
    const gunWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.8 });

    // ---- 头 + 面罩 + 头盔 ----
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), skinMat);
    head.position.y = 1.74;
    head.castShadow = true;
    g.add(head);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), visorMat);
    visor.position.set(0, 1.74, -0.14);
    g.add(visor);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), armorMat);
    helmet.position.y = 1.75;
    g.add(helmet);

    // ---- 颈 ----
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8), skinMat);
    neck.position.y = 1.56;
    g.add(neck);

    // ---- 躯干（胸甲方体）+ 护肩 + 髋部 ----
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.28), armorMat);
    torso.position.y = 1.26;
    torso.castShadow = true;
    g.add(torso);

    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.3), armorDarkMat);
    chestPlate.position.y = 1.36;
    g.add(chestPlate);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), clothMat);
    hips.position.y = 0.94;
    g.add(hips);

    const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), armorMat);
    shoulderL.position.set(-0.3, 1.5, 0);
    g.add(shoulderL);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 0.3;
    g.add(shoulderR);

    // ---- 手臂（上臂 + 前臂 + 手，前伸持枪） ----
    const armL = this._buildArm(armorMat, clothMat, skinMat, -1);
    const armR = this._buildArm(armorMat, clothMat, skinMat, 1);
    g.add(armL.group); g.add(armR.group);

    // ---- 腿（大腿 + 小腿 + 脚，髋部为摆动轴） ----
    const legL = this._buildLeg(clothMat, bootMat, -1);
    const legR = this._buildLeg(clothMat, bootMat, 1);
    g.add(legL.group); g.add(legR.group);
    this._legL = legL.group;
    this._legR = legR.group;

    // ---- 步枪（机匣 + 枪管 + 弹匣 + 枪托） ----
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), gunMat);
    gun.position.set(0.03, 1.28, -0.38);
    gun.castShadow = true;
    g.add(gun);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.42, 8), gunMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.03, 1.3, -0.82);
    g.add(barrel);
    const magBox = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.1), gunWoodMat);
    magBox.position.set(0.03, 1.13, -0.3);
    magBox.rotation.x = 0.25;
    g.add(magBox);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.26), gunWoodMat);
    stock.position.set(0.03, 1.24, -0.02);
    g.add(stock);
    const gunParts = [gun, barrel, magBox, stock];

    // 血条（精灵，始终面向相机）
    const barCanvas = document.createElement('canvas');
    barCanvas.width = 64; barCanvas.height = 8;
    this._barCanvas = barCanvas;
    this._barCtx = barCanvas.getContext('2d');
    this._barTex = new THREE.CanvasTexture(barCanvas);
    const barMat = new THREE.SpriteMaterial({ map: this._barTex, depthTest: false });
    this._barSprite = new THREE.Sprite(barMat);
    this._barSprite.scale.set(1.2, 0.15, 1);
    this._barSprite.position.y = 2.1;
    this._barSprite.visible = false;
    g.add(this._barSprite);
    this._drawBar();
    // 接触阴影（GameFactory 框架 createContactShadow 思路）：低端机关阴影时，
    // 用 1 个半透明圆盘接地，敌人不至于"飘在空中"（随 mesh 移动自动跟随）
    if (window.CS15_LOWEND) {
      const blobGeo = new THREE.CircleGeometry(0.55, 16);
      const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.02;
      g.add(blob);
    }

    this.mesh = g;
    this.scene.add(g);

    // ---- 精英/王牌视觉标识（tier 1 金色面罩+头盔脊；tier 2 红色面罩+光环）----
    if (this.tier > 0) {
      const tierColor = this.tier === 2 ? 0xe03030 : 0xe0a030;   // 王牌红 / 精英金
      const visorRecolor = new THREE.MeshStandardMaterial({
        color: tierColor, roughness: 0.25, metalness: 0.7,
        emissive: tierColor, emissiveIntensity: 0.5,
      });
      visor.material.dispose();
      visor.material = visorRecolor;

      // 头盔脊（一条沿头顶的凸起，精英细、王牌粗）
      const crest = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.05, 0.34),
        new THREE.MeshStandardMaterial({ color: tierColor, roughness: 0.4, metalness: 0.6 })
      );
      crest.position.set(0, 1.86, -0.02);
      if (this.tier === 2) crest.scale.set(1, 1.6, 1);   // 王牌脊更粗高
      g.add(crest);

      // 王牌：额外头顶光环（细环，增强辨识度）
      if (this.tier === 2) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.28, 0.02, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0xe03030, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 1.95;
        g.add(ring);
      }
    }

    // ---- 高精度命中：标记各身体部位，供武器系统 Raycaster 精确求交 ----
    // (血条 Sprite 不参与求交，避免命中始终面向相机的血条)
    this.hitMeshes = [
      head, visor, helmet, neck, torso, chestPlate, hips, shoulderL, shoulderR,
      ...armL.parts, ...armR.parts,
      ...legL.parts, ...legR.parts,
      ...gunParts,
    ];
    for (const m of [head, visor, helmet]) m.userData.part = 'head';
    for (const m of [neck, torso, chestPlate, hips, shoulderL, shoulderR]) m.userData.part = 'torso';
    for (const m of armL.parts.concat(armR.parts)) m.userData.part = 'arm';
    for (const m of legL.parts.concat(legR.parts)) m.userData.part = 'leg';
    for (const m of gunParts) m.userData.part = 'gun';
    for (const m of this.hitMeshes) m.userData.enemy = this;

    this._walkPhase = 0;
  }

  // 手臂（上臂 + 前臂 + 手），前伸并向内收拢持枪
  _buildArm(armorMat, clothMat, skinMat, side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.3, 1.42, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.34, 8), armorMat);
    upper.rotation.x = -Math.PI / 2;
    upper.position.set(side * -0.06, -0.08, -0.1);
    upper.castShadow = true;
    arm.add(upper);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.28, 8), clothMat);
    fore.rotation.x = -Math.PI / 2;
    fore.position.set(side * -0.16, -0.06, -0.3);
    arm.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
    hand.position.set(side * -0.24, -0.05, -0.44);
    arm.add(hand);
    return { group: arm, parts: [upper, fore, hand] };
  }

  // 腿（大腿 + 小腿 + 脚），髋部为走路摆动轴
  _buildLeg(clothMat, bootMat, side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0.94, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.44, 8), clothMat);
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    leg.add(thigh);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.4, 8), clothMat);
    shin.position.y = -0.6;
    leg.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), bootMat);
    foot.position.set(0, -0.85, 0.05);
    leg.add(foot);
    return { group: leg, parts: [thigh, shin, foot] };
  }

  _drawBar() {
    const ctx = this._barCtx;
    ctx.clearRect(0, 0, 64, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 64, 8);
    const r = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = r > 0.5 ? '#4ade60' : r > 0.25 ? '#f5b53a' : '#ff4040';
    ctx.fillRect(1, 1, 62 * r, 6);
    this._barTex.needsUpdate = true;
  }

  spawnAt(pos) {
    if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.z))) return false;
    // 碰撞解算：出生点随机偏移可能落入墙/掩体内；先推出，再做无副作用复核。
    const safe = typeof this.map.findNearestFree === 'function'
      ? this.map.findNearestFree(pos.x, pos.z, this.radius, 12)
      : null;
    const r = safe || this.map.collide(pos.x, pos.z, this.radius);
    if (this.map && typeof this.map.isCircleFree === 'function' &&
        !this.map.isCircleFree(r.x, r.z, this.radius)) return false;
    this.position.set(r.x, 0, r.z);
    this.velocity.set(0, 0, 0);
    this.health = this.maxHealth;
    this.alive = true;
    this.deathTimer = 0;
    this._deathAge = 0;
    this.state = 'idle';
    this._huntDelay = 0.4 + Math.random() * 0.8;
    this.seePlayer = false;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.position.copy(this.position);
    this._barSprite.visible = false;
    this._stuckTimer = 0;
    this._escapeTimer = 0;
    this._wantsMove = false;
    this._lastPos.copy(this.position);
    this._lastValidPos.copy(this.position);
    this._containmentTimer = Math.random() * 0.12;
    this._seeTimer = Math.random() * 0.12;
    this._avoidTimer = Math.random() * 0.1;
    this.magazine = this.magazineSize;
    this.reserve = this.reserveMax;
    this.reloadTimer = 0;
    this.reloadRecoverTimer = 0;
    this.fireCooldown = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this._ammoTarget = null;
    this._ammoSearchTimer = Math.random() * Math.max(0.1, Number((CONFIG.enemy.ammo || {}).searchInterval) || 0.45);
    this._ammoPickupCooldown = 0;
    this._path = null;
    this._pathIndex = 0;
    this._pathRefreshTimer = Math.random() * 0.25;
    this._pathTarget.set(Infinity, 0, Infinity);
    this.rushTime = 0;
    this.rushEvadeTime = 0;
    this.rushCooldown = 2.5 + Math.random() * 3;
    this.meleeCooldown = 0;
    this._rigUpdateAccumulator = 0;
    if (this._rigInstance) this._rigInstance.reset();
    return true;
  }

  deactivateForPool() {
    this.alive = false;
    this.state = 'pooled';
    this.deathTimer = 0;
    this.velocity.set(0, 0, 0);
    this.mesh.visible = false;
    this.mesh.rotation.set(0, 0, 0);
    if (this._barSprite) this._barSprite.visible = false;
    // 对象池复用前丢弃上一个难度留下的补给目标和导航路径。
    this._clearPickupSearch();
    this._clearNavigationState();
  }

  // ---------- 受击 ----------
  takeDamage(amount, part) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this._rigInstance) this._rigInstance.triggerHit(part || 'torso');
    this._barSprite.visible = true;
    this._drawBar();
    // 受击立刻进入战斗
    if (this.state === 'idle') {
      this.state = 'engage';
      this.lastSeenPos.copy(this.player.getFeet());
    }
    if (this.health <= 0) {
      this._die(part);
      return true;
    }
    return false;
  }

  _die(part) {
    this.alive = false;
    this.state = 'dead';
    this.deathTimer = 0.9;
    this._deathAge = 0;
    this._barSprite.visible = false;
    if (this._rigInstance) this._rigInstance.triggerDeath();
    // 爆头固定掉落弹药、血包、护甲；手榴弹掉落与护甲掉落分别独立判定。
    // 爆头分支保留三件套原调用契约，第四件由同一 dropBundle 负责错开位置。
    const canBundle = this.pickups && typeof this.pickups.dropBundle === 'function';
    const grenadeDrop = !!this.pickups && Math.random() < Math.max(0, Math.min(1, Number(CONFIG.enemy.grenadeDropChance) || 0));
    const armorDrop = !!this.pickups && part !== 'head' &&
      Math.random() < Math.max(0, Math.min(1, Number(CONFIG.enemy.armorDropChance) || 0));
    if (part === 'head' && canBundle) {
      if (grenadeDrop) this.pickups.dropBundle(this.position, ['ammo', 'health', 'armor', 'grenade']);
      else this.pickups.dropBundle(this.position, ['ammo', 'health', 'armor']);
    } else if (canBundle && (armorDrop || grenadeDrop)) {
      const types = [];
      if (armorDrop) types.push('armor');
      if (grenadeDrop) types.push('grenade');
      this.pickups.dropBundle(this.position, types);
    } else if (this.pickups && armorDrop) {
      const pk = new Pickup(this.scene, { x: this.position.x, z: this.position.z }, 'armor', true);
      this.pickups.addDynamic(pk);
    } else if (this.pickups && grenadeDrop) {
      const pk = new Pickup(this.scene, { x: this.position.x, z: this.position.z }, 'grenade', true);
      this.pickups.addDynamic(pk);
    }
    // 倒地动画：整体旋转倒下
  }

  // ---------- 视线检测 ----------
  _canSeePlayer() {
    // 独立行为测试会绕过构造器；真实实例在构造时已创建这些复用对象。
    this._tmpEye = this._tmpEye || new THREE.Vector3();
    this._tmpTo = this._tmpTo || new THREE.Vector3();
    this._tmpFlat = this._tmpFlat || new THREE.Vector3();
    this._tmpFwd = this._tmpFwd || new THREE.Vector3();
    this._eye2 = this._eye2 || { x: 0, z: 0 };
    this._target2 = this._target2 || { x: 0, z: 0 };
    const eye = this._tmpEye.set(this.position.x, 1.6, this.position.z);
    const target = this.player.getEye();
    const to = this._tmpTo.copy(target).sub(eye);
    const dist = to.length();
    if (dist > CONFIG.enemy.sightRange) return false;
    to.normalize();
    // 视野角（敌人朝向）
    const fwd = this._tmpFwd.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    const flat = this._tmpFlat.copy(to).setY(0);
    if (flat.lengthSq() > 0) flat.normalize();
    const dot = fwd.dot(flat);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    // FOV 检测：在视野内或距离很近
    if (angle > CONFIG.enemy.fov && dist > 6) return false;
    // 日常感知走眼高墙线；射击瞬间仍由 _canHitPlayer() 进行真实三角/AABB 射线认证。
    if (CONFIG.ai && CONFIG.ai.losMode === 'seg' && this.map &&
        typeof this.map.hasFastLineOfSight === 'function') {
      return this.map.hasFastLineOfSight(this.position.x, this.position.z, target.x, target.z, eye.y);
    }
    const wallDist = this.map.raycast(eye, to, dist);   // losMode='ray' 回退原逻辑
    return wallDist >= dist - 0.5;
  }

  // 射击瞬间再次确认弹道无遮挡。
  // 视线检测有 0.12s 节流，不能直接把缓存结果当成子弹命中许可；
  // 敌我射击都必须经过同一张地图 AABB 射线边界，避免敌人隔墙造成伤害。
  _canHitPlayer() {
    if (!this.player || !this.map || typeof this.player.getEye !== 'function') return false;
    this._tmpEye = this._tmpEye || new THREE.Vector3();
    this._tmpTo = this._tmpTo || new THREE.Vector3();
    const eye = this._tmpEye.set(this.position.x, 1.6, this.position.z);
    const target = this.player.getEye();
    const to = this._tmpTo.copy(target).sub(eye);
    const dist = to.length();
    if (!Number.isFinite(dist) || dist <= 0.01) return true;
    to.multiplyScalar(1 / dist);
    if (typeof this.map.raycastDetailed === 'function') {
      const wall = this.map.raycastDetailed(eye, to, dist);
      return !wall || wall.t >= dist - 0.08;
    }
    if (typeof this.map.raycast === 'function') {
      return this.map.raycast(eye, to, dist) >= dist - 0.08;
    }
    return true;
  }

  // ---------- 主更新 ----------
  update(dt) {
    if (!this.alive) {
      // 倒地动画
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        this._deathAge = (this._deathAge || 0) + dt;
        const fall = Math.min(1, this._deathAge / 0.45);
        if (this._rigInstance && this._deathAge <= 0.45) {
          this._rigInstance.update(dt, {
            speed: 0,
            forward: 0,
            side: 0,
            state: 'dead',
            distance: 0,
            rushing: false,
          });
        }
        this.mesh.rotation.x = fall * (Math.PI / 2) * 0.9;
        this.mesh.position.y = -fall * 0.3;
        if (this.deathTimer <= 0) this.mesh.visible = false;
      }
      return;
    }

    this._updateAmmo(dt);

    const playerFeet = this.player.getFeet();
    const toPlayer = this._tmpTo.copy(playerFeet).sub(this.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const dirToPlayer = this._tmpDir.copy(toPlayer);
    if (dist > 0.01) dirToPlayer.multiplyScalar(1 / dist); else dirToPlayer.set(0, 0, 0);

    // 远处敌人降低感知频率；开火前仍会单独做权威遮挡判定。
    this._seeTimer = (this._seeTimer || 0) - dt;
    let seen = this.seePlayer;   // 节流间隔内沿用上次结果
    if (this._seeTimer <= 0) {
      this._seeTimer = dist <= 12 ? 0.12 : (dist <= 25 ? 0.2 : 0.35);
      seen = this._canSeePlayer();
      this.seePlayer = seen;
    }
    if (seen) {
      this.lastSeenPos.copy(this.player.getFeet());
      if (this.state === 'idle') {
        this.reactionTimer = CONFIG.enemy.reactionTime * this.difficultyReactionMul;
        this.state = 'react';
      }
    } else if (this.state === 'idle' && this.autoHunt) {
      // 只有灾难级允许在未看见玩家时主动搜索并进入追击状态。
      this._huntDelay -= dt;
      if (this._huntDelay <= 0) {
        this.lastSeenPos.copy(this.player.getFeet());
        this.state = 'engage';
      }
    }

    // 反应期
    if (this.state === 'react') {
      this.reactionTimer -= dt;
      if (this.reactionTimer <= 0) this.state = 'engage';
      this._moveTowards(dirToPlayer, dt, 0);   // 反应期不动
    } else if (this.state === 'engage') {
      this._engage(dist, dirToPlayer, dt, seen);
    }

    // 朝向：始终面向玩家或移动方向
    if (this.state !== 'idle') {
      this.facing = Math.atan2(-dirToPlayer.x, -dirToPlayer.z);
    }

    // ---- 卡墙检测：有移动意图但位移过小，持续判定后执行一次安全脱困 ----
    if (this.state === 'engage' || this.state === 'react') {
      const moved = Math.hypot(this.position.x - this._lastPos.x, this.position.z - this._lastPos.z);
      this._lastPos.copy(this.position);
      if (this._wantsMove && moved < 0.03) {
        this._stuckTimer += dt;
        if (this._stuckTimer > 1.8 && this._escapeTimer <= 0) {
          this._stuckTimer = 0;
          this._recoverFromStuck();
        }
      } else {
        this._stuckTimer = 0;
      }
    } else {
      this._lastPos.copy(this.position);
      this._stuckTimer = 0;
    }

    // 应用位置（先做 AI-AI 防穿模推挤：位置已由 _engage/_moveTowards 更新完，推挤后 mesh 自动跟随）
    this._avoidAI(dt);
    // 无论是否仍有位移，都定期复核实体圆是否落在合法空间。旧逻辑只检查
    // “想移动但几乎没动”，敌人嵌入墙后若仍沿墙缓慢滑动就永远不会触发脱困。
    this._containmentTimer = Math.max(0, (Number(this._containmentTimer) || 0) - dt);
    if (this._containmentTimer <= 0) {
      this._containmentTimer = Math.max(0.08, Number(CONFIG.ai && CONFIG.ai.containmentCheckInterval) || 0.18);
      const free = !this.map || typeof this.map.isCircleFree !== 'function' ||
        this.map.isCircleFree(this.position.x, this.position.z, this.radius);
      if (free) this._lastValidPos.copy(this.position);
      else this._recoverFromStuck(true);
    }
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    this.mesh.rotation.y = this.facing;

    // 混合骨骼系统接收相对朝向的二维速度：下半身自由移动，上半身持续瞄准并可叠加射击。
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    if (this._rigInstance) {
      this._rigUpdateAccumulator = (this._rigUpdateAccumulator || 0) + dt;
      const animationProfile = (CONFIG.performance && CONFIG.performance.enemyAnimationProfile) || {};
      const nearDistance = Number(animationProfile.nearDistance) || 12;
      const farDistance = Number(animationProfile.farDistance) || 25;
      const nearInterval = Math.max(0, Number(animationProfile.nearInterval) || 0);
      const midInterval = Math.max(0, Number(animationProfile.midInterval) || (1 / 30));
      const farInterval = Math.max(0, Number(animationProfile.farInterval) || (1 / 15));
      const rigInterval = dist <= nearDistance ? nearInterval : (dist <= farDistance ? midInterval : farInterval);
      if (rigInterval > 0 && this._rigUpdateAccumulator < rigInterval) return;
      const rigDt = this._rigUpdateAccumulator;
      this._rigUpdateAccumulator = 0;
      const forwardX = -Math.sin(this.facing);
      const forwardZ = -Math.cos(this.facing);
      const rightX = Math.cos(this.facing);
      const rightZ = -Math.sin(this.facing);
      const motionScale = Math.max(this.speed || sp, 0.001);
      this._rigInstance.update(rigDt, {
        speed: sp,
        forward: Math.max(-1, Math.min(1, (this.velocity.x * forwardX + this.velocity.z * forwardZ) / motionScale)),
        side: Math.max(-1, Math.min(1, (this.velocity.x * rightX + this.velocity.z * rightZ) / motionScale)),
        state: this.state,
        distance: dist,
        rushing: this.rushTime > 0,
      });
    } else if (sp > 0.3) {
      this._walkPhase += dt * sp * 3;
      this._legL.rotation.x = Math.sin(this._walkPhase) * 0.5;
      this._legR.rotation.x = -Math.sin(this._walkPhase) * 0.5;
    } else {
      this._legL.rotation.x *= 0.8;
      this._legR.rotation.x *= 0.8;
    }
  }

  _engage(dist, dirToPlayer, dt, seen) {
    const E = CONFIG.enemy;
    const moveDir = this._tmpMove.set(0, 0, 0);
    let curSpeed = 0;

    // 卡墙强制逃离：朝最开阔方向走（不开火），优先解困
    if (this._escapeTimer > 0) {
      this._escapeTimer -= dt;
      const dir = this._tmpAux.set(Math.cos(this._escapeDir), 0, Math.sin(this._escapeDir));
      this._moveTowards(dir, dt, this.speed);
      return;
    }

    // 低血或低弹时主动争抢最近补给；补到弹后仍要走正常换弹读条。
    if (this._seekAmmo(dt)) return;
    if (this._magazineCount() <= 0 && this._reserveCount() > 0) this._startReload();

    // 非灾难级只在看见玩家时进行战斗移动；失去视线后不继续追踪玩家。
    // 脱困分支在上方优先执行，因此碰撞恢复能力不受该门禁影响。
    if (!seen && !this.autoHunt) {
      this._clearNavigationState();
      this._clearPickupSearch();
      this.rushTime = 0;
      this.rushEvadeTime = 0;
      this._wantsMove = false;
      this.state = 'idle';
      this.reactionTimer = 0;
      this._huntDelay = 0.4 + Math.random() * 0.8;
      if (this.velocity) {
        this.velocity.x *= 0.8;
        this.velocity.z *= 0.8;
      }
      return;
    }

    const aiCfg = CONFIG.ai || {};
    const rushStartDistance = Math.max(8, Number(aiCfg.rushStartDistance) || 12);
    const rushStopDistance = Math.max(5, Math.min(rushStartDistance - 1, Number(aiCfg.rushStopDistance) || 7.5));
    // ---- 冲刺突进（rush）：只从中距离发起，到安全射击距离立即结束 ----
    if (this.canRush && !this._isReloadLocked() && dist <= rushStartDistance && dist > rushStopDistance + 0.5 &&
        this.rushTime <= 0 && this.rushEvadeTime <= 0 && this.rushCooldown <= 0) {
      this.rushTime = Math.max(0.35, Number(aiCfg.rushDuration) || 0.9);
      this.rushCooldown = 3 + Math.random() * 3;
      if (this.hud) this.hud.toast(`${this.tierLabel || ''}敌人发起冲锋！`.trim());
    }
    if (this.rushTime > 0 && dist <= rushStopDistance) {
      this.rushTime = 0;
      this.rushEvadeTime = Math.max(0.5, Number(aiCfg.rushEvadeDuration) || 1.25);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.rushTime > 0) {
      this.rushTime -= dt;
      moveDir.copy(dirToPlayer);
      curSpeed = this.speed * Math.max(1.2, Number(aiCfg.rushSpeedMul) || 2.15);
      if (!seen && this.autoHunt && this.useNavigation && dist > 6) {
        this._routeDirection(this.player.getFeet(), dt, moveDir, true);
      }
      this._moveTowards(moveDir, dt, curSpeed);
      if (this.rushTime <= 0) {
        this.rushEvadeTime = Math.max(this.rushEvadeTime, Math.max(0.5, Number(aiCfg.rushEvadeDuration) || 1.25));
      }
    } else {
      this.rushCooldown -= dt;

      // 冲锋结束后先侧移并保持距离；精英可以更积极，但不能继续贴脸压到玩家身边。
      if (this.rushEvadeTime > 0) {
        this.rushEvadeTime = Math.max(0, this.rushEvadeTime - dt);
        const side = this._tmpAux.set(-dirToPlayer.z, 0, dirToPlayer.x).multiplyScalar(this.strafeDir);
        moveDir.copy(side).addScaledVector(dirToPlayer, dist < rushStopDistance ? -0.55 : -0.12).normalize();
        curSpeed = this.speed;
      } else if (dist > 18) {
        moveDir.copy(dirToPlayer);
        curSpeed = this.speed * 1.3;
      } else if (dist < 6) {
        if (this.canPush) {
          const side = this._tmpAux.set(-dirToPlayer.z, 0, dirToPlayer.x).multiplyScalar(this.strafeDir);
          moveDir.copy(side).addScaledVector(dirToPlayer, -0.45).normalize();
          curSpeed = this.speed * 1.05;
        } else {
          moveDir.copy(dirToPlayer).multiplyScalar(-1);
          curSpeed = this.speed;
        }
      } else {
        // 中距离：横向绕圈
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeDir *= -1;
          this.strafeTimer = 1 + Math.random() * 2;
        }
        // 偶尔向玩家靠近
        if (dist > 12) moveDir.addScaledVector(dirToPlayer, 0.5);
        // 横向
        const side = this._tmpAux.set(-dirToPlayer.z, 0, dirToPlayer.x).multiplyScalar(this.strafeDir);
        moveDir.add(side);
        if (moveDir.lengthSq() > 0) moveDir.normalize();
        curSpeed = this.speed * 0.9;
      }
      if (!seen && this.autoHunt && this.useNavigation && dist > 6) {
        this._routeDirection(this.player.getFeet(), dt, moveDir, true);
      }
      if (this._isReloadLocked()) {
        curSpeed *= Math.max(0.2, Math.min(1, Number((CONFIG.enemy.ammo || {}).reloadMoveSpeedMul) || 0.55));
      }
      this._moveTowards(moveDir, dt, curSpeed);
    }

    // 近战冷却（非冲刺触发的近战，如敌人贴身时概率出拳）
    if (this.canMelee && this.meleeCooldown > 0) this.meleeCooldown -= dt;

    // 开火（冲刺期间不开火，专注突进）
    if (this.rushTime <= 0 && !this._isReloadLocked()) {
      this.fireCooldown -= dt;
      if (seen && dist < E.fireRange && this.fireCooldown <= 0 && this._magazineCount() > 0) {
        this._fireBurst(dist);
        // fireIntervalMul：精英/王牌开火更密集
        this.fireCooldown = (E.fireInterval + Math.random() * 0.4) * this.fireIntervalMul;
        // burstBonus：精英/王牌点射更长
        this.burstLeft = E.burstCount + this.burstBonus;
      }
    }
    // 点射间隔
    if (this.burstLeft > 0 && !this._isReloadLocked() && this._magazineCount() > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        const fired = this._shootOnce(dist);
        if (fired) {
          this.burstLeft--;
          this.burstTimer = E.burstDelay;
        } else {
          this.burstLeft = 0;
        }
      }
    } else if (this._magazineCount() <= 0) {
      this.burstLeft = 0;
    }

    // 近身近战：非冲刺状态下，贴身且冷却好了 → 概率出拳
    if (this.canMelee && this.meleeCooldown <= 0 && dist < 2.0 && Math.random() < 0.015) {
      this._meleeHit();
      this.meleeCooldown = 2.0;
    }
  }

  // 找一个最开阔的方向用于卡墙解困（采样 8 个方向，选离墙最远者）
  _findEscapeDir() {
    let bestA = 0, bestClear = -1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      let clear = 0;
      for (let d = 0.5; d <= 6; d += 0.5) {
        const r = this.map.collide(this.position.x + dx * d, this.position.z + dz * d, this.radius);
        if (Math.abs(r.x - (this.position.x + dx * d)) > 0.01 || Math.abs(r.z - (this.position.z + dz * d)) > 0.01) break;
        clear = d;
      }
      if (clear > bestClear) { bestClear = clear; bestA = a; }
    }
    return bestA;
  }

  // 先把已经卡入碰撞盒的敌人移到最近合法位置；找不到时才使用方向逃离，
  // 防止“永远在墙内但每帧仍按追击方向移动”的状态持续存在。
  // 升级梯队：就近合法点 → 上次合法位置 → 最近敌人出生点（恒合法）。
  // 真机反馈 2026-09-03：密集集装箱区 findNearestFree 与 lastValid 双双
  // 失败时旧逻辑静默放弃，敌人会永久嵌在墙内——出生点兜底保证必然脱离。
  _recoverFromStuck(forceRelocate = false) {
    const currentlyFree = this.map && typeof this.map.isCircleFree === 'function'
      ? this.map.isCircleFree(this.position.x, this.position.z, this.radius)
      : false;
    this._stuckRecoveryCount = (this._stuckRecoveryCount || 0) + 1;
    if (!currentlyFree && this.map && typeof this.map.findNearestFree === 'function') {
      const occupied = Array.isArray(this.enemies)
        ? this.enemies.filter((enemy) => enemy && enemy !== this && enemy.alive).map((enemy) => enemy.position)
        : [];
      const spacing = Math.max(this.radius * 2, Number(CONFIG.ai && CONFIG.ai.aiSpacing) || 0.9);
      const safe = this.map.findNearestFree(
        this.position.x, this.position.z, this.radius, 12, occupied, spacing
      );
      if (safe) {
        this.position.x = safe.x;
        this.position.z = safe.z;
        this.velocity.x = 0;
        this.velocity.z = 0;
        this._lastPos.copy(this.position);
        this._lastValidPos = this._lastValidPos || new THREE.Vector3();
        this._lastValidPos.copy(this.position);
        this._path = null;
        this._pathIndex = 0;
        return true;
      }
      const lastValid = this._lastValidPos;
      if (lastValid && this.map.isCircleFree(lastValid.x, lastValid.z, this.radius)) {
        this.position.copy(lastValid);
        this.velocity.set(0, 0, 0);
        this._path = null;
        this._pathIndex = 0;
        return true;
      }
      // 兜底：就近与上次合法位置都不可用时，传送到最近的固定出生点。
      // 出生点由地图构建保证合法；传送距离可能较远，但优于永久卡死。
      if (this.map.spawns && Array.isArray(this.map.spawns.enemy) && this.map.spawns.enemy.length > 0) {
        let best = null;
        let bestDistSq = Infinity;
        for (const s of this.map.spawns.enemy) {
          if (!s) continue;
          const dx = s.x - this.position.x, dz = s.z - this.position.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) { bestDistSq = dSq; best = s; }
        }
        if (best) {
          const resolved = this.map.collide(best.x, best.z, this.radius);
          if (this.map.isCircleFree(resolved.x, resolved.z, this.radius)) {
            this.position.x = resolved.x;
            this.position.z = resolved.z;
            this.position.y = 0;
            this.velocity.set(0, 0, 0);
            this._lastPos.copy(this.position);
            this._lastValidPos = this._lastValidPos || new THREE.Vector3();
            this._lastValidPos.copy(this.position);
            this._path = null;
            this._pathIndex = 0;
            return true;
          }
        }
      }
      return false;
    }
    if (forceRelocate && !currentlyFree) return false;
    this._escapeDir = this._findEscapeDir();
    this._escapeTimer = 1.2;
    return true;
  }

  _routeDirection(target, dt, out, usePlayerFlow = false) {
    const result = out || this._tmpAux;
    // 导航包括 A* 和玩家流场；只有显式开启导航的灾难级实例可以触发。
    if (this.useNavigation !== true || (usePlayerFlow && this.autoHunt !== true)) {
      result.set(0, 0, 0);
      return false;
    }
    if (usePlayerFlow && this.map && typeof this.map.flowDirectionAt === 'function' &&
        this.map.flowDirectionAt(this.position.x, this.position.z, result)) {
      return true;
    }
    const targetMoved = Math.hypot(target.x - this._pathTarget.x, target.z - this._pathTarget.z) > 1.25;
    this._pathRefreshTimer -= Math.max(0, Number(dt) || 0);
    if (targetMoved || this._pathRefreshTimer <= 0 || !this._path || this._pathIndex >= this._path.length) {
      this._pathRefreshTimer = Math.max(0.25, Number(CONFIG.ai && CONFIG.ai.navigationRefresh) || 0.65);
      this._pathTarget.set(target.x, 0, target.z);
      this._path = this.map && typeof this.map.findPath === 'function'
        ? this.map.findPath(this.position.x, this.position.z, target.x, target.z, this.radius)
        : null;
      this._pathIndex = 0;
    }
    if (!this._path || this._path.length === 0) {
      result.set(target.x - this.position.x, 0, target.z - this.position.z);
      if (result.lengthSq() > 1e-6) result.normalize();
      return false;
    }
    while (this._pathIndex < this._path.length) {
      const waypoint = this._path[this._pathIndex];
      if (Math.hypot(waypoint.x - this.position.x, waypoint.z - this.position.z) > 0.62) break;
      this._pathIndex++;
    }
    const waypoint = this._path[Math.min(this._pathIndex, this._path.length - 1)];
    result.set(waypoint.x - this.position.x, 0, waypoint.z - this.position.z);
    if (result.lengthSq() > 1e-6) result.normalize();
    return true;
  }

  _moveTowards(dir, dt, speed) {
    this._wantsMove = speed > 0 && dir.lengthSq() > 0;
    if (!this._wantsMove) {
      this.velocity.x *= 0.8; this.velocity.z *= 0.8;
      return;
    }
    const startX = this.position.x;
    const startZ = this.position.z;
    const startFree = !this.map || typeof this.map.isCircleFree !== 'function' ||
      this.map.isCircleFree(startX, startZ, this.radius);
    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.z * speed;
    // 积分
    let nx = this.position.x + this.velocity.x * dt;
    let nz = this.position.z + this.velocity.z * dt;
    const r = typeof this.map.moveCircle === 'function'
      ? this.map.moveCircle(this.position.x, this.position.z, nx, nz, this.radius)
      : this.map.collide(nx, nz, this.radius);
    const pushX = r.x - nx, pushZ = r.z - nz;
    const blocked = Math.abs(pushX) > 0.001 || Math.abs(pushZ) > 0.001;
    if (blocked) {
      // 滑墙：把速度中撞墙法线方向的分量移除，剩余切向分量继续移动
      const len = Math.hypot(pushX, pushZ) || 1;
      const nX = pushX / len, nZ = pushZ / len;
      const dot = this.velocity.x * nX + this.velocity.z * nZ;
      if (dot < 0) {
        let sX = this.velocity.x - dot * nX;
        let sZ = this.velocity.z - dot * nZ;
        const sLen = Math.hypot(sX, sZ);
        if (sLen > 0.001) {
          // 切向速度归一化到原速（保持移动节奏）
          sX = (sX / sLen) * speed;
          sZ = (sZ / sLen) * speed;
          const altX = this.position.x + sX * dt;
          const altZ = this.position.z + sZ * dt;
          const r2 = typeof this.map.moveCircle === 'function'
            ? this.map.moveCircle(this.position.x, this.position.z, altX, altZ, this.radius)
            : this.map.collide(altX, altZ, this.radius);
          if (Math.abs(r2.x - altX) < 0.001 && Math.abs(r2.z - altZ) < 0.001) {
            nx = r2.x; nz = r2.z;
          } else {
            nx = r.x; nz = r.z;   // 切向也被挡 → 原地，交给卡墙检测换向
          }
        } else {
          // 纯正面撞墙没有切向速度，必须停在碰撞解算后的合法位置，不能继续使用穿墙终点。
          nx = r.x; nz = r.z;
        }
      } else {
        nx = r.x; nz = r.z;
      }
    }
    if (this.map && typeof this.map.isCircleFree === 'function' &&
        !this.map.isCircleFree(nx, nz, this.radius)) {
      if (startFree) {
        nx = startX;
        nz = startZ;
      } else if (typeof this.map.findNearestFree === 'function') {
        const safe = this.map.findNearestFree(nx, nz, this.radius, 12);
        if (safe) { nx = safe.x; nz = safe.z; }
      }
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    this.position.set(nx, this.position.y, nz);
    if (!this.map || typeof this.map.isCircleFree !== 'function' ||
        this.map.isCircleFree(nx, nz, this.radius)) {
      this._lastValidPos = this._lastValidPos || new THREE.Vector3();
      this._lastValidPos.copy(this.position);
    }
  }

  // AI-AI 纯位置约束（three-cs pointToSegmentDistance 思路，平方距离即可）：
  // 只推自己、不修改他人位置、不改变追击/开火/横移行为策略
  _avoidAI(dt) {
    this._avoidTimer = (this._avoidTimer || 0) - dt;
    if (this._avoidTimer > 0) return;
    this._avoidTimer = 0.1;                          // 10Hz 节流
    const others = this.spatialHash && typeof this.spatialHash.queryInto === 'function'
      ? this.spatialHash.queryInto(this.position.x, this.position.z, (CONFIG.ai && CONFIG.ai.aiSpacing) || 0.9, this._nearbyEnemies)
      : this.enemies;
    if (!others || others.length < 2) return;
    const spacing = (CONFIG.ai && CONFIG.ai.aiSpacing) || 0.9;
    const minSq = spacing * spacing;
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const dx = this.position.x - o.position.x;
      const dz = this.position.z - o.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq >= minSq) continue;
      let d = Math.sqrt(dSq);
      let nx, nz;
      if (dSq < 1e-6) {
        // 完全重合时没有天然法线。使用数组顺序生成成对相反的确定性方向，
        // 避免两个敌人永久保持同坐标，也避免每帧随机抖动。
        const allEnemies = this.enemies || others;
        const selfIndex = Math.max(0, allEnemies.indexOf(this));
        const otherIndex = Math.max(0, allEnemies.indexOf(o));
        const low = Math.min(selfIndex, otherIndex);
        const high = Math.max(selfIndex, otherIndex);
        const angle = ((low + 1) * 1.61803398875 + (high + 1) * 0.754877666) % (Math.PI * 2);
        const sign = selfIndex <= otherIndex ? 1 : -1;
        nx = Math.cos(angle) * sign;
        nz = Math.sin(angle) * sign;
        d = 0;
      } else {
        nx = dx / d;
        nz = dz / d;
      }
      const push = (spacing - d) * 0.5;              // 只推开自己（半距，两敌各让 0.5 视觉均衡）
      const startX = this.position.x, startZ = this.position.z;
      const targetX = startX + nx * push, targetZ = startZ + nz * push;
      // 分离位移同样沿完整轨迹求解；只检查终点会让两个重叠敌人在窄墙两侧互推穿墙。
      const r = typeof this.map.moveCircle === 'function'
        ? this.map.moveCircle(startX, startZ, targetX, targetZ, this.radius)
        : this.map.collide(targetX, targetZ, this.radius);
      const legal = !this.map || typeof this.map.isCircleFree !== 'function' ||
        this.map.isCircleFree(r.x, r.z, this.radius);
      if (legal) {
        this.position.x = r.x; this.position.z = r.z;
        this._lastValidPos = this._lastValidPos || new THREE.Vector3();
        this._lastValidPos.copy(this.position);
      } else {
        this.position.x = startX; this.position.z = startZ;
      }
    }
  }

  _fireBurst(dist) {
    this.burstTimer = 0;
  }

  _magazineCount() {
    const ammoCfg = CONFIG.enemy.ammo || {};
    const fallback = Math.max(1, Math.floor(Number(ammoCfg.magazineSize) || 18));
    if (!Number.isFinite(Number(this.magazine))) this.magazine = fallback;
    return Math.max(0, Math.floor(Number(this.magazine)));
  }

  _reserveCount() {
    const ammoCfg = CONFIG.enemy.ammo || {};
    const fallback = Math.max(0, Math.floor(Number(ammoCfg.reserveSize) || 54));
    if (!Number.isFinite(Number(this.reserve))) this.reserve = fallback;
    if (!Number.isFinite(Number(this.reserveMax))) this.reserveMax = fallback;
    return Math.max(0, Math.floor(Number(this.reserve)));
  }

  _updateAmmo(dt) {
    if (!Number.isFinite(Number(this.reloadTimer))) this.reloadTimer = 0;
    if (!Number.isFinite(Number(this.reloadRecoverTimer))) this.reloadRecoverTimer = 0;
    const delta = Math.max(0, Number(dt) || 0);
    if (this.reloadRecoverTimer > 0) {
      this.reloadRecoverTimer = Math.max(0, this.reloadRecoverTimer - delta);
    }
    if (this.reloadTimer <= 0) return;
    this.reloadTimer = Math.max(0, this.reloadTimer - delta);
    if (this.reloadTimer > 0) return;
    const ammoCfg = CONFIG.enemy.ammo || {};
    const capacity = Math.max(1, Math.floor(Number(this.magazineSize) || Number(ammoCfg.magazineSize) || 18));
    const reserve = this._reserveCount();
    const missing = Math.max(0, capacity - this._magazineCount());
    const loaded = Math.min(missing, reserve);
    this.magazine += loaded;
    this.reserve -= loaded;
    this.reloadRecoverTimer = Math.max(0.1, Number(ammoCfg.postReloadDelay) || 0.45);
    this.burstLeft = 0;
    this.burstTimer = 0;
  }

  _isReloadLocked() {
    return (Number(this.reloadTimer) || 0) > 0 || (Number(this.reloadRecoverTimer) || 0) > 0;
  }

  _startReload() {
    if ((Number(this.reloadTimer) || 0) > 0 || this._magazineCount() > 0 || this._reserveCount() <= 0) return false;
    const ammoCfg = CONFIG.enemy.ammo || {};
    this.reloadTimer = Math.max(0.5, Number(ammoCfg.reloadTime) || 2.2);
    this.reloadRecoverTimer = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.rushTime = 0;
    this.rushEvadeTime = Math.max(this.rushEvadeTime || 0, 0.5);
    return true;
  }

  _seekAmmo(dt) {
    // 补给搜索、拾取和通往补给点的路径是一组能力门禁；非灾难级全部关闭。
    if (this.seekPickups !== true || this.useNavigation !== true) {
      this._clearPickupSearch();
      if (this.useNavigation !== true) this._clearNavigationState();
      return false;
    }
    const ammoCfg = CONFIG.enemy.ammo || {};
    const healthRatio = Math.max(0, Number(this.health) || 0) / Math.max(1, Number(this.maxHealth) || 1);
    const totalAmmo = this._magazineCount() + this._reserveCount();
    const ammoCapacity = Math.max(1, this.magazineSize + this.reserveMax);
    const needsHealth = healthRatio <= (Number(ammoCfg.healthSeekRatio) || 0.55);
    const needsAmmo = totalAmmo / ammoCapacity <= (Number(ammoCfg.ammoSeekRatio) || 0.45);
    const wantedTypes = needsHealth && needsAmmo ? ['health', 'ammo'] : needsHealth ? ['health'] : needsAmmo ? ['ammo'] : [];
    if (wantedTypes.length === 0) {
      this._ammoTarget = null;
      return false;
    }
    if (this._ammoTarget && !wantedTypes.includes(this._ammoTarget.type)) this._ammoTarget = null;
    const delta = Math.max(0, Number(dt) || 0);
    this._ammoSearchTimer = Math.max(0, (Number(this._ammoSearchTimer) || 0) - delta);
    this._ammoPickupCooldown = Math.max(0, (Number(this._ammoPickupCooldown) || 0) - delta);
    if (!this.pickups) return false;
    // 没找到补给时遵守搜索间隔，不让“无弹敌人”每帧扫描整张拾取列表。
    if (!this._ammoTarget && this._ammoSearchTimer > 0) return false;
    if (this._ammoSearchTimer <= 0 || !this._ammoTarget || !this._ammoTarget.active) {
      this._ammoSearchTimer = Math.max(0.1, Number(ammoCfg.searchInterval) || 0.45);
      this._ammoTarget = null;
      const maxDistance = Number(ammoCfg.pickupSearchRadius) || 28;
      for (const type of wantedTypes) {
        const candidates = typeof this.pickups.findActiveCandidates === 'function'
          ? this.pickups.findActiveCandidates(type, this.position.x, this.position.z, maxDistance)
          : [this.pickups.findNearestActive(type, this.position.x, this.position.z, maxDistance)].filter(Boolean);
        for (const candidate of candidates) {
          const path = this.map && typeof this.map.findPath === 'function'
            ? this.map.findPath(this.position.x, this.position.z, candidate.pos.x, candidate.pos.z, this.radius)
            : [];
          if (path === null) continue;
          this._ammoTarget = candidate;
          this._path = path;
          this._pathIndex = 0;
          this._pathTarget = this._pathTarget || new THREE.Vector3(Infinity, 0, Infinity);
          this._pathTarget.set(candidate.pos.x, 0, candidate.pos.z);
          this._pathRefreshTimer = Math.max(0.25, Number(CONFIG.ai && CONFIG.ai.navigationRefresh) || 0.65);
          break;
        }
        if (this._ammoTarget) break;
      }
    }
    const target = this._ammoTarget;
    if (!target) return false;
    const dx = target.pos.x - this.position.x;
    const dz = target.pos.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= (Number(ammoCfg.pickupRange) || 1.4)) {
      const collect = typeof this.pickups.collectForEnemy === 'function'
        ? this.pickups.collectForEnemy.bind(this.pickups)
        : this.pickups.collectAmmoForEnemy && this.pickups.collectAmmoForEnemy.bind(this.pickups);
      if (this._ammoPickupCooldown <= 0 && collect && collect(this, target)) {
        this._ammoPickupCooldown = 0.25;
        this._ammoTarget = null;
        if (target.type === 'ammo') this._startReload();
      }
      this._wantsMove = false;
      return true;
    }
    this._tmpAux = this._tmpAux || new THREE.Vector3();
    this._routeDirection(target.pos, dt, this._tmpAux);
    this._moveTowards(this._tmpAux, dt, this.speed);
    return true;
  }

  _shootOnce(dist) {
    const E = CONFIG.enemy;
    if (this._isReloadLocked() || this._magazineCount() <= 0) return false;
    this.magazine = this._magazineCount() - 1;
    if (this._rigInstance) this._rigInstance.triggerShot();
    // 命中率随距离衰减 + 精英/王牌命中加成
    const acc = Math.min(0.96, (E.hitChance + this.hitChanceAdd) * (this.difficultyAccuracyMul || 1) * Math.max(0.3, 1 - dist / E.fireRange));
    if (Math.random() < acc && this._canHitPlayer()) {
      // 是否暴击（头）：小概率
      const head = Math.random() < 0.12;
      const minDamage = Math.max(1, Number(E.damageMin != null ? E.damageMin : (E.damage != null ? E.damage : 8)));
      const maxDamage = Math.max(minDamage, Number(E.damageMax != null ? E.damageMax : (E.damage != null ? E.damage : minDamage)));
      const baseDamage = minDamage + Math.random() * (maxDamage - minDamage);
      const rawDamage = head ? baseDamage * (Number(E.headshotMultiplier) || 3) : baseDamage + (this.damageAdd || 0);
      const dmg = rawDamage * (this.difficultyDamageMul || 1);
      this.player.takeDamage(dmg);
      // 枪口火光（敌人朝向玩家）
    }
    // 音效（3D 空间音频：按敌人世界坐标播放；不可用时内部自动回退全局 enemyShot()）
    if (this.hud.audio) this.hud.audio.enemyShot3D(this.position);
    if (this._magazineCount() <= 0 && this._reserveCount() > 0) this._startReload();
    return true;
  }

  // ---- 近战重击（精英/王牌专属）----
  _meleeHit() {
    if (!this.player || !this.player.alive) return;
    const dist = this.position.distanceTo(this.player.getFeet());
    if (dist > 2.5) return;
    if (this._rigInstance) this._rigInstance.triggerMelee();
    // 近战必定命中（贴身），高伤害
    const dmg = (this.meleeDamage + (Math.random() * 4 - 2)) * (this.difficultyDamageMul || 1);
    this.player.takeDamage(dmg);
    // 近战冲击波（视觉）
    if (this.hud && this.hud.audio) this.hud.audio.enemyShot();
    // 屏幕震动反馈
    if (this.hud && this.hud._onMelee) this.hud._onMelee();
  }

  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    if (this._rigInstance) {
      // 只释放实例资源；共享人体几何、材质和贴图继续供其他敌人/下一波使用。
      if (this._barSprite && this._barSprite.material) this._barSprite.material.dispose();
      if (this._barTex) this._barTex.dispose();
      if (this._contactShadow) {
        if (this._contactShadow.geometry) this._contactShadow.geometry.dispose();
        if (this._contactShadow.material) this._contactShadow.material.dispose();
      }
      this._rigInstance.dispose();
      if (this.hitMeshes) this.hitMeshes.length = 0;
      this._rigInstance = null;
      this._barTex = null;
      this._barCanvas = null;
      this._barCtx = null;
      this._barSprite = null;
      this._contactShadow = null;
      this.mesh = null;
      return;
    }
    const geometries = new Set();
    const materials = new Set();
    this.mesh.traverse((obj) => {
      if (obj.geometry && !geometries.has(obj.geometry)) {
        geometries.add(obj.geometry);
        obj.geometry.dispose();
      }
      const list = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      for (const mat of list) {
        if (!materials.has(mat)) {
          materials.add(mat);
          mat.dispose();
        }
      }
    });
    if (this._barTex) this._barTex.dispose();
    if (this.hitMeshes) this.hitMeshes.length = 0;
    this._barTex = null;
    this._barCanvas = null;
    this._barCtx = null;
    this._barSprite = null;
    this.mesh = null;
  }
}

// 经典脚本全局暴露（依赖顺序：config → three(UMD) → map → player → enemy → …）
window.Enemy = Enemy;
