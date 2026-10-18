import test from "node:test";
import assert from "node:assert/strict";
import {
  Simulation,
  PRESETS,
  normalizeConfig,
  STEP,
  CAR_LENGTH,
} from "../src/model.js";
import { getRoute } from "../src/route.js";
import { RoadView } from "../src/view.js";

const setup = (intersection = "stop", extra = {}) =>
  new Simulation({ ...PRESETS.junction, intersection, ...extra });
function atLine(sim, car, entry, extraGap = 2) {
  Object.assign(car, {
    q: entry.q - (CAR_LENGTH / 2 + 1 + extraGap) / sim.laneLength(car.lane),
    v: 0,
    cooldown: 100,
  });
}
function safe(sim) {
  const axes = new Set(
    [...sim.junction.reservations.values()].map((p) => p.axis),
  );
  if (sim.config.intersection === "lights") assert.ok(axes.size <= 1);
  else assert.ok(sim.junction.reservations.size <= 1);
  for (const car of sim.cars) {
    assert.ok(Number.isFinite(car.v) && car.v >= 0);
    if (sim.route.inside(car.q))
      assert.ok(
        sim.junction.reservations.has(car.id),
        "a car entered without right of way",
      );
    for (const lane of car.target === null
      ? [car.lane]
      : [car.lane, car.target])
      assert.ok(sim.neighbors(car, lane).gap >= 0.49, "cars overlap");
  }
}
test("saved setups default to a circle and normalize unknown layouts and controls", () => {
  assert.equal(normalizeConfig(PRESETS.mixed).layout, "circle");
  assert.equal(
    normalizeConfig({ layout: "bad", intersection: "bad" }).layout,
    "circle",
  );
  assert.equal(
    normalizeConfig({ layout: "bad", intersection: "bad" }).intersection,
    "stop",
  );
});
test("every road is a continuous closed path with smooth wraparound", () => {
  for (const layout of ["circle", "rectangle", "figure8"])
    for (const intersection of ["stop", "lights", "roundabout"]) {
      const route = getRoute(layout, intersection),
        a = route.sample(0),
        b = route.sample(1 - 1e-6);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.001);
      assert.ok(Math.cos(a.heading - b.heading) > 0.995);
      for (let q = 0; q < 1; q += 0.01) {
        const p = route.sample(q);
        assert.ok(
          Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            Number.isFinite(p.heading),
        );
      }
    }
});
test("the four-arm loop has four separated approaches and rounded rectangles have no sharp corners", () => {
  const route = getRoute("figure8");
  assert.equal(route.entries.length, 4);
  assert.deepEqual(
    route.entries.map((e) => e.axis),
    [0, 1, 0, 1],
  );
  for (let i = 0; i < 3; i++)
    assert.ok(
      Math.abs(route.entries[i + 1].q - route.entries[i].q - 0.25) < 1e-6,
    );
  const rect = getRoute("rectangle");
  for (let q = 0; q < 1; q += 0.001)
    assert.ok(
      Math.cos(rect.sample(q).heading - rect.sample(q + 0.001).heading) > 0.98,
    );
});
test("throughput counts full travelled laps repeatedly, excluding an initial partial gate crossing", () => {
  const sim = new Simulation({
    ...PRESETS.perfect,
    lanes: 1,
    counts: { regular: 1 },
    reaction: 0,
  });
  sim.cars[0].q = 0.98;
  sim.advance(2);
  assert.ok(sim.cars[0].q < 0.1);
  assert.equal(sim.laps, 0);
  sim.advance(38);
  assert.equal(sim.laps, 1);
  sim.advance(40);
  assert.equal(sim.laps, 2);
  assert.equal(sim.cars[0].laps, 2);
  assert.equal(sim.stats.completedLaps, 2);
  assert.ok(Math.abs(sim.stats.throughputPerMinute - 1.5) < 1e-8);
  sim.reset(PRESETS.junction);
  assert.equal(sim.laps, 0);
});
test("figure-eight spawns evenly along usable road while keeping the junction clear", () => {
  const sim = setup("stop", { lanes: 3, counts: { regular: 30 } });
  assert.ok(sim.cars.every((c) => !sim.route.inside(c.q) && c.v === 0));
  safe(sim);
  for (const entry of sim.route.entries)
    assert.equal(sim.addObstacle((entry.q + entry.exitQ) / 2, 0), false);
  const short = setup("stop", {
    lanes: 5,
    length: 600,
    counts: { regular: 100 },
  });
  safe(short);
  assert.throws(
    () => setup("stop", { lanes: 1, length: 600, counts: { regular: 100 } }),
    /Too many cars/,
  );
});
test("pointer placement finds the correct lane on every layout at desktop and phone widths", () => {
  for (const layout of ["circle", "rectangle", "figure8"])
    for (const width of [360, 800])
      for (const lanes of [1, 3, 5]) {
        const sim = setup("stop", { layout, lanes, counts: { regular: 1 } });
        const view = new RoadView({
          getBoundingClientRect: () => ({ width, height: 510 }),
        });
        for (const q of [0.08, 0.16, 0.38, 0.64, 0.87]) {
          if (sim.route.inside(q)) continue;
          for (let lane = 0; lane < lanes; lane++) {
            const p = view.point(q, lane, sim),
              hit = view.roadLocation(p.x, p.y, sim);
            assert.ok(hit, `${layout} must accept a point on the road`);
            assert.equal(hit.lane, lane, `${layout}, ${width}px, lane ${lane}`);
            assert.ok(
              Math.min(Math.abs(hit.q - q), 1 - Math.abs(hit.q - q)) < 0.002,
            );
          }
        }
      }
});
test("all-way stops require a full stop and dwell before granting entry", () => {
  const sim = setup("stop", { counts: { regular: 1 } }),
    car = sim.cars[0];
  atLine(sim, car, sim.route.entries[0]);
  sim.history = Array.from({ length: 43 }, () => sim.snapshot());
  sim.advance(1.85);
  assert.equal(sim.junction.reservations.size, 0);
  sim.advance(0.25);
  assert.equal(sim.junction.reservations.has(car.id), true);
});
test("all-way stops serve the earliest stopped car first", () => {
  const sim = setup("stop", { reaction: 0, counts: { regular: 2 } }),
    [first, second] = sim.cars;
  atLine(sim, first, sim.route.entries[0]);
  second.q = 0.4;
  sim.junction.update(sim);
  sim.time = 0.2;
  atLine(sim, second, sim.route.entries[1]);
  sim.junction.update(sim);
  sim.time = 1.1;
  sim.junction.update(sim);
  assert.equal(sim.junction.reservations.has(first.id), true);
  assert.equal(sim.junction.reservations.has(second.id), false);
});
test("lights alternate directions with amber and all-red clearance", () => {
  const junction = setup("lights").junction;
  assert.deepEqual(
    [0, 12, 14, 15, 27, 29, 30].map((t) => [
      junction.signal(t).axis,
      junction.signal(t).stage,
    ]),
    [
      [0, "green"],
      [0, "amber"],
      [0, "red"],
      [1, "green"],
      [1, "amber"],
      [1, "red"],
      [0, "green"],
    ],
  );
});
test("roundabouts allow a rolling entry while all-way stops require stopping", () => {
  for (const mode of ["stop", "roundabout"]) {
    const sim = setup(mode, { counts: { regular: 1 } }),
      car = sim.cars[0];
    atLine(sim, car, sim.route.entries[0], 7);
    car.v = 3;
    sim.junction.update(sim);
    assert.equal(sim.junction.reservations.has(car.id), mode === "roundabout");
  }
});
test("all intersection modes sustain crossings without conflicting reservations or overlaps", () => {
  for (const intersection of ["stop", "lights", "roundabout"])
    for (const lanes of [1, 3]) {
      const sim = setup(intersection, {
        lanes,
        counts: { regular: 10, stuntman: 2, slowpoke: 2 },
      });
      for (let i = 0; i < 1500; i++) {
        sim.step();
        if (i % 5 === 0) safe(sim);
      }
      assert.ok(
        sim.junction.crossings > 1,
        `${intersection}, ${lanes} lanes must keep moving`,
      );
      assert.ok(sim.cars.some((c) => c.travelled > 0.1));
    }
});
test("a blocked junction retains right of way until the broken car is repaired and clears", () => {
  const sim = setup("roundabout", { counts: { regular: 2 } }),
    car = sim.cars[0];
  atLine(sim, car, sim.route.entries[0], 5);
  sim.junction.update(sim);
  assert.ok(sim.junction.reservations.has(car.id));
  sim.breakCar(car.id);
  sim.advance(5);
  assert.equal(sim.junction.reservations.size, 1);
  assert.ok(sim.junction.reservations.has(car.id));
  sim.repairCar(car.id);
  sim.advance(40);
  assert.ok(sim.junction.crossings >= 1);
  safe(sim);
});
