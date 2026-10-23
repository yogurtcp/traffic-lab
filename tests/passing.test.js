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
  leader.q = car.q + (80 + CAR_LENGTH) / sim.laneLength(1);
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

function heldTraffic(reaction, lanes = 2, layout = "circle", type = "cautious") {
  let sim = new Simulation({
    ...PRESETS.perfect,
    lanes,
    length: 2500,
    reaction,
    counts: { regular: 2, [type]: 1 },
  });
  if (layout === "u") {
    const cars = sim.cars;
    sim = new Simulation({ ...PRESETS.stream, lanes, length: 2500, reaction });
    sim.cars = cars;
    sim.arrived = sim.entered = cars.length;
    sim.nextCar = cars.length + 1;
    sim.nextArrival = 1000;
  }
  const [car, leader] = sim.cars.filter((c) => c.type === "regular");
  const slow = sim.cars.find((c) => c.type === type);
  for (const [i, vehicle] of [car, leader, slow].entries()) {
    Object.assign(vehicle, {
      lane: lanes - 1,
      from: lanes - 1,
      q: 0.2 + i * 42 / sim.laneLength(lanes - 1),
      v: (type === "cautious" ? 78 : 68) / 3.6,
      cooldown: vehicle === car ? 0 : 1000,
    });
  }
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  return { sim, car, leader, slow };
}

test("Regulars pass a Regular held below its cruising speed by moving traffic, including above 70", () => {
  let pulledOutAfterBraking = false;
  for (const reaction of [0, 0.9, 2])
    for (const layout of ["circle", "u"])
      for (const lanes of [2, 3])
        for (const type of ["cautious", "slowpoke"]) {
          const { sim, car, leader } = heldTraffic(reaction, lanes, layout, type);
          const label = `${layout}, ${lanes} lanes, ${reaction}s reaction, ${type}`;
          let started = false,
            passed = false;
          for (let i = 0; i < 900; i++) {
            sim.step();
            if (car.target !== null && car.target < car.from) {
              if (!started && car.v + 0.05 < leader.v)
                pulledOutAfterBraking = true;
              started = true;
            }
            separated(sim);
            if (car.q > leader.q) {
              assert.ok(
                car.lane < leader.lane,
                `complete the pass on the left: ${label}`,
              );
              passed = true;
              break;
            }
          }
          assert.ok(started, `never attempted a pass: ${label}`);
          assert.ok(passed, `never got around held traffic: ${label}`);
          assert.ok(
            car.v * 3.6 > 80,
            `accelerate in the clear passing lane: ${label}`,
          );
        }
  assert.ok(
    pulledOutAfterBraking,
    "a constrained follower can pull out to accelerate",
  );
});

test("Speedsters pass an unimpeded Regular doing 90 instead of waiting for a 70 km/h slowdown", () => {
  const { sim, car, leader } = scenario("speedster");
  car.v = 100 / 3.6;
  leader.v = 90 / 3.6;
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  sim.considerLane(car, sim.snapshot());
  assert.equal(car.target, 0);
});
