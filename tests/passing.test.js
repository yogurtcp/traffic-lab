import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, PRESETS, CAR_LENGTH, STEP } from "../src/model.js";

function scenario(type = "slowpoke", extra = {}) {
  const sim = new Simulation({
    ...PRESETS.perfect,
    lanes: 2,
    length: 1000,
    reaction: 0,
    counts: { [type]: 1, regular: type === "regular" ? 2 : 1 },
    ...extra,
  });
  const car = sim.cars.find((c) => c.type === type);
  const leader = sim.cars.find((c) => c !== car);
  Object.assign(car, { lane: 1, from: 1, q: 0.2, v: 65 / 3.6, cooldown: 0 });
  Object.assign(leader, {
    lane: 1,
    from: 1,
    q: 0.2 + (35 + CAR_LENGTH) / sim.laneLength(1),
    v: 65 / 3.6,
    cooldown: 1000,
  });
  return { sim, car, leader };
}
function separated(sim) {
  for (const car of sim.cars)
    for (const lane of car.target === null
      ? [car.lane]
      : [car.lane, car.target])
      assert.ok(sim.neighbors(car, lane).gap >= 0.49);
}
test("slower and equal cruising drivers stay right while the temporarily slowed leader recovers", () => {
  for (const type of ["slowpoke", "regular", "cautious", "eco"]) {
    const { sim, car } = scenario(type);
    sim.history = Array.from({ length: 43 }, () => sim.snapshot());
    for (let i = 0; i < 1200; i++) {
      sim.step();
      assert.equal(car.lane, 1, `${type} left lane at ${sim.time}`);
      assert.equal(car.target, null);
      separated(sim);
    }
  }
});
test("variance cannot trigger a pass when the leader's cruising target is faster", () => {
  const { sim, car, leader } = scenario("regular", {
    counts: { regular: 1, slowpoke: 1 },
    speedVariance: { regular: 20, slowpoke: 20 },
  });
  let found = false;
  for (let time = 0; time < 200; time += 0.1) {
    sim.time = time;
    if (
      sim.desiredSpeed(car) > 68 / 3.6 &&
      sim.desiredSpeed(car) < sim.desiredSpeed(leader)
    ) {
      found = true;
      break;
    }
  }
  assert.ok(found, "fixture must expose misleading actual speed versus target");
  sim.considerLane(car, sim.snapshot());
  assert.equal(car.target, null);
});
test("a delayed view cannot start a pass after the leader is already pulling away", () => {
  const { sim, car, leader } = scenario("regular", {
    counts: { regular: 1, slowpoke: 1 },
    reaction: 2,
  });
  car.v = 90 / 3.6;
  const delayed = sim.snapshot();
  car.v = 60 / 3.6;
  leader.v = 75 / 3.6;
  sim.considerLane(car, delayed);
  assert.equal(car.target, null);
});
test("staging across several lanes also requires a real cruising advantage", () => {
  const { sim, car, leader } = scenario("slowpoke", { lanes: 5 });
  car.lane = car.from = 4;
  car.v = 70 / 3.6;
  leader.lane = leader.from = 2;
  sim.considerLane(car, sim.snapshot());
  assert.equal(car.target, null);
});
test("an unproductive pass returns right safely instead of occupying the passing lane", () => {
  const { sim, car, leader } = scenario("regular", {
    speedVariance: { regular: 20 },
  });
  car.lane = car.from = 0;
  car.v = 80 / 3.6;
  leader.v = 70 / 3.6;
  leader.speedVariance = 0;
  let found = false;
  for (let time = 0; time < 200; time += 0.1) {
    sim.time = time;
    if (sim.desiredSpeed(car) * 3.6 > 95) {
      found = true;
      break;
    }
  }
  assert.ok(found);
  assert.equal(sim.safeLane(car, 1), true);
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  sim.considerLane(car, sim.snapshot());
  assert.equal(car.target, 1);
  for (let i = 0; i < Math.round(2 / STEP); i++) {
    sim.step();
    separated(sim);
  }
  assert.equal(car.lane, 1);
});
