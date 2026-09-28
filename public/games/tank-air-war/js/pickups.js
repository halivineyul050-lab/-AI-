// pickups.js —— 补给系统：修理箱 / 装甲板掉落 + 定时空投（光柱信标）
// 模型池化：与炮弹/敌人/特效一致，避免长时间战斗持续产生短命 Group。

class PickupManager {
  constructor(scene, factory) {
    this.scene = scene;
    this.factory = factory;
    this.active = [];
    this.pools = { heal: [], armor: [] };
    this.airdropTimer = CONFIG.pickup.airdropInterval;
  }

  _acquire(kind) {
    const pool = this.pools[kind];
    for (const m of pool) if (!m.visible) return m;
    const model = this.factory.buildPickup(kind);
    model.visible = false;
    this.scene.add(model);
    pool.push(model);
    return model;
  }

  // 掉落一个补给（kind: heal / armor）
  drop(kind, x, z) {
    const model = this._acquire(kind);
    model.position.set(x, 0, z);
    model.rotation.y = Math.random() * Math.PI * 2;
    model.visible = true;
    this.active.push({ model, kind, life: CONFIG.pickup.lifetime, age: 0 });
  }

  // 精英/常规掉落判定（world 可选：用于按难度调整掉率）
  rollDrop(enemy, world) {
    const P = CONFIG.pickup;
    const half = CONFIG.arena.half;
    let chance = enemy.tier >= 1 ? P.eliteDropChance : P.normalDropChance;
    if (enemy.kind === 'gunship') chance = 1;
    if (world && world.diffCfg) chance *= world.diffCfg.dropMul;
    if (Math.random() >= chance) return;
    const kind = Math.random() < 0.55 ? 'heal' : 'armor';
    const x = clamp(enemy.position.x, -half + 3, half - 3);
    const z = clamp(enemy.position.z, -half + 3, half - 3);
    this.drop(kind, x, z);
  }

  // 定时空投：玩家周围开阔点（避开障碍）
  update(dt, world) {
    this.airdropTimer -= dt;
    if (this.airdropTimer <= 0) {
      this.airdropTimer = CONFIG.pickup.airdropInterval;
      const spot = world.findOpenSpotNear(world.player.position, 12, 26);
      const kind = Math.random() < 0.5 ? 'heal' : 'armor';
      this.drop(kind, spot.x, spot.z);
      world.hud.showPickup(kind === 'heal' ? '战术医疗补给空投已抵达，跟随信标回收！' : '装甲补给空投已抵达，跟随信标回收！');
      world.audio.pickup();
    }

    const p = world.player.position;
    const magnet = (world.player.mods && world.player.mods.magnet) || 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i];
      it.age += dt;
      it.life -= dt;
      // 信标旋转 + 呼吸
      it.model.userData.beacon.rotation.y += dt * 2.2;
      it.model.userData.beacon.scale.y = 1 + Math.sin(it.age * 4) * 0.12;
      it.model.position.y = Math.sin(it.age * 2.5) * 0.12;

      if (it.life <= 0) {
        this._remove(i);
        continue;
      }
      // 磁力拾取：进入吸附半径后补给主动飞向坦克（强化卡"磁力拾取"）
      if (magnet > 0 && world.player.alive) {
        const md = dist2D(it.model.position.x, it.model.position.z, p.x, p.z);
        if (md > 0.01 && md < magnet + CONFIG.pickup.pickupRadius) {
          const k = Math.min(1, dt * 6.5);
          it.model.position.x += (p.x - it.model.position.x) * k;
          it.model.position.z += (p.z - it.model.position.z) * k;
        }
      }
      // 拾取判定
      const d = dist2D(it.model.position.x, it.model.position.z, p.x, p.z);
      if (d < CONFIG.pickup.pickupRadius && world.player.alive) {
        if (it.kind === 'heal') {
          world.player.health = Math.min(world.player.maxHealth, world.player.health + CONFIG.pickup.healAmount);
          world.hud.showPickup(`修理完成 +${CONFIG.pickup.healAmount} 机体`);
        } else {
          world.player.armor = Math.min(world.player.armorMax, world.player.armor + CONFIG.pickup.armorAmount);
          world.hud.showPickup(`装甲板 +${CONFIG.pickup.armorAmount}`);
        }
        world.audio.pickup();
        world.effects.sparkBurst(it.model.position.clone().setY(1), 10, it.kind === 'heal' ? 0x35d058 : 0x4aa8ff);
        this._remove(i);
      }
    }
  }

  _remove(i) {
    const it = this.active[i];
    it.model.visible = false;   // 回收进池，不销毁对象
    this.active.splice(i, 1);
  }

  reset() {
    for (const it of this.active) it.model.visible = false;
    this.active.length = 0;
    this.airdropTimer = CONFIG.pickup.airdropInterval;
  }
}

window.PickupManager = PickupManager;
