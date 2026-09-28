// inspect.js —— 武器检视：菜单期按需加载量化模型并构建归一化展示模型
// 纯模型模块：不建 DOM、不持有渲染循环；场景/相机/输入由 main.js 的检视控制器管理。
// 依赖顺序：config → three → resource_loader → inspect → main（首屏经典脚本）。
(function (root) {
  'use strict';

  const THREE = root.THREE;

  // 检视顺序 = 检视器 ‹ › 切换顺序：三把主武器在前，副武器/近战/手雷随后。
  // usp（Glock-18）是 weapon.js 内的程序化模型，菜单期 weapon.js 尚未加载，
  // 本阶段不提供检视；模型就绪后由控制器提示。
  const ORDER = ['ak47', 'm249', 'awp', 'usp', 'm9', 'grenade'];
  const MODEL_GLOBAL = {
    ak47: 'Ak47Model',
    awp: 'AwpModel',
    m249: 'M249Model',
    m9: 'M9Model',
    grenade: 'GrenadeModel',
  };
  const TEXTURE_GLOBAL = {
    ak47: 'Ak47Tex',
    awp: 'AwpTex',
    m249: 'M249Tex',
    m9: 'M9Tex',
    grenade: 'GrenadeTex',
  };
  const FALLBACK_COLOR = {
    ak47: 0x9a8a98, awp: 0x8a9298, m249: 0x8f8275, m9: 0x6d78a8, grenade: 0x65704c,
  };

  function isSupported(id) {
    return Object.prototype.hasOwnProperty.call(MODEL_GLOBAL, id);
  }

  function labelOf(id) {
    const weapon = root.CONFIG && root.CONFIG.weapons && root.CONFIG.weapons[id];
    return weapon ? weapon.name : id;
  }

  // 检视需要加载的包内文件：模型脚本 + 贴图脚本 + 三张 PBR 图片。
  // 已加载的文件由 resource_loader 去重，重复检视同一武器不会二次解码。
  function filesFor(id) {
    if (!isSupported(id)) return [];
    return [
      `${id}_model.js`,
      `${id}_tex.js`,
      `${id}_albedo.webp`,
      `${id}_normal.webp`,
      `${id}_mr.webp`,
    ];
  }

  async function ensureLoaded(id) {
    const files = filesFor(id);
    if (!files.length) throw new Error(`weapon inspect unsupported: ${id}`);
    const loader = root.CS15ResourceLoader;
    if (!loader || typeof loader.ensureFiles !== 'function') {
      throw new Error('resource loader unavailable for weapon inspect');
    }
    await loader.ensureFiles(files);
    if (!root[MODEL_GLOBAL[id]]) throw new Error(`weapon model missing: ${id}`);
    return true;
  }

  function applyTextures(id, material) {
    const api = root[TEXTURE_GLOBAL[id]];
    if (!api || typeof api.loadAll !== 'function') return;
    api.loadAll().then((textures) => {
      if (textures.albedo) { material.map = textures.albedo; material.color.set(0xffffff); }
      if (textures.normal) {
        material.normalMap = textures.normal;
        material.normalScale = new THREE.Vector2(0.7, 0.7);
      }
      if (textures.roughness) { material.roughnessMap = textures.roughness; material.roughness = 0.9; }
      if (textures.metallic) { material.metalnessMap = textures.metallic; material.metalness = 0.9; }
      material.needsUpdate = true;
    }).catch(() => {
      // 贴图失败时保留纯色材质，检视仍可用。
    });
  }

  // 构建归一化展示模型：包围盒居中 + 统一目标尺寸，长轴水平朝 +X（侧面视角）。
  // 返回 { group, dispose }；group 不加入场景，由调用方挂载。
  function buildModel(id, targetSize) {
    if (!isSupported(id)) return null;
    const size = targetSize || 1.7;
    const material = new THREE.MeshPhysicalMaterial({
      color: FALLBACK_COLOR[id] != null ? FALLBACK_COLOR[id] : 0x8a9298,
      roughness: 0.55,
      metalness: 0.55,
      clearcoat: 0.12,
    });
    const mesh = root[MODEL_GLOBAL[id]].build(null, material);
    // 异步应用包内 PBR（albedo/normal/roughness/metallic）——贴图就绪前
    // 先以纯色兜底渲染，就绪后 material.needsUpdate 自动换肤。
    applyTextures(id, material);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);

    const stage = new THREE.Group();
    stage.add(mesh);
    stage.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(mesh);
    const dim = new THREE.Vector3();
    box.getSize(dim);
    const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
    const scale = size / maxDim;
    mesh.scale.setScalar(scale);
    mesh.updateWorldMatrix(true, false);
    const centered = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    centered.getCenter(center);
    mesh.position.set(mesh.position.x - center.x, mesh.position.y - center.y, mesh.position.z - center.z);

    // 量化模型 build() 内已把枪长转到 Z 轴；再转 90° 让侧面正对相机（长轴 → X）。
    const group = new THREE.Group();
    group.add(stage);
    stage.rotation.y = Math.PI / 2;
    return {
      group,
      dispose() {
        mesh.geometry.dispose();
        material.dispose();
      },
    };
  }

  root.WeaponInspect = Object.freeze({
    ORDER: ORDER.slice(),
    isSupported,
    labelOf,
    filesFor,
    ensureLoaded,
    buildModel,
    applyTextures,
  });
})(typeof window !== 'undefined' ? window : globalThis);
