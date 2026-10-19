import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, PRESETS, STEP, CAR_LENGTH } from "../src/model.js";
import { getRoute } from "../src/route.js";
import { RoadView } from "../src/view.js";
const config = (extra = {}) => ({
  ...PRESETS.stream,
  length: 600,
  probabilities: { regular: 100 },
  ...extra,
});
function conservation(sim) {
  assert.equal(sim.arrived, sim.entered + sim.stats.upstream);
  assert.equal(sim.entered, sim.cars.length + sim.exited);
}
function separated(sim) {
  for (const c of sim.cars) {
    assert.ok(Number.isFinite(c.v) && c.v >= 0);
    for (const lane of c.target === null ? [c.lane] : [c.lane, c.target])
      assert.ok(
        sim.neighbors(c, lane).gap >= 0.49,
        `overlap at ${sim.time}: ${c.id}`,
      );
  }
  conservation(sim);
}

test("streams start empty, schedule arrivals in simulation time, and reset reproducibly", () => {
  const a = new Simulation(config({ interval: 2 })),
    b = new Simulation(config({ interval: 2 }));
  assert.equal(a.cars.length, 0);
  a.advance(10);
  b.advance(10);
  assert.equal(a.arrived, 5);
  assert.deepEqual(a.cars, b.cars);
  assert.equal(a.nextCar, 6);
  conservation(a);
  a.reset(config({ interval: 2 }));
  assert.equal(a.arrived, 0);
  assert.equal(a.exited, 0);
  assert.equal(a.cars.length, 0);
  a.advance(10);
  assert.deepEqual(a.cars, b.cars);
});
test("each car exits once, never wraps on the U, and throughput counts departures", () => {
  const sim = new Simulation(config({ interval: 60 }));
  sim.step();
  const c = sim.cars[0];
  Object.assign(c, { q: 0.999, travelled: 0.999, v: 25 });
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  sim.step();
  assert.equal(sim.cars.length, 0);
  assert.equal(sim.exited, 1);
  sim.advance(5);
  assert.equal(sim.exited, 1);
  assert.equal(sim.stats.completedLaps, 0);
  assert.equal(sim.stats.throughputPerMinute, (sim.exited * 60) / sim.time);
  conservation(sim);
});
test("weighted personality choices are seeded, and blocked arrivals queue instead of vanishing", () => {
  const run = () => {
    const s = new Simulation(
      config({ interval: 0.2, probabilities: { regular: 70, slowpoke: 30 } }),
    );
    for (let l = 0; l < 2; l++) assert.ok(s.addObstacle(0.001, l));
    s.advance(200);
    return s;
  };
  const a = run(),
    b = run();
  assert.equal(a.arrived, 1000);
  assert.equal(a.entered, 0);
  assert.equal(a.stats.upstream, 1000);
  assert.deepEqual(a.pending, b.pending);
  const types = a.pending.flat().map((c) => c.type);
  assert.ok(types.every((t) => ["regular", "slowpoke"].includes(t)));
  assert.ok(
    Math.abs(types.filter((t) => t === "regular").length / 1000 - 0.7) < 0.04,
  );
  conservation(a);
});
test("clearing a blocked entrance releases the upstream queue without losing cars", () => {
  const sim = new Simulation(config({ lanes: 1, interval: 0.5 }));
  assert.ok(sim.addObstacle(0.02, 0));
  for (let i = 0; i < 400; i++) {
    sim.step();
    separated(sim);
  }
  assert.ok(sim.stats.upstream > 10);
  sim.clearIncidents();
  for (let i = 0; i < 1400; i++) {
    sim.step();
    separated(sim);
  }
  assert.ok(sim.exited > 0);
  assert.ok(sim.entered > 5);
  assert.equal(sim.arrived, 180);
});
test("continuous arrivals also work on retained closed-road layouts", () => {
  for (const layout of ["circle", "rectangle", "figure8"]) {
    const s = new Simulation(
      config({ layout, interval: 10, intersection: "lights" }),
    );
    s.advance(80);
    assert.equal(s.arrived, 8);
    assert.ok(s.entered > 0);
    assert.ok(s.exited > 0, layout);
    assert.equal(s.stats.completedLaps, 0);
    conservation(s);
  }
});
test("finite road neighbors and separate junction approaches never wrap or follow cross traffic", () => {
  const s = new Simulation(config({ layout: "cross", interval: 60 }));
  s.step();
  const a = s.cars[0];
  Object.assign(a, { approach: 0, q: 0.99 });
  const other = { ...a, id: 99, approach: 1, q: 0.991 };
  s.cars.push(other);
  assert.equal(s.neighbors(a, a.lane).front, null);
  other.approach = 0;
  other.q = 0.01;
  assert.equal(s.neighbors(a, a.lane).front, null);
  assert.equal(s.neighbors(a, a.lane).rear, other);
  assert.ok(s.forward(0.99, 0.01, 0) < 0);
});
test("all open junction modes maintain right of way, separation, balanced arrivals, and exits", () => {
  for (const intersection of ["stop", "lights", "roundabout"])
    for (const lanes of [1, 3]) {
      const s = new Simulation(
        config({ layout: "cross", intersection, lanes, interval: 5 }),
      );
      const approaches = new Set();
      for (let i = 0; i < 2200; i++) {
        s.step();
        for (const c of s.cars) {
          approaches.add(c.approach);
          if (s.route.inside(c.q))
            assert.ok(
              s.junction.reservations.has(c.id),
              `${intersection}: unreserved crossing`,
            );
        }
        const permits = [...s.junction.reservations.values()];
        if (intersection === "lights")
          assert.ok(new Set(permits.map((p) => p.axis)).size <= 1);
        else assert.ok(permits.length <= 1);
        separated(s);
      }
      assert.equal(approaches.size, 4);
      assert.ok(s.exited > 0, `${intersection}: no exits`);
      assert.ok(s.junction.crossings > 3);
      assert.equal(s.arrived, 22);
    }
});
test("open-road geometry has distinct endpoints, four cross approaches, and a 40 m junction", () => {
  for (const layout of ["u", "cross"])
    for (const control of ["stop", "lights", "roundabout"]) {
      const route = getRoute(layout, control);
      assert.equal(route.closed, false);
      for (let a = 0; a < route.approaches; a++) {
        const start = route.sample(0, a),
          end = route.sample(1, a);
        assert.ok(Math.hypot(start.x - end.x, start.y - end.y) > 1);
        assert.deepEqual(route.sample(1.1, a), end);
        assert.deepEqual(route.sample(-0.1, a), start);
      }
      if (layout === "cross") {
        assert.equal(route.entries.length, 4);
        assert.ok(
          Math.abs((route.entries[0].exitQ - route.entries[0].q) * 1000 - 40) <
            1e-8,
        );
      }
    }
});
test("pointer hits identify the approach and lane of open roads on phone and desktop", () => {
  for (const layout of ["u", "cross"])
    for (const width of [360, 800])
      for (const lanes of [1, 3, 5]) {
        const s = new Simulation(config({ layout, lanes }));
        const v = new RoadView({
          getBoundingClientRect: () => ({ width, height: 680 }),
        });
        for (let a = 0; a < s.route.approaches; a++)
          for (const q of [0.15, 0.8])
            for (let lane = 0; lane < lanes; lane++) {
              const p = v.point(q, lane, s, a),
                hit = v.roadLocation(p.x, p.y, s);
              assert.ok(hit);
              assert.equal(hit.lane, lane, `${layout} ${width} lane ${lane}`);
              assert.equal(hit.approach, a);
              assert.ok(Math.abs(hit.q - q) < 0.002);
            }
      }
});
test("open-junction obstacles affect only the selected approach and exclude the center", () => {
  const s = new Simulation(config({ layout: "cross" }));
  assert.equal(s.addObstacle(0.5, 0, 0), false);
  assert.ok(s.addObstacle(0.2, 0, 2));
  s.step();
  const car = s.cars[0];
  Object.assign(car, { q: 0.1, lane: 0, target: null, approach: 0 });
  assert.equal(s.neighbors(car, 0).front, null);
  car.approach = 2;
  assert.equal(s.neighbors(car, 0).front?.id, "o1");
});
test("a blocked preferred lane or entrance leaves other lanes and entrances available", () => {
  const u = new Simulation(config({ probabilities: { hog: 100 } }));
  assert.ok(u.addObstacle(0.001, 0));
  u.step();
  assert.equal(u.cars.length, 1);
  assert.equal(u.cars[0].lane, 1);
  const cross = new Simulation(config({ layout: "cross", interval: 1 }));
  for (let lane = 0; lane < 2; lane++)
    assert.ok(cross.addObstacle(0.001, lane, 0));
  cross.advance(30);
  assert.ok(cross.pending[0].length > 0);
  assert.ok(cross.cars.some((c) => c.approach !== 0));
  assert.ok(cross.entered > 0);
  conservation(cross);
  const car = u.cars[0];
  car.q = 0.002;
  assert.equal(
    u.safeLane(car, 0),
    false,
    "an obstacle just behind still occupies physical merge space",
  );
});
