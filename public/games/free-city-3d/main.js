import { createVehicleState, stepLaneTraffic, stepVehicle } from "./simulation.mjs";
import { createVehicleModel, createWorld, isPositionBlocked, updateWorld } from "./world.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game-canvas");
const overlay = $("overlay");
const startButton = $("start");
const input = { forward: false, back: false, left: false, right: false, accelerate: false, handbrake: false };
const missions = [
  { name: "第一单 · 送货上路", pickup: { x: 36, z: -108 }, drop: { x: 108, z: -36 }, pay: 520 },
  { name: "穿城急件", pickup: { x: -108, z: 36 }, drop: { x: 36, z: 108 }, pay: 680 },
  { name: "码头夜班", pickup: { x: 108, z: 108 }, drop: { x: -36, z: -108 }, pay: 840 }
];
let enginePromise = null;
let renderer = null;
let world = null;
let camera = null;
let vehicleState = null;
let inCar = null;
let mode = "menu";
let frame = 0;
let previousTime = 0;
let elapsed = 0;
let missionIndex = 0;
let stage = "pickup";
let cash = 0;
let wanted = 0;
let wantedHeat = 0;
let health = 100;
let toastTimeout = 0;
let nextPoliceId = 0;
let frameAverage = 16.7;
let impactCooldown = 0;
let currentDpr = 1;
let currentMission = missions[0];
const cameraTarget = { x: 0, y: 1.5, z: 0 };
const cameraPosition = { x: 0, y: 7, z: 16 };

function setText(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function renderHud() {
  setText("money", `$ ${cash.toLocaleString("zh-CN")}`);
  setText("stars", `${"★".repeat(wanted)}${"☆".repeat(5 - wanted)}`);
  setText("mission-title", currentMission.name);
  setText("mission-text", stage === "pickup" ? "前往金色街标取货" : "货物已装车，送往蓝色交付点");
  const actor = inCar || world?.player;
  if (actor) {
    const target = stage === "pickup" ? currentMission.pickup : currentMission.drop;
    const distance = Math.ceil(Math.hypot(actor.x - target.x, actor.z - target.z) * 5);
    setText("distance", `目标距离 ${distance} m`);
  }
  setText("vehicle-name", inCar ? (inCar.type === "police" ? "警用轿车" : "城市轿车") : "步行");
  setText("vehicle-speed", `${Math.round(Math.abs(vehicleState?.speed || 0) * 3.6)} km/h`);
  $("health-bar").style.width = `${Math.max(0, Math.min(100, health))}%`;
}

function setLoading(loading, message = "正在铺开城市街道…") {
  $("loading").hidden = !loading;
  $("error").hidden = true;
  startButton.disabled = loading;
  startButton.textContent = loading ? "正在进入…" : "进入城市";
  if (loading) setText("loading", message);
}

function loadThree() {
  if (window.THREE?.WebGLRenderer) return Promise.resolve(window.THREE);
  if (enginePromise) return enginePromise;
  const source = startButton.dataset.engineSrc;
  enginePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.onload = () => window.THREE?.WebGLRenderer ? resolve(window.THREE) : reject(new Error("Three.js did not initialize"));
    script.onerror = () => reject(new Error("Three.js failed to load"));
    document.head.append(script);
  }).catch((error) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

function getQuality() {
  const smallScreen = window.matchMedia("(max-width: 700px)").matches;
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  return smallScreen || lowMemory ? "low" : "high";
}

function setupRenderer(THREE, quality) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  currentDpr = Math.min(window.devicePixelRatio || 1, quality === "low" ? 1.15 : 1.55);
  renderer.setPixelRatio(currentDpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0xa8c3cb, 1);
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 440);
  camera.position.set(0, 8, 18);
}

function startWorld(THREE) {
  const quality = getQuality();
  setupRenderer(THREE, quality);
  world = createWorld(THREE, { quality, seed: 781 });
  world.traffic.forEach((car) => { car.nextCrossing = findNextCrossing(car); });
  currentMission = missions[missionIndex % missions.length];
  world.markers[0].position.set(currentMission.pickup.x, 0, currentMission.pickup.z);
  world.markers[1].position.set(currentMission.drop.x, 0, currentMission.drop.z);
  vehicleState = { ...createVehicleState({ x: world.playerCar.x, z: world.playerCar.z, angle: 0, maxSpeed: 27 }), health };
  currentDpr = renderer.getPixelRatio();
  mode = "play";
  overlay.hidden = true;
  $("pause").textContent = "Ⅱ";
  $("pause").setAttribute("aria-label", "暂停游戏");
  window.addEventListener("resize", resizeRenderer, { passive: true });
  renderHud();
  showToast("城市醒了，先去接一单。");
  previousTime = 0;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
}

async function startGame() {
  if (mode === "paused") {
    resumeGame();
    return;
  }
  if (mode === "play") return;
  setLoading(true);
  try {
    const THREE = await loadThree();
    startWorld(THREE);
  } catch (error) {
    console.error("Free city could not start:", error);
    setLoading(false);
    $("error").hidden = false;
  }
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const quality = getQuality();
  const targetDpr = Math.min(window.devicePixelRatio || 1, quality === "low" ? 1.15 : 1.55);
  if (Math.abs(targetDpr - currentDpr) > 0.05) {
    currentDpr = targetDpr;
    renderer.setPixelRatio(currentDpr);
  }
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function clearInput() {
  for (const key of Object.keys(input)) input[key] = false;
  document.querySelectorAll("[data-control].pressed").forEach((button) => button.classList.remove("pressed"));
}

function pauseGame() {
  if (mode !== "play") return;
  mode = "paused";
  clearInput();
  cancelAnimationFrame(frame);
  overlay.hidden = false;
  setText("overlay-title", "稍作休息");
  setText("overlay-desc", "城市时间停在这里，准备好后继续出发。");
  startButton.disabled = false;
  startButton.textContent = "继续游戏";
  $("pause").textContent = "▶";
  $("pause").setAttribute("aria-label", "继续游戏");
}

function resumeGame() {
  if (mode !== "paused") return;
  mode = "play";
  overlay.hidden = true;
  $("pause").textContent = "Ⅱ";
  $("pause").setAttribute("aria-label", "暂停游戏");
  previousTime = 0;
  frame = requestAnimationFrame(tick);
}

function isBlocked(x, z, radius, movingCar = null) {
  if (isPositionBlocked(world.city, x, z, radius)) return true;
  const occupied = [...world.parkedCars, ...world.traffic, ...world.police];
  return occupied.some((car) => car !== movingCar && car !== inCar && Math.hypot(car.x - x, car.z - z) < radius + 1.55);
}

function addWanted(amount = 1) {
  wanted = Math.min(5, wanted + amount);
  wantedHeat = 20;
  renderHud();
  showToast("巡逻频道收到警情，注意后方来车。");
}

function interact() {
  if (mode !== "play") return;
  if (inCar) {
    const side = Math.cos(inCar.angle);
    let x = inCar.x + side * 2.4;
    let z = inCar.z + Math.sin(inCar.angle) * 2.4;
    if (isBlocked(x, z, 0.75, inCar)) {
      x = inCar.x - side * 2.4;
      z = inCar.z - Math.sin(inCar.angle) * 2.4;
    }
    if (isBlocked(x, z, 0.75, inCar)) {
      showToast("这里太挤，暂时无法下车。");
      return;
    }
    world.player.x = x;
    world.player.z = z;
    world.player.angle = inCar.angle;
    inCar.speed = 0;
    inCar = null;
    vehicleState = null;
    showToast("你下了车。E 键可再次上车。");
    renderHud();
    return;
  }
  const nearby = [...world.parkedCars, ...world.traffic]
    .map((car) => ({ car, distance: Math.hypot(car.x - world.player.x, car.z - world.player.z) }))
    .filter(({ distance }) => distance < 5.2)
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearby) {
    showToast("靠近路边车辆后按 E 上车。");
    return;
  }
  inCar = nearby.car;
  if (nearby.car.type === "traffic") {
    world.traffic = world.traffic.filter((car) => car !== nearby.car);
    nearby.car.type = "stolen";
    world.parkedCars.push(nearby.car);
    addWanted();
  }
  vehicleState = { ...createVehicleState({ x: inCar.x, z: inCar.z, angle: inCar.angle || 0, maxSpeed: 27 }), health };
  world.player.x = inCar.x;
  world.player.z = inCar.z;
  renderHud();
}

function updateWalking(dt) {
  const xDirection = Number(input.right) - Number(input.left);
  const zDirection = Number(input.back) - Number(input.forward);
  const magnitude = Math.hypot(xDirection, zDirection) || 1;
  const speed = input.accelerate ? 8.5 : 5.8;
  const dx = xDirection / magnitude * speed * dt;
  const dz = zDirection / magnitude * speed * dt;
  if (!isBlocked(world.player.x + dx, world.player.z, 0.55)) world.player.x += dx;
  if (!isBlocked(world.player.x, world.player.z + dz, 0.55)) world.player.z += dz;
  if (Math.abs(dx) + Math.abs(dz) > 0.001) world.player.angle = Math.atan2(dx, -dz);
}

function updateDriving(dt) {
  impactCooldown = Math.max(0, impactCooldown - dt);
  const throttle = Number(input.forward) + Number(input.accelerate) - Number(input.back);
  const steering = Number(input.right) - Number(input.left);
  const braking = input.back && vehicleState.speed > 0.8;
  const result = stepVehicle(vehicleState, {
    throttle: braking ? 0 : throttle > 0 ? 1 : throttle < 0 ? -1 : 0,
    brake: braking ? 1 : 0,
    steer: steering,
    handbrake: input.handbrake
  }, dt, (candidate) => isBlocked(candidate.x, candidate.z, 1.45, inCar));
  vehicleState = result.state;
  inCar.x = vehicleState.x;
  inCar.z = vehicleState.z;
  inCar.angle = vehicleState.angle;
  inCar.speed = vehicleState.speed;
  inCar.steer = steering;
  if (result.collided) {
    health = vehicleState.health;
    if (impactCooldown <= 0) {
      showToast("车身擦过障碍，速度和车况都受了影响。");
      impactCooldown = 0.9;
    }
  }
}

function updateTraffic(dt) {
  const focus = inCar || world.player;
  for (const car of world.traffic) {
    const nearPlayer = Math.hypot(car.x - focus.x, car.z - focus.z) < 13;
    const targetSpeed = nearPlayer ? 3.4 : 7.8;
    car.speed += Math.sign(targetSpeed - car.speed) * Math.min(Math.abs(targetSpeed - car.speed), 3 * dt);
    const previous = car.axis === "x" ? car.x : car.z;
    const next = stepLaneTraffic(car, dt, { min: -165, max: 165 });
    car.x = next.x;
    car.z = next.z;
    const current = car.axis === "x" ? car.x : car.z;
    const crossed = car.nextCrossing != null && (car.direction > 0 ? previous < car.nextCrossing && current >= car.nextCrossing : previous > car.nextCrossing && current <= car.nextCrossing);
    if (crossed && Math.random() < 0.16) {
      const crossing = car.nextCrossing;
      const turnDirection = Math.random() > 0.5 ? 1 : -1;
      if (car.axis === "x") {
        car.axis = "z";
        car.x = crossing + (turnDirection > 0 ? -3.7 : 3.7);
        car.direction = turnDirection;
        car.angle = turnDirection > 0 ? Math.PI : 0;
        car.road = crossing;
      } else {
        car.axis = "x";
        car.z = crossing + (turnDirection > 0 ? -3.7 : 3.7);
        car.direction = turnDirection;
        car.angle = turnDirection > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.road = crossing;
      }
      car.nextCrossing = findNextCrossing(car);
    } else if (crossed) {
      car.nextCrossing = findNextCrossing(car);
    }
    const wrapped = (previous > 150 && current < -150) || (previous < -150 && current > 150);
    if (wrapped) car.nextCrossing = findNextCrossing(car);
  }
  for (const person of world.pedestrians) {
    const nearbyTraffic = world.traffic.some((car) => Math.hypot(car.x - person.x, car.z - person.z) < 3.2);
    const nearPlayer = Math.hypot(focus.x - person.x, focus.z - person.z) < 4.1;
    if ((nearbyTraffic || nearPlayer) && person.avoidTimer <= 0) {
      person.direction *= -1;
      person.avoidTimer = 1.2;
    }
    person.avoidTimer = Math.max(0, person.avoidTimer - dt);
    const positionKey = person.axis === "x" ? "x" : "z";
    const nextPosition = person[positionKey] + person.direction * person.speed * dt;
    if (nextPosition < -157 || nextPosition > 157) person.direction *= -1;
    person[positionKey] = Math.max(-157, Math.min(157, nextPosition));
  }
}

function findNextCrossing(car) {
  const position = car.axis === "x" ? car.x : car.z;
  const candidates = [-144, -72, 0, 72, 144].filter((value) => car.direction > 0 ? value > position + 5 : value < position - 5);
  if (candidates.length) return car.direction > 0 ? Math.min(...candidates) : Math.max(...candidates);
  return car.direction > 0 ? 144 : -144;
}

function createPoliceCar(THREE) {
  const angle = Math.random() * Math.PI * 2;
  const focus = inCar || world.player;
  const road = world.city.roadLines[Math.floor(Math.random() * world.city.roadLines.length)];
  const cop = {
    x: Math.max(-155, Math.min(155, focus.x + Math.cos(angle) * 35)),
    z: road,
    angle: angle,
    speed: 0,
    type: "police",
    group: createVehicleModel(THREE, 0x526c83, "police")
  };
  if (isPositionBlocked(world.city, cop.x, cop.z, 2)) cop.x = road + 15;
  cop.group.position.set(cop.x, 0, cop.z);
  world.scene.add(cop.group);
  world.police.push(cop);
}

function updatePolice(dt) {
  const focus = inCar || world.player;
  const targetCount = Math.min(wanted, 3);
  while (world.police.length < targetCount) createPoliceCar(window.THREE);
  for (const cop of world.police) {
    const dx = focus.x - cop.x;
    const dz = focus.z - cop.z;
    const distance = Math.hypot(dx, dz) || 1;
    const desired = Math.atan2(dx, -dz);
    let turn = Math.atan2(Math.sin(desired - cop.angle), Math.cos(desired - cop.angle));
    cop.angle += Math.max(-1.35 * dt, Math.min(1.35 * dt, turn));
    const speed = Math.min(17, distance * 0.65);
    cop.speed = speed;
    const nx = cop.x + Math.sin(cop.angle) * speed * dt;
    const nz = cop.z - Math.cos(cop.angle) * speed * dt;
    if (!isPositionBlocked(world.city, nx, nz, 1.5)) {
      cop.x = nx;
      cop.z = nz;
    } else {
      cop.angle += (turn >= 0 ? -1 : 1) * 1.8 * dt;
    }
    if (distance < 4.4 && !cop.hitCooldown) {
      health = Math.max(0, health - 9);
      cop.hitCooldown = 1.6;
      wantedHeat = Math.max(wantedHeat, 5);
      showToast("警车挤近了，拉开距离再甩掉他们。");
    }
    cop.hitCooldown = Math.max(0, (cop.hitCooldown || 0) - dt);
  }
  if (wanted > 0) {
    wantedHeat -= dt;
    if (wantedHeat <= 0) {
      wanted = Math.max(0, wanted - 1);
      wantedHeat = wanted ? 12 : 0;
      if (!wanted) {
        for (const cop of world.police) world.scene.remove(cop.group);
        world.police.length = 0;
        showToast("警情解除，街区恢复平静。");
      }
    }
  }
}

function checkMission() {
  const actor = inCar || world.player;
  const target = stage === "pickup" ? currentMission.pickup : currentMission.drop;
  if (Math.hypot(actor.x - target.x, actor.z - target.z) > 5.6) return;
  if (stage === "pickup") {
    stage = "drop";
    showToast("货物已装车，按导航标记送达。");
  } else {
    const bonus = Math.floor(missionIndex / missions.length) * 180;
    const reward = currentMission.pay + bonus;
    cash += reward;
    missionIndex += 1;
    currentMission = missions[missionIndex % missions.length];
    stage = "pickup";
    showToast(`委托完成，收到 $${reward.toLocaleString("zh-CN")}。`);
  }
  renderHud();
}

function recoverPlayer() {
  if (health > 0) return;
  const fine = Math.min(cash, 160);
  cash -= fine;
  health = 100;
  wanted = 0;
  wantedHeat = 0;
  for (const cop of world.police) world.scene.remove(cop.group);
  world.police.length = 0;
  if (inCar) {
    inCar.x = 5;
    inCar.z = 7;
    inCar.angle = 0;
  }
  world.player.x = 5;
  world.player.z = 11;
  world.player.angle = 0;
  inCar = null;
  vehicleState = null;
  showToast(`车辆失控，你回到街角并支付 $${fine} 修理费。`);
  renderHud();
}

function update(dt) {
  elapsed += dt;
  if (inCar) updateDriving(dt);
  else updateWalking(dt);
  updateTraffic(dt);
  updatePolice(dt);
  checkMission();
  recoverPlayer();
  renderHud();
  const actor = inCar || world.player;
  setText("vehicle-name", inCar ? (Math.abs(vehicleState.speed) > 0.4 ? "行驶中" : "城市轿车") : "步行");
}

function drawMinimap() {
  const map = $("minimap");
  const context = map.getContext("2d");
  const size = map.width;
  context.fillStyle = "#5e755e";
  context.fillRect(0, 0, size, size);
  const scale = size / 360;
  for (const line of world.city.roadLines) {
    context.fillStyle = "#303a3a";
    const coordinate = (line + 180) * scale;
    context.fillRect(coordinate - scale * 10.5, 0, scale * 21, size);
    context.fillRect(0, coordinate - scale * 10.5, size, scale * 21);
  }
  const dot = (x, z, color, radius) => {
    context.beginPath();
    context.arc((x + 180) * scale, (z + 180) * scale, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  };
  for (const car of world.police) dot(car.x, car.z, "#ff615c", 3.2);
  for (const car of world.traffic) if (Math.hypot(car.x - (inCar?.x ?? world.player.x), car.z - (inCar?.z ?? world.player.z)) < 90) dot(car.x, car.z, "#c9d5ce", 1.7);
  const target = stage === "pickup" ? currentMission.pickup : currentMission.drop;
  dot(target.x, target.z, "#f0cf70", 3.6);
  const actor = inCar || world.player;
  dot(actor.x, actor.z, "#efffe8", 3.8);
}

function updateCamera(dt) {
  const actor = inCar || world.player;
  const angle = inCar ? inCar.angle : world.player.angle;
  const distance = inCar ? 13 : 9;
  const height = inCar ? 7 : 6.4;
  const targetX = actor.x + Math.sin(angle) * 2.4;
  const targetZ = actor.z - Math.cos(angle) * 2.4;
  const desiredX = actor.x - Math.sin(angle) * distance;
  const desiredZ = actor.z + Math.cos(angle) * distance;
  const smoothing = 1 - Math.exp(-4.2 * dt);
  cameraTarget.x += (targetX - cameraTarget.x) * smoothing;
  cameraTarget.y += ((inCar ? 1.35 : 1.55) - cameraTarget.y) * smoothing;
  cameraTarget.z += (targetZ - cameraTarget.z) * smoothing;
  cameraPosition.x += (desiredX - cameraPosition.x) * smoothing;
  cameraPosition.y += (height - cameraPosition.y) * smoothing;
  cameraPosition.z += (desiredZ - cameraPosition.z) * smoothing;
  camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
  camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
}

function adaptQuality(deltaMilliseconds) {
  frameAverage += (deltaMilliseconds - frameAverage) * 0.035;
  if (!renderer || !world || getQuality() === "low") return;
  const target = frameAverage > 27 ? Math.max(0.85, currentDpr - 0.08) : frameAverage < 17 ? Math.min(1.55, currentDpr + 0.015) : currentDpr;
  if (Math.abs(target - currentDpr) > 0.025) {
    currentDpr = target;
    renderer.setPixelRatio(currentDpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
}

function tick(timestamp) {
  if (mode !== "play") return;
  const delta = previousTime ? Math.min(0.05, Math.max(0, (timestamp - previousTime) / 1000)) : 0.016;
  previousTime = timestamp;
  update(delta);
  const objectives = { pickup: currentMission.pickup, drop: currentMission.drop, stage };
  updateWorld(world, { time: elapsed, player: world.player, inCar, objectives, wanted, dt: delta });
  updateCamera(delta);
  renderer.render(world.scene, camera);
  drawMinimap();
  adaptQuality(delta * 1000);
  frame = requestAnimationFrame(tick);
}

function keyToControl(key) {
  return ({ ArrowUp: "forward", w: "forward", ArrowDown: "back", s: "back", ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", Shift: "accelerate", " ": "handbrake" })[key];
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const control = keyToControl(key);
  if (control && mode === "play") {
    input[control] = true;
    event.preventDefault();
  }
  if (key === "e" && mode === "play" && !event.repeat) {
    interact();
    event.preventDefault();
  }
  if ((key === "Escape" || key === "p") && !event.repeat) {
    if (mode === "play") pauseGame();
    else if (mode === "paused") resumeGame();
  }
});
window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const control = keyToControl(key);
  if (control) input[control] = false;
});
window.addEventListener("blur", pauseGame);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});
document.querySelectorAll("[data-control]").forEach((button) => {
  const controlName = button.dataset.control;
  const down = (event) => {
    event.preventDefault();
    if (controlName === "enter") {
      interact();
      return;
    }
    const mapped = controlName === "forward" || controlName === "back" || controlName === "left" || controlName === "right" || controlName === "accelerate" || controlName === "handbrake" ? controlName : null;
    if (!mapped) return;
    input[mapped] = true;
    button.classList.add("pressed");
    if (event.pointerId !== undefined) button.setPointerCapture(event.pointerId);
  };
  const up = (event) => {
    event.preventDefault();
    if (controlName in input) input[controlName] = false;
    button.classList.remove("pressed");
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("lostpointercapture", up);
});
startButton.addEventListener("click", startGame);
$("pause").addEventListener("click", () => mode === "play" ? pauseGame() : mode === "paused" ? resumeGame() : null);

