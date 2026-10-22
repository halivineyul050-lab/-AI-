import assert from "node:assert/strict";
import { test } from "node:test";

import { createVehicleState, stepLaneTraffic, stepVehicle } from "../public/games/free-city-3d/simulation.mjs";

const movingState = (speed = 18) => ({
  ...createVehicleState({ x: 0, z: 0, maxSpeed: 28 }),
  speed,
  vx: 0,
  vz: -speed
});

test("a coasting vehicle slows gradually while preserving its lane", () => {
  const next = stepVehicle(movingState(), {}, 0.5, () => false).state;
  assert.ok(next.speed > 0 && next.speed < 18);
  assert.equal(next.x, 0);
  assert.ok(next.z < 0);
});

test("reverse speed is capped below the forward speed limit", () => {
  let state = createVehicleState({ x: 0, z: 0, maxSpeed: 28 });
  for (let index = 0; index < 80; index += 1) {
    state = stepVehicle(state, { throttle: -1 }, 0.05, () => false).state;
  }
  assert.ok(state.speed >= -9.01 && state.speed < 0);
});

test("steering response increases with forward speed and reverses while backing up", () => {
  const slow = stepVehicle(movingState(3), { steer: 1 }, 0.1, () => false).state;
  const fast = stepVehicle(movingState(20), { steer: 1 }, 0.1, () => false).state;
  const reverse = stepVehicle(movingState(-10), { steer: 1 }, 0.1, () => false).state;
  assert.ok(fast.angle > slow.angle);
  assert.ok(reverse.angle < 0);
});

test("handbrake produces more lateral slide than normal grip", () => {
  const state = { ...movingState(12), vx: 8, vz: -12 };
  const normal = stepVehicle(state, { steer: 0.5 }, 0.2, () => false).state;
  const handbrake = stepVehicle(state, { steer: 0.5, handbrake: true }, 0.2, () => false).state;
  const lateral = (car) => Math.abs(car.vx * Math.cos(car.angle) + car.vz * Math.sin(car.angle));
  assert.ok(lateral(handbrake) > lateral(normal));
});

test("a collision blocks translation and reduces speed and health", () => {
  const before = movingState(16);
  const result = stepVehicle(before, { throttle: 1 }, 0.05, () => true);
  assert.equal(result.collided, true);
  assert.equal(result.state.x, before.x);
  assert.equal(result.state.z, before.z);
  assert.ok(Math.abs(result.state.speed) < Math.abs(before.speed));
  assert.ok(result.state.health < before.health);
});

test("a stalled frame is clamped so it cannot teleport the car", () => {
  const result = stepVehicle(movingState(20), { throttle: 1 }, 3, () => false);
  assert.ok(Math.abs(result.state.z) < 2);
});

test("lane traffic wraps at the road boundary", () => {
  const car = { x: 9, z: 0, axis: "x", direction: 1, speed: 8 };
  let next = car;
  for (let frame = 0; frame < 5; frame += 1) {
    next = stepLaneTraffic(next, 0.05, { min: -10, max: 10 });
  }
  assert.ok(next.x < -9 && next.x >= -10);
});

test("a stationary car touching an obstacle does not take repeated damage", () => {
  const before = createVehicleState({ x: 0, z: 0 });
  const result = stepVehicle(before, {}, 0.05, () => true);
  assert.equal(result.collided, false);
  assert.equal(result.state.health, 100);
});
