import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, PRESETS, CAR_LENGTH, STEP } from "../src/model.js";

function scenario({
  layout = "circle",
  lanes = 2,
  reaction = 0.9,
  gap = 135,
  slowLane = lanes - 1,
  ownLane = lanes - 2,
  leaderSpeed = 70,
} = {}) {
  let sim = new Simulation({
    ...PRESETS.perfect,
    lanes,
    length: 2000,
    reaction,
    counts: { regular: 1, slowpoke: 1 },
  });
  if (layout === "u") {
    const cars = sim.cars;
    sim = new Simulation({ ...PRESETS.stream, lanes, length: 2000, reaction });
    sim.cars = cars;
    sim.arrived = sim.entered = cars.length;
    sim.nextCar = 3;
    sim.nextArrival = 1000;
  }
  const car = sim.cars.find((c) => c.type === "regular");
  const leader = sim.cars.find((c) => c !== car);
  Object.assign(car, { lane: ownLane, from: ownLane, q: 0.2, v: 25, cooldown: 0 });
  Object.assign(leader, {
    lane: slowLane,
    from: slowLane,
    q: 0.2 + (gap + CAR_LENGTH) / sim.laneLength(slowLane),
    v: leaderSpeed / 3.6,
    cooldown: 1000,
  });
  if (leaderSpeed === 90) leader.type = "regular";
  if (leaderSpeed === 80) leader.type = "cautious";
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  return { sim, car, leader };
}

function separated(sim) {
  for (const car of sim.cars)
    for (const lane of car.target === null ? [car.lane] : [car.lane, car.target])
      assert.ok(sim.neighbors(car, lane).gap >= 0.49);
}

test("Regulars return right at cruising speed instead of reserving the left lane for distant slower traffic", () => {
  for (const layout of ["circle", "u"])
    for (const lanes of [2, 3])
      for (const reaction of [0, 0.9, 2]) {
        const { sim, car } = scenario({ layout, lanes, reaction });
        sim.considerLane(car, sim.snapshot());
        assert.equal(
          car.target,
          lanes - 1,
          `${layout}, ${lanes} lanes, ${reaction}s`,
        );
        for (let i = 0; i < 5 / STEP; i++) {
          sim.step();
          assert.ok(car.v * 3.6 >= 89.5, `unnecessary slowing: ${car.v * 3.6}`);
          separated(sim);
        }
      }
});

test("a distant slower car in the current lane does not prevent keeping right on a clear road", () => {
  const { sim, car } = scenario({ slowLane: 0 });
  sim.considerLane(car, sim.snapshot());
  assert.equal(car.target, 1);
});

test("the same distance means keep right for a small speed difference and stay left for an imminent catch", () => {
  for (const [gap, leaderSpeed, target] of [
    [100, 80, 1],
    [100, 70, null],
    [40, 70, null],
  ]) {
    const { sim, car } = scenario({ gap, leaderSpeed });
    sim.considerLane(car, sim.snapshot());
    assert.equal(car.target, target, `${gap}m, ${leaderSpeed} km/h leader`);
  }
});

test("keep right first, then complete a nearby left pass and return without repeated lane changes", () => {
  for (const layout of ["circle", "u"])
    for (const reaction of [0, 0.9, 2]) {
      const { sim, car, leader } = scenario({ layout, reaction });
      const maneuvers = [];
      let passed = false;
      for (let i = 0; i < 60 / STEP; i++) {
        const changes = sim.changes;
        sim.step();
        if (changes < sim.changes) maneuvers.push([car.from, car.target]);
        if (!passed && car.q > leader.q) {
          assert.equal(car.lane, 0, "pass on the left");
          passed = true;
        }
        separated(sim);
      }
      assert.ok(passed);
      assert.deepEqual(maneuvers, [
        [0, 1],
        [1, 0],
        [0, 1],
      ]);
      assert.equal(car.lane, 1);
      assert.ok(car.v * 3.6 > 89);
    }
});

test("a close faster car behind vetoes pulling out until it can pass without a braking shock", () => {
  for (const reaction of [0, 0.9, 2]) {
    const { sim, car, leader } = scenario({ gap: 40, ownLane: 1, reaction });
    const fast = {
      ...car,
      id: 3,
      type: "speedster",
      lane: 0,
      from: 0,
      q: car.q - (30 + CAR_LENGTH) / sim.laneLength(0),
      v: 110 / 3.6,
      cooldown: 1000,
    };
    sim.cars.push(fast);
    sim.history = Array.from({ length: 43 }, () => sim.snapshot());
    assert.equal(sim.safeLane(car, 0), false);
    sim.considerLane(car, sim.snapshot());
    assert.equal(car.target, null);
    let passed = false;
    for (let i = 0; i < 45 / STEP; i++) {
      sim.step();
      if (car.target === 0)
        assert.ok(fast.q > car.q, "wait for the faster driver to clear");
      if (car.q > leader.q) passed = true;
      assert.ok(
        fast.a >= -1.5,
        "do not force a braking shock on the faster driver",
      );
      separated(sim);
    }
    assert.ok(passed, "take the opportunity once the passing lane is clear");
  }
});
