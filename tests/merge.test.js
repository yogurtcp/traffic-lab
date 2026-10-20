import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, PRESETS, CAR_LENGTH } from "../src/model.js";
import { ReplayBuffer } from "../src/replay.js";
function scenario(
  direction = "left",
  rearSpeed = 90,
  backGap = 60,
  frontGap = 1000,
  reaction = 0.9,
  layout = "circle",
) {
  const base = new Simulation({
    ...PRESETS.perfect,
    lanes: 2,
    reaction,
    counts: { regular: 3, slowpoke: 1 },
  });
  const sim =
    layout === "u"
      ? new Simulation({ ...PRESETS.stream, reaction, interval: 60 })
      : base;
  if (layout === "u") {
    sim.cars = base.cars;
    sim.arrived = sim.entered = sim.cars.length;
    sim.nextCar = 5;
    sim.nextArrival = 1000;
  }
  const [car, rear, front] = sim.cars.filter((c) => c.type === "regular");
  const source = sim.cars.find((c) => c.type === "slowpoke");
  const lane = direction === "left" ? 0 : 1,
    from = 1 - lane;
  Object.assign(car, { lane: from, from, q: 0.2, v: 25, cooldown: 0 });
  Object.assign(source, {
    lane: from,
    from,
    q:
      direction === "left"
        ? 0.2 + (80 + CAR_LENGTH) / sim.laneLength(from)
        : 0.8,
    v: 70 / 3.6,
    cooldown: 1000,
  });
  Object.assign(rear, {
    lane,
    from: lane,
    q: 0.2 - (backGap + CAR_LENGTH) / sim.laneLength(lane),
    v: rearSpeed / 3.6,
    type: rearSpeed > 90 ? "speedster" : "regular",
    cooldown: 1000,
  });
  Object.assign(front, {
    lane,
    from: lane,
    q:
      frontGap < 500
        ? 0.2 + (frontGap + CAR_LENGTH) / sim.laneLength(lane)
        : 0.8,
    v: 25,
    cooldown: 1000,
  });
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  return { sim, car, rear, front, source, lane };
}
function separated(sim) {
  for (const car of sim.cars)
    for (const lane of car.target === null
      ? [car.lane]
      : [car.lane, car.target])
      assert.ok(sim.neighbors(car, lane).gap >= 0.49);
}
test("Regulars reject a gap that would make them brake behind the new leader and shock the follower", () => {
  const { sim, car, lane } = scenario("left", 90, 80, 15);
  assert.equal(sim.safeLane(car, lane), false);
  sim.considerLane(car, sim.snapshot());
  assert.equal(car.target, null);
});
test("obstacle bypasses also wait for a safe follower gap", () => {
  const { sim, car, rear, lane } = scenario("right", 110, 50);
  assert.ok(sim.addObstacle(car.q + (30 + 4.75) / sim.laneLength(0), 0));
  assert.equal(sim.safeLane(car, lane), false);
  sim.considerLane(car, sim.snapshot());
  assert.equal(car.target, null);
  assert.equal(rear.v * 3.6, 110);
});
test("accepted left and right merges keep actual follower braking gentle", () => {
  for (const layout of ["circle", "u"])
    for (const direction of ["left", "right"])
      for (const reaction of [0, 0.9, 2]) {
        const { sim, car, rear, lane } = scenario(
          direction,
          90,
          60,
          direction === "right" ? 50 : 1000,
          reaction,
          layout,
        );
        sim.considerLane(car, sim.snapshot());
        assert.equal(
          car.target,
          lane,
          `${direction} with reaction ${reaction}`,
        );
        let hardest = 0;
        for (let i = 0; i < 100; i++) {
          sim.step();
          hardest = Math.min(hardest, rear.a);
          separated(sim);
        }
        assert.ok(hardest >= -1.5, `${direction}: follower braked ${hardest}`);
      }
});
test("a follower accelerating during its reaction time is included in the merge decision", () => {
  const { sim, car, rear, lane } = scenario("left", 70, 25, 1000, 2);
  rear.type = "speedster";
  rear.a = 1.5;
  car.v = 70 / 3.6;
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  assert.equal(sim.safeLane(car, lane), false);
});
test("blocked-lane courtesy opens room with gradual braking and releases after the merge", () => {
  const sim = new Simulation({
    ...PRESETS.perfect,
    lanes: 2,
    reaction: 0.9,
    counts: { regular: 3 },
  });
  const [waiting, rear, passing] = sim.cars;
  Object.assign(waiting, { lane: 0, from: 0, q: 0.4, v: 0, cooldown: 0 });
  Object.assign(rear, { lane: 1, from: 1, q: 0, v: 25, cooldown: 1000 });
  Object.assign(passing, { lane: 1, from: 1, q: 0.34, v: 25, cooldown: 1000 });
  assert.ok(sim.addObstacle(0.4 + 12 / sim.laneLength(0), 0));
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  sim.step();
  assert.equal(rear.yieldFor, waiting.id);
  const recording = new ReplayBuffer();
  recording.capture(sim);
  const historical = recording.at(sim.time);
  assert.equal(waiting.target, null);
  for (let i = 0; i < 200; i++) {
    sim.step();
    assert.ok(sim.yieldAcceleration(rear) >= -1);
    assert.ok(rear.a >= -1.5);
    separated(sim);
  }
  assert.equal(waiting.lane, 1);
  assert.equal(rear.yieldFor, undefined);
  assert.equal(
    historical.cars.find((c) => c.id === rear.id).yieldFor,
    waiting.id,
  );
});
test("merge forecasts do not advance the simulation or consume random draws", () => {
  const { sim, car, lane } = scenario();
  const control = scenario().sim;
  const before = structuredClone({
    cars: sim.cars,
    history: sim.history,
    time: sim.time,
    events: sim.events,
  });
  for (let i = 0; i < 10; i++) sim.safeLane(car, lane);
  assert.deepEqual(
    {
      cars: sim.cars,
      history: sim.history,
      time: sim.time,
      events: sim.events,
    },
    before,
  );
  assert.equal(sim.random(), control.random());
});

test("a range of accepted merges keeps real follower braking below 1.5 m/s²", () => {
  let accepted = 0;
  for (const direction of ["left", "right"])
    for (const reaction of [0, 0.9, 2])
      for (const rearSpeed of [70, 90, 110])
        for (const rearGap of [30, 50, 80, 140])
          for (const frontGap of [20, 50, 150]) {
            const { sim, car, rear, lane } = scenario(
              direction,
              rearSpeed,
              rearGap,
              frontGap,
              reaction,
            );
            sim.considerLane(car, sim.snapshot());
            if (car.target !== lane) continue;
            accepted++;
            for (let i = 0; i < 100; i++) {
              sim.step();
              assert.ok(
                rear.a >= -1.5,
                `${direction}, reaction ${reaction}, rear ${rearSpeed}km/h at ${rearGap}m, front ${frontGap}m: ${rear.a}`,
              );
              separated(sim);
            }
          }
  assert.ok(
    accepted > 80,
    "retain useful everyday merges rather than refusing them all",
  );
});

test("courtesy does not slow a driver unnecessarily when the waiting car already has room", () => {
  const sim = new Simulation({
    ...PRESETS.perfect,
    lanes: 2,
    reaction: 0.9,
    counts: { regular: 2 },
  });
  const [waiting, rear] = sim.cars;
  Object.assign(waiting, { lane: 0, from: 0, q: 0.4, v: 0, cooldown: 0 });
  Object.assign(rear, { lane: 1, from: 1, q: 0, v: 25, cooldown: 1000 });
  assert.ok(sim.addObstacle(0.4 + 12 / sim.laneLength(0), 0));
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  sim.step();
  assert.equal(waiting.target, 1);
  assert.equal(rear.yieldFor, undefined);
  assert.ok(rear.a >= -0.1);
});
