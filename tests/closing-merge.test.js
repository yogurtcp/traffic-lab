import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, PRESETS, CAR_LENGTH } from "../src/model.js";
function scenario({
  layout = "u",
  gap = 35,
  leaderSpeed = 70,
  rear = true,
  reaction = 0.9,
} = {}) {
  const base = new Simulation({
    ...PRESETS.perfect,
    lanes: 2,
    reaction,
    counts: { regular: rear ? 3 : 2 },
  });
  const s =
    layout === "u"
      ? new Simulation({ ...PRESETS.stream, lanes: 2, reaction, interval: 60 })
      : base;
  if (layout === "u") {
    s.cars = base.cars;
    s.arrived = s.entered = s.cars.length;
    s.nextCar = s.cars.length + 1;
    s.nextArrival = 1000;
  }
  const [car, front, behind] = s.cars;
  Object.assign(car, { lane: 0, from: 0, q: 0.2, v: 25, cooldown: 0 });
  Object.assign(front, {
    lane: 1,
    from: 1,
    q: 0.2 + (gap + CAR_LENGTH) / s.laneLength(1),
    v: leaderSpeed / 3.6,
    type: leaderSpeed > 90 ? "speedster" : "regular",
    cooldown: 1000,
  });
  if (behind)
    Object.assign(behind, {
      lane: 1,
      from: 1,
      q: 0.2 - (220 + CAR_LENGTH) / s.laneLength(1),
      v: 25,
      cooldown: 1000,
    });
  s.history = Array.from({ length: 43 }, () => s.snapshot());
  return { s, car, front, behind };
}

test("a return-right merge checks the new leader even without a nearby follower", () => {
  for (const rear of [false, true])
    for (const reaction of [0, 0.9, 2]) {
      const { s, car } = scenario({ rear, reaction, gap: 35 });
      assert.equal(s.safeLane(car, 1), false);
      s.considerLane(car, s.snapshot());
      assert.equal(car.target, null);
    }
});
test("a distant source-lane obstacle cannot excuse an unsafe return", () => {
  const { s, car } = scenario({ gap: 35, rear: false });
  assert.ok(s.addObstacle(car.q + 0.4, 0));
  assert.equal(s.safeLane(car, 1), false);
});
test("the same physical gap is accepted or rejected according to relative velocity", () => {
  for (const layout of ["circle", "u"])
    for (const [leaderSpeed, accepted] of [
      [70, false],
      [90, true],
      [110, true],
    ]) {
      const { s, car } = scenario({
        layout,
        gap: 40,
        leaderSpeed,
        rear: false,
      });
      assert.equal(
        s.safeLane(car, 1),
        accepted,
        `${layout}: leader ${leaderSpeed}`,
      );
    }
});
test("known slowing of a destination leader is included beyond the instant of merging", () => {
  const { s, car, front } = scenario({ gap: 80, rear: false });
  assert.equal(s.safeLane(car, 1), true);
  front.a = -2;
  assert.equal(s.safeLane(car, 1), false);
});
test("accepted returns keep both the merging car and its follower braking gently", () => {
  for (const layout of ["circle", "u"])
    for (const rear of [false, true])
      for (const reaction of [0, 0.9, 2]) {
        const { s, car, behind } = scenario({
          layout,
          rear,
          reaction,
          gap: 80,
        });
        s.considerLane(car, s.snapshot());
        assert.equal(car.target, 1);
        for (let i = 0; i < 100; i++) {
          s.step();
          assert.ok(car.a >= -1.5, `${layout}: merging car ${car.a}`);
          if (behind) assert.ok(behind.a >= -1.5);
          for (const c of s.cars)
            for (const lane of c.target === null
              ? [c.lane]
              : [c.lane, c.target])
              assert.ok(s.neighbors(c, lane).gap >= 0.49);
        }
      }
});
test("a predicted collision with the destination leader is rejected even during an obstacle escape", () => {
  const { s, car, front } = scenario({ gap: 38, leaderSpeed: 0, rear: false });
  front.broken = true;
  assert.ok(s.addObstacle(car.q + (50 + 4.75) / s.laneLength(0), 0));
  assert.equal(s.safeLane(car, 1), false);
});
test("waiting in the passing lane avoids the abrupt braking cascade from a premature return", () => {
  const { s, car, behind } = scenario({ gap: 35 });
  for (let i = 0; i < 100; i++) {
    s.step();
    assert.equal(car.lane, 0);
    assert.equal(car.target, null);
    assert.ok(car.a >= -1e-8);
    assert.ok(behind.a >= -1.5);
  }
});
