import test from "node:test";
import assert from "node:assert/strict";
import {
  Simulation,
  PRESETS,
  PERSONALITIES,
  STEP,
  CAR_LENGTH,
  normalizeConfig,
} from "../src/model.js";

const config = (counts, options = {}) => ({
  ...PRESETS.perfect,
  lanes: 1,
  counts,
  ...options,
});
function checkSafe(sim) {
  for (const c of sim.cars) {
    assert.ok(Number.isFinite(c.q) && c.q >= 0 && c.q < 1);
    assert.ok(Number.isFinite(c.v) && c.v >= 0);
    for (const lane of c.target === null ? [c.lane] : [c.lane, c.target]) {
      const n = sim.neighbors(c, lane);
      assert.ok(
        n.gap >= 0.49,
        `overlap: car ${c.id}, lane ${lane}, gap ${n.gap}`,
      );
    }
  }
}
test("each lane starts at identical intervals, hogs occupy the left lane, and seed is reproducible", () => {
  const sim = new Simulation(PRESETS.mixed);
  for (let lane = 0; lane < sim.config.lanes; lane++) {
    const cars = sim.cars
      .filter((c) => c.lane === lane)
      .sort((a, b) => a.q - b.q);
    for (const c of cars)
      assert.ok(
        Math.abs(
          sim.neighbors(c, lane).gap -
            (sim.laneLength(lane) / cars.length - CAR_LENGTH),
        ) < 1e-6,
      );
  }
  assert.ok(
    sim.cars.filter((c) => c.type === "hog").every((c) => c.lane === 0),
  );
  assert.deepEqual(sim.cars, new Simulation(PRESETS.mixed).cars);
  assert.notDeepEqual(
    sim.cars,
    new Simulation({ ...PRESETS.mixed, seed: 100 }).cars,
  );
});
test("outer lanes have longer laps; actual motion respects km/h", () => {
  const sim = new Simulation(config({ regular: 1 }, { lanes: 2, reaction: 0 }));
  const c = sim.cars[0];
  c.cooldown = 100;
  const start = c.q;
  sim.advance(1);
  assert.ok(Math.abs((c.q - start) * sim.laneLength(c.lane) - 25) < 0.01);
  assert.ok(sim.laneLength(1) > sim.laneLength(0));
});
test("all eight personalities converge to their desired unimpeded speed", () => {
  for (const type of Object.keys(PERSONALITIES)) {
    const sim = new Simulation(config({ [type]: 1 }));
    sim.cars[0].v = 0;
    sim.history = Array.from({ length: 43 }, () => sim.snapshot());
    sim.advance(120);
    assert.ok(Math.abs(sim.cars[0].v * 3.6 - PERSONALITIES[type].speed) < 0.01);
    assert.ok(
      sim.samples.every((s) => s.average <= PERSONALITIES[type].speed + 1e-8),
    );
  }
});
test("equal-spacing flow stays smooth despite different inner and outer lap lengths", () => {
  const sim = new Simulation(PRESETS.perfect);
  sim.advance(60);
  assert.ok(sim.stats.average > 80);
  assert.equal(sim.stats.slow, 0);
  assert.equal(sim.changes, 0);
});
test("followers react to a brake pulse after the configured perception delay", () => {
  const sim = new Simulation(config({ regular: 2 }, { reaction: 1 }));
  const [lead, follow] = sim.cars;
  lead.q = 0.06;
  follow.q = 0;
  lead.v = follow.v = 15;
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  const control = new Simulation(config({ regular: 2 }, { reaction: 1 }));
  control.cars = structuredClone(sim.cars);
  control.history = Array.from({ length: 43 }, () => control.snapshot());
  sim.brakeCar(lead.id);
  sim.advance(0.8);
  control.advance(0.8);
  assert.ok(Math.abs(sim.cars[1].v - control.cars[1].v) < 1e-8);
  sim.advance(0.8);
  control.advance(0.8);
  assert.ok(sim.cars[1].v < control.cars[1].v - 0.1);
});
test("brake pulse expires; breakdown stays stopped until repaired", () => {
  const sim = new Simulation(config({ regular: 1 }));
  const c = sim.cars[0];
  sim.brakeCar(c.id);
  sim.advance(3);
  const slow = c.v;
  sim.advance(5);
  assert.ok(c.v > slow);
  sim.breakCar(c.id);
  sim.advance(8);
  assert.equal(c.v, 0);
  sim.advance(3);
  assert.equal(c.v, 0);
  sim.repairCar(c.id);
  sim.advance(3);
  assert.ok(c.v > 0);
});
test("obstacles cannot spawn inside cars and can be removed", () => {
  const sim = new Simulation(config({ regular: 1 }));
  assert.equal(sim.addObstacle(sim.cars[0].q, 0), false);
  assert.equal(sim.addObstacle(0.1, 0), true);
  assert.equal(sim.addObstacle(0.1, 0), false);
  sim.removeObstacle(sim.obstacles[0].id);
  assert.equal(sim.obstacles.length, 0);
});
test("regular and speedster overtake slow traffic to the left; stuntmen also use the right", () => {
  for (const type of ["regular", "speedster", "stuntman"]) {
    const sim = new Simulation(
      config({ [type]: 1, slowpoke: 1 }, { lanes: 3, reaction: 0 }),
    );
    const c = sim.cars.find((c) => c.type === type),
      lead = sim.cars.find((c) => c.type === "slowpoke");
    c.lane = 1;
    c.q = 0;
    c.cooldown = 0;
    lead.lane = 1;
    lead.q = 0.035;
    lead.v = 18;
    sim.considerLane(c, sim.snapshot());
    assert.equal(c.target, 0);
    c.target = null;
    c.lane = 0;
    c.from = 0;
    c.cooldown = 0;
    lead.lane = 0;
    sim.considerLane(c, sim.snapshot());
    assert.equal(c.target, type === "stuntman" ? 1 : null);
  }
});
function passingScenario(type, followerSpeed, leaderSpeed) {
  const sim = new Simulation(
    config(
      { [type]: 1, regular: type === "regular" ? 2 : 1 },
      { lanes: 2, reaction: 0 },
    ),
  );
  const car = sim.cars.find((c) => c.type === type);
  const lead = sim.cars.find((c) => c.id !== car.id);
  Object.assign(car, {
    lane: 1,
    from: 1,
    q: 0,
    v: followerSpeed / 3.6,
    cooldown: 0,
  });
  Object.assign(lead, {
    lane: 1,
    from: 1,
    q: 0.035,
    v: leaderSpeed / 3.6,
    cooldown: 100,
  });
  return { sim, car, lead };
}
test("slowpokes do not attempt to pass equal-speed or faster moving leaders", () => {
  for (const [followerSpeed, leaderSpeed] of [
    [70, 70],
    [70, 70.4],
    [60, 65],
  ]) {
    const { sim, car } = passingScenario(
      "slowpoke",
      followerSpeed,
      leaderSpeed,
    );
    sim.considerLane(car, sim.snapshot());
    assert.equal(
      car.target,
      null,
      `${followerSpeed} km/h behind ${leaderSpeed} km/h`,
    );
  }
});
test("a slowpoke can still pass genuinely slower traffic, including after matching its speed", () => {
  for (const followerSpeed of [70, 50]) {
    const { sim, car } = passingScenario("slowpoke", followerSpeed, 50);
    sim.considerLane(car, sim.snapshot());
    assert.equal(car.target, 0);
  }
});
test("a passing lane must offer a useful speed advantage", () => {
  const { sim, car } = passingScenario("regular", 90, 65);
  const leftLeader = {
    ...sim.cars.find((c) => c.id !== car.id),
    id: 999,
    lane: 0,
    from: 0,
    q: 0.06,
    v: 60 / 3.6,
  };
  sim.cars.push(leftLeader);
  assert.equal(sim.safeLane(car, 0), true);
  sim.considerLane(car, sim.snapshot());
  assert.equal(car.target, null);
});
test("a lane change requires space both in front and behind", () => {
  const sim = new Simulation(
    config({ regular: 1, slowpoke: 2 }, { lanes: 2, reaction: 0 }),
  );
  const c = sim.cars.find((c) => c.type === "regular"),
    [lead, rear] = sim.cars.filter((c) => c.type === "slowpoke");
  c.lane = 1;
  c.q = 0.2;
  c.cooldown = 0;
  lead.lane = 1;
  lead.q = 0.23;
  rear.lane = 0;
  rear.q = 0.19;
  rear.v = 25;
  assert.equal(sim.safeLane(c, 0), false);
  sim.considerLane(c, sim.snapshot());
  assert.equal(c.target, null);
});
function stuntScenario(frontDistance = 14, frontSpeed = 20) {
  const sim = new Simulation(
    config({ stuntman: 1, regular: 3 }, { lanes: 2, reaction: 0.9 }),
  );
  const stunt = sim.cars.find((c) => c.type === "stuntman");
  const [leader, targetLeader, rear] = sim.cars.filter((c) => c !== stunt);
  Object.assign(stunt, { lane: 0, from: 0, q: 0, v: 25, cooldown: 0 });
  Object.assign(leader, { lane: 0, from: 0, q: 0.012, v: 15, cooldown: 100 });
  Object.assign(targetLeader, {
    lane: 1,
    from: 1,
    q: frontDistance / sim.laneLength(1),
    v: frontSpeed,
    cooldown: 100,
  });
  Object.assign(rear, {
    lane: 1,
    from: 1,
    q: 1 - 8 / sim.laneLength(1),
    v: 25,
    cooldown: 100,
  });
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  return { sim, stunt, rear, targetLeader };
}
test("stuntmen take tight gaps that regular drivers reject, even when both lanes require braking", () => {
  const { sim, stunt } = stuntScenario();
  assert.equal(sim.safeLane(stunt, 1), true);
  assert.equal(sim.safeLane({ ...stunt, type: "regular" }, 1), false);
  const state = sim.snapshot();
  assert.equal(sim.acceleration(stunt, 0, state), -8);
  assert.equal(sim.acceleration(stunt, 1, state), -8);
  sim.considerLane(stunt, state);
  assert.equal(stunt.target, 1);
});
test("a stuntman cutting in makes the following regular driver brake harder without overlap", () => {
  const { sim, stunt, rear } = stuntScenario(100, 25);
  const control = stuntScenario(100, 25);
  control.stunt.cooldown = 100;
  sim.considerLane(stunt, sim.snapshot());
  assert.equal(stunt.target, 1);
  let hardest = 0;
  for (let i = 0; i < 30; i++) {
    sim.step();
    control.sim.step();
    hardest = Math.min(hardest, rear.a);
    checkSafe(sim);
  }
  assert.ok(hardest < -3);
  assert.ok(rear.v < control.rear.v - 2);
});
test("stuntmen still reject gaps without physical clearance", () => {
  const { sim, stunt, targetLeader } = stuntScenario();
  targetLeader.q = (CAR_LENGTH + 0.5) / sim.laneLength(1);
  assert.equal(sim.safeLane(stunt, 1), false);
});
test("lawful drivers cannot pass on the right, including two lanes across; stuntmen can", () => {
  for (const type of ["regular", "speedster", "stuntman"]) {
    const sim = new Simulation(
      config({ [type]: 1, hog: 1 }, { lanes: 3, reaction: 2 }),
    );
    const car = sim.cars.find((c) => c.type === type),
      hog = sim.cars.find((c) => c.type === "hog");
    car.lane = 2;
    car.from = 2;
    car.q = 0;
    car.cooldown = 100;
    hog.lane = 0;
    hog.q = 0.001;
    hog.cooldown = 100;
    sim.history = Array.from({ length: 43 }, () => sim.snapshot());
    sim.advance(1);
    assert.equal(car.q > hog.q, type === "stuntman");
  }
});
test("a broken vehicle in the leftmost lane can be avoided on its right", () => {
  const sim = new Simulation(config({ regular: 2 }, { lanes: 2, reaction: 0 }));
  const [car, broken] = sim.cars;
  car.lane = 0;
  car.q = 0;
  car.cooldown = 0;
  broken.lane = 0;
  broken.q = 0.03;
  broken.broken = true;
  broken.v = 0;
  sim.considerLane(car, sim.snapshot());
  assert.equal(car.target, 1);
});
test("regular drivers move right around a left-lane obstacle or its connected queue", () => {
  for (const queue of [false, true]) {
    const sim = new Simulation(
      config({ regular: queue ? 2 : 1 }, { lanes: 2, reaction: 0 }),
    );
    const car = sim.cars[0];
    Object.assign(car, { lane: 0, from: 0, q: 0, v: 0, cooldown: 0 });
    if (queue) Object.assign(sim.cars[1], { lane: 0, from: 0, q: 0.02, v: 0 });
    assert.equal(sim.addObstacle(0.04, 0), true);
    sim.considerLane(car, sim.snapshot());
    assert.equal(car.target, 1);
  }
});
test("right-lane traffic can pass an obstruction queue, clearing room for a merge", () => {
  const sim = new Simulation(
    config({ regular: 2 }, { lanes: 2, reaction: 0.9 }),
  );
  const [left, right] = sim.cars;
  Object.assign(left, { lane: 0, from: 0, q: 0.02, v: 0, cooldown: 0 });
  Object.assign(right, { lane: 1, from: 1, q: 0.02, v: 0, cooldown: 100 });
  assert.equal(sim.addObstacle(0.03, 0), true);
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  assert.equal(sim.safeLane(left, 1), false);
  sim.advance(25);
  assert.ok(
    right.q > 0.1,
    "the right lane must keep moving past the blocked queue",
  );
  assert.ok(
    left.q > 0.03,
    "the blocked car must eventually merge and pass the obstacle",
  );
  checkSafe(sim);
});
test("an unrelated distant obstacle does not permit ordinary passing on the right", () => {
  const sim = new Simulation(
    config({ regular: 1, hog: 1 }, { lanes: 2, reaction: 0 }),
  );
  const car = sim.cars.find((c) => c.type === "regular");
  const hog = sim.cars.find((c) => c.type === "hog");
  Object.assign(car, { lane: 1, from: 1, q: 0, cooldown: 100 });
  Object.assign(hog, { lane: 0, from: 0, q: 0.001, cooldown: 100 });
  sim.addObstacle(0.5, 0);
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  assert.equal(sim.obstructionQueues()[0].has(hog.id), false);
  sim.advance(1);
  assert.ok(car.q < hog.q);
});
test("a left-lane obstacle cannot deadlock every lane of regular traffic", () => {
  for (const lanes of [2, 3]) {
    const sim = new Simulation(
      config({ regular: 36 }, { lanes, reaction: 0.9 }),
    );
    assert.equal(sim.addObstacle(0.04, 0), true);
    sim.advance(90);
    assert.ok(sim.stats.average > 15, `${lanes} lanes must retain useful flow`);
    assert.ok(sim.stats.stopped < sim.cars.length / 2);
    assert.ok(sim.laps > 0);
    checkSafe(sim);
  }
});
test("dense traffic remains finite, bounded, and separated through abrupt incidents and lane changes", () => {
  for (const lanes of [1, 3, 5]) {
    const sim = new Simulation({
      ...PRESETS.mixed,
      lanes,
      reaction: 2,
      length: 600,
    });
    sim.brakeCar(sim.cars[0].id);
    sim.breakCar(sim.cars.at(-1).id);
    sim.addObstacle(0.123, 0);
    for (let i = 0; i < 600; i++) {
      sim.step();
      if (i % 20 === 0) checkSafe(sim);
    }
    assert.ok(sim.samples.length > 50);
  }
});
test("single-lane brake pulse disrupts following cars and appears in the time series", () => {
  const sim = new Simulation(PRESETS.wave);
  sim.advance(30);
  const before = sim.stats.average;
  sim.brakeCar(sim.cars[0].id);
  sim.advance(12);
  assert.ok(sim.stats.average < before - 1);
  assert.ok(sim.samples.some((s) => s.slow > 0));
  checkSafe(sim);
});
test("empty roads, reset, and invalid saved values are handled", () => {
  const sim = new Simulation(config({}));
  sim.advance(1);
  assert.equal(sim.stats.average, 0);
  const normalized = normalizeConfig({
    lanes: 100,
    reaction: NaN,
    length: -3,
    counts: { regular: 400, stuntman: -4 },
  });
  assert.equal(normalized.lanes, 5);
  assert.equal(normalized.length, 600);
  assert.equal(normalized.reaction, 0.9);
  assert.equal(normalized.counts.regular, 180);
  assert.equal(normalized.counts.stuntman, 0);
  sim.reset(PRESETS.mixed);
  assert.equal(sim.time, 0);
  assert.equal(sim.cars.length, 54);
  assert.equal(sim.events.length, 0);
  assert.throws(() => sim.step(0.1), /fixed/);
});
