// map.js —— 关卡几何与碰撞数据
// 构造一个 CS 风格的对称竞技场：CT 房 / T 房 / 中央长廊 + 多个掩体箱
// 对外暴露 GameMap 类：scene 中添加网格 + 提供 collide() 碰撞查询 + spawn 点
// 经典脚本（非 ES Module）：THREE / CONFIG 由前置脚本挂到 window 提供

// AABB 包围盒（轴对齐），用于碰撞与射线
class Box {
  constructor(minX, maxX, minZ, maxZ, minY = 0, maxY = 4) {
    this.minX = minX; this.maxX = maxX;
    this.minZ = minZ; this.maxZ = maxZ;
    this.minY = minY; this.maxY = maxY;
    this._collisionStamp = 0;
  }
  // 点是否在盒内（XZ 平面）
  containsXZ(x, z) {
    return x >= this.minX && x <= this.maxX && z >= this.minZ && z <= this.maxZ;
  }
  // 圆是否覆盖盒子的 XZ 投影；用于盒顶支撑判定，不能复用 containsXZ，
  // 否则站在箱子边缘时会出现脚底悬空或突然掉落。
  overlapsCircleXZ(px, pz, radius) {
    const closestX = Math.max(this.minX, Math.min(px, this.maxX));
    const closestZ = Math.max(this.minZ, Math.min(pz, this.maxZ));
    const dx = px - closestX;
    const dz = pz - closestZ;
    return dx * dx + dz * dz <= radius * radius + 1e-8;
  }
  overlapsVertical(minY, maxY) {
    return maxY > this.minY + 1e-6 && minY < this.maxY - 1e-6;
  }
  // 圆与 AABB 碰撞（XZ 平面），返回推开向量 {x,z} 或 null
  // 注意：圆心在盒内部时，最近点等于圆心自身，按半径差推出的向量是零向量——
  // 必须沿穿透最浅的轴整段推出到墙面之外，否则实体会永久卡在墙体里
  // （randomSpawn 的采样验证、spawnAt 的出生解算、卡墙解困的方向采样都依赖这里的正确性）
  resolveCircle(px, pz, radius) {
    const closestX = Math.max(this.minX, Math.min(px, this.maxX));
    const closestZ = Math.max(this.minZ, Math.min(pz, this.maxZ));
    const dx = px - closestX;
    const dz = pz - closestZ;
    const distSq = dx * dx + dz * dz;
    // 浮点误差不应把刚好贴墙的实体再次判定为穿透，避免 bounds 裁剪线与外围墙反复推挤。
    if (distSq >= radius * radius - 1e-8) return null;
    if (distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      return { x: (dx / dist) * overlap, z: (dz / dist) * overlap };
    }
    // 圆心在盒内：算到四面墙外的距离（含半径），取最短方向整段推出
    const toLeft = px - this.minX + radius;
    const toRight = this.maxX - px + radius;
    const toFront = pz - this.minZ + radius;
    const toBack = this.maxZ - pz + radius;
    const m = Math.min(toLeft, toRight, toFront, toBack);
    if (m === toLeft) return { x: -m, z: 0 };
    if (m === toRight) return { x: m, z: 0 };
    if (m === toFront) return { x: 0, z: -m };
    return { x: 0, z: m };
  }
}

class GameMap {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this._disposed = false;
    this._textureCache = new Map();
    this._texturePending = new Map();
    this._textureWaits = new Set();
    // 每张地图拥有独立根节点，切换地图时可以完整移除旧视觉层和灯光，
    // 不把上一张地图的网格、材质和光源叠加到当前回合。
    this._mapRoot = new THREE.Group();
    this._mapRoot.name = `cs15-map-${opts.mapId || (CONFIG.map && CONFIG.map.defaultId) || 'classic'}`;
    this.scene.add(this._mapRoot);
    // GPU 纹理锻造器（可选注入，main 创建后传入；未注入时走 CPU 兜底）
    this.forge = opts.forge || null;
    this.mapId = opts.mapId || (CONFIG.map && CONFIG.map.defaultId) || 'classic';
    this.isContainerPort = this.mapId === 'container-port';
    this.boxes = [];      // 行走碰撞体（墙、可绕行的高位结构）
    this._portBoundaryBoxes = [];
    this._portWalkBoxes = [];
    this._portSupportBoxes = [];
    this._portCollisionSegments = [];
    this._portRaycaster = null;
    if (this.isContainerPort) {
      this.initialYaw = Math.PI; // 南侧出生点朝向仓库腹地（+Z），开局不会盯着外墙
      this.spawns = {
        player: new THREE.Vector3(-27, 0, -25),
        enemy: [
          new THREE.Vector3(27, 0, -25),
          new THREE.Vector3(27, 0, 25),
          new THREE.Vector3(12, 0, 27),
          new THREE.Vector3(-8, 0, 26.5),
          new THREE.Vector3(12, 0, -27),
          new THREE.Vector3(-11.5, 0, -27),
        ],
      };
      // 视觉模型约 64m 方形；把外围墙的内沿留在可玩区外，避免实体半径被夹在边界碰撞体里。
      this.bounds = { minX: -30.5, maxX: 30.5, minZ: -30.5, maxZ: 30.5 };
    } else {
      this.initialYaw = 0;
      this.spawns = {
        player: new THREE.Vector3(-22, 0, 0),
        enemy: [
          new THREE.Vector3(22, 0, -6),
          new THREE.Vector3(22, 0, 6),
          new THREE.Vector3(18, 0, 0),
          new THREE.Vector3(26, 0, 0),
          new THREE.Vector3(24, 0, -10),
          new THREE.Vector3(24, 0, 10),
        ],
      };
      this.bounds = { minX: -32, maxX: 32, minZ: -20, maxZ: 20 };
    }
    this._build();
    this._buildCollisionGrid();
    this._buildNavigationGrid();
  }

  _addToMapRoot(object) {
    if (object) this._mapRoot.add(object);
    return object;
  }

  // 程序化法线贴图（GameFactory 框架 createSurfaceTextures 思路）：
  // 从高度场派生切线空间法线，让大平面（地面/墙面）响应灯光移动而不显平
  // 优先走 GPU 锻造器（桌面 1024 / 移动端 512 HalfFloat 高度 + Sobel，物理一致
  // slope=relief/worldSize，NYQUIST 纪律的周期噪声无缝平铺）；不可用时退回
  // 原有 128px CPU Canvas 实现
  _makeNormalTexture(size, type, forceCpu = false) {
    if (!forceCpu && this.forge && this.forge.available && window.TextureForge) {
      const isBrick = (type === 'brick');
      const result = this.forge.build({
        key: type,
        frag: isBrick ? TextureForge.BRICK_FRAG : TextureForge.CONCRETE_FRAG,
        size,
        seed: isBrick ? 3.7 : 5.2,
        // brick tile 覆盖 1.5m（_addWall 的 repeat 计算），灰缝深 ~5mm
        // concrete tile 覆盖 4m（地面 repeat 20 → 80m/20），颗粒起伏 ~2mm
        worldSize: isBrick ? 1.5 : 4.0,
        relief: isBrick ? 0.005 : 0.002,
      });
      if (result && result.normal) {
        result.normal.repeat.set(1, 1);   // 由调用方按面尺寸覆盖 repeat
        return result.normal;
      }
    }
    // ---- CPU 兜底（原实现，低端机/forge 不可用）----
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    // 1) 高度场
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v;
        if (type === 'brick') {
          const tile = 16, half = 13;
          const bx = x % tile, by = y % tile;
          v = (bx < half && by < half) ? 0.62 : 0.2; // 砖面高、灰缝低
        } else { // concrete：颗粒噪点
          v = 0.5 + (Math.random() - 0.5) * 0.16;
        }
        H[y * size + x] = v;
      }
    }
    // 2) 高度梯度 → 法线（切线空间，+Z 朝外）
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const hL = H[y * size + (x + size - 1) % size];
        const hR = H[y * size + (x + 1) % size];
        const hD = H[((y + size - 1) % size) * size + x];
        const hU = H[((y + 1) % size) * size + x];
        const nx = (hL - hR) * 4;
        const ny = (hD - hU) * 4;
        const nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const p = i * 4;
        img.data[p]     = (nx / len * 0.5 + 0.5) * 255;
        img.data[p + 1] = (ny / len * 0.5 + 0.5) * 255;
        img.data[p + 2] = (nz / len * 0.5 + 0.5) * 255;
        img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // 给材质异步应用真实贴图（加载完成后替换，加载前用纯色兜底，避免黑帧）
  // 记录作业供贴图懒加载完成后重放（QA#2）
  _applyTex(mat, key, repeatX, repeatY) {
    this._texJobs = this._texJobs || [];
    this._texJobs.push({ mat, key, repeatX, repeatY });
    this._applyTexJob({ mat, key, repeatX, repeatY });
  }

  _applyTexJob({ mat, key, repeatX, repeatY }) {
    if (this._disposed) return;
    const url = window.TEX && window.TEX[key];
    if (!url) return;
    this._loadSharedTexture(key, url, (tex) => {
      if (this._disposed) return;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
      // 每个网格的平铺比例已经烘焙进 UV，同一张 GPU 纹理可被所有墙面共享。
      tex.repeat.set(1, 1);
      tex.needsUpdate = true;
      this._disposeTextureIfOwned(mat.map, tex);
      mat.map = tex;
      mat.color.setHex(0xffffff);   // 贴图全显，避免被兜底颜色染色
      mat.needsUpdate = true;
    });
  }

  _disposeTextureIfOwned(texture, replacement) {
    if (!texture || texture === replacement || typeof texture.dispose !== 'function') return;
    if (texture.userData && texture.userData.cs15PersistentAsset) return;
    texture.dispose();
  }

  _trackTexturePromise(promise) {
    const tracked = promise.catch((error) => {
      console.warn('[cs15] local texture unavailable', error);
      return null;
    });
    this._textureWaits.add(tracked);
    return tracked;
  }

  // 地图之间共享包内图片的解码结果。墙面与地面平铺已经写入各自 UV，因此
  // 不再为每一面墙 clone Texture，也不会在死亡后切图时重复占用 GPU 内存。
  _loadSharedTexture(key, url, onReady) {
    if (this._disposed || !url || typeof onReady !== 'function') return;
    const shared = window.CS15_SHARED_MAP_TEXTURES ||
      (window.CS15_SHARED_MAP_TEXTURES = new Map());
    let promise = shared.get(url);
    if (!promise) {
      promise = new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(url, (texture) => {
          texture.userData = texture.userData || {};
          texture.userData.cs15PersistentAsset = true;
          texture.anisotropy = Math.max(1, Number(window.CS15_TEXTURE_ANISOTROPY) || 1);
          texture.needsUpdate = true;
          resolve(texture);
        }, undefined, () => reject(new Error(`贴图加载失败：${url}`)));
      });
      promise.catch(() => shared.delete(url));
      shared.set(url, promise);
    }
    const applied = promise.then((texture) => {
      if (this._disposed) return null;
      this._textureCache.set(key, texture);
      onReady(texture);
      return texture;
    });
    this._trackTexturePromise(applied);
  }

  whenTexturesReady() {
    return Promise.all(Array.from(this._textureWaits)).then(() => undefined);
  }

  // 贴图懒加载完成后重放所有贴图作业（QA#2）
  applyTextures() {
    for (const job of (this._texJobs || [])) this._applyTexJob(job);
  }

  _decodeModelData(encoded, Type) {
    if (!encoded || typeof Type !== 'function') return null;
    const decode = window.atob || (typeof atob === 'function' ? atob : null);
    if (!decode) return null;
    const binary = decode(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Type(bytes.buffer);
  }

  _decodeQuantizedModelAttribute(encoded, itemSize, quantization) {
    const packed = this._decodeModelData(encoded, Uint16Array);
    if (!packed || !quantization || !Array.isArray(quantization.min) ||
      !Array.isArray(quantization.scale)) return null;
    const result = new Float32Array(packed.length);
    for (let i = 0; i < packed.length; i++) {
      const component = i % itemSize;
      result[i] = Number(quantization.min[component]) +
        packed[i] * Number(quantization.scale[component]);
    }
    return result;
  }

  _normalizeModelNormals(normals) {
    if (!normals) return normals;
    for (let i = 0; i < normals.length; i += 3) {
      const x = normals[i], y = normals[i + 1], z = normals[i + 2];
      const length = Math.hypot(x, y, z) || 1;
      normals[i] = x / length;
      normals[i + 1] = y / length;
      normals[i + 2] = z / length;
    }
    return normals;
  }

  _scaleGeometryUv(geometry, repeatX, repeatY) {
    const uv = geometry && geometry.getAttribute && geometry.getAttribute('uv');
    if (!uv) return geometry;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * repeatX, uv.getY(i) * repeatY);
    }
    uv.needsUpdate = true;
    return geometry;
  }

  _applyPortTexture(mat, key, slot, srgb) {
    const url = window.TEX && window.TEX[key];
    if (!url) return;
    this._loadSharedTexture(`port:${key}`, url, (texture) => {
      if (this._disposed) return;
      texture.flipY = false;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      if ('SRGBColorSpace' in THREE) texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      this._disposeTextureIfOwned(mat[slot], texture);
      mat[slot] = texture;
      if (slot === 'map') mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    });
  }

  _applyPortMrTexture(mat, key) {
    const url = window.TEX && window.TEX[key];
    if (!url) return;
    this._loadSharedTexture(`port:${key}`, url, (texture) => {
      if (this._disposed) return;
      texture.flipY = false;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      if ('SRGBColorSpace' in THREE) texture.colorSpace = THREE.NoColorSpace;
      texture.needsUpdate = true;
      this._disposeTextureIfOwned(mat.metalnessMap, texture);
      this._disposeTextureIfOwned(mat.roughnessMap, texture);
      mat.metalnessMap = texture;
      mat.roughnessMap = texture;
      mat.needsUpdate = true;
    });
  }

  // 港口视觉使用离线压缩模型和本地 PBR；模型矩阵在这里固定，
  // 弹道射线随后直接求交这张真实网格，避免视觉表面与射线边界脱节。
  _buildImportedPortModel() {
    const data = window.CS15_MAP_MODEL;
    if (!data || !data.positions || !data.uvs || !data.indices) return false;
    try {
      const quantized = data.encoding === 'u16-quantized';
      const quantization = data.quantization || {};
      const positions = quantized
        ? this._decodeQuantizedModelAttribute(data.positions, 3, quantization.positions)
        : this._decodeModelData(data.positions, Float32Array);
      const normals = data.normals ? (quantized
        ? this._normalizeModelNormals(this._decodeQuantizedModelAttribute(data.normals, 3, quantization.normals))
        : this._decodeModelData(data.normals, Float32Array)) : null;
      const uvs = quantized
        ? this._decodeQuantizedModelAttribute(data.uvs, 2, quantization.uvs)
        : this._decodeModelData(data.uvs, Float32Array);
      const indices = this._decodeModelData(data.indices, Uint16Array);
      if (!positions || !uvs || !indices || positions.length !== data.vertexCount * 3 ||
        uvs.length !== data.vertexCount * 2 || indices.length !== data.triangleCount * 3) return false;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      if (normals && normals.length === positions.length) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      else geometry.computeVertexNormals();
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();

      const env = this._environmentAssets();
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.12,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const bounds = data.bounds || { min: [0, 0, 0], max: [1, 1, 1] };
      const min = bounds.min || [0, 0, 0];
      const max = bounds.max || [1, 1, 1];
      const scale = 64;
      mesh.scale.setScalar(scale);
      mesh.position.set(
        -((Number(min[0]) + Number(max[0])) * 0.5) * scale,
        -Number(min[1]) * scale,
        -((Number(min[2]) + Number(max[2])) * 0.5) * scale
      );
      this._buildExactPortCollision(positions, indices, scale, mesh.position);
      mesh.userData.environmentAsset = env.portModel.baseColorKey;
      mesh.userData.visualOnly = true;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this._freezeStaticMesh(mesh);
      this._addToMapRoot(mesh);
      this._portModel = mesh;
      this._installPortRaycastAcceleration(mesh);

      this._applyPortTexture(material, env.portModel.baseColorKey, 'map', true);
      if (!window.CS15_LOWEND) {
        this._applyPortTexture(material, env.portModel.normalKey, 'normalMap', false);
        if (env.portModel.mrKey) this._applyPortMrTexture(material, env.portModel.mrKey);
        else {
          this._applyPortTexture(material, env.portModel.metalnessKey, 'metalnessMap', false);
          this._applyPortTexture(material, env.portModel.roughnessKey, 'roughnessMap', false);
        }
        material.normalScale.set(0.55, 0.55);
      }
      return true;
    } catch (err) {
      console.warn('[cs15] port visual model fallback', err);
      return false;
    }
  }

  // 从当前可见模型的竖直三角面提取 XZ 边界。水平移动只与真实表面碰撞，
  // 不再使用 0.5m 栅格外扩盒，消除视觉墙面之外的空气阻挡。
  _buildExactPortCollision(positions, indices, scale, offset) {
    const dedup = new Map();
    const round = (value) => Math.round(value * 100) / 100;
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const ia = indices[i] * 3, ib = indices[i + 1] * 3, ic = indices[i + 2] * 3;
      const ax = positions[ia] * scale + offset.x, ay = positions[ia + 1] * scale + offset.y, az = positions[ia + 2] * scale + offset.z;
      const bx = positions[ib] * scale + offset.x, by = positions[ib + 1] * scale + offset.y, bz = positions[ib + 2] * scale + offset.z;
      const cx = positions[ic] * scale + offset.x, cy = positions[ic + 1] * scale + offset.y, cz = positions[ic + 2] * scale + offset.z;
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const normalLength = Math.hypot(nx, ny, nz);
      if (normalLength < 1e-6 || Math.abs(ny) / normalLength > 0.38) continue;
      const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
      if (maxY < 0.12 || minY > 1.9 || maxY - minY < 0.22) continue;
      const points = [[ax, az], [bx, bz], [cx, cz]];
      let p1 = points[0], p2 = points[1], best = -1;
      for (let a = 0; a < 3; a++) {
        for (let b = a + 1; b < 3; b++) {
          const dx = points[b][0] - points[a][0], dz = points[b][1] - points[a][1];
          const lengthSq = dx * dx + dz * dz;
          if (lengthSq > best) { best = lengthSq; p1 = points[a]; p2 = points[b]; }
        }
      }
      if (best < 0.0064) continue;
      let x1 = round(p1[0]), z1 = round(p1[1]), x2 = round(p2[0]), z2 = round(p2[1]);
      if (x1 > x2 || (x1 === x2 && z1 > z2)) {
        [x1, x2] = [x2, x1]; [z1, z2] = [z2, z1];
      }
      const key = `${x1},${z1}|${x2},${z2}`;
      const existing = dedup.get(key);
      if (existing) {
        existing.minY = Math.min(existing.minY, minY);
        existing.maxY = Math.max(existing.maxY, maxY);
      } else {
        dedup.set(key, { x1, z1, x2, z2, minY, maxY, _segmentStamp: 0 });
      }
    }
    this._portCollisionSegments = this._mergeCollinearPortSegments(Array.from(dedup.values()));
    return this._portCollisionSegments.length;
  }

  _mergeCollinearPortSegments(segments) {
    const groups = new Map();
    for (const segment of segments) {
      let dx = segment.x2 - segment.x1, dz = segment.z2 - segment.z1;
      const length = Math.hypot(dx, dz);
      if (length < 1e-6) continue;
      dx /= length; dz /= length;
      if (dx < 0 || (Math.abs(dx) < 1e-8 && dz < 0)) { dx = -dx; dz = -dz; }
      const offset = -dz * segment.x1 + dx * segment.z1;
      const t1 = dx * segment.x1 + dz * segment.z1;
      const t2 = dx * segment.x2 + dz * segment.z2;
      const key = `${Math.round(dx * 10000)},${Math.round(dz * 10000)},${Math.round(offset * 100)}`;
      let group = groups.get(key);
      if (!group) { group = { dx, dz, offset, intervals: [] }; groups.set(key, group); }
      group.intervals.push({ start: Math.min(t1, t2), end: Math.max(t1, t2), minY: segment.minY, maxY: segment.maxY });
    }
    const merged = [];
    for (const group of groups.values()) {
      group.intervals.sort((a, b) => a.start - b.start);
      let current = null;
      const flush = () => {
        if (!current) return;
        const x1 = group.dx * current.start - group.dz * group.offset;
        const z1 = group.dz * current.start + group.dx * group.offset;
        const x2 = group.dx * current.end - group.dz * group.offset;
        const z2 = group.dz * current.end + group.dx * group.offset;
        merged.push({ x1, z1, x2, z2, minY: current.minY, maxY: current.maxY, _segmentStamp: 0 });
      };
      for (const interval of group.intervals) {
        if (!current || interval.start > current.end + 0.025) {
          flush();
          current = Object.assign({}, interval);
        } else {
          current.end = Math.max(current.end, interval.end);
          current.minY = Math.min(current.minY, interval.minY);
          current.maxY = Math.max(current.maxY, interval.maxY);
        }
      }
      flush();
    }
    return merged;
  }

  _environmentAssets() {
    return window.CS15_ENVIRONMENT_ASSETS || {
      sharedSurface: { textureKey: 'concrete', baseColor: 0x6f7579, roughness: 0.9, metalness: 0.03, tileWorldSize: 4 },
      portModel: { baseColorKey: 'portBase', normalKey: 'portNormal', mrKey: 'portMR', metalnessKey: 'portMetallic', roughnessKey: 'portRoughness' },
      containerPalette: [0x724a45, 0x456074, 0x8b7546, 0x626a66],
      boundaryColor: 0x4b555c,
      markingColor: 0xb48c39,
    };
  }

  _portCollisionLayout() {
    return {
      high: [
        { x: -18, z: 14, w: 20, d: 3.2, h: 4.2 },
        { x: -18, z: -14, w: 20, d: 3.2, h: 4.2 },
        { x: -4, z: 21, w: 3.2, d: 12, h: 4.2 },
        { x: 7, z: 15, w: 16, d: 3.2, h: 4.2 },
        { x: 7, z: -15, w: 16, d: 3.2, h: 4.2 },
        { x: 20, z: 7, w: 3.2, d: 12, h: 4.2 },
        { x: 20, z: -9, w: 3.2, d: 8, h: 4.2 },
        { x: 12, z: 0, w: 7, d: 3.2, h: 3.5 },
        { x: 26, z: 19, w: 8, d: 7, h: 4.8 },
        { x: 26, z: -19, w: 8, d: 7, h: 4.8 },
      ],
    };
  }

  _addPortCollider(block, opts = {}) {
    const box = new Box(
      block.x - block.w / 2, block.x + block.w / 2,
      block.z - block.d / 2, block.z + block.d / 2,
      0, block.h
    );
    this.boxes.push(box);
    if (opts.boundary) {
      box._portBoundary = true;
      this._portBoundaryBoxes.push(box);
    }
  }

  // 行走盒来自当前视觉模型的地面相连结构投影。保留独立标记，港口弹道在
  // 三角网格漏掉简化后的窄墙时可使用同一阻挡依据，不再出现敌我判定分叉。
  _addImportedWalkColliders(blockMovement = false) {
    const source = window.CS15_MAP_COLLISION;
    const boxes = source && Array.isArray(source.boxes) ? source.boxes : [];
    let accepted = 0;
    for (const item of boxes) {
      const minX = Number(item && item.minX);
      const maxX = Number(item && item.maxX);
      const minZ = Number(item && item.minZ);
      const maxZ = Number(item && item.maxZ);
      const minY = Number(item && item.minY);
      const maxY = Number(item && item.maxY);
      if (![minX, maxX, minZ, maxZ, minY, maxY].every(Number.isFinite)) continue;
      if (maxX <= minX || maxZ <= minZ || maxY <= minY) continue;
      if (minX < -32 || maxX > 32 || minZ < -32 || maxZ > 32 || minY < 0) continue;
      const requestedInset = Math.max(0, Number(CONFIG.map && CONFIG.map.portCollisionInset) || 0);
      const insetX = Math.min(requestedInset, Math.max(0, (maxX - minX - 0.08) / 2));
      const insetZ = Math.min(requestedInset, Math.max(0, (maxZ - minZ - 0.08) / 2));
      const box = new Box(minX + insetX, maxX - insetX, minZ + insetZ, maxZ - insetZ, minY, maxY);
      box._portWalk = true;
      box._portCollisionInset = Math.max(insetX, insetZ);
      // 行走盒重新参与普通移动阻挡（第五轮真机复现修复）：墙线提取存在缺口
      // （被倾角/高度/短边过滤跳过的面），敌人圆心可经缺口深入低平台/走道/板条
      // 占地内 0.4m（整半径），视觉上"卡在墙体和其他物体中"且 0.18s 审计判合法、
      // 永不脱困。离线实证（tools/audit_wall_blindspots3.js + probe_strut_belt.js）
      // 显示 99% 残余危险点圆心位于行走盒足迹内。注意：64 文件已确认基线在墙线
      // 提取成功时从不阻挡行走盒足迹，本判定是**新约束**而非回归——安全性已
      // 离线验证：全部 138 盒 minY=0，与敌人身体带 [0,1.8] 恒重叠；全足迹阻挡
      // 后导航连通分量覆盖 99.7% walkable、6/6 敌人出生点保持连通，不会制造
      // 空气墙或分割地图。墙线段判定继续负责模型精细轮廓。
      if (this.isContainerPort) this.boxes.push(box);
      this._portWalkBoxes.push(box);
      this._portSupportBoxes.push(box);
      accepted++;
    }
    return accepted;
  }

  _addPortVisualBlock(block, color, opts = {}) {
    const env = this._environmentAssets();
    const surface = env.sharedSurface;
    const geo = new THREE.BoxGeometry(block.w, block.h, block.d);
    const mat = new THREE.MeshStandardMaterial({
      color: color == null ? surface.baseColor : color,
      roughness: opts.roughness == null ? surface.roughness : opts.roughness,
      metalness: opts.metalness == null ? surface.metalness : opts.metalness,
    });
    if (opts.textured !== false) {
      const tile = surface.tileWorldSize || 4;
      const repeatX = Math.max(1, Math.round(Math.max(block.w, block.d) / tile));
      const repeatY = Math.max(1, Math.round(block.h / tile));
      this._scaleGeometryUv(geo, repeatX, repeatY);
      this._applyTex(mat, opts.textureKey || surface.textureKey, 1, 1);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(block.x, block.h / 2, block.z);
    this._freezeStaticMesh(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this._addToMapRoot(mesh);
  }

  _freezeStaticMesh(mesh) {
    if (!mesh) return mesh;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  _buildPortLighting() {
    this.scene.background = new THREE.Color(0x536475);
    this.scene.fog = new THREE.Fog(0x536475, 75, 180);
    this._addToMapRoot(new THREE.AmbientLight(0xd7e2ec, 1.7));
    this._addToMapRoot(new THREE.HemisphereLight(0xdcecff, 0x59616b, 1.1));
    const dir = new THREE.DirectionalLight(0xf2e7d2, 1.35);
    dir.position.set(-28, 45, 18);
    dir.castShadow = window.CS15_DYNAMIC_SHADOWS_ENABLED === true;
    dir.shadow.mapSize.set(CONFIG.shadowMapSize, CONFIG.shadowMapSize);
    dir.shadow.camera.left = -42; dir.shadow.camera.right = 42;
    dir.shadow.camera.top = 42; dir.shadow.camera.bottom = -42;
    dir.shadow.camera.near = 1; dir.shadow.camera.far = 120;
    dir.shadow.bias = -0.0005;
    this._addToMapRoot(dir);
    if (!window.CS15_LOWEND) {
      const warm = new THREE.PointLight(0xffb36b, 1.1, 42, 2);
      warm.position.set(23, 5, 18); this._addToMapRoot(warm);
      if (!window.CS15_TOUCH) {
        const cool = new THREE.PointLight(0x6ca9e6, 0.85, 48, 2);
        cool.position.set(-20, 6, -20); this._addToMapRoot(cool);
      }
    }
  }

  _buildPortFallback(layout) {
    const env = this._environmentAssets();
    layout.high.forEach((block, i) => this._addPortVisualBlock(block, env.containerPalette[i % env.containerPalette.length], { textured: false }));
    // 外围墙放在模型外缘，实体由 bounds 留出的内沿负责安全裁剪。
    this._addPortVisualBlock({ x: -31.5, z: 0, w: 1, d: 64, h: 5 }, env.boundaryColor);
    this._addPortVisualBlock({ x: 31.5, z: 0, w: 1, d: 64, h: 5 }, env.boundaryColor);
    this._addPortVisualBlock({ x: 0, z: -31.5, w: 64, d: 1, h: 5 }, env.boundaryColor);
    this._addPortVisualBlock({ x: 0, z: 31.5, w: 64, d: 1, h: 5 }, env.boundaryColor);

    const skyGeo = new THREE.SphereGeometry(170, 24, 12);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x536475, side: THREE.BackSide, fog: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this._freezeStaticMesh(sky);
    this._addToMapRoot(sky);
  }

  _addPortFloor() {
    // 源模型主要提供集装箱/仓库几何，地面作为独立低面数基础层补齐可玩空间。
    // y=-0.03 避开模型地面可能产生的 z-fighting，同时不改变玩家的 y=0 地面规则。
    const env = this._environmentAssets();
    const surface = env.sharedSurface;
    const floorGeo = new THREE.PlaneGeometry(64, 64);
    this._scaleGeometryUv(floorGeo, 16, 16);
    const floorMat = new THREE.MeshStandardMaterial({
      color: surface.baseColor,
      roughness: surface.roughness,
      metalness: surface.metalness,
    });
    this._applyTex(floorMat, surface.textureKey, 1, 1);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.03;
    floor.receiveShadow = true;
    floor.renderOrder = -1;
    this._freezeStaticMesh(floor);
    this._addToMapRoot(floor);
  }

  _addPortMarkings() {
    // 参考图中的港区黄线用极低面数的窄盒实现，避免再引入一张贴图。
    const mat = new THREE.MeshBasicMaterial({ color: this._environmentAssets().markingColor, transparent: true, opacity: 0.78 });
    const addMark = (x, z, w, d) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.018, d), mat);
      mesh.position.set(x, 0.008, z);
      mesh.renderOrder = 1;
      this._freezeStaticMesh(mesh);
      this._addToMapRoot(mesh);
    };
    addMark(-24, -3.1, 10, 0.08);
    addMark(-24, 3.1, 10, 0.08);
    addMark(-8, -3.1, 9, 0.08);
    addMark(-8, 3.1, 9, 0.08);
    addMark(8, -3.1, 9, 0.08);
    addMark(8, 3.1, 9, 0.08);
    addMark(23, -3.1, 5, 0.08);
    addMark(23, 3.1, 5, 0.08);
    addMark(-2.6, 0, 0.08, 5);
    addMark(16.6, 0, 0.08, 5);
  }

  _buildPort() {
    const layout = this._portCollisionLayout();
    // 外边界放到可玩区外侧；bounds 负责实体的最后裁剪，避免边界盒与裁剪线重叠。
    this._addPortCollider({ x: -31.5, z: 0, w: 1, d: 64, h: 5 }, { boundary: true });
    this._addPortCollider({ x: 31.5, z: 0, w: 1, d: 64, h: 5 }, { boundary: true });
    this._addPortCollider({ x: 0, z: -31.5, w: 64, d: 1, h: 5 }, { boundary: true });
    this._addPortCollider({ x: 0, z: 31.5, w: 64, d: 1, h: 5 }, { boundary: true });

    this._addPortFloor();
    this._addPortMarkings();
    const imported = this._buildImportedPortModel();
    if (imported) {
      const exactCount = this._portCollisionSegments.length;
      const importedCount = this._addImportedWalkColliders(exactCount === 0);
      if (exactCount > 0) {
        this._portCollisionSource = `visual-mesh-segments:${exactCount}`;
      } else if (importedCount > 0) {
        this._portCollisionSource = `model-walk-boxes-fallback:${importedCount}`;
      } else {
        layout.high.forEach((block) => this._addPortCollider(block));
        this._portCollisionSource = 'curated-layout-fallback';
      }
    } else {
      layout.high.forEach((block) => this._addPortCollider(block));
      this._portCollisionSource = 'curated-layout-fallback';
      this._buildPortFallback(layout);
    }
    this._portVisualSource = imported ? 'imported-model' : 'curated-fallback';
    this._buildPortLighting();
  }

  _build() {
    if (this.isContainerPort) {
      this._buildPort();
      return;
    }
    this._buildClassic();
  }

  // 添加一块墙体并登记碰撞
  _addWall(x, z, w, d, h, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: opts.rough != null ? opts.rough : 0.9, metalness: opts.metal != null ? opts.metal : 0.0,
    });
    // 砖墙贴图：按主面尺寸平铺（真实 CC0 贴图，加载前用纯色兜底）
    const len = Math.max(w, d);
    const rx = Math.max(1, Math.round(len / 1.5));
    const ry = Math.max(1, Math.round(h / 1.5));
    this._scaleGeometryUv(geo, rx, ry);
    this._applyTex(mat, 'brick', 1, 1);
    // 平铺比例已进入几何 UV，整张经典地图只需要一份砖墙法线纹理。
    if (!window.CS15_LOWEND) {
      const normalSize = window.CS15_TOUCH ? 128 : 256;
      this._brickNormalBase = this._brickNormalBase || this._makeNormalTexture(normalSize, 'brick', true);
      this._brickNormalBase.repeat.set(1, 1);
      this._brickNormalBase.needsUpdate = true;
      mat.normalMap = this._brickNormalBase;
      mat.normalScale.set(0.4, 0.4);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this._addToMapRoot(mesh);
    // AABB
    this.boxes.push(new Box(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, h));
    return mesh;
  }

  _buildClassic() {
    // ---------- 地面 ----------
    const floorSize = 80;
    const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
    this._scaleGeometryUv(floorGeo, 20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x6a6f78, roughness: 0.85, metalness: 0.0,
    });
    // 棋盘格纹路：用 CanvasTexture 生成
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#6a6f78'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#5a5f68';
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++)
        if ((i + j) % 2 === 0) ctx.fillRect(i * 32, j * 32, 32, 32);
    floorMat.map = new THREE.CanvasTexture(canvas);
    floorMat.map.wrapS = floorMat.map.wrapT = THREE.RepeatWrapping;
    floorMat.map.repeat.set(1, 1);
    // 混凝土贴图（真实 CC0，替换棋盘格兜底）
    this._applyTex(floorMat, 'concrete', 1, 1);
    // 程序化法线贴图（同 repeat），让地面随光照移动显出颗粒起伏
    if (!window.CS15_LOWEND) {
      const floorNormal = this._makeNormalTexture(this.forge && this.forge.available ? (window.CS15_TOUCH ? 512 : 1024) : 256, 'concrete');
      floorNormal.repeat.set(1, 1);
      floorMat.normalMap = floorNormal;
      floorMat.normalScale.set(0.5, 0.5);
    }
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this._addToMapRoot(floor);

    // ---------- 天空（穹顶）----------
    const skyGeo = new THREE.SphereGeometry(200, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x46566c, side: THREE.BackSide, fog: false,
    });
    this._addToMapRoot(new THREE.Mesh(skyGeo, skyMat));

    // ---------- 外围墙 ----------
    const wallColor = 0x636b63;
    const wallH = 5;
    // 东西两侧
    this._addWall(-32, 0, 1, 40, wallH, wallColor);   // 西墙
    this._addWall( 32, 0, 1, 40, wallH, wallColor);   // 东墙
    // 南北两侧
    this._addWall(0, -20, 64, 1, wallH, wallColor);
    this._addWall(0,  20, 64, 1, wallH, wallColor);

    // ---------- 中央长廊两侧墙（带门洞）----------
    // 中央走廊 Z ∈ [-4, 4]，在走廊外侧用墙隔出上下两个区域，并留门洞
    // 上半区隔墙（z=4），在 x ∈ [-6,6] 留门
    this._addWall(-19, 4, 26, 1, wallH, wallColor);   // x: -32~-6
    this._addWall( 19, 4, 26, 1, wallH, wallColor);   // x: 6~32
    // 下半区隔墙（z=-4）
    this._addWall(-19, -4, 26, 1, wallH, wallColor);
    this._addWall( 19, -4, 26, 1, wallH, wallColor);

    // ---------- 房间隔墙（CT 房在左 x≈-14，T 房在右 x≈14）----------
    // CT 房分隔：x=-14，留 z∈[-3,3] 门
    this._addWall(-14, 9.5, 1, 11, wallH, 0x7a6450);
    this._addWall(-14, -9.5, 1, 11, wallH, 0x7a6450);
    // T 房分隔：x=14
    this._addWall(14, 9.5, 1, 11, wallH, 0x7a6450);
    this._addWall(14, -9.5, 1, 11, wallH, 0x7a6450);

    // ---------- 掩体箱（AABB，可站上去/绕过）----------
    // 中央长廊掩体
    this._addCrate(0, 0, 2.2, 2.2, 1.2, 0xb88a4a);
    this._addCrate(-8, 0, 1.8, 1.8, 1.0, 0xb88a4a);
    this._addCrate(8, 0, 1.8, 1.8, 1.0, 0xb88a4a);
    // 上下区域掩体
    this._addCrate(-6, 11, 2.5, 1.5, 1.4, 0xa87a3a);
    this._addCrate(6, -11, 2.5, 1.5, 1.4, 0xa87a3a);
    this._addCrate(-22, 10, 2, 2, 1.2, 0xa87a3a);
    this._addCrate(22, -10, 2, 2, 1.2, 0xa87a3a);
    // 长廊角落小箱（半高，做胸墙）
    this._addCrate(-3, 7, 1.2, 1.2, 0.7, 0x906a2a);
    this._addCrate(3, -7, 1.2, 1.2, 0.7, 0x906a2a);

    // ---------- 光照 ----------
    // 环境光（提亮，让所有面都可见）
    this._addToMapRoot(new THREE.AmbientLight(0xccddee, 1.8));
    // 半球光（上亮下暗，模拟天光）
    this._addToMapRoot(new THREE.HemisphereLight(0xddeeff, 0x666a75, 1.2));
    // 主方向光（带阴影）
    const dir = new THREE.DirectionalLight(0xdfe8f2, 1.4);
    dir.position.set(-20, 40, 20);
    dir.castShadow = window.CS15_DYNAMIC_SHADOWS_ENABLED === true;
    dir.shadow.mapSize.set(CONFIG.shadowMapSize, CONFIG.shadowMapSize);
    dir.shadow.camera.left = -45; dir.shadow.camera.right = 45;
    dir.shadow.camera.top = 30; dir.shadow.camera.bottom = -30;
    dir.shadow.camera.near = 1; dir.shadow.camera.far = 100;
    dir.shadow.bias = -0.0005;
    this._addToMapRoot(dir);
    // 反向补光（消除背光面阴影）
    const dir2 = new THREE.DirectionalLight(0x8fa3c8, 0.8);
    dir2.position.set(20, 30, -20);
    this._addToMapRoot(dir2);
    // 点光源会增加所有标准材质的逐像素计算：普通安卓保留 1 个氛围光，低端机关闭，桌面保留 2 个。
    if (!window.CS15_LOWEND) {
      const p1 = new THREE.PointLight(0xffaa55, 1.0, 50, 2);
      p1.position.set(-24, 4, 0); this._addToMapRoot(p1);
    }
    if (!window.CS15_TOUCH) {
      const p2 = new THREE.PointLight(0x55aaff, 1.0, 50, 2);
      p2.position.set(24, 4, 0); this._addToMapRoot(p2);
    }

    // ---------- 背景与雾 ----------
    this.scene.background = new THREE.Color(0x3a4a5e);
    this.scene.fog = new THREE.Fog(0x3a4a5e, 80, 250);

    // ---------- 玩家出生点标记（不可见）----------
    // 已在 spawns 中
  }

  // 添加一个木箱掩体（AABB 含顶部高度，可踩）
  _addCrate(x, z, w, d, h, color) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.85, metalness: 0.05,
    });
    // 木箱贴图（真实 CC0 木纹，加载前用纯色兜底）
    this._applyTex(mat, 'crateWood', 1, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this._addToMapRoot(mesh);
    // 登记为可踩踏碰撞体（高度作为玩家头顶参考）
    this.boxes.push(new Box(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, h));
  }

  // 碰撞盒空间分区：移动只查询当前位置附近的结构性 AABB；
  // 港口弹道改由真实视觉网格求交，边界盒仍保留为地图外沿兜底。
  _buildCollisionGrid() {
    const cellSize = 4;
    const grid = new Map();
    for (let index = 0; index < this.boxes.length; index++) {
      const box = this.boxes[index];
      // 网格重建会重置计数器，旧标记不能与新一轮查询编号重合。
      box._collisionStamp = 0;
      box._raycastStamp = 0;
      const minGX = Math.floor(box.minX / cellSize);
      const maxGX = Math.floor(box.maxX / cellSize);
      const minGZ = Math.floor(box.minZ / cellSize);
      const maxGZ = Math.floor(box.maxZ / cellSize);
      for (let gz = minGZ; gz <= maxGZ; gz++) {
        for (let gx = minGX; gx <= maxGX; gx++) {
          const key = `${gx},${gz}`;
          let list = grid.get(key);
          if (!list) { list = []; grid.set(key, list); }
          list.push(index);
        }
      }
    }
    this._collisionGrid = grid;
    this._collisionGridCellSize = cellSize;
    this._collisionGridBoxCount = this.boxes.length;
    this._collisionGridStamp = 0;
    this._collisionCandidateBuffer = [];
    this._raycastGridStamp = 0;
    this._rayCandidateBuffer = [];

    const segmentGrid = new Map();
    const portSegments = this._portCollisionSegments || [];
    for (let index = 0; index < portSegments.length; index++) {
      const segment = portSegments[index];
      segment._segmentStamp = 0;
      const minGX = Math.floor(Math.min(segment.x1, segment.x2) / cellSize);
      const maxGX = Math.floor(Math.max(segment.x1, segment.x2) / cellSize);
      const minGZ = Math.floor(Math.min(segment.z1, segment.z2) / cellSize);
      const maxGZ = Math.floor(Math.max(segment.z1, segment.z2) / cellSize);
      for (let gz = minGZ; gz <= maxGZ; gz++) {
        for (let gx = minGX; gx <= maxGX; gx++) {
          const key = `${gx},${gz}`;
          let list = segmentGrid.get(key);
          if (!list) { list = []; segmentGrid.set(key, list); }
          list.push(index);
        }
      }
    }
    this._segmentGrid = segmentGrid;
    this._segmentGridStamp = 0;
    this._segmentCandidateBuffer = [];

    // 精确墙线负责正常移动，模型派生盒只用于识别“已经完全进入实体内部”的
    // 异常位置。单独建索引，避免每次占位复核扫描全部港口结构盒。
    const interiorGrid = new Map();
    const interiorBoxes = this._portWalkBoxes || [];
    for (let index = 0; index < interiorBoxes.length; index++) {
      const box = interiorBoxes[index];
      box._interiorStamp = 0;
      const minGX = Math.floor(box.minX / cellSize);
      const maxGX = Math.floor(box.maxX / cellSize);
      const minGZ = Math.floor(box.minZ / cellSize);
      const maxGZ = Math.floor(box.maxZ / cellSize);
      for (let gz = minGZ; gz <= maxGZ; gz++) {
        for (let gx = minGX; gx <= maxGX; gx++) {
          const key = `${gx},${gz}`;
          let list = interiorGrid.get(key);
          if (!list) { list = []; interiorGrid.set(key, list); }
          list.push(index);
        }
      }
    }
    this._portInteriorGrid = interiorGrid;
    this._portInteriorGridStamp = 0;
    this._portInteriorCandidateBuffer = [];
  }

  _segmentCandidates(px, pz, radius) {
    const portSegments = this._portCollisionSegments || [];
    if (!this._segmentGrid || portSegments.length === 0) return [];
    const cellSize = this._collisionGridCellSize || 4;
    const minGX = Math.floor((px - radius) / cellSize), maxGX = Math.floor((px + radius) / cellSize);
    const minGZ = Math.floor((pz - radius) / cellSize), maxGZ = Math.floor((pz + radius) / cellSize);
    const stamp = ++this._segmentGridStamp;
    const out = this._segmentCandidateBuffer;
    out.length = 0;
    for (let gz = minGZ; gz <= maxGZ; gz++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const list = this._segmentGrid.get(`${gx},${gz}`);
        if (!list) continue;
        for (const index of list) {
          const segment = portSegments[index];
          if (segment._segmentStamp === stamp) continue;
          segment._segmentStamp = stamp;
          out.push(segment);
        }
      }
    }
    return out;
  }

  // 沿视线穿过空间网格收集候选墙线。使用 supercover DDA，并复用数组；
  // 港口日常感知不再对完整可见模型执行 Three.js 三角射线。
  _lineSegmentCandidates(x1, z1, x2, z2) {
    const segments = this._portCollisionSegments || [];
    if (!this._segmentGrid || segments.length === 0) return [];
    const cellSize = this._collisionGridCellSize || 4;
    let gx = Math.floor(x1 / cellSize), gz = Math.floor(z1 / cellSize);
    const endGX = Math.floor(x2 / cellSize), endGZ = Math.floor(z2 / cellSize);
    const dx = x2 - x1, dz = z2 - z1;
    const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
    const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
    const tDeltaX = stepX ? cellSize / Math.abs(dx) : Infinity;
    const tDeltaZ = stepZ ? cellSize / Math.abs(dz) : Infinity;
    const nextBoundaryX = stepX > 0 ? (gx + 1) * cellSize : gx * cellSize;
    const nextBoundaryZ = stepZ > 0 ? (gz + 1) * cellSize : gz * cellSize;
    let tMaxX = stepX ? Math.abs((nextBoundaryX - x1) / dx) : Infinity;
    let tMaxZ = stepZ ? Math.abs((nextBoundaryZ - z1) / dz) : Infinity;
    const stamp = ++this._segmentGridStamp;
    const out = this._lineSegmentCandidateBuffer || (this._lineSegmentCandidateBuffer = []);
    out.length = 0;
    const addCell = (cellX, cellZ) => {
      const list = this._segmentGrid.get(`${cellX},${cellZ}`);
      if (!list) return;
      for (const index of list) {
        const segment = segments[index];
        if (segment._segmentStamp === stamp) continue;
        segment._segmentStamp = stamp;
        out.push(segment);
      }
    };
    addCell(gx, gz);
    const maxSteps = Math.abs(endGX - gx) + Math.abs(endGZ - gz) + 4;
    for (let steps = 0; (gx !== endGX || gz !== endGZ) && steps < maxSteps; steps++) {
      if (tMaxX < tMaxZ) {
        gx += stepX;
        tMaxX += tDeltaX;
      } else if (tMaxZ < tMaxX) {
        gz += stepZ;
        tMaxZ += tDeltaZ;
      } else {
        // 精确穿过格点时把两个侧邻格也纳入，避免漏掉贴角墙线。
        addCell(gx + stepX, gz);
        addCell(gx, gz + stepZ);
        gx += stepX;
        gz += stepZ;
        tMaxX += tDeltaX;
        tMaxZ += tDeltaZ;
      }
      addCell(gx, gz);
    }
    return out;
  }

  // 日常 AI 视线只需要回答“眼高处是否有墙”。射击瞬间仍调用
  // raycastDetailed()，因此这里的轻量判定不会替代权威弹道验证。
  hasFastLineOfSight(startX, startZ, endX, endZ, eyeY = 1.6) {
    this.performanceStats = this.performanceStats || { flowBuilds: 0, fastLosChecks: 0, pathSearches: 0 };
    this.performanceStats.fastLosChecks++;
    const lineDx = endX - startX, lineDz = endZ - startZ;
    const length = Math.hypot(lineDx, lineDz);
    if (length <= 1e-5) return true;
    const endpointTolerance = Math.min(0.12, 0.5 / length);
    const blockedBy = (x3, z3, x4, z4) => {
      const wallDx = x4 - x3, wallDz = z4 - z3;
      const denominator = lineDx * wallDz - lineDz * wallDx;
      if (Math.abs(denominator) < 1e-8) return false;
      const relX = x3 - startX, relZ = z3 - startZ;
      const alongSight = (relX * wallDz - relZ * wallDx) / denominator;
      const alongWall = (relX * lineDz - relZ * lineDx) / denominator;
      return alongSight > 0.01 && alongSight < 1 - endpointTolerance &&
        alongWall >= -1e-6 && alongWall <= 1 + 1e-6;
    };
    if (this.isContainerPort && (this._portCollisionSegments || []).length > 0) {
      for (const segment of this._lineSegmentCandidates(startX, startZ, endX, endZ)) {
        if (segment.maxY <= eyeY + 0.01 || segment.minY >= eyeY - 0.01) continue;
        if (blockedBy(segment.x1, segment.z1, segment.x2, segment.z2)) return false;
      }
      return true;
    }
    for (const box of this.boxes || []) {
      if (box.maxY <= eyeY + 0.01 || box.minY >= eyeY - 0.01) continue;
      if (blockedBy(box.minX, box.minZ, box.maxX, box.minZ) ||
          blockedBy(box.maxX, box.minZ, box.maxX, box.maxZ) ||
          blockedBy(box.maxX, box.maxZ, box.minX, box.maxZ) ||
          blockedBy(box.minX, box.maxZ, box.minX, box.minZ)) return false;
    }
    return true;
  }

  _portInteriorCandidates(px, pz) {
    const boxes = this._portWalkBoxes || [];
    if (!this._portInteriorGrid || boxes.length === 0) return [];
    const cellSize = this._collisionGridCellSize || 4;
    const list = this._portInteriorGrid.get(`${Math.floor(px / cellSize)},${Math.floor(pz / cellSize)}`);
    const out = this._portInteriorCandidateBuffer;
    out.length = 0;
    if (!list) return out;
    const stamp = ++this._portInteriorGridStamp;
    for (const index of list) {
      const box = boxes[index];
      if (box._interiorStamp === stamp) continue;
      box._interiorStamp = stamp;
      out.push(box);
    }
    return out;
  }

  // 港口墙线只描述表面：圆心若因出生、拥挤或数值异常进入大型实体深处，
  // 它可能离所有表面都超过半径而被误判为“自由”。这里仅检查派生盒的深层核心，
  // 外缘仍完全交给可见网格墙线，避免重新引入 AABB 空气墙。
  // 薄盒自适应：跨度不足 2×coreInset 的盒核心按跨度收缩——第五轮真机复现
  // 证明居中 0.5m 硬下限仍不够：0.5~1.0m 宽的走道板条（边缘墙线有提取缺口）
  // 在跨度≤0.5m 时核心被清零、深层检测永不生效，敌人圆心经缺口进入板条
  // 占地后审计判合法、永不脱困（卡在“其他物体”中）。本版核心带最小为跨度
  // 的 60%：圆心必须深入盒内超过 20% 跨度才算异常，板条边缘的贴边路径保留。
  // 注意：深层核心判定是对全足迹阻挡（boxes[]）之外的第二道保险；二者共同
  // 保证圆心不会停留在结构实体内部而不被检测。
  _isDeepInsidePortStructure(px, pz, radius, vertical = null) {
    if (!this.isContainerPort || !(this._portWalkBoxes || []).length) return false;
    const bodyMin = vertical && Number.isFinite(Number(vertical.minY)) ? Number(vertical.minY) : 0;
    const bodyMax = vertical && Number.isFinite(Number(vertical.maxY)) ? Number(vertical.maxY) : 1.8;
    const coreInset = Math.max(0.08, Number(radius) || 0) + 0.04;
    for (const box of this._portInteriorCandidates(px, pz)) {
      if (!box.overlapsVertical(bodyMin, bodyMax)) continue;
      const halfW = (box.maxX - box.minX) / 2;
      const halfD = (box.maxZ - box.minZ) / 2;
      const insetX = Math.min(coreInset, Math.max(halfW * 0.4, halfW - 0.25));
      const insetZ = Math.min(coreInset, Math.max(halfD * 0.4, halfD - 0.25));
      if (insetX <= 0 || insetZ <= 0) continue;   // 极薄盒（跨度<0.1m）不做深层判定
      if (px > box.minX + insetX && px < box.maxX - insetX &&
          pz > box.minZ + insetZ && pz < box.maxZ - insetZ) return true;
    }
    return false;
  }

  _resolvePortSegments(px, pz, radius, vertical = null) {
    let x = px, z = pz;
    const bodyMin = vertical && Number.isFinite(Number(vertical.minY)) ? Number(vertical.minY) : 0;
    const bodyMax = vertical && Number.isFinite(Number(vertical.maxY)) ? Number(vertical.maxY) : 1.8;
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (const segment of this._segmentCandidates(x, z, radius)) {
        if (segment.maxY <= bodyMin + 0.02 || segment.minY >= bodyMax - 0.02) continue;
        const vx = segment.x2 - segment.x1, vz = segment.z2 - segment.z1;
        const lengthSq = vx * vx + vz * vz;
        if (lengthSq < 1e-8) continue;
        const t = Math.max(0, Math.min(1, ((x - segment.x1) * vx + (z - segment.z1) * vz) / lengthSq));
        const nearestX = segment.x1 + vx * t, nearestZ = segment.z1 + vz * t;
        let dx = x - nearestX, dz = z - nearestZ;
        let distance = Math.hypot(dx, dz);
        if (distance >= radius - 1e-5) continue;
        let normalX, normalZ;
        if (distance < 1e-6) {
          const inv = 1 / Math.sqrt(lengthSq);
          normalX = -vz * inv;
          normalZ = vx * inv;
          distance = 0;
        } else {
          normalX = dx / distance;
          normalZ = dz / distance;
        }
        const push = radius - distance + 0.001;
        x += normalX * push;
        z += normalZ * push;
        changed = true;
      }
      if (!changed) break;
    }
    return { x, z };
  }

  _collisionCandidates(px, pz, radius) {
    if (!this._collisionGrid || this._collisionGridBoxCount !== this.boxes.length) {
      this._buildCollisionGrid();
    }
    if (!this._collisionGrid || this.boxes.length === 0) return this.boxes;
    const cellSize = this._collisionGridCellSize;
    const minGX = Math.floor((px - radius) / cellSize);
    const maxGX = Math.floor((px + radius) / cellSize);
    const minGZ = Math.floor((pz - radius) / cellSize);
    const maxGZ = Math.floor((pz + radius) / cellSize);
    const stamp = ++this._collisionGridStamp;
    const result = this._collisionCandidateBuffer;
    result.length = 0;
    for (let gz = minGZ; gz <= maxGZ; gz++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const list = this._collisionGrid.get(`${gx},${gz}`);
        if (!list) continue;
        for (const index of list) {
          const box = this.boxes[index];
          if (box._collisionStamp === stamp) continue;
          box._collisionStamp = stamp;
          result.push(box);
        }
      }
    }
    return result;
  }

  // 射线宽相对很小，但射程可能跨过多个分区；取射线首尾投影的 2D 包围范围，
  // 再交给 rayAABBDetailed 做精确求交，保证只减少候选而不提前排除可能命中的盒子。
  _raycastCandidates(origin, direction, maxDist) {
    if (!this._collisionGrid || this._collisionGridBoxCount !== this.boxes.length) {
      this._buildCollisionGrid();
    }
    if (!this._collisionGrid || this.boxes.length === 0) return this.boxes;
    const distance = Number.isFinite(maxDist) && maxDist > 0 ? maxDist : 0;
    const endX = origin.x + direction.x * distance;
    const endZ = origin.z + direction.z * distance;
    const pad = 0.001;
    const cellSize = this._collisionGridCellSize;
    const minGX = Math.floor((Math.min(origin.x, endX) - pad) / cellSize);
    const maxGX = Math.floor((Math.max(origin.x, endX) + pad) / cellSize);
    const minGZ = Math.floor((Math.min(origin.z, endZ) - pad) / cellSize);
    const maxGZ = Math.floor((Math.max(origin.z, endZ) + pad) / cellSize);
    const stamp = ++this._raycastGridStamp;
    const result = this._rayCandidateBuffer;
    result.length = 0;
    for (let gz = minGZ; gz <= maxGZ; gz++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const list = this._collisionGrid.get(`${gx},${gz}`);
        if (!list) continue;
        for (const index of list) {
          const box = this.boxes[index];
          if (box._raycastStamp === stamp) continue;
          box._raycastStamp = stamp;
          result.push(box);
        }
      }
    }
    return result;
  }

  // 碰撞解算：给定位置与半径，迭代推出所有重叠盒。
  // vertical 可选，用于跳跃中的玩家：脚底已经高过盒顶时，盒体不再阻挡水平移动；
  // 地面敌人不传该参数，继续按完整高度墙体碰撞。
  collide(px, pz, radius, vertical = null) {
    let x = px, z = pz;
    const minY = vertical && Number.isFinite(Number(vertical.minY)) ? Number(vertical.minY) : null;
    const maxY = vertical && Number.isFinite(Number(vertical.maxY)) ? Number(vertical.maxY) : null;
    const hasVertical = minY !== null && maxY !== null && maxY > minY;
    for (let i = 0; i < 10; i++) {   // 相邻盒交叉处需要多轮推出，避免经典地图敌人残留在结构内部
      let changed = false;
      for (const b of this._collisionCandidates(x, z, radius)) {
        if (hasVertical && !b.overlapsVertical(minY, maxY)) continue;
        const push = b.resolveCircle(x, z, radius);
        if (push) { x += push.x; z += push.z; changed = true; }
      }
      if (!changed) break;
    }
    if (this.isContainerPort && (this._portCollisionSegments || []).length > 0) {
      const exact = this._resolvePortSegments(x, z, radius, vertical);
      x = exact.x;
      z = exact.z;
    }
    // 外围边界裁剪。若裁剪改变了位置，再对港口精确边界解算一次，防止边界
    // 把圆心压回紧邻的模型墙面中。
    const clampedX = Math.max(this.bounds.minX + radius, Math.min(this.bounds.maxX - radius, x));
    const clampedZ = Math.max(this.bounds.minZ + radius, Math.min(this.bounds.maxZ - radius, z));
    if (this.isContainerPort && (this._portCollisionSegments || []).length > 0 &&
        (Math.abs(clampedX - x) > 1e-6 || Math.abs(clampedZ - z) > 1e-6)) {
      const exact = this._resolvePortSegments(clampedX, clampedZ, radius, vertical);
      x = Math.max(this.bounds.minX + radius, Math.min(this.bounds.maxX - radius, exact.x));
      z = Math.max(this.bounds.minZ + radius, Math.min(this.bounds.maxZ - radius, exact.z));
    } else {
      x = clampedX;
      z = clampedZ;
    }
    return { x, z };
  }

  // 沿移动轨迹分步解算，避免高速实体单帧跨过薄的模型碰撞代理。
  // 每一步都从上一步的合法位置继续，撞墙后仍能沿切线方向滑行。
  moveCircle(startX, startZ, endX, endZ, radius) {
    const vertical = arguments.length > 5 ? arguments[5] : null;
    let x = startX, z = startZ;
    const dx = endX - startX, dz = endZ - startZ;
    const distance = Math.hypot(dx, dz);
    const collisionStep = (CONFIG.performance && CONFIG.performance.collisionStep) || 0.2;
    const steps = Math.max(1, Math.ceil(distance / collisionStep));
    const stepX = dx / steps, stepZ = dz / steps;
    for (let i = 0; i < steps; i++) {
      const resolved = this.collide(x + stepX, z + stepZ, radius, vertical);
      x = resolved.x;
      z = resolved.z;
    }
    return { x, z };
  }

  // 复核一个位置是否真正没有与碰撞盒或地图边界重叠。
  // collide() 的返回值不能单独当作安全证明：相邻盒在同一轮中可能把实体
  // 从第一面墙推到第二面墙里，因此出生和解困都要再做一次无副作用检查。
  // 港口地图额外做「缝隙挤压」判定：圆不与任何墙线重叠（原有判定全部合法）
  // 但处于宽度不足一条圆直径×squeezeGapFactor 的平行墙缝内时判为不自由。
  // 这堵住了第四轮修复后仍复现的卡墙路径：敌人被 AI 分离推挤塞进 0.8m 级
  // 缝隙后，占位审计判合法、永不触发脱困。出生采样、导航网格、占位审计、
  // AI 推挤与脱困迁移都消费本判定，行为自动统一。
  isCircleFree(px, pz, radius, vertical = null) {
    if (px < this.bounds.minX + radius - 1e-5 || px > this.bounds.maxX - radius + 1e-5 ||
      pz < this.bounds.minZ + radius - 1e-5 || pz > this.bounds.maxZ - radius + 1e-5) return false;
    const minY = vertical && Number.isFinite(Number(vertical.minY)) ? Number(vertical.minY) : null;
    const maxY = vertical && Number.isFinite(Number(vertical.maxY)) ? Number(vertical.maxY) : null;
    const hasVertical = minY !== null && maxY !== null && maxY > minY;
    for (const b of this._collisionCandidates(px, pz, radius)) {
      if (hasVertical && !b.overlapsVertical(minY, maxY)) continue;
      if (b.resolveCircle(px, pz, radius)) return false;
    }
    if (this._isDeepInsidePortStructure(px, pz, radius, vertical)) return false;
    const bodyMin = hasVertical ? minY : 0;
    const bodyMax = hasVertical ? maxY : 1.8;
    if (this.isContainerPort && (this._portCollisionSegments || []).length > 0) {
      for (const segment of this._segmentCandidates(px, pz, radius)) {
        if (segment.maxY <= bodyMin + 0.02 || segment.minY >= bodyMax - 0.02) continue;
        const vx = segment.x2 - segment.x1, vz = segment.z2 - segment.z1;
        const lengthSq = vx * vx + vz * vz;
        if (lengthSq < 1e-8) continue;
        const t = Math.max(0, Math.min(1, ((px - segment.x1) * vx + (pz - segment.z1) * vz) / lengthSq));
        const dx = px - (segment.x1 + vx * t), dz = pz - (segment.z1 + vz * t);
        if (dx * dx + dz * dz < radius * radius - 1e-6) return false;
      }
      // 挤压缝：位置本身合法，但两侧近距离各有一道身体层墙线，缝宽不足以
      // 安全通行。离线实证（tools/audit_wall_blindspots2.js）显示 109/111
      // 危险点属于此类——缝内合法、塞入后被两壁夹死且永不触发脱困。
      if (this._isSqueezeGap(px, pz, radius, bodyMin, bodyMax)) return false;
    }
    return true;
  }

  // 缝隙挤压判定：收集探测半径（直径×squeezeGapFactor）内的身体层墙线段，
  // 两两配对——两墙方向接近平行（夹角 20° 内）且位于圆心两侧（各自指向圆心
  // 的法线点积 < 0）、两侧距离之和小于探测半径时判为挤压缝。求和判定保证
  // 1m 级合法走廊不受影响，只有真正容不下一条圆直径的缝会被封。
  _isSqueezeGap(px, pz, radius, bodyMin, bodyMax) {
    const probe = radius * 2 * (Number(CONFIG.ai && CONFIG.ai.squeezeGapFactor) || 1.15);
    const probeSq = probe * probe;
    const near = [];
    for (const segment of this._segmentCandidates(px, pz, probe)) {
      if (segment.maxY <= bodyMin + 0.02 || segment.minY >= bodyMax - 0.02) continue;
      const vx = segment.x2 - segment.x1, vz = segment.z2 - segment.z1;
      const lengthSq = vx * vx + vz * vz;
      if (lengthSq < 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((px - segment.x1) * vx + (pz - segment.z1) * vz) / lengthSq));
      const dx = px - (segment.x1 + vx * t), dz = pz - (segment.z1 + vz * t);
      const distSq = dx * dx + dz * dz;
      if (distSq >= probeSq) continue;
      const dist = Math.sqrt(distSq);
      const invLen = 1 / Math.sqrt(lengthSq);
      // 圆心几乎落在段上时用段自身法线兜底（真重叠已被上方重叠判定先行排除）
      const nx = dist > 1e-6 ? dx / dist : -vz * invLen;
      const nz = dist > 1e-6 ? dz / dist : vx * invLen;
      near.push({ nx, nz, dist, vx: vx * invLen, vz: vz * invLen });
    }
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      for (let j = i + 1; j < near.length; j++) {
        const b = near[j];
        if (a.nx * b.nx + a.nz * b.nz >= 0) continue;        // 同侧不构成缝
        const cross = Math.abs(a.vx * b.vz - a.vz * b.vx);   // 平行墙 |sinθ| ≈ 0
        if (cross >= 0.342) continue;                        // 夹角超过 20° 不算平行
        if (a.dist + b.dist < probe) return true;
      }
    }
    return false;
  }

  // 从一个可能已经卡进模型的点向外找最近合法圆心。正常移动不会调用它，
  // 只在出生复核或卡墙恢复时使用，避免在每帧为所有敌人增加环形采样成本。
  findNearestFree(px, pz, radius, maxDistance = 8, reservedPoints = [], reservedMinDist = 0) {
    const originX = Number(px), originZ = Number(pz);
    if (!Number.isFinite(originX) || !Number.isFinite(originZ)) return null;
    const points = Array.isArray(reservedPoints) ? reservedPoints : [];
    const reservedDistanceSq = Math.max(0, Number(reservedMinDist) || 0) ** 2;
    const tryPoint = (x, z) => {
      const resolved = this.collide(x, z, radius);
      const offset = Math.hypot(resolved.x - originX, resolved.z - originZ);
      if (offset > maxDistance + 0.05) return null;
      if (reservedDistanceSq > 0) {
        for (const point of points) {
          if (!point) continue;
          const dx = resolved.x - point.x, dz = resolved.z - point.z;
          if (dx * dx + dz * dz < reservedDistanceSq) return null;
        }
      }
      return this.isCircleFree(resolved.x, resolved.z, radius)
        ? new THREE.Vector3(resolved.x, 0, resolved.z) : null;
    };
    const center = tryPoint(originX, originZ);
    if (center) return center;
    const step = 0.5;
    const rings = Math.max(1, Math.ceil(maxDistance / step));
    for (let ring = 1; ring <= rings; ring++) {
      const distance = Math.min(maxDistance, ring * step);
      const count = Math.max(12, Math.ceil(Math.PI * 2 * distance / step));
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const safe = tryPoint(originX + Math.cos(angle) * distance, originZ + Math.sin(angle) * distance);
        if (safe) return safe;
      }
    }
    return null;
  }

  // 计算玩家下落轨迹上的最高可站立盒顶。currentY/targetY 用于只接受向下穿过
  // 的顶面，避免跳跃上升时被同一箱子的顶面“吸住”。
  getGroundHeight(px, pz, radius, currentY = Infinity, targetY = -Infinity) {
    let ground = 0;
    const descending = Number.isFinite(Number(currentY)) && Number.isFinite(Number(targetY)) && targetY <= currentY + 1e-6;
    for (const b of this._collisionCandidates(px, pz, radius)) {
      if (!b.overlapsCircleXZ(px, pz, radius) || b.maxY <= ground + 1e-6) continue;
      if (descending && (b.maxY > currentY + 0.06 || b.maxY < targetY - 0.06)) continue;
      ground = b.maxY;
    }
    if (this.isContainerPort) {
      for (const b of (this._portSupportBoxes || [])) {
        if (!b.overlapsCircleXZ(px, pz, radius) || b.maxY <= ground + 1e-6) continue;
        if (descending && (b.maxY > currentY + 0.06 || b.maxY < targetY - 0.06)) continue;
        ground = b.maxY;
      }
    }
    return ground;
  }

  // 随机可行走出生点：在地图内随机采样，避开碰撞盒、玩家和已预留敌人位置。
  // reservedPoints 用于同一波的出生队列；找不到满足间距的点时，返回采样到的最优合法点。
  randomSpawn(avoidX, avoidZ, minDist, reservedPoints = [], reservedMinDist = 0) {
    const points = Array.isArray(reservedPoints) ? reservedPoints : [];
    const requiredPointDistSq = Math.max(0, reservedMinDist) ** 2;
    let best = null;
    let bestPointDistSq = -1;
    const distanceFromPlayerSq = (x, z) => {
      if (minDist && avoidX !== undefined) {
        const dx = x - avoidX, dz = z - avoidZ;
        if (dx * dx + dz * dz < minDist * minDist) return -1;
      }
      let nearestSq = Infinity;
      for (const point of points) {
        if (!point) continue;
        const dx = x - point.x, dz = z - point.z;
        nearestSq = Math.min(nearestSq, dx * dx + dz * dz);
      }
      return nearestSq;
    };

    for (let i = 0; i < 80; i++) {
      const x = this.bounds.minX + 1 + Math.random() * (this.bounds.maxX - this.bounds.minX - 2);
      const z = this.bounds.minZ + 1 + Math.random() * (this.bounds.maxZ - this.bounds.minZ - 2);
      const pointDistSq = distanceFromPlayerSq(x, z);
      if (pointDistSq < 0) continue;
      if (!this.isCircleFree(x, z, 0.6)) continue;
      if (pointDistSq > bestPointDistSq) {
        bestPointDistSq = pointDistSq;
        best = { x, z };
      }
      if (pointDistSq >= requiredPointDistSq) return new THREE.Vector3(x, 0, z);
    }

    // 回退先检查固定点，仍尽量满足玩家/队列间距并避开碰撞盒。
    for (const s of this.spawns.enemy) {
      const safe = this.findNearestFree(s.x, s.z, 0.6, 12);
      if (!safe) continue;
      const pointDistSq = distanceFromPlayerSq(safe.x, safe.z);
      if (pointDistSq < 0) continue;
      if (pointDistSq > bestPointDistSq) {
        bestPointDistSq = pointDistSq;
        best = { x: safe.x, z: safe.z };
      }
      if (pointDistSq >= requiredPointDistSq) return safe;
    }
    // 地图极拥挤时返回最远的合法采样点，避免所有敌人落到同一个固定回退点。
    if (best) return new THREE.Vector3(best.x, 0, best.z);
    for (const s of this.spawns.enemy) {
      const safe = this.findNearestFree(s.x, s.z, 0.6, 20);
      if (safe && distanceFromPlayerSq(safe.x, safe.z) >= 0) return safe;
    }
    // 不返回未经验证的地图中心；调用者延后本次生成并重新采样。
    return null;
  }

  _buildNavigationGrid() {
    const cellSize = Math.max(0.75, Number(CONFIG.ai && CONFIG.ai.navigationCellSize) || 1);
    const width = Math.max(1, Math.floor((this.bounds.maxX - this.bounds.minX) / cellSize));
    const height = Math.max(1, Math.floor((this.bounds.maxZ - this.bounds.minZ) / cellSize));
    const walkable = new Uint8Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const wx = this.bounds.minX + (x + 0.5) * cellSize;
        const wz = this.bounds.minZ + (z + 0.5) * cellSize;
        walkable[z * width + x] = this.isCircleFree(wx, wz, 0.46) ? 1 : 0;
      }
    }
    const count = width * height;
    this._navigation = {
      cellSize, width, height, walkable,
      gScore: new Float32Array(count),
      parent: new Int32Array(count),
      closed: new Uint8Array(count),
      heap: [],
      heapScore: [],
      flowDistance: new Int32Array(count),
      flowQueue: new Int32Array(count),
      flowGoal: -1,
      flowRefreshTimer: 0,
      directions: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
    };
    this._navigation.flowDistance.fill(-1);
    this.performanceStats = { flowBuilds: 0, fastLosChecks: 0, pathSearches: 0 };
  }

  _nearestNavigationIndex(worldX, worldZ) {
    const nav = this._navigation;
    if (!nav) return -1;
    const baseX = Math.floor((worldX - this.bounds.minX) / nav.cellSize);
    const baseZ = Math.floor((worldZ - this.bounds.minZ) / nav.cellSize);
    for (let ring = 0; ring <= 5; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
          const x = baseX + dx, z = baseZ + dz;
          if (x < 0 || z < 0 || x >= nav.width || z >= nav.height) continue;
          const index = z * nav.width + x;
          if (nav.walkable[index]) return index;
        }
      }
    }
    return -1;
  }

  isPathClear(startX, startZ, endX, endZ, radius = 0.4) {
    const dx = endX - startX, dz = endZ - startZ;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / Math.max(0.25, radius * 0.75)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isCircleFree(startX + dx * t, startZ + dz * t, radius)) return false;
    }
    return true;
  }

  // 全部追击玩家的敌人共享一张流场。只有玩家进入新的导航格且刷新冷却结束
  // 才重建一次，避免每个敌人各自运行 A*。
  updatePlayerFlowField(targetX, targetZ, dt) {
    const nav = this._navigation;
    if (!nav) return false;
    const count = nav.width * nav.height;
    if (!nav.flowDistance) {
      nav.flowDistance = new Int32Array(count);
      nav.flowDistance.fill(-1);
    }
    nav.flowQueue = nav.flowQueue || new Int32Array(count);
    nav.directions = nav.directions || [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    if (nav.flowGoal == null) nav.flowGoal = -1;
    this.performanceStats = this.performanceStats || { flowBuilds: 0, fastLosChecks: 0, pathSearches: 0 };
    nav.flowRefreshTimer = Math.max(0, nav.flowRefreshTimer - Math.max(0, Number(dt) || 0));
    const goal = this._nearestNavigationIndex(targetX, targetZ);
    if (goal < 0) return false;
    if (goal === nav.flowGoal) return true;
    if (nav.flowGoal >= 0 && nav.flowRefreshTimer > 0) return true;
    nav.flowRefreshTimer = Math.max(0.1, Number(CONFIG.ai && CONFIG.ai.playerFlowRefresh) || 0.35);
    nav.flowGoal = goal;
    nav.flowDistance.fill(-1);
    let head = 0, tail = 0;
    nav.flowQueue[tail++] = goal;
    nav.flowDistance[goal] = 0;
    while (head < tail) {
      const current = nav.flowQueue[head++];
      const cx = current % nav.width, cz = Math.floor(current / nav.width);
      const nextDistance = nav.flowDistance[current] + 1;
      for (const direction of nav.directions) {
        const dx = direction[0], dz = direction[1];
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= nav.width || nz >= nav.height) continue;
        const next = nz * nav.width + nx;
        if (!nav.walkable[next] || nav.flowDistance[next] >= 0) continue;
        if (dx && dz && (!nav.walkable[cz * nav.width + nx] || !nav.walkable[nz * nav.width + cx])) continue;
        nav.flowDistance[next] = nextDistance;
        nav.flowQueue[tail++] = next;
      }
    }
    this.performanceStats.flowBuilds++;
    return true;
  }

  flowDirectionAt(worldX, worldZ, out) {
    const nav = this._navigation;
    const result = out || new THREE.Vector3();
    const current = this._nearestNavigationIndex(worldX, worldZ);
    if (!nav || current < 0 || nav.flowGoal < 0 || nav.flowDistance[current] < 0) return false;
    const cx = current % nav.width, cz = Math.floor(current / nav.width);
    let best = current, bestDistance = nav.flowDistance[current];
    for (const direction of nav.directions) {
      const dx = direction[0], dz = direction[1];
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= nav.width || nz >= nav.height) continue;
      const next = nz * nav.width + nx;
      const distance = nav.flowDistance[next];
      if (distance < 0 || distance >= bestDistance) continue;
      if (dx && dz && (!nav.walkable[cz * nav.width + nx] || !nav.walkable[nz * nav.width + cx])) continue;
      best = next;
      bestDistance = distance;
    }
    if (best === current) return false;
    const bestX = best % nav.width, bestZ = Math.floor(best / nav.width);
    result.set(
      this.bounds.minX + (bestX + 0.5) * nav.cellSize - worldX,
      0,
      this.bounds.minZ + (bestZ + 0.5) * nav.cellSize - worldZ
    );
    if (result.lengthSq() <= 1e-6) return false;
    result.normalize();
    return true;
  }

  // 确定性 A*：导航网格在地图加载阶段生成，运行中只搜索索引；返回前再用
  // 真实碰撞边界简化路径，保证敌人追击和抢补给都不会直线撞墙。
  findPath(startX, startZ, endX, endZ, radius = 0.4) {
    this.performanceStats = this.performanceStats || { flowBuilds: 0, fastLosChecks: 0, pathSearches: 0 };
    this.performanceStats.pathSearches++;
    if (this.isPathClear(startX, startZ, endX, endZ, radius)) {
      return [new THREE.Vector3(endX, 0, endZ)];
    }
    const nav = this._navigation;
    const start = this._nearestNavigationIndex(startX, startZ);
    const goal = this._nearestNavigationIndex(endX, endZ);
    if (!nav || start < 0 || goal < 0) return null;
    const count = nav.width * nav.height;
    const gScore = nav.gScore || (nav.gScore = new Float32Array(count)); gScore.fill(Infinity);
    const parent = nav.parent || (nav.parent = new Int32Array(count)); parent.fill(-1);
    const closed = nav.closed || (nav.closed = new Uint8Array(count)); closed.fill(0);
    const heap = nav.heap || (nav.heap = []), heapScore = nav.heapScore || (nav.heapScore = []);
    heap.length = 0; heapScore.length = 0;
    const goalX = goal % nav.width, goalZ = Math.floor(goal / nav.width);
    const heuristic = (index) => Math.hypot(goalX - index % nav.width, goalZ - Math.floor(index / nav.width));
    const push = (index, score) => {
      let pos = heap.length;
      heap.push(index); heapScore.push(score);
      while (pos > 0) {
        const parentPos = (pos - 1) >> 1;
        if (heapScore[parentPos] <= score) break;
        heap[pos] = heap[parentPos]; heapScore[pos] = heapScore[parentPos]; pos = parentPos;
      }
      heap[pos] = index; heapScore[pos] = score;
    };
    const pop = () => {
      const result = heap[0];
      const lastIndex = heap.pop(), lastScore = heapScore.pop();
      if (heap.length > 0) {
        let pos = 0;
        while (true) {
          let child = pos * 2 + 1;
          if (child >= heap.length) break;
          if (child + 1 < heap.length && heapScore[child + 1] < heapScore[child]) child++;
          if (heapScore[child] >= lastScore) break;
          heap[pos] = heap[child]; heapScore[pos] = heapScore[child]; pos = child;
        }
        heap[pos] = lastIndex; heapScore[pos] = lastScore;
      }
      return result;
    };
    gScore[start] = 0;
    push(start, heuristic(start));
    const directions = nav.directions || (nav.directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
    let visits = 0, found = false;
    while (heap.length > 0 && visits < 2400) {
      const current = pop();
      if (closed[current]) continue;
      if (current === goal) { found = true; break; }
      closed[current] = 1; visits++;
      const cx = current % nav.width, cz = Math.floor(current / nav.width);
      for (const [dx, dz] of directions) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= nav.width || nz >= nav.height) continue;
        const next = nz * nav.width + nx;
        if (!nav.walkable[next] || closed[next]) continue;
        if (dx && dz && (!nav.walkable[cz * nav.width + nx] || !nav.walkable[nz * nav.width + cx])) continue;
        const tentative = gScore[current] + (dx && dz ? Math.SQRT2 : 1);
        if (tentative >= gScore[next]) continue;
        gScore[next] = tentative;
        parent[next] = current;
        push(next, tentative + heuristic(next));
      }
    }
    if (!found) return null;
    const reversed = [];
    for (let cursor = goal; cursor !== start;) {
      const x = cursor % nav.width, z = Math.floor(cursor / nav.width);
      reversed.push(new THREE.Vector3(
        this.bounds.minX + (x + 0.5) * nav.cellSize,
        0,
        this.bounds.minZ + (z + 0.5) * nav.cellSize
      ));
      cursor = parent[cursor];
      if (cursor < 0) return null;
    }
    reversed.reverse();
    const simplified = [];
    let anchorX = startX, anchorZ = startZ, cursor = 0;
    while (cursor < reversed.length) {
      let farthest = cursor;
      for (let next = cursor + 1; next < reversed.length; next++) {
        if (!this.isPathClear(anchorX, anchorZ, reversed[next].x, reversed[next].z, radius)) break;
        farthest = next;
      }
      const point = reversed[farthest];
      simplified.push(point);
      anchorX = point.x; anchorZ = point.z; cursor = farthest + 1;
    }
    const last = simplified[simplified.length - 1];
    if (this.isCircleFree(endX, endZ, radius) &&
        (!last || Math.hypot(last.x - endX, last.z - endZ) > 0.05)) {
      simplified.push(new THREE.Vector3(endX, 0, endZ));
    }
    return simplified;
  }

  // 返回地图射线最近命中距离；经典地图走分区 AABB，港口地图走真实模型网格。
  raycast(origin, direction, maxDist) {
    return this.raycastDetailed(origin, direction, maxDist).t;
  }

  _raycastImportedPort(origin, direction, maxDist) {
    if (!this._portModel || !THREE.Raycaster || !Number.isFinite(maxDist) || maxDist <= 0) return null;
    if (!this._portRaycaster) {
      this._portRaycaster = new THREE.Raycaster();
      // BVH 路径只需要最近一个命中；语义与取 hits[0] 完全一致，但省掉
      // 全部远端交点的排序收集。
      try { this._portRaycaster.firstHitOnly = true; } catch (e) { /* 非 BVH 路径忽略 */ }
    }
    // 网格已在 _freezeStaticMesh 冻结矩阵；不再每次射线 updateMatrixWorld(true)
    //（59,874 面的矩阵级联在 M249 射速下是可观开销）。万一有代码移动过模型，
    // matrixWorldNeedsUpdate 会重新置位，这里按需补偿一次。
    if (this._portModel.matrixWorldNeedsUpdate) this._portModel.updateMatrixWorld(true);
    this._portRaycaster.set(origin, direction);
    // 枪口/眼位可能贴着模型表面，跳过极近的自相交，避免出现零距离弹孔。
    this._portRaycaster.near = 0.02;
    this._portRaycaster.far = maxDist;
    const hits = this._portRaycaster.intersectObject(this._portModel, false);
    if (!hits || hits.length === 0) return null;
    const hit = hits[0];
    if (!hit || !Number.isFinite(hit.distance) || hit.distance < this._portRaycaster.near || hit.distance > maxDist) return null;
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : direction.clone().negate();
    return { t: hit.distance, normal };
  }

  // 交战/扔雷卡顿根因修复：Raycaster 原生路径对整张 59,874 面网格暴力遍历
  //（每发子弹/每步手雷地面探测一次）。接入 three-mesh-bvh（MIT）后射线走
  // BVH 加速，命中结果与原生路径完全一致——同一批三角形，仅加速查找。
  // 库文件缺失、原型安装失败或构建异常时静默回退原生路径。
  _installPortRaycastAcceleration(mesh) {
    if (!mesh || !mesh.geometry || this._portBvhReady || this._portBvhFailed) return;
    const lib = (typeof window !== 'undefined') ? window.MeshBVHLib : null;
    if (!lib || typeof lib.computeBoundsTree !== 'function' ||
        typeof lib.acceleratedRaycast !== 'function') return;
    try {
      if (!this._bvhPrototypesInstalled) {
        THREE.BufferGeometry.prototype.computeBoundsTree = lib.computeBoundsTree;
        THREE.BufferGeometry.prototype.disposeBoundsTree = lib.disposeBoundsTree;
        THREE.Mesh.prototype.raycast = lib.acceleratedRaycast;
        this._bvhPrototypesInstalled = true;
      }
      const now = (window.performance && performance.now) ? () => performance.now() : () => Date.now();
      const t0 = now();
      mesh.geometry.computeBoundsTree();
      const buildMs = Math.round((now() - t0) * 10) / 10;
      this._portBvhReady = true;
      this.performanceStats = this.performanceStats || {};
      this.performanceStats.bvhBuildMs = buildMs;
      this.performanceStats.bvhTriangles = Math.floor(mesh.geometry.attributes.position.count / 3);
    } catch (err) {
      console.warn('[cs15] BVH 加速不可用，回退原生射线', err);
      this._portBvhReady = false;
      this._portBvhFailed = true;
    }
  }

  // 返回 { t, normal }——最近命中距离 + 命中面世界法线（港口弹道精确贴真实墙面）
  raycastDetailed(origin, direction, maxDist) {
    let best = { t: maxDist, normal: null };
    if (this.isContainerPort && this._portModel) {
      const visualHit = this._raycastImportedPort(origin, direction, maxDist);
      if (visualHit && visualHit.t < best.t) best = visualHit;
      // 港口子弹以可见三角网格为准。移动 AABB 来自 0.5m 栅格投影，若把它
      // 继续当弹道兜底，会在障碍物周边形成肉眼看不见的挡弹区域。
      // 只保留地图外围边界兜底，避免子弹飞出可玩区域。
      for (const b of this._raycastCandidates(origin, direction, maxDist)) {
        if (!b._portBoundary) continue;
        const r = rayAABBDetailed(origin, direction, b);
        if (r !== null && r.t < best.t) best = r;
      }
      return best;
    }
    for (const b of this._raycastCandidates(origin, direction, maxDist)) {
      const r = rayAABBDetailed(origin, direction, b);
      if (r !== null && r.t < best.t) best = r;
    }
    return best;
  }

  // 2D 墙线段（视线判定用）：仅输出"高墙"四边（maxY>=CONFIG.ai.losSegY），
  // 掩体箱（h<=1.4）不参与遮挡，与现有 raycast 行为一致；boxes 静态故惰性缓存
  boxSegments() {
    if (this._segs) return this._segs;
    const segs = [];
    const yTh = (CONFIG.ai && CONFIG.ai.losSegY) || 1.55;
    for (const b of this.boxes) {
      if (b.maxY < yTh) continue;              // 关键：过滤掩体箱
      segs.push({ p1: { x: b.minX, z: b.minZ }, p2: { x: b.maxX, z: b.minZ } });
      segs.push({ p1: { x: b.maxX, z: b.minZ }, p2: { x: b.maxX, z: b.maxZ } });
      segs.push({ p1: { x: b.maxX, z: b.maxZ }, p2: { x: b.minX, z: b.maxZ } });
      segs.push({ p1: { x: b.minX, z: b.maxZ }, p2: { x: b.minX, z: b.minZ } });
    }
    this._segs = segs;
    return segs;
  }

  // 地图只允许在开局前或死亡后切换；切换时释放旧根节点，避免多次选择地图后
  // 旧模型、贴图、阴影缓存和灯光继续占用移动设备内存。
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this._portModel && this._portModel.geometry &&
        typeof this._portModel.geometry.disposeBoundsTree === 'function') {
      try { this._portModel.geometry.disposeBoundsTree(); } catch (e) { /* 已释放 */ }
    }
    const textures = new Set();
    const disposeMaterial = (material) => {
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const mat of materials) {
        if (!mat) continue;
        for (const key of Object.keys(mat)) {
          const value = mat[key];
          if (value && value.isTexture) textures.add(value);
        }
        if (mat.dispose) mat.dispose();
      }
    };
    if (this._mapRoot) {
      this._mapRoot.traverse((object) => {
        if (object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
        disposeMaterial(object.material);
        if (object.shadow && object.shadow.map && typeof object.shadow.map.dispose === 'function') {
          object.shadow.map.dispose();
        }
      });
      if (this._mapRoot.parent) this._mapRoot.parent.remove(this._mapRoot);
    }
    // 程序化法线属于当前地图；外置图片带 cs15PersistentAsset 标记，由页面级
    // 共享缓存持有，切图时保留，避免返回同一地图后重新解码和上传。
    if (this._brickNormalBase && this._brickNormalBase.isTexture) textures.add(this._brickNormalBase);
    for (const texture of this._textureCache.values()) textures.add(texture);
    for (const texture of textures) {
      if (texture.userData && texture.userData.cs15PersistentAsset) continue;
      texture.dispose();
    }
    this._textureCache.clear();
    this._texturePending.clear();
    this._textureWaits.clear();
    this.boxes.length = 0;
    this._portBoundaryBoxes.length = 0;
    this._portWalkBoxes.length = 0;
    this._portSupportBoxes.length = 0;
    this._collisionGrid = null;
    this._segmentGrid = null;
    this._portInteriorGrid = null;
    this._collisionCandidateBuffer = [];
    this._segmentCandidateBuffer = [];
    this._portInteriorCandidateBuffer = [];
    this._rayCandidateBuffer = [];
    this._texJobs = [];
    this._portModel = null;
    this._portRaycaster = null;
  }
}

// 射线 vs AABB（slab 法），返回 { t, normal } 或 null
// normal：被击中进入面的世界外法线（起点在盒内时为 null，调用方需回退）
function rayAABBDetailed(o, d, box) {
  let tmin = -Infinity, tmax = Infinity;
  let axis = null;   // 产生 tmin 的轴（进入面）
  // X
  if (Math.abs(d.x) > 1e-8) {
    let t1 = (box.minX - o.x) / d.x;
    let t2 = (box.maxX - o.x) / d.x;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) { tmin = t1; axis = 'x'; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  } else if (o.x < box.minX || o.x > box.maxX) return null;
  // Y
  if (Math.abs(d.y) > 1e-8) {
    let t1 = (box.minY - o.y) / d.y;
    let t2 = (box.maxY - o.y) / d.y;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) { tmin = t1; axis = 'y'; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  } else if (o.y < box.minY || o.y > box.maxY) return null;
  // Z
  if (Math.abs(d.z) > 1e-8) {
    let t1 = (box.minZ - o.z) / d.z;
    let t2 = (box.maxZ - o.z) / d.z;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) { tmin = t1; axis = 'z'; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  } else if (o.z < box.minZ || o.z > box.maxZ) return null;

  if (tmax < 0) return null;
  const t = tmin >= 0 ? tmin : tmax;
  if (tmin < 0) return { t, normal: null };   // 起点在盒内，无进入面法线

  // 进入面法线：沿命中轴，符号与射线方向相反
  let sign = 0;
  if (axis === 'x') sign = d.x > 0 ? -1 : 1;
  else if (axis === 'y') sign = d.y > 0 ? -1 : 1;
  else if (axis === 'z') sign = d.z > 0 ? -1 : 1;
  const normal = new THREE.Vector3(
    axis === 'x' ? sign : 0,
    axis === 'y' ? sign : 0,
    axis === 'z' ? sign : 0
  );
  return { t, normal };
}

// 经典脚本全局暴露（依赖顺序：config → three(UMD) → map → …）
window.Box = Box;
window.GameMap = GameMap;
