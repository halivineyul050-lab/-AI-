// resource_loader.js —— 小工具包内资源分段调度器
// 只加载 ZIP 内的经典脚本和图片；不使用网络、模块、Worker 或动态代码执行。
(function (root) {
  'use strict';

  const loadedScripts = new Set();
  const pendingScripts = new Map();
  const loadedImages = new Map();
  const pendingImages = new Map();

  const boot = root.CS15_BOOT || {
    startedAt: (root.performance && performance.now) ? performance.now() : Date.now(),
    marks: {},
  };
  root.CS15_BOOT = boot;

  function now() {
    return (root.performance && performance.now) ? performance.now() : Date.now();
  }

  function mark(name) {
    const value = now() - boot.startedAt;
    boot.marks[name] = Math.round(value * 10) / 10;
    if (root.performance && typeof performance.mark === 'function') {
      try { performance.mark(`cs15:${name}`); } catch (error) { /* 旧 WebView 可忽略 */ }
    }
    return boot.marks[name];
  }

  function isTouchDevice() {
    return ('ontouchstart' in root)
      || (root.navigator && Number(root.navigator.maxTouchPoints) > 0)
      || !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  }

  function nextPaint() {
    return new Promise((resolve) => {
      if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(() => resolve());
      else root.setTimeout(resolve, 0);
    });
  }

  function loadScript(file) {
    if (loadedScripts.has(file)) return Promise.resolve(file);
    if (pendingScripts.has(file)) return pendingScripts.get(file);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `./${file}`;
      script.async = false;
      script.onload = () => {
        loadedScripts.add(file);
        pendingScripts.delete(file);
        resolve(file);
      };
      script.onerror = () => {
        pendingScripts.delete(file);
        reject(new Error(`包内脚本加载失败：${file}`));
      };
      document.head.appendChild(script);
    });
    pendingScripts.set(file, promise);
    return promise;
  }

  function loadImage(path) {
    if (loadedImages.has(path)) return Promise.resolve(path);
    if (pendingImages.has(path)) return pendingImages.get(path);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const finish = () => {
          // 保留已解码 Image 引用，避免加载页结束后立刻被回收并在 TextureLoader
          // 再次访问同一包内图片时重复解码。
          loadedImages.set(path, image);
          // ImageLoader 按调用方传入的原始 URL 查 THREE.Cache；项目中既有
          // `path` 也有 `./path` 写法，因此两个键都登记为同一个已解码对象。
          if (root.THREE && root.THREE.Cache) {
            root.THREE.Cache.add(path, image);
            root.THREE.Cache.add(`./${path}`, image);
          }
          pendingImages.delete(path);
          resolve(path);
        };
        if (typeof image.decode === 'function') image.decode().then(finish, finish);
        else finish();
      };
      image.onerror = () => {
        pendingImages.delete(path);
        reject(new Error(`包内图片加载失败：${path}`));
      };
      image.src = `./${path}`;
    });
    pendingImages.set(path, promise);
    return promise;
  }

  // P0 体积优化：minitool 目标平台全部为触屏 WebView。桌面端不再单独加载
  // GPU 程序化贴图锻造器与高清敌人模，统一走触屏路径——敌人使用标清模型，
  // 墙面材质走包内贴图，两端游戏体验一致且完全可玩。
  function scriptPlan(mapId) {
    const scripts = ['math2d.js'];
    // Bloom 后处理（three r160 examples 的 UMD 转译）：检视页金属辉光。
    // 库缺失/初始化失败时 main.js 自动回退直接渲染路径。
    scripts.push('postprocessing.umd.js');
    // three-mesh-bvh（MIT，UMD）：为港口可见网格提供射线加速结构，消除
    // 全网格暴力遍历造成的交战/扔雷卡顿。必须在 map_model.js 之前加载；
    // 文件缺失或初始化失败时 map.js 自动退回原生 Raycaster 路径。
    scripts.push('three_mesh_bvh.umd.js');
    scripts.push(
      'ak47_model.js', 'ak47_tex.js', 'awp_model.js', 'awp_tex.js',
      'm249_model.js', 'm249_tex.js', 'm9_model.js', 'm9_tex.js',
      'grenade_model.js', 'grenade_tex.js'
    );
    scripts.push('enemy_model.js');
    scripts.push('enemy_rig.js');
    if (mapId === 'container-port') {
      scripts.push('map_model.js', 'map_collision.js', 'map_assets.js');
    }
    scripts.push('textures.js', 'environment_materials.js');
    scripts.push('map.js', 'player.js', 'enemy.js', 'weapon.js', 'pickup.js');
    return scripts;
  }

  function imagePlan(mapId) {
    const images = [
      'enemy_albedo.webp',
      'ak47_albedo.webp', 'ak47_normal.webp', 'ak47_mr.webp',
      'awp_albedo.webp', 'awp_normal.webp', 'awp_mr.webp',
      'm249_albedo.webp', 'm249_normal.webp', 'm249_mr.webp',
      'm9_albedo.webp', 'm9_normal.webp', 'm9_mr.webp',
      'grenade_albedo.webp', 'grenade_normal.webp', 'grenade_mr.webp',
      'env_brick.webp', 'env_concrete.webp', 'env_crate_wood.webp',
    ];
    if (!root.CS15_LOWEND) images.push('enemy_normal.webp', 'enemy_orm.webp');
    if (mapId === 'container-port') {
      images.push('port_base.webp');
      if (!root.CS15_LOWEND) images.push('port_normal.webp', 'port_mr.webp');
    }
    return images;
  }

  async function loadForMap(mapId, options) {
    const onProgress = options && typeof options.onProgress === 'function'
      ? options.onProgress : function () {};
    const scripts = scriptPlan(mapId);
    const images = imagePlan(mapId);
    const total = scripts.length + images.length;
    let completed = 0;
    const report = (label) => {
      completed++;
      onProgress({ completed, total, ratio: total ? completed / total : 1, label });
    };

    mark('runtime_load_start');
    for (const file of scripts) {
      await loadScript(file);
      report(file);
      await nextPaint();
    }

    if (root.THREE && root.THREE.Cache) root.THREE.Cache.enabled = true;
    // 图片互不依赖，限制为触屏 2 路、桌面 3 路解码。相比逐张串行可缩短
    // 准备时间，同时避免一次性解码全部 PBR 导致移动 WebView 内存和主线程尖峰。
    let imageCursor = 0;
    const imageWorker = async () => {
      while (imageCursor < images.length) {
        const path = images[imageCursor++];
        await loadImage(path);
        report(path);
        await nextPaint();
      }
    };
    const imageConcurrency = Math.min(images.length, isTouchDevice() ? 2 : 3);
    await Promise.all(Array.from({ length: imageConcurrency }, () => imageWorker()));
    mark('runtime_assets_ready');
    return { mapId, scripts: scripts.slice(), images: images.slice() };
  }

  // 按需补载包内文件（武器检视在菜单期使用）：图片扩展名走解码管线并登记
  // THREE.Cache，其余按脚本加载；已加载文件直接命中缓存，不重复执行/解码。
  async function ensureFiles(files) {
    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    const images = [];
    for (const file of list) {
      if (/\.(webp|jpe?g|png)$/i.test(file)) images.push(file);
      else await loadScript(file);
    }
    if (root.THREE && root.THREE.Cache) root.THREE.Cache.enabled = true;
    for (const image of images) await loadImage(image);
    return true;
  }

  mark('resource_loader_ready');
  root.CS15ResourceLoader = Object.freeze({
    loadForMap,
    ensureFiles,
    isTouchDevice,
    mark,
    metrics: boot,
  });
})(window);
