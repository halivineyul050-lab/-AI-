// player.js —— 第一人称玩家控制器
// 职责：鼠标拖动视角、WASD 加速度移动、跳跃/重力、AABB 碰撞、血量护甲
// 采用 Source/CS 风格的速度向量积分（地面摩擦 + 空中受限控制）
// 经典脚本（非 ES Module）：THREE / CONFIG / clamp 由前置脚本挂到 window 提供

class Player {
  constructor(camera, gameMap, hud) {
    this.camera = camera;
    this.map = gameMap;
    this.hud = hud;
    const P = CONFIG.player;

    // 位置用 yaw/pitch 表示朝向，position 表示脚底
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;

    // 状态（上限为实例字段：局内强化“陶瓷插板”可扩容，新局 reset 恢复默认）
    this.maxHealth = P.maxHealth;
    this.maxArmor = P.maxArmor;
    this.speedMul = 1;         // 局内强化“疾行背包”移速乘数
    this.health = P.maxHealth;
    this.armor = P.maxArmor;
    this.alive = true;
    this.crouching = false;
    this.crouchToggle = false;  // 触屏「蹲」按钮开关态（tap 切换；键盘 Shift/Ctrl 仍为按住）
    this._crouchAmt = 0;        // 下蹲视觉量 0~1（眼高平滑过渡）
    this.prone = false;
    this.proneToggle = false;   // 触屏/键盘「卧」按钮开关态
    this._proneAmt = 0;          // 卧姿视觉量 0~1（眼高与枪模平滑过渡）
    this._jumpRequested = false; // 跳跃按钮按下一次只消费一次，卧倒时转换为起身
    // 左右探头：leanTarget 由移动端按钮（-1/0/1）或 Q/E 键驱动，_leanAmt 平滑收敛。
    this.leanTarget = 0;
    this._leanAmt = 0;
    this.weaponSpeedMul = 1;   // 武器级移速系数（AWP 0.75，由 weapon.switchTo 注入）
    this.sensitivityScale = 1; // 设置页全局灵敏度倍率
    this.aimSensitivityMul = 1;// 开镜时由武器系统降低

    // 输入
    this.keys = {};
    this.moveTouch = { x: 0, y: 0 };   // 虚拟摇杆模拟量（x 右 / y 前，-1~1）
    this._bindInput();

    // 视觉：手臂/枪模型挂在相机下，weapon 模块会注入
    this.recoilOffset = 0;     // 当前后坐力造成的视角上抬（用于恢复）
    this.recoilRecover = 0.06;
    this.viewBob = 0;          // 走路晃动相位；停步时冻结，避免空闲枪口继续漂移
    this.viewBobAmount = 0;    // 晃动幅度单独回零，不再错误衰减相位
    this.touchLookReferencePx = CONFIG.player.touchReferenceShortSide || 460;
  }

  reset(spawn) {
    this.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = 0; this.pitch = 0;
    this.recoilOffset = 0;
    this.recoilRecover = 0.06;
    this.onGround = true;
    this.maxHealth = CONFIG.player.maxHealth;
    this.maxArmor = CONFIG.player.maxArmor;
    this.speedMul = 1;
    this.health = this.maxHealth;
    this.armor = this.maxArmor;
    this.alive = true;
    this.crouching = false;
    this.crouchToggle = false;
    this._crouchAmt = 0;
    this.prone = false;
    this.proneToggle = false;
    this._proneAmt = 0;
    this._jumpRequested = false;
    this.leanTarget = 0;
    this._leanAmt = 0;
    this.moveTouch.x = 0; this.moveTouch.y = 0;
    this.viewBob = 0;
    this.viewBobAmount = 0;
    this._syncCamera();
  }

  // ---------- 输入 ----------
  _bindInput() {
    this._onKeyDown = (e) => {
      // 防止 Space 滚动页面
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.requestJump();
        return;
      }
      this.keys[e.code] = true;
      if (e.code === 'KeyZ') {
        e.preventDefault();
        if (!e.repeat) this.toggleProne();
      }
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  // 由 main 在桌面端指针拖动时调用
  onMouseMove(e) {
    if (!this.alive) return;
    const s = CONFIG.player.mouseSensitivity * this.sensitivityScale * this.aimSensitivityMul;
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }

  // 触屏视角（灵敏度更高）
  onTouchLook(dx, dy, extraMul = 1) {
    if (!this.alive) return;
    const reference = Math.max(240, Number(this.touchLookReferencePx) || (CONFIG.player.touchReferenceShortSide || 460));
    const baseReference = CONFIG.player.touchReferenceShortSide || 460;
    const maxDelta = reference * (CONFIG.player.touchMaxDeltaRatio || 0.35);
    const safeDx = clamp(Number(dx) || 0, -maxDelta, maxDelta);
    const safeDy = clamp(Number(dy) || 0, -maxDelta, maxDelta);
    // 按逻辑短边归一化：同样占屏比例的滑动在手机和平板上得到相同转角。
    const s = CONFIG.player.touchSensitivity * (baseReference / reference) *
      this.sensitivityScale * this.aimSensitivityMul * extraMul;
    this.yaw -= safeDx * s;
    this.pitch -= safeDy * s;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }

  // 卧姿为开关态：进入卧姿时取消触屏蹲伏，起身后可继续由 Shift/Ctrl 控制蹲伏。
  toggleProne() {
    if (!this.alive) return false;
    this.proneToggle = !this.proneToggle;
    if (this.proneToggle) this.crouchToggle = false;
    return this.proneToggle;
  }

  toggleCrouch() {
    if (!this.alive) return false;
    if (this.proneToggle) this.proneToggle = false;
    this.crouchToggle = !this.crouchToggle;
    return this.crouchToggle;
  }

  // 跳跃按钮是离散动作：卧倒时先站起，下一次按下才真正离地。
  // 这样移动端按住/松开差异不会把起身和跳跃合并成一个不可控状态。
  requestJump() {
    if (!this.alive) return 'ignored';
    if (this.proneToggle) {
      this.proneToggle = false;
      this.crouchToggle = false;
      return 'stand';
    }
    this._jumpRequested = true;
    return 'jump';
  }

  // ---------- 受伤 ----------
  takeDamage(amount) {
    if (!this.alive) return 0;
    let dmg = amount;
    // 护甲吸收 50%
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.5);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    this.hud.damageFlash();
    // 受击回调（main 注入）：供“无伤清波”等挑战成就统计，缺省无开销。
    if (typeof this.onDamaged === 'function') this.onDamaged();
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
    this.hud.updateVitals(this.health, this.armor, this.maxHealth, this.maxArmor);
    return dmg;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
    this.hud.updateVitals(this.health, this.armor, this.maxHealth, this.maxArmor);
  }

  // 强化卡效果（CONFIG.upgrades.cards 的 kind=player 项）。
  applyUpgrade(key, value, mode) {
    if (key === 'speedMul' && mode === 'mul') this.speedMul *= value;
    else if (key === 'armorMax') {
      this.maxArmor += value;
      this.armor = this.maxArmor;
    } else if (key === 'healFull') {
      this.health = this.maxHealth;
    }
    this.hud.updateVitals(this.health, this.armor, this.maxHealth, this.maxArmor);
  }

  // ---------- 主更新 ----------
  update(dt) {
    if (!this.alive) return;

    const P = CONFIG.player;
    // ---- 朝向（yaw 绕 Y，pitch 绕 X）----
    // 后坐力上抬叠加在 pitch 上
    this._syncCamera();

    // ---- 输入方向（局部空间）：键盘数字量 + 摇杆模拟量（x 右 / y 前，-1~1）----
    const fwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0) + this.moveTouch.y;
    const right = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0) + this.moveTouch.x;

    // 卧姿优先于蹲伏；两种姿态都用平滑量过渡，避免真机上相机和枪模瞬移。
    this.prone = !!this.proneToggle;
    const stanceRate = P.stanceTransitionSpeed || 9;
    this._proneAmt += ((this.prone ? 1 : 0) - this._proneAmt) * Math.min(1, dt * stanceRate);
    this.crouching = !this.prone && (this.crouchToggle || !!this.keys['ShiftLeft'] || !!this.keys['ControlLeft']);
    this._crouchAmt += ((this.crouching ? 1 : 0) - this._crouchAmt) * Math.min(1, dt * stanceRate);
    // 探头目标：移动端按钮 leanTarget 与键盘 Q/E 叠加，钳制在 -1~1。
    const leanKey = (this.keys['KeyQ'] ? -1 : 0) + (this.keys['KeyE'] ? 1 : 0);
    const leanTarget = Math.max(-1, Math.min(1, (this.leanTarget || 0) + leanKey));
    this._leanAmt += (leanTarget - this._leanAmt) * Math.min(1, dt * (P.leanSpeed || 10));

    const stanceSpeed = this.prone ? (P.proneSpeed || 2.2) : (this.crouching ? P.crouchSpeed : P.walkSpeed);
    const wishSpeed = stanceSpeed * (this.weaponSpeedMul || 1) * (this.speedMul || 1);

    // 计算期望速度（基于 yaw，水平面）
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // 相机 forward 在水平面：(-sin, 0, -cos)
    const wishX = (-sin * fwd + cos * right);
    const wishZ = (-cos * fwd - sin * right);
    const wishLen = Math.hypot(wishX, wishZ);
    const wishDirX = wishLen > 0 ? wishX / wishLen : 0;
    const wishDirZ = wishLen > 0 ? wishZ / wishLen : 0;
    // 摇杆幅度必须进入目标速度；旧逻辑虽然计算了模拟量，却始终按满速加速，
    // 导致轻推和推满没有速度层次，真机手感接近四向按钮。
    const inputAmount = Math.min(wishLen, 1);
    const targetSpeed = wishSpeed * inputAmount;

    // ---- 水平移动积分（CS 风格 accelerate + friction）----
    if (this.onGround) {
      // 摩擦：把当前水平速度向 0 衰减
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed > 0) {
        const drop = speed * P.friction * dt;
        const newSpeed = Math.max(0, speed - drop) / speed;
        this.velocity.x *= newSpeed;
        this.velocity.z *= newSpeed;
      }
      this._accelerate(wishDirX, wishDirZ, targetSpeed, P.accelGround, dt);
    } else {
      // 空中：受限加速（保留惯性）
      this._accelerate(wishDirX, wishDirZ, targetSpeed, P.accelAir, dt);
    }

    // ---- 跳跃 ----
    const jumpRequested = this._jumpRequested;
    this._jumpRequested = false;
    if (jumpRequested && this.onGround && !this.prone) {
      this.velocity.y = P.jumpVelocity;
      this.onGround = false;
    }

    // ---- 重力 ----
    this.velocity.y -= P.gravity * dt;

    // ---- 位置积分 + 碰撞 ----
    const startX = this.position.x, startZ = this.position.z;
    const targetX = startX + this.velocity.x * dt;
    const targetZ = startZ + this.velocity.z * dt;
    const previousY = this.position.y;
    const targetY = previousY + this.velocity.y * dt;
    // 跳跃时只让与玩家身体高度重叠的盒体挡住水平移动；越过箱顶后，
    // 玩家可以继续向箱子内部移动，落地检测再把脚底接到箱顶高度。
    const standingGround = typeof this.map.getGroundHeight === 'function'
      ? this.map.getGroundHeight(startX, startZ, P.radius, previousY, previousY)
      : 0;
    const sweepMinY = this.onGround && targetY <= standingGround + 0.06
      ? Math.max(standingGround, Math.min(previousY, targetY))
      : Math.min(previousY, targetY);
    const verticalSweep = { minY: sweepMinY, maxY: Math.max(previousY + P.height, targetY + P.height) };
    // XZ 连续碰撞：优先沿轨迹分步，兼容旧地图/测试桩时回退到单点解算。
    const resolved = typeof this.map.moveCircle === 'function'
      ? this.map.moveCircle(startX, startZ, targetX, targetZ, P.radius, verticalSweep)
      : this.map.collide(targetX, targetZ, P.radius, verticalSweep);
    // 如果被推开，说明撞墙，清除该方向速度（简单处理）
    const pushX = resolved.x - targetX;
    const pushZ = resolved.z - targetZ;
    if (Math.abs(pushX) > 0.001 || Math.abs(pushZ) > 0.001) {
      // 沿法线反弹掉该分量
      const nLen = Math.hypot(pushX, pushZ) || 1;
      const nx = pushX / nLen, nz = pushZ / nLen;
      const vDotN = this.velocity.x * nx + this.velocity.z * nz;
      if (vDotN < 0) {
        this.velocity.x -= vDotN * nx;
        this.velocity.z -= vDotN * nz;
      }
    }
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    // Y 轴：地面和可站立箱顶；只在下落穿过顶面时吸附，避免上升时被箱顶拦住。
    const groundY = typeof this.map.getGroundHeight === 'function'
      ? this.map.getGroundHeight(this.position.x, this.position.z, P.radius, previousY, targetY)
      : 0;
    this.position.y = targetY;
    if (this.velocity.y <= 0 && targetY <= groundY + 1e-5) {
      this.position.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // ---- 视角晃动（走路 bob）----
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const bobTarget = this.onGround && hSpeed > 0.25
      ? Math.min(1, hSpeed / Math.max(0.01, P.walkSpeed)) : 0;
    if (bobTarget > 0) {
      this.viewBob += dt * hSpeed * 1.4;
    }
    const bobBlend = 1 - Math.exp(-dt * (P.viewBobSettleSpeed || 12));
    this.viewBobAmount += (bobTarget - this.viewBobAmount) * bobBlend;
    if (this.viewBobAmount < 1e-4) this.viewBobAmount = 0;

    // ---- 后坐力恢复：只衰减独立的视觉/弹道偏移，不改玩家基础俯仰角。 ----
    // 如果恢复阶段直接扣减 pitch，玩家在后坐期间主动拖动视角后会被多扣一次，
    // 真机上表现为枪械和枪口持续自动下坠。
    if (this.recoilOffset > 0) {
      const recover = Math.min(this.recoilOffset, dt * (this.recoilRecover || 0.06));
      this.recoilOffset -= recover;
    }

    this._syncCamera();
  }

  // 沿期望方向加速
  _accelerate(wishDirX, wishDirZ, wishSpeed, accel, dt) {
    const currentSpeed = this.velocity.x * wishDirX + this.velocity.z * wishDirZ;
    const addSpeed = wishSpeed - currentSpeed;
    if (addSpeed <= 0) return;
    let accelSpeed = accel * wishSpeed * dt;
    if (accelSpeed > addSpeed) accelSpeed = addSpeed;
    this.velocity.x += accelSpeed * wishDirX;
    this.velocity.z += accelSpeed * wishDirZ;
  }

  // 施加一发射击的后坐力（数据驱动：recover 恢复速率 + pattern 摆动幅度）
  applyRecoil(recoilDef) {
    const pitchKick = Math.max(0, Number(recoilDef && recoilDef.x) || 0);
    const yawKick = Math.max(0, Number(recoilDef && recoilDef.y) || 0);
    // Three.js 的前向量是 -Z，正向 rotation.x 会把前方抬向 +Y。
    // 后坐量独立保存，基础 pitch 只由玩家输入修改。
    this.recoilOffset += pitchKick;
    const pattern = recoilDef && (recoilDef.pattern || recoilDef.recoilPattern);
    const sway = pattern === 'heavy' ? 1.6 : 1.0;   // AK/AWP 左右摆动更明显
    this.yaw += (Math.random() - 0.5) * 2 * yawKick * sway;
    this.recoilRecover = Number(recoilDef && recoilDef.recover) || 0.06;
    this.recoilOffset = Math.min(this.recoilOffset, Math.PI / 3);
  }

  // 增加护盾点数（护甲拾取）：封顶实例上限（强化可扩容）
  addArmor(amount) {
    this.armor = clamp(this.armor + amount, 0, this.maxArmor);
    this.hud.updateVitals(this.health, this.armor, this.maxHealth, this.maxArmor);
  }

  _syncCamera() {
    const P = CONFIG.player;
    // 探头几何：沿玩家右侧偏移眼位（right = (cos yaw, 0, -sin yaw)），
    // 相机向探头反方向滚转（身体倾出的传统观感）。
    const lean = this._leanAmt || 0;
    const leanOffset = (P.leanOffset != null ? P.leanOffset : 0.45) * lean;
    const leanRoll = (P.leanRoll != null ? P.leanRoll : 0.2) * lean;
    const proneBobScale = P.proneBobScale == null ? 0.35 : P.proneBobScale;
    const bobScale = 1 - this._proneAmt * (1 - proneBobScale);
    const bobAmount = this.onGround ? (this.viewBobAmount || 0) * bobScale : 0;
    const bobY = Math.sin(this.viewBob * 2) * 0.04 * bobAmount;
    const bobX = Math.cos(this.viewBob) * 0.03 * bobAmount;
    const eyeH = this.getEyeHeight();
    const leanSin = Math.sin(this.yaw);
    const leanCos = Math.cos(this.yaw);
    this.camera.position.set(
      this.position.x + bobX * 0.3 + leanCos * leanOffset,
      this.position.y + eyeH + bobY,
      this.position.z - leanSin * leanOffset
    );
    // 用欧拉角 YXZ 避免万向锁；Z 分量为探头滚转（方向与探头侧相反）
    const effectivePitch = clamp(this.pitch + this.recoilOffset, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    this.camera.rotation.set(effectivePitch, this.yaw, -leanRoll, 'YXZ');
  }

  // 相机和射击都使用同一眼高；走路晃动只影响渲染，不改变弹道起点。
  getEyeHeight() {
    const P = CONFIG.player;
    const proneAmt = this._proneAmt || 0;
    const crouchAmt = (this._crouchAmt || 0) * (1 - proneAmt);
    return P.height - (P.crouchDrop || 0.5) * crouchAmt - (P.proneDrop || 0.98) * proneAmt;
  }

  getProneAmount() { return this._proneAmt || 0; }

  // 提供给武器模块：相机朝向射线
  // 起点用"无走路晃动"的眼位（bob 只影响渲染位置），保证弹道与屏幕中心准星严格重合
  getAimRay() {
    const dir = new THREE.Vector3(0, 0, -1);
    const effectivePitch = clamp(this.pitch + this.recoilOffset, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    dir.applyEuler(new THREE.Euler(effectivePitch, this.yaw, 0, 'YXZ'));
    // 探头侧偏进入弹道起点：掩体后探身射击时，子弹从探出的眼位发出。
    const lean = this._leanAmt || 0;
    const leanOffset = (CONFIG.player.leanOffset != null ? CONFIG.player.leanOffset : 0.45) * lean;
    const leanSin = Math.sin(this.yaw);
    const leanCos = Math.cos(this.yaw);
    return {
      origin: new THREE.Vector3(
        this.position.x + leanCos * leanOffset,
        this.position.y + this.getEyeHeight(),
        this.position.z - leanSin * leanOffset
      ),
      direction: dir.normalize(),
    };
  }

  // 提供给敌人：脚底位置
  getFeet() { return this.position; }
  getEye() { return this.camera.position; }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}

// 经典脚本全局暴露（依赖顺序：config → three(UMD) → map → player → …）
window.Player = Player;
