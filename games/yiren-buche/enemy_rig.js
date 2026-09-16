// enemy_rig.js —— 混合骨骼动画重建：离线蒙皮、二维移动混合、上下半身叠加与战斗动作
// 经典脚本；依赖 THREE 与 enemy_model.js。几何/材质/贴图全局共享，每个敌人仅保留独立骨架与动作状态。
(function () {
  'use strict';

  const MODEL = window.CS15_ENEMY_MODEL;
  const HIT_LAYER = 1;
  const CODENAMES = ['Phantom', 'Viper', 'Ghost', 'Reaper', 'Fang', 'Echo', 'Talon', 'Raven'];
  const BONE = {
    root: 0, pelvis: 1, spine1: 2, spine2: 3, chest: 4, neck: 5, head: 6,
    clavicleL: 7, upperArmL: 8, lowerArmL: 9, handL: 10,
    clavicleR: 11, upperArmR: 12, lowerArmR: 13, handR: 14,
    upperLegL: 15, lowerLegL: 16, footL: 17, toeL: 18,
    upperLegR: 19, lowerLegR: 20, footR: 21, toeR: 22,
    weapon: 23,
  };

  const shared = {
    ready: false,
    geometries: [],
    bodyMaterial: null,
    tierMaterials: [],
    hitMaterial: null,
    flashMaterial: null,
    boxGeometry: null,
    sphereGeometry: null,
    flashGeometry: null,
    textures: [],
    isMobile: false,
    hasHighLod: false,
  };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function damp(current, target, rate, dt) {
    return current + (target - current) * (1 - Math.exp(-rate * dt));
  }

  function decodeUint16(base64) {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Uint16Array(bytes.buffer);
  }

  function decodeUint8(base64) {
    const raw = atob(base64);
    const values = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) values[i] = raw.charCodeAt(i);
    return values;
  }

  function decodeSkin(lod, vertexCount) {
    if (!lod.skinIndex || !lod.skinWeight) throw new Error('Enemy model is missing offline skin weights');
    const packedIndex = decodeUint8(lod.skinIndex);
    const packedWeight = decodeUint8(lod.skinWeight);
    if (packedIndex.length !== vertexCount * 2 || packedWeight.length !== vertexCount * 2) {
      throw new Error('Enemy model skin payload length mismatch');
    }
    const indices = new Uint16Array(vertexCount * 4);
    const weights = new Float32Array(vertexCount * 4);
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const source = vertex * 2;
      const target = vertex * 4;
      indices[target] = packedIndex[source];
      indices[target + 1] = packedIndex[source + 1];
      weights[target] = packedWeight[source] / 255;
      weights[target + 1] = packedWeight[source + 1] / 255;
    }
    return { indices, weights };
  }

  function decodeGeometry(lod) {
    const encodedPosition = decodeUint16(lod.position);
    const encodedUv = decodeUint16(lod.uv);
    const encodedNormal = lod.normal ? decodeUint16(lod.normal) : null;
    const index = decodeUint16(lod.index);
    const position = new Float32Array(encodedPosition.length);
    const uv = new Float32Array(encodedUv.length);
    const normal = encodedNormal ? new Float32Array(encodedNormal.length) : null;
    for (let i = 0; i < encodedPosition.length; i += 3) {
      position[i] = lod.positionMin[0] + encodedPosition[i] * lod.positionScale[0];
      position[i + 1] = lod.positionMin[1] + encodedPosition[i + 1] * lod.positionScale[1];
      position[i + 2] = lod.positionMin[2] + encodedPosition[i + 2] * lod.positionScale[2];
    }
    for (let i = 0; i < encodedUv.length; i++) uv[i] = encodedUv[i] / 65535;
    if (normal) {
      for (let i = 0; i < encodedNormal.length; i++) normal[i] = encodedNormal[i] / 32767.5 - 1;
    }

    const skin = decodeSkin(lod, position.length / 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (normal) geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skin.indices, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skin.weights, 4));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    if (!normal) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.cs15SharedEnemyAsset = true;
    geometry.userData.triangleCount = lod.triangleCount;
    geometry.userData.offlineSkinWeights = true;
    return geometry;
  }

  function loadTexture(path, colorSpace, onLoad) {
    const texture = new THREE.TextureLoader().load(path, (loaded) => {
      loaded.wrapS = THREE.ClampToEdgeWrapping;
      loaded.wrapT = THREE.ClampToEdgeWrapping;
      loaded.anisotropy = Math.max(1, Number(window.CS15_TEXTURE_ANISOTROPY) || (shared.isMobile ? 2 : 4));
      if (colorSpace) loaded.colorSpace = colorSpace;
      loaded.needsUpdate = true;
      onLoad(loaded);
    }, undefined, () => {
      // MeshStandardMaterial 保留纯色兜底；离线图片失败不能阻断游戏。
    });
    shared.textures.push(texture);
    return texture;
  }

  function markShared(mesh) {
    mesh.userData.cs15SharedEnemyAsset = true;
    return mesh;
  }

  function ensureShared() {
    if (shared.ready || !MODEL || !MODEL.lods || !MODEL.lods.length) return !!shared.ready;
    if (!MODEL.rig || MODEL.rig.boneCount !== 24 || MODEL.rig.skinInfluences !== 2) return false;
    shared.isMobile = !!(
      window.CS15_LOWEND
      || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '')
    );
    shared.geometries = MODEL.lods.map(decodeGeometry);
    shared.hasHighLod = shared.geometries.length >= 3;
    shared.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x59616d,
      roughness: 0.62,
      metalness: 0.32,
    });
    shared.bodyMaterial.userData.cs15SharedEnemyAsset = true;

    const tierColors = [0x39b8d4, 0xe0a030, 0xe03030];
    shared.tierMaterials = tierColors.map((color, tier) => {
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: tier === 0 ? 0.35 : 0.28,
        metalness: 0.65,
        emissive: color,
        emissiveIntensity: tier === 2 ? 0.46 : (tier === 1 ? 0.33 : 0.22),
      });
      material.userData.cs15SharedEnemyAsset = true;
      return material;
    });
    shared.hitMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, colorWrite: false, depthWrite: false });
    shared.hitMaterial.userData.cs15SharedEnemyAsset = true;
    shared.flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    shared.flashMaterial.userData.cs15SharedEnemyAsset = true;
    shared.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    shared.sphereGeometry = new THREE.SphereGeometry(0.5, 8, 6);
    shared.flashGeometry = new THREE.OctahedronGeometry(0.5, 0);
    shared.boxGeometry.userData.cs15SharedEnemyAsset = true;
    shared.sphereGeometry.userData.cs15SharedEnemyAsset = true;
    shared.flashGeometry.userData.cs15SharedEnemyAsset = true;

    loadTexture('./enemy_albedo.webp', THREE.SRGBColorSpace, (texture) => {
      shared.bodyMaterial.map = texture;
      shared.bodyMaterial.needsUpdate = true;
    });
    // 普通安卓低端档不上传法线/ORM，节约显存与片元开销。
    if (!window.CS15_LOWEND) {
      loadTexture('./enemy_normal.webp', null, (texture) => {
        shared.bodyMaterial.normalMap = texture;
        shared.bodyMaterial.normalScale.set(0.78, 0.78);
        shared.bodyMaterial.needsUpdate = true;
      });
      loadTexture('./enemy_orm.webp', null, (texture) => {
        shared.bodyMaterial.roughnessMap = texture;
        shared.bodyMaterial.metalnessMap = texture;
        shared.bodyMaterial.needsUpdate = true;
      });
    }
    shared.ready = true;
    return true;
  }

  function makeBone(name, x, y, z, parent, bones) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    bone.userData.bindPosition = bone.position.clone();
    bone.userData.bindRotation = bone.rotation.clone();
    if (parent) parent.add(bone);
    bones.push(bone);
    return bone;
  }

  function createSkeleton() {
    const bones = [];
    const root = makeBone('root', 0, 0, 0, null, bones);
    const pelvis = makeBone('pelvis', 0, 0.92, 0, root, bones);
    const spine1 = makeBone('spine1', 0, 0.13, 0, pelvis, bones);
    const spine2 = makeBone('spine2', 0, 0.15, 0, spine1, bones);
    const chest = makeBone('chest', 0, 0.18, 0, spine2, bones);
    const neck = makeBone('neck', 0, 0.16, 0, chest, bones);
    const head = makeBone('head', 0, 0.12, 0, neck, bones);

    const clavicleL = makeBone('clavicleL', -0.10, 0.04, 0, chest, bones);
    const upperArmL = makeBone('upperArmL', -0.16, 0, -0.01, clavicleL, bones);
    const lowerArmL = makeBone('lowerArmL', -0.05, -0.24, -0.06, upperArmL, bones);
    const handL = makeBone('handL', 0.17, -0.09, -0.15, lowerArmL, bones);
    const clavicleR = makeBone('clavicleR', 0.10, 0.04, 0, chest, bones);
    const upperArmR = makeBone('upperArmR', 0.16, 0, -0.01, clavicleR, bones);
    const lowerArmR = makeBone('lowerArmR', 0.05, -0.24, -0.06, upperArmR, bones);
    const handR = makeBone('handR', -0.17, -0.09, -0.15, lowerArmR, bones);

    const upperLegL = makeBone('upperLegL', -0.12, 0, 0, pelvis, bones);
    const lowerLegL = makeBone('lowerLegL', 0, -0.43, 0, upperLegL, bones);
    const footL = makeBone('footL', 0, -0.39, -0.01, lowerLegL, bones);
    const toeL = makeBone('toeL', 0, -0.05, -0.09, footL, bones);
    const upperLegR = makeBone('upperLegR', 0.12, 0, 0, pelvis, bones);
    const lowerLegR = makeBone('lowerLegR', 0, -0.43, 0, upperLegR, bones);
    const footR = makeBone('footR', 0, -0.39, -0.01, lowerLegR, bones);
    const toeR = makeBone('toeR', 0, -0.05, -0.09, footR, bones);
    const weapon = makeBone('weapon', 0, -0.18, -0.12, chest, bones);

    const rig = {
      bones, root, pelvis, spine1, spine2, chest, neck, head,
      clavicleL, upperArmL, lowerArmL, handL,
      clavicleR, upperArmR, lowerArmR, handR,
      upperLegL, lowerLegL, footL, toeL,
      upperLegR, lowerLegR, footR, toeR, weapon,
    };
    // 兼容旧调试入口；正式动画使用 pelvis/spine1。
    rig.hips = pelvis;
    rig.spine = spine1;
    return rig;
  }

  function armorMesh(geometry, material, parent, position, scale, rotation) {
    const mesh = markShared(new THREE.Mesh(geometry, material));
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = !window.CS15_LOWEND || window.CS15_DYNAMIC_SHADOWS_ENABLED === true;
    parent.add(mesh);
    return mesh;
  }

  function addTierArmor(rig, tier, name) {
    const material = shared.tierMaterials[tier];
    const nameIndex = Math.max(0, CODENAMES.indexOf(name));
    const variantScale = 0.96 + (nameIndex % 4) * 0.025;
    const meshes = [];
    const tierScale = tier === 2 ? 1.12 : (tier === 1 ? 1.04 : 0.92);
    meshes.push(armorMesh(shared.boxGeometry, material, rig.head, [0, -0.025, -0.178], [0.17 * variantScale * tierScale, 0.024, 0.022]));
    meshes.push(armorMesh(shared.boxGeometry, material, rig.chest, [0, -0.08, -0.173], [0.19 * tierScale, 0.025, 0.018]));
    if (tier >= 1) {
      const shoulderScale = tier === 2 ? [0.23, 0.11, 0.27] : [0.20, 0.095, 0.24];
      meshes.push(armorMesh(shared.sphereGeometry, material, rig.upperArmL, [-0.015, -0.025, 0.025], shoulderScale, [0, 0, -0.14]));
      meshes.push(armorMesh(shared.sphereGeometry, material, rig.upperArmR, [0.015, -0.025, 0.025], shoulderScale, [0, 0, 0.14]));
      meshes.push(armorMesh(shared.boxGeometry, material, rig.head, [0, 0.105, 0.02], [tier === 2 ? 0.022 : 0.018, tier === 2 ? 0.06 : 0.042, tier === 2 ? 0.14 : 0.11]));
    }
    if (tier === 2) {
      const ringGeometry = new THREE.TorusGeometry(0.185, 0.008, 6, 20);
      ringGeometry.userData.cs15SharedEnemyAsset = false;
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.position.set(0, 0.17, 0);
      ring.rotation.x = Math.PI / 2;
      rig.head.add(ring);
      meshes.push(ring);
    }
    return meshes;
  }

  function hitMesh(geometry, parent, part, position, scale, rotation, list) {
    const mesh = new THREE.Mesh(geometry, shared.hitMaterial);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.layers.set(HIT_LAYER);
    mesh.userData.part = part;
    mesh.userData.cs15SharedEnemyAsset = true;
    parent.add(mesh);
    list.push(mesh);
    return mesh;
  }

  function createHitMeshes(rig) {
    const hitMeshes = [];
    hitMesh(shared.sphereGeometry, rig.head, 'head', [0, 0.055, 0], [0.40, 0.48, 0.40], null, hitMeshes);
    hitMesh(shared.boxGeometry, rig.chest, 'torso', [0, -0.09, 0], [0.48, 0.50, 0.30], null, hitMeshes);
    hitMesh(shared.boxGeometry, rig.pelvis, 'torso', [0, 0.03, 0], [0.36, 0.22, 0.27], null, hitMeshes);
    hitMesh(shared.boxGeometry, rig.upperArmL, 'arm', [-0.03, -0.10, -0.03], [0.16, 0.34, 0.17], [0.30, 0, -0.14], hitMeshes);
    hitMesh(shared.boxGeometry, rig.lowerArmL, 'arm', [0.06, -0.05, -0.08], [0.14, 0.30, 0.15], [0.70, 0, 0.28], hitMeshes);
    hitMesh(shared.boxGeometry, rig.upperArmR, 'arm', [0.03, -0.10, -0.03], [0.16, 0.34, 0.17], [0.30, 0, 0.14], hitMeshes);
    hitMesh(shared.boxGeometry, rig.lowerArmR, 'arm', [-0.06, -0.05, -0.08], [0.14, 0.30, 0.15], [0.70, 0, -0.28], hitMeshes);
    hitMesh(shared.boxGeometry, rig.upperLegL, 'leg', [0, -0.22, 0], [0.19, 0.46, 0.22], null, hitMeshes);
    hitMesh(shared.boxGeometry, rig.lowerLegL, 'leg', [0, -0.20, 0], [0.15, 0.42, 0.18], null, hitMeshes);
    hitMesh(shared.boxGeometry, rig.upperLegR, 'leg', [0, -0.22, 0], [0.19, 0.46, 0.22], null, hitMeshes);
    hitMesh(shared.boxGeometry, rig.lowerLegR, 'leg', [0, -0.20, 0], [0.15, 0.42, 0.18], null, hitMeshes);
    hitMesh(shared.boxGeometry, rig.weapon, 'gun', [-0.10, -0.18, -0.10], [0.22, 0.34, 0.50], [0, 0, -0.55], hitMeshes);
    return hitMeshes;
  }

  function createMuzzleFlash(rig) {
    const group = new THREE.Group();
    group.name = 'enemyMuzzleFlash';
    // 母版步枪从角色右侧斜跨到画面左下；+X 对应枪管尖端。
    group.position.set(0.30, -0.38, -0.20);
    group.visible = false;
    const core = markShared(new THREE.Mesh(shared.flashGeometry, shared.flashMaterial));
    core.scale.set(0.085, 0.065, 0.16);
    group.add(core);
    let light = null;
    if (!window.CS15_LOWEND) {
      light = new THREE.PointLight(0xffb14a, 0, 3.2, 2);
      group.add(light);
    }
    rig.weapon.add(group);
    return { group, light };
  }

  function createInstance(options) {
    if (!ensureShared()) return null;
    const tier = clamp(options.tier | 0, 0, 2);
    const name = options.name || CODENAMES[0];
    const root = new THREE.Group();
    root.name = 'hybridEnemyRig';
    const rig = createSkeleton();
    root.add(rig.root);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(rig.bones);
    skeleton.calculateInverses();

    const nearLod = shared.hasHighLod && shared.isMobile ? 1 : 0;
    const farLod = Math.max(0, shared.geometries.length - 1);
    const meshes = shared.geometries.map((geometry, index) => {
      const mesh = markShared(new THREE.SkinnedMesh(geometry, shared.bodyMaterial));
      mesh.name = `enemyBodyLOD${index}`;
      mesh.castShadow = !window.CS15_LOWEND || window.CS15_DYNAMIC_SHADOWS_ENABLED === true;
      mesh.receiveShadow = false;
      mesh.visible = index === nearLod;
      root.add(mesh);
      mesh.bind(skeleton);
      return mesh;
    });
    const armor = addTierArmor(rig, tier, name);
    const hitMeshes = createHitMeshes(rig);
    const muzzle = createMuzzleFlash(rig);
    root.updateMatrixWorld(true);

    let phase = Math.random() * Math.PI * 2;
    let idleTime = Math.random() * 10;
    let moveBlend = 0;
    let forwardBlend = 0;
    let sideBlend = 0;
    let aimBlend = 0;
    let shotAge = 99;
    let meleeAge = 99;
    let hitAge = 99;
    let hitSide = 1;
    let burstKick = 0;
    let activeLod = nearLod;
    let deathSide = 1;
    let deathBlend = 0;

    function selectLod(distance) {
      let next;
      if (window.CS15_LOWEND) next = distance < 13 ? nearLod : farLod;
      else if (shared.isMobile) next = distance < 19 ? nearLod : farLod;
      else if (shared.hasHighLod) next = distance < 10 ? 0 : (distance < 24 ? 1 : farLod);
      else next = distance < 24 ? nearLod : farLod;
      if (next === activeLod) return;
      for (let i = 0; i < meshes.length; i++) meshes[i].visible = i === next;
      activeLod = next;
    }

    function restoreBindPose() {
      for (const bone of rig.bones) {
        bone.position.copy(bone.userData.bindPosition);
        bone.rotation.copy(bone.userData.bindRotation);
      }
    }

    function resetPose() {
      restoreBindPose();
      phase = 0;
      moveBlend = 0;
      forwardBlend = 0;
      sideBlend = 0;
      aimBlend = 0;
      shotAge = 99;
      meleeAge = 99;
      hitAge = 99;
      burstKick = 0;
      deathBlend = 0;
      muzzle.group.visible = false;
      if (muzzle.light) muzzle.light.intensity = 0;
    }

    function shotEnvelope() {
      if (shotAge >= 0.32) return 0;
      if (shotAge < 0.045) return shotAge / 0.045;
      const recovery = 1 - (shotAge - 0.045) / 0.275;
      return clamp(recovery * recovery, 0, 1);
    }

    function actionEnvelope(age, attack, duration) {
      if (age >= duration) return 0;
      if (age < attack) return age / attack;
      return clamp(1 - (age - attack) / (duration - attack), 0, 1);
    }

    const api = {
      root,
      rig,
      skeleton,
      meshes,
      armor,
      hitMeshes,
      muzzleFlash: muzzle.group,
      get activeLod() { return activeLod; },
      get animationState() {
        return { moveBlend, forwardBlend, sideBlend, aimBlend, shotAge, hitAge, deathBlend };
      },
      reset: resetPose,
      triggerShot() {
        shotAge = 0;
        burstKick = Math.min(1.4, burstKick + 0.42);
      },
      triggerMelee() { meleeAge = 0; },
      triggerHit(part) {
        hitAge = 0;
        hitSide = part === 'head' ? -hitSide : (part === 'arm' ? -1 : 1);
      },
      triggerDeath() {
        deathSide = Math.random() < 0.5 ? -1 : 1;
        deathBlend = 0;
      },
      update(dt, motionOrSpeed, legacyState, legacyDistance) {
        const motion = motionOrSpeed && typeof motionOrSpeed === 'object'
          ? motionOrSpeed
          : { speed: Number(motionOrSpeed) || 0, forward: 1, side: 0, state: legacyState, distance: legacyDistance };
        const speed = Math.max(0, Number(motion.speed) || 0);
        const state = motion.state || 'idle';
        const distance = motion.distance == null ? 0 : motion.distance;
        const targetMove = speed > 0.22 ? 1 : 0;
        const targetForward = targetMove ? clamp(Number(motion.forward) || 0, -1, 1) : 0;
        const targetSide = targetMove ? clamp(Number(motion.side) || 0, -1, 1) : 0;
        const targetAim = state === 'engage' ? 1 : (state === 'react' ? 0.52 : 0.12);
        moveBlend = damp(moveBlend, targetMove, targetMove ? 11 : 8, dt);
        forwardBlend = damp(forwardBlend, targetForward, 9, dt);
        sideBlend = damp(sideBlend, targetSide, 9, dt);
        aimBlend = damp(aimBlend, targetAim, 7, dt);
        phase += dt * (1.5 + speed * (motion.rushing ? 3.4 : 2.55)) * Math.max(0.16, moveBlend);
        idleTime += dt;
        shotAge += dt;
        meleeAge += dt;
        hitAge += dt;
        burstKick = damp(burstKick, 0, 7.5, dt);
        deathBlend = damp(deathBlend, state === 'dead' ? 1 : 0, 5.2, dt);
        selectLod(distance);
        restoreBindPose();

        const rushing = motion.rushing ? 1 : 0;
        const directionStrength = clamp(Math.hypot(forwardBlend, sideBlend), 0, 1);
        const strideStrength = moveBlend * (0.72 + 0.28 * directionStrength) * (rushing ? 1.22 : 1);
        const directionSign = Math.abs(forwardBlend) > 0.2 ? Math.sign(forwardBlend) : 1;
        const stride = Math.sin(phase) * 0.58 * strideStrength * directionSign;
        const liftL = Math.max(0, -Math.sin(phase)) * strideStrength;
        const liftR = Math.max(0, Math.sin(phase)) * strideStrength;
        const sideStep = Math.sin(phase) * sideBlend * 0.24 * moveBlend;
        const bob = Math.abs(Math.sin(phase * 2)) * 0.032 * moveBlend;
        const idleBreath = Math.sin(idleTime * 1.7) * 0.018 * (1 - moveBlend);

        // 下半身二维移动混合：前进/后退/横移共用步相位，但姿态方向独立。
        rig.root.position.y += bob;
        rig.pelvis.position.x += Math.sin(phase) * 0.028 * sideBlend * moveBlend;
        rig.pelvis.rotation.y += Math.sin(phase) * 0.075 * moveBlend - sideBlend * 0.075;
        rig.pelvis.rotation.z += sideBlend * 0.07 + sideStep * 0.18;
        rig.upperLegL.rotation.x += stride;
        rig.upperLegR.rotation.x -= stride;
        rig.upperLegL.rotation.z += sideStep;
        rig.upperLegR.rotation.z -= sideStep;
        rig.lowerLegL.rotation.x += liftL * 0.82 + Math.max(0, -stride) * 0.28;
        rig.lowerLegR.rotation.x += liftR * 0.82 + Math.max(0, stride) * 0.28;
        rig.footL.rotation.x -= stride * 0.36 + liftL * 0.22;
        rig.footR.rotation.x += stride * 0.36 - liftR * 0.22;
        rig.toeL.rotation.x += liftL * 0.16;
        rig.toeR.rotation.x += liftR * 0.16;

        // 上半身保持瞄准并叠加移动反向补偿，移动时仍能射击。
        rig.spine1.rotation.z += idleBreath - sideBlend * 0.055 * moveBlend;
        rig.spine1.rotation.x += -forwardBlend * 0.035 * moveBlend - rushing * 0.075;
        rig.spine2.rotation.y += -Math.sin(phase) * 0.045 * moveBlend;
        rig.chest.rotation.y += sideBlend * 0.055 * moveBlend;
        rig.chest.rotation.x += -aimBlend * 0.035 - rushing * 0.045;
        rig.neck.rotation.x += aimBlend * 0.025;
        rig.head.rotation.y += Math.sin(idleTime * 0.65) * 0.035 * (1 - aimBlend);
        rig.clavicleL.rotation.x += -aimBlend * 0.035;
        rig.clavicleR.rotation.x += -aimBlend * 0.052;
        rig.upperArmL.rotation.x += -aimBlend * 0.035 - stride * 0.055;
        rig.upperArmR.rotation.x += -aimBlend * 0.055 + stride * 0.055;
        rig.lowerArmL.rotation.x += -aimBlend * 0.025;
        rig.lowerArmR.rotation.x += -aimBlend * 0.035;
        rig.weapon.position.y += aimBlend * 0.018;
        rig.weapon.position.z -= aimBlend * 0.012;

        const shot = shotEnvelope();
        if (shot > 0 || burstKick > 0.01) {
          const recoil = shot + burstKick * 0.22;
          rig.spine2.rotation.x -= recoil * 0.045;
          rig.chest.rotation.x -= recoil * 0.085;
          rig.chest.rotation.y += hitSide * recoil * 0.018;
          rig.clavicleL.rotation.x -= recoil * 0.075;
          rig.clavicleR.rotation.x -= recoil * 0.11;
          rig.upperArmL.rotation.x -= recoil * 0.095;
          rig.upperArmR.rotation.x -= recoil * 0.14;
          rig.lowerArmL.rotation.x -= recoil * 0.055;
          rig.lowerArmR.rotation.x -= recoil * 0.085;
          rig.weapon.position.z += recoil * 0.072;
          rig.weapon.position.y += recoil * 0.018;
          rig.weapon.rotation.x -= recoil * 0.055;
        }

        const melee = actionEnvelope(meleeAge, 0.10, 0.58);
        if (melee > 0) {
          rig.chest.rotation.y += melee * deathSide * 0.18;
          rig.upperArmR.rotation.x += melee * 0.68;
          rig.lowerArmR.rotation.x += melee * 0.45;
          rig.weapon.rotation.z += melee * 0.16;
        }

        const hit = actionEnvelope(hitAge, 0.055, 0.30);
        if (hit > 0) {
          rig.spine1.rotation.z += hitSide * hit * 0.13;
          rig.spine2.rotation.y -= hitSide * hit * 0.10;
          rig.head.rotation.z += hitSide * hit * 0.09;
        }

        if (deathBlend > 0.001) {
          const death = deathBlend;
          rig.pelvis.rotation.z += deathSide * death * 0.18;
          rig.spine1.rotation.x -= death * 0.20;
          rig.spine2.rotation.z += deathSide * death * 0.22;
          rig.head.rotation.z -= deathSide * death * 0.30;
          rig.upperArmL.rotation.z -= death * 0.38;
          rig.upperArmR.rotation.z += death * 0.38;
          rig.upperLegL.rotation.x += death * 0.20;
          rig.upperLegR.rotation.x -= death * 0.14;
        }

        const flashVisible = shotAge < 0.085;
        muzzle.group.visible = flashVisible;
        if (flashVisible) {
          const flash = 1 - shotAge / 0.085;
          muzzle.group.scale.setScalar(0.76 + flash * 0.72);
        }
        if (muzzle.light) muzzle.light.intensity = flashVisible ? (1.6 + (1 - shotAge / 0.085) * 2.6) : 0;
      },
      dispose() {
        for (const item of armor) {
          if (item.geometry && item.geometry.userData.cs15SharedEnemyAsset === false) item.geometry.dispose();
        }
        skeleton.dispose();
        root.clear();
      },
    };
    return api;
  }

  window.CS15EnemyRig = {
    available: !!MODEL,
    hitLayer: HIT_LAYER,
    codenames: CODENAMES.slice(),
    create: createInstance,
    stats() {
      return {
        available: !!MODEL,
        shared: true,
        rigVersion: MODEL && MODEL.rig ? MODEL.rig.type : null,
        boneCount: MODEL && MODEL.rig ? MODEL.rig.boneCount : 0,
        offlineSkinWeights: !!(MODEL && MODEL.rig && MODEL.rig.skinInfluences === 2),
        animationLayers: ['locomotion-2d', 'upper-body-aim', 'shot-hit-melee-death'],
        muzzleFlash: true,
        mobileSkipsHighLod: true,
        lodTriangles: MODEL && MODEL.lods ? MODEL.lods.map((lod) => lod.triangleCount) : [],
        textureFiles: ['enemy_albedo.webp', 'enemy_normal.webp', 'enemy_orm.webp'],
      };
    },
  };
})();
