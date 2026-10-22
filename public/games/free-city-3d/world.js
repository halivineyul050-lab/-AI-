const ROAD_LINES = [-144, -72, 0, 72, 144];
const CITY_EDGE = 180;

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mesh(THREE, geometry, material, parent, x, y, z, castShadow = false, receiveShadow = false) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = castShadow;
  object.receiveShadow = receiveShadow;
  parent.add(object);
  return object;
}

function addInstanced(THREE, target, geometry, material, entries) {
  if (!entries.length) return null;
  const instances = new THREE.InstancedMesh(geometry, material, entries.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  entries.forEach((entry, index) => {
    position.set(entry.x, entry.y, entry.z);
    quaternion.setFromEuler(new THREE.Euler(0, entry.rotation || 0, 0));
    scale.set(entry.w, entry.h, entry.d);
    matrix.compose(position, quaternion, scale);
    instances.setMatrixAt(index, matrix);
    if (entry.color) instances.setColorAt(index, new THREE.Color(entry.color));
  });
  instances.instanceMatrix.needsUpdate = true;
  instances.castShadow = false;
  instances.receiveShadow = true;
  target.add(instances);
  return instances;
}

function buildCity(THREE, scene, random, quality) {
  const materials = {
    ground: new THREE.MeshStandardMaterial({ color: 0x647465, roughness: 1 }),
    road: new THREE.MeshStandardMaterial({ color: 0x343b3b, roughness: 0.92 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0xb5b0a1, roughness: 0.9 }),
    curb: new THREE.MeshStandardMaterial({ color: 0x777f78, roughness: 0.85 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xd8cfaa, roughness: 0.8 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x667d5d, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x878d87, roughness: 0.95 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xc3cbb9, emissive: 0x777563, emissiveIntensity: 0.16, roughness: 0.42, metalness: 0.08 }),
    tree: new THREE.MeshStandardMaterial({ color: 0x4d6951, roughness: 0.92 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x594b3b, roughness: 1 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf5da9d, emissive: 0xd7a857, emissiveIntensity: 1.1 })
  };
  const ground = mesh(THREE, new THREE.PlaneGeometry(CITY_EDGE * 2, CITY_EDGE * 2), materials.ground, scene, 0, -0.2, 0, false, true);
  ground.rotation.x = -Math.PI / 2;
  const roadEntries = [];
  const sidewalkEntries = [];
  const curbEntries = [];
  const paintEntries = [];
  for (const line of ROAD_LINES) {
    roadEntries.push({ x: line, y: -0.08, z: 0, w: 21, h: 0.12, d: CITY_EDGE * 2 });
    roadEntries.push({ x: 0, y: -0.08, z: line, w: CITY_EDGE * 2, h: 0.12, d: 21 });
    for (const side of [-1, 1]) {
      sidewalkEntries.push({ x: line + side * 13.1, y: -0.02, z: 0, w: 3.1, h: 0.28, d: CITY_EDGE * 2 });
      sidewalkEntries.push({ x: 0, y: -0.02, z: line + side * 13.1, w: CITY_EDGE * 2, h: 0.28, d: 3.1 });
      curbEntries.push({ x: line + side * 11.25, y: 0.04, z: 0, w: 0.42, h: 0.34, d: CITY_EDGE * 2 });
      curbEntries.push({ x: 0, y: 0.04, z: line + side * 11.25, w: CITY_EDGE * 2, h: 0.34, d: 0.42 });
      const laneOffset = side * 5.15;
      for (let offset = -CITY_EDGE + 4; offset < CITY_EDGE; offset += 10) {
        if (ROAD_LINES.some((crossing) => Math.abs(offset - crossing) < 13)) continue;
        paintEntries.push({ x: line + laneOffset, y: 0.002, z: offset, w: 0.12, h: 0.018, d: 4.2 });
        paintEntries.push({ x: offset, y: 0.002, z: line + laneOffset, w: 4.2, h: 0.018, d: 0.12 });
      }
    }
  }
  addInstanced(THREE, scene, new THREE.BoxGeometry(1, 1, 1), materials.road, roadEntries);
  addInstanced(THREE, scene, new THREE.BoxGeometry(1, 1, 1), materials.sidewalk, sidewalkEntries);
  addInstanced(THREE, scene, new THREE.BoxGeometry(1, 1, 1), materials.curb, curbEntries);
  addInstanced(THREE, scene, new THREE.BoxGeometry(1, 1, 1), materials.paint, paintEntries);

  const buildingColors = [0x9d9b8c, 0xb8a991, 0x8f9a97, 0x777f7c, 0xc0b59d, 0x7d898b, 0xa5a18e];
  const buildings = [];
  const buildingInstances = [];
  const windows = [];
  const podiums = [];
  const blockCenters = [-108, -36, 36, 108];
  for (let blockX = 0; blockX < blockCenters.length; blockX += 1) {
    for (let blockZ = 0; blockZ < blockCenters.length; blockZ += 1) {
      const cx = blockCenters[blockX];
      const cz = blockCenters[blockZ];
      const courtyard = (blockX * 3 + blockZ * 5) % 7 === 0;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (courtyard && sx === 1 && sz === -1) continue;
        const x = cx + sx * (14 + random() * 2.5);
        const z = cz + sz * (14 + random() * 2.5);
        const width = 14 + random() * 5.5;
        const depth = 14 + random() * 5.5;
        const height = 9 + random() * 25;
        const color = buildingColors[Math.floor(random() * buildingColors.length)];
        buildings.push({ x, z, width, depth, height });
        buildingInstances.push({ x, y: height / 2 + 0.35, z, w: width, h: height, d: depth, color });
        podiums.push({ x, y: 0.18, z, w: width + 1.1, h: 0.32, d: depth + 1.1 });
        const rows = Math.max(2, Math.floor(height / 3.2));
        for (let row = 0; row < rows; row += 1) {
          const y = 1.8 + row * 3;
          for (let column = -1; column <= 1; column += 1) {
            const offset = column * width * 0.27;
            windows.push({ x: x + offset, y, z: z - depth / 2 - 0.055, w: 1.9, h: 1.35, d: 0.09 });
            windows.push({ x: x + offset, y, z: z + depth / 2 + 0.055, w: 1.9, h: 1.35, d: 0.09 });
            const side = column * depth * 0.27;
            windows.push({ x: x - width / 2 - 0.055, y, z: z + side, w: 0.09, h: 1.35, d: 1.9 });
            windows.push({ x: x + width / 2 + 0.055, y, z: z + side, w: 0.09, h: 1.35, d: 1.9 });
          }
        }
        if (height > 19) {
          const units = 2 + Math.floor(random() * 3);
          for (let i = 0; i < units; i += 1) {
            podiums.push({ x: x + (random() - 0.5) * width * 0.4, y: height + 0.8, z: z + (random() - 0.5) * depth * 0.4, w: 1.3 + random() * 2, h: 1 + random() * 1.7, d: 1.3 + random() * 2 });
          }
        }
      }
    }
  }
  addInstanced(THREE, scene, new THREE.BoxGeometry(1, 1, 1), materials.concrete, podiums);
  const buildingMesh = addInstanced(THREE, scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84 }), buildingInstances);
  if (buildingMesh) buildingMesh.castShadow = false;
  addInstanced(THREE, scene, new THREE.BoxGeometry(1, 1, 1), materials.windows, windows);

  const treePositions = [];
  const lampPositions = [];
  for (const line of ROAD_LINES) {
    for (let offset = -CITY_EDGE + 18; offset < CITY_EDGE; offset += 28) {
      if (ROAD_LINES.some((crossing) => Math.abs(offset - crossing) < 18)) continue;
      for (const side of [-1, 1]) {
        if (quality === "low" && Math.abs(offset) > 100) continue;
        treePositions.push({ x: line + side * 15.4, z: offset, height: 4.1 + random() * 1.4 });
        lampPositions.push({ x: line + side * 9.7, z: offset + (side > 0 ? 6 : -6) });
      }
    }
  }
  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 7);
  const leafGeometry = new THREE.IcosahedronGeometry(1.35, 1);
  const trunkEntries = treePositions.map((tree) => ({ x: tree.x, y: 1.1, z: tree.z, w: 1, h: 1, d: 1 }));
  const leafEntries = treePositions.map((tree) => ({ x: tree.x, y: 2.8, z: tree.z, w: 1, h: tree.height / 3.6, d: 0.9 }));
  addInstanced(THREE, scene, trunkGeometry, materials.trunk, trunkEntries);
  addInstanced(THREE, scene, leafGeometry, materials.tree, leafEntries);

  const poleGeometry = new THREE.CylinderGeometry(0.075, 0.11, 6.2, 7);
  const armGeometry = new THREE.BoxGeometry(1.4, 0.12, 0.12);
  const bulbGeometry = new THREE.SphereGeometry(0.17, 8, 6);
  const poles = lampPositions.map((lamp) => ({ x: lamp.x, y: 3.1, z: lamp.z, w: 1, h: 1, d: 1 }));
  const arms = lampPositions.map((lamp) => ({ x: lamp.x + 0.58, y: 6, z: lamp.z, w: 1, h: 1, d: 1 }));
  const bulbs = lampPositions.map((lamp) => ({ x: lamp.x + 1.15, y: 5.85, z: lamp.z, w: 1, h: 1, d: 1 }));
  addInstanced(THREE, scene, poleGeometry, materials.curb, poles);
  addInstanced(THREE, scene, armGeometry, materials.curb, arms);
  addInstanced(THREE, scene, bulbGeometry, materials.lamp, bulbs);

  const crosswalkEntries = [];
  for (const x of ROAD_LINES) for (const z of ROAD_LINES) {
    for (let stripe = 0; stripe < 6; stripe += 1) {
      const offset = -6 + stripe * 2.4;
      crosswalkEntries.push({ x: x + offset, y: 0.015, z: z - 12.8, w: 2.7, h: 0.035, d: 0.72 });
      crosswalkEntries.push({ x: x + offset, y: 0.015, z: z + 12.8, w: 2.7, h: 0.035, d: 0.72 });
      crosswalkEntries.push({ x: x - 12.8, y: 0.015, z: z + offset, w: 2.7, h: 0.035, d: 0.72, rotation: Math.PI / 2 });
      crosswalkEntries.push({ x: x + 12.8, y: 0.015, z: z + offset, w: 2.7, h: 0.035, d: 0.72, rotation: Math.PI / 2 });
    }
  }
  addInstanced(THREE, scene, new THREE.BoxGeometry(1, 1, 1), materials.paint, crosswalkEntries);

  const buildingColliders = buildings.map(({ x, z, width, depth }) => ({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 }));
  const roadTrees = treePositions.map(({ x, z }) => ({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 }));
  const colliders = [...buildingColliders, ...roadTrees];
  return { colliders, roadTrees, random, buildings, materials, roadLines: ROAD_LINES, edge: CITY_EDGE, poles, arms, bulbs };
}

export function createVehicleModel(THREE, paint = 0xc1ba9d, type = "sedan") {
  const root = new THREE.Group();
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: paint, roughness: 0.34, metalness: 0.28, clearcoat: 0.52, clearcoatRoughness: 0.3 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2528, roughness: 0.42, metalness: 0.1 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0x5d7a80, roughness: 0.17, metalness: 0.04, transmission: 0.06, transparent: true, opacity: 0.86 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x202426, roughness: 0.92 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xffe3a6, emissive: 0xffbc59, emissiveIntensity: 0.8, roughness: 0.3 });
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xb84231, emissive: 0x7f1d15, emissiveIntensity: 0.3 });
  const length = type === "police" ? 4.7 : 4.2;
  mesh(THREE, new THREE.BoxGeometry(2.02, 0.56, length), bodyMaterial, root, 0, 0.64, 0, true, true);
  mesh(THREE, new THREE.BoxGeometry(1.72, 0.72, length * 0.48), glassMaterial, root, 0, 1.22, 0.12, true, false);
  mesh(THREE, new THREE.BoxGeometry(1.92, 0.12, 0.86), bodyMaterial, root, 0, 0.96, -length * 0.31, true, false);
  mesh(THREE, new THREE.BoxGeometry(2.1, 0.18, 0.16), trimMaterial, root, 0, 0.43, -length * 0.51);
  mesh(THREE, new THREE.BoxGeometry(2.1, 0.2, 0.16), trimMaterial, root, 0, 0.44, length * 0.51);
  for (const side of [-1, 1]) {
    mesh(THREE, new THREE.BoxGeometry(0.34, 0.18, 0.1), lampMaterial, root, side * 0.68, 0.74, -length * 0.51);
    mesh(THREE, new THREE.BoxGeometry(0.3, 0.15, 0.1), tailMaterial, root, side * 0.7, 0.75, length * 0.51);
  }
  const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12);
  const wheels = [];
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const wheel = mesh(THREE, wheelGeometry, tireMaterial, root, side * 1.02, 0.38, end * length * 0.34, true, false);
    wheel.rotation.z = Math.PI / 2;
    wheel.userData.isWheel = true;
    wheel.userData.frontWheel = end < 0;
    wheels.push(wheel);
    const hub = mesh(THREE, new THREE.CylinderGeometry(0.17, 0.17, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x9b9a8c, metalness: 0.74, roughness: 0.35 }), root, side * 1.02, 0.38, end * length * 0.34);
    hub.rotation.z = Math.PI / 2;
  }
  let beacon = null;
  if (type === "police") {
    beacon = mesh(THREE, new THREE.BoxGeometry(0.72, 0.14, 0.2), new THREE.MeshStandardMaterial({ color: 0x427da1, emissive: 0x143a91, emissiveIntensity: 1.3 }), root, 0, 1.68, 0.1);
  }
  root.traverse((object) => {
    if (object.isMesh && object.material !== glassMaterial) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  root.userData = { wheels, beacon, bodyMaterial, type };
  return root;
}

export function createPersonModel(THREE, color = 0x9d7054) {
  const root = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc79c78, roughness: 0.82 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x353d3d, roughness: 0.88 });
  mesh(THREE, new THREE.CapsuleGeometry(0.32, 0.55, 4, 7), coat, root, 0, 1.05, 0, true, false);
  mesh(THREE, new THREE.SphereGeometry(0.22, 10, 8), skin, root, 0, 1.61, -0.015, true, false);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = mesh(THREE, new THREE.CapsuleGeometry(0.1, 0.48, 3, 6), pants, root, side * 0.15, 0.45, 0, true, false);
    leg.userData.swing = side;
    legs.push(leg);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = mesh(THREE, new THREE.CapsuleGeometry(0.075, 0.42, 3, 6), coat, root, side * 0.38, 1.05, 0, true, false);
    arm.userData.swing = -side;
    arms.push(arm);
  }
  root.userData = { legs, arms };
  return root;
}

export function createMarker(THREE, color) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.72, transparent: true, opacity: 0.86, roughness: 0.34 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.13, 8, 44), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  group.add(ring);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.32, 4.2, 10, 1, true), material);
  beacon.position.y = 2.3;
  group.add(beacon);
  group.userData.ring = ring;
  return group;
}

export function createWorld(THREE, { quality = "auto", seed = 781 } = {}) {
  const random = mulberry32(seed);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa8c3cb);
  scene.fog = new THREE.FogExp2(0xa8c3cb, quality === "low" ? 0.0058 : 0.0046);
  const hemi = new THREE.HemisphereLight(0xd8e8ee, 0x59604f, 2.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffedcf, 3.6);
  sun.position.set(-42, 72, 28);
  sun.castShadow = quality !== "low";
  sun.shadow.mapSize.set(quality === "high" ? 1536 : 1024, quality === "high" ? 1536 : 1024);
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 58;
  sun.shadow.camera.bottom = -58;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const city = buildCity(THREE, scene, random, quality);

  const playerCar = { x: 5, z: 7, angle: 0, speed: 0, type: "parked", group: createVehicleModel(THREE, 0x8e9e9c) };
  playerCar.group.position.set(playerCar.x, 0, playerCar.z);
  scene.add(playerCar.group);
  const parkedCars = [playerCar];
  const paint = [0xb4a38b, 0x728992, 0x88736f, 0xa8b2a8, 0x747d8c, 0xc2b98f];
  for (let index = 0; index < 9; index += 1) {
    let car = null;
    for (let attempt = 0; attempt < 28 && !car; attempt += 1) {
      const road = city.roadLines[Math.floor(random() * city.roadLines.length)];
      const axis = index % 2 === 0 ? "x" : "z";
      const side = random() > 0.5 ? 1 : -1;
      const candidate = {
        x: axis === "x" ? random() * 300 - 150 : road + side * 8.25,
        z: axis === "z" ? random() * 300 - 150 : road + side * 8.25,
        angle: axis === "x" ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? Math.PI : 0),
        speed: 0,
        type: "parked"
      };
      const nearBuilding = city.colliders.some((box) => candidate.x > box.minX - 2 && candidate.x < box.maxX + 2 && candidate.z > box.minZ - 2 && candidate.z < box.maxZ + 2);
      const nearCar = parkedCars.some((other) => Math.hypot(other.x - candidate.x, other.z - candidate.z) < 8);
      if (!nearBuilding && !nearCar) car = candidate;
    }
    if (!car) continue;
    car.group = createVehicleModel(THREE, paint[index % paint.length]);
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.angle;
    parkedCars.push(car);
    scene.add(car.group);
  }

  const traffic = [];
  const trafficPaint = [0x657a7c, 0xc1b59d, 0x798a9c, 0x8b7363, 0xaaa28f];
  for (let index = 0; index < 16; index += 1) {
    let car = null;
    for (let attempt = 0; attempt < 28 && !car; attempt += 1) {
      const axis = index % 2 === 0 ? "x" : "z";
      const road = city.roadLines[Math.floor(random() * city.roadLines.length)];
      const direction = random() > 0.5 ? 1 : -1;
      const offset = direction > 0 ? -3.7 : 3.7;
      const candidate = {
        id: `traffic-${index}`,
        x: axis === "x" ? random() * 320 - 160 : road + offset,
        z: axis === "z" ? random() * 320 - 160 : road + offset,
        axis,
        road,
        direction,
        speed: 5.2 + random() * 3.4,
        type: "traffic",
        turnAt: road,
        turnCooldown: random() * 40
      };
      candidate.angle = axis === "x" ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (direction > 0 ? Math.PI : 0);
      const nearCar = [...parkedCars, ...traffic].some((other) => Math.hypot(other.x - candidate.x, other.z - candidate.z) < 9);
      if (!nearCar) car = candidate;
    }
    if (!car) continue;
    car.group = createVehicleModel(THREE, trafficPaint[index % trafficPaint.length]);
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.angle;
    scene.add(car.group);
    traffic.push(car);
  }

  const pedestrians = [];
  const pedestrianColors = [0x536b73, 0x8b684f, 0x6b7c5a, 0x796078, 0x9a7a4f];
  for (let index = 0; index < 30; index += 1) {
    const axis = index % 2 === 0 ? "x" : "z";
    const road = city.roadLines[Math.floor(random() * city.roadLines.length)];
    const side = random() > 0.5 ? 1 : -1;
    let x = axis === "x" ? random() * 300 - 150 : road + side * 14.8;
    let z = axis === "z" ? random() * 300 - 150 : road + side * 14.8;
    if (Math.hypot(x - 5, z - 11) < 23) {
      if (axis === "x") x = x < 5 ? -42 : 42;
      else z = z < 11 ? -42 : 42;
    }
    const pedestrian = {
      x,
      z,
      axis,
      lane: road + side * 14.8,
      direction: random() > 0.5 ? 1 : -1,
      speed: 0.9 + random() * 0.45,
      phase: random() * Math.PI * 2,
      avoidTimer: 0,
      group: createPersonModel(THREE, pedestrianColors[index % pedestrianColors.length])
    };
    pedestrian.group.position.set(pedestrian.x, 0, pedestrian.z);
    scene.add(pedestrian.group);
    pedestrians.push(pedestrian);
  }

  const player = { x: 5, z: 11, angle: 0, group: createPersonModel(THREE, 0xc4a574) };
  player.group.position.set(player.x, 0, player.z);
  scene.add(player.group);
  const police = [];
  const markers = [];
  for (const color of [0xe9c85c, 0x6dc7d2]) {
    const marker = createMarker(THREE, color);
    scene.add(marker);
    markers.push(marker);
  }
  return { scene, player, playerCar, parkedCars, traffic, pedestrians, police, markers, sun, city, quality };
}

export function updateWorld(world, { time, player, inCar, objectives, wanted, dt }) {
  const focusX = inCar ? inCar.x : player.x;
  const focusZ = inCar ? inCar.z : player.z;
  world.player.group.visible = !inCar;
  world.player.group.position.set(player.x, 0, player.z);
  world.player.group.rotation.y = player.angle;
  world.playerCar.group.position.set(world.playerCar.x, 0, world.playerCar.z);
  world.playerCar.group.rotation.y = world.playerCar.angle;
  world.sun.position.set(focusX - 42, 72, focusZ + 28);
  world.sun.target.position.set(focusX, 0, focusZ);
  world.sun.target.updateMatrixWorld();

  for (const car of [...world.parkedCars, ...world.traffic, ...world.police]) {
    if (car === world.playerCar) continue;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.angle || 0;
    car.group.visible = Math.hypot(car.x - focusX, car.z - focusZ) < 155;
    car.group.userData.wheels.forEach((wheel) => {
      if (wheel.userData.frontWheel) wheel.rotation.y = (car.steer || 0) * 0.35;
      wheel.rotation.x += (car.speed || 0) * dt * 0.5;
    });
    const beacon = car.group.userData.beacon;
    if (beacon) beacon.material.color.set(Math.floor(time * 7) % 2 ? 0x438de4 : 0xe64f4f);
  }
  for (const pedestrian of world.pedestrians) {
    const distance = Math.hypot(pedestrian.x - focusX, pedestrian.z - focusZ);
    pedestrian.group.visible = distance < 105;
    pedestrian.group.position.set(pedestrian.x, 0, pedestrian.z);
    pedestrian.group.rotation.y = pedestrian.axis === "x" ? (pedestrian.direction > 0 ? Math.PI / 2 : -Math.PI / 2) : (pedestrian.direction > 0 ? Math.PI : 0);
    const stride = Math.sin(time * 6 + pedestrian.phase) * 0.44;
    for (const limb of [...pedestrian.group.userData.legs, ...pedestrian.group.userData.arms]) limb.rotation.x = stride * limb.userData.swing;
  }
  const targets = [objectives.pickup, objectives.drop];
  world.markers.forEach((marker, index) => {
    const point = targets[index];
    const visible = index === (objectives.stage === "pickup" ? 0 : 1);
    marker.visible = visible;
    marker.position.set(point.x, 0, point.z);
    marker.rotation.y = time * (index ? -0.34 : 0.34);
    marker.userData.ring.position.y = 0.12 + Math.sin(time * 2.8) * 0.08;
  });
  world.playerCar.group.visible = !inCar && Math.hypot(world.playerCar.x - focusX, world.playerCar.z - focusZ) < 160;
  if (inCar?.group) inCar.group.visible = true;
  for (const cop of world.police) cop.group.visible = wanted > 0;
}

export function isPositionBlocked(city, x, z, radius = 1) {
  if (x < -city.edge + radius || z < -city.edge + radius || x > city.edge - radius || z > city.edge - radius) return true;
  return city.colliders.some((box) => x + radius > box.minX && x - radius < box.maxX && z + radius > box.minZ && z - radius < box.maxZ);
}

export { CITY_EDGE, ROAD_LINES };

