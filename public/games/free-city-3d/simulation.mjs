const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
const MAX_FRAME_DELTA = 0.05;

export function createVehicleState({ x = 0, z = 0, angle = 0, maxSpeed = 28 } = {}) {
  return {
    x: Number.isFinite(x) ? x : 0,
    z: Number.isFinite(z) ? z : 0,
    angle: Number.isFinite(angle) ? angle : 0,
    speed: 0,
    vx: 0,
    vz: 0,
    health: 100,
    maxSpeed: clamp(maxSpeed, 8, 50)
  };
}

export function stepVehicle(state, input = {}, dt = 0, collides = () => false) {
  const delta = clamp(dt, 0, MAX_FRAME_DELTA);
  const throttle = clamp(input.throttle, -1, 1);
  const steering = clamp(input.steer, -1, 1);
  const brake = clamp(input.brake, 0, 1);
  const handbrake = Boolean(input.handbrake);
  const forwardX = Math.sin(state.angle);
  const forwardZ = -Math.cos(state.angle);
  const rightX = Math.cos(state.angle);
  const rightZ = Math.sin(state.angle);
  let longitudinal = state.vx * forwardX + state.vz * forwardZ;
  let lateral = state.vx * rightX + state.vz * rightZ;

  if (brake > 0) {
    longitudinal = Math.sign(longitudinal) * Math.max(0, Math.abs(longitudinal) - 30 * brake * delta);
  } else if (throttle !== 0) {
    const acceleration = throttle > 0 ? 14 : 9;
    longitudinal += throttle * acceleration * delta;
  } else {
    longitudinal *= Math.exp(-(handbrake ? 1.45 : 0.48) * delta);
  }

  const maxForward = clamp(state.maxSpeed, 8, 50);
  longitudinal = clamp(longitudinal, -9, maxForward);
  const steeringGrip = handbrake ? 0.62 : 1;
  const speedSteering = clamp(Math.abs(longitudinal) / 3.5, 0, 1);
  const direction = longitudinal < -0.15 ? -1 : 1;
  const angle = state.angle + steering * speedSteering * steeringGrip * direction * 1.25 * delta;
  lateral *= Math.exp(-(handbrake ? 1.15 : 5.2) * delta);

  const nextForwardX = Math.sin(angle);
  const nextForwardZ = -Math.cos(angle);
  const nextRightX = Math.cos(angle);
  const nextRightZ = Math.sin(angle);
  const vx = nextForwardX * longitudinal + nextRightX * lateral;
  const vz = nextForwardZ * longitudinal + nextRightZ * lateral;
  const candidate = { x: state.x + vx * delta, z: state.z + vz * delta };
  const moved = Math.hypot(candidate.x - state.x, candidate.z - state.z) > 0.01;
  const collided = Boolean(delta && moved && collides(candidate));

  if (collided) {
    const impact = Math.abs(longitudinal);
    longitudinal *= -0.14;
    return {
      state: {
        ...state,
        speed: longitudinal,
        vx: nextForwardX * longitudinal,
        vz: nextForwardZ * longitudinal,
        health: Math.max(0, state.health - clamp(impact * 0.48, 5, 24))
      },
      collided: true
    };
  }

  return {
    state: {
      ...state,
      x: candidate.x,
      z: candidate.z,
      angle,
      speed: longitudinal,
      vx,
      vz,
      health: clamp(state.health, 0, 100)
    },
    collided: false
  };
}

export function stepLaneTraffic(car, dt, roadBounds) {
  const delta = clamp(dt, 0, MAX_FRAME_DELTA);
  const min = Number.isFinite(roadBounds?.min) ? roadBounds.min : -150;
  const max = Number.isFinite(roadBounds?.max) ? roadBounds.max : 150;
  const span = Math.max(1, max - min);
  const direction = car.direction < 0 ? -1 : 1;
  const distance = Math.max(0, Number.isFinite(car.speed) ? car.speed : 0) * delta * direction;
  if (car.axis === "x") {
    const x = min + (((car.x - min + distance) % span) + span) % span;
    return { ...car, x };
  }
  const z = min + (((car.z - min + distance) % span) + span) % span;
  return { ...car, z };
}

