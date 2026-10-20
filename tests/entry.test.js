import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, PRESETS, STEP } from "../src/model.js";
const setup = (extra) => ({
  ...PRESETS.stream,
  probabilities: { regular: 100 },
  interval: 60,
  ...extra,
});
function enqueue(sim, type = "regular") {
  const id = sim.nextCar++;
  sim.pending[0].push({ id, type, approach: 0 });
  sim.arrived++;
  return id;
}
function conservation(sim) {
  assert.equal(sim.arrived, sim.entered + sim.stats.upstream);
  assert.equal(sim.entered, sim.cars.length + sim.exited);
}
test("arrivals use a clear lane instead of spawning behind a slower driver", () => {
  const sim = new Simulation(setup());
  sim.step();
  const leader = sim.cars[0];
  Object.assign(leader, { q: 0.03, v: 70 / 3.6 });
  const id = enqueue(sim);
  sim.inflow();
  const car = sim.cars.find((c) => c.id === id);
  assert.equal(car.lane, 0);
  assert.equal(car.v * 3.6, 90);
  assert.equal(leader.v * 3.6, 70);
  conservation(sim);
});
test("the preferred right lane remains preferred when it has ample room", () => {
  const sim = new Simulation(setup());
  sim.step();
  sim.cars[0].q = 0.5;
  const id = enqueue(sim);
  sim.inflow();
  const car = sim.cars.find((c) => c.id === id);
  assert.equal(car.lane, 1);
  assert.ok(car.v * 3.6 > 89);
  conservation(sim);
});
test("a distant stopped vehicle does not force every arrival to enter at zero speed", () => {
  const sim = new Simulation(setup({ lanes: 1 }));
  sim.step();
  Object.assign(sim.cars[0], { q: 0.5, v: 0 });
  const id = enqueue(sim);
  sim.inflow();
  assert.ok(sim.cars.find((c) => c.id === id).v * 3.6 > 70);
  conservation(sim);
});
test("entry speeds fit the actual gap and newborn perception never invents a shorter one", () => {
  for (const reaction of [0, 0.9, 2]) {
    const sim = new Simulation(setup({ lanes: 1, reaction }));
    sim.advance(2);
    const id = enqueue(sim);
    sim.inflow();
    const car = sim.cars.find((c) => c.id === id);
    const speed = car.v;
    assert.ok(speed > 20 && speed < 25);
    sim.step();
    assert.ok(car.a >= -1e-6, `${reaction}: invented braking ${car.a}`);
    assert.ok(car.v >= speed - 1e-6);
    conservation(sim);
  }
});
test("all-Regular startup no longer manufactures hard braking in the first 30 metres", () => {
  for (const reaction of [0, 0.9, 2]) {
    const sim = new Simulation(setup({ interval: 2, reaction }));
    const entryLanes = new Set();
    for (let i = 0; i < 300; i++) {
      sim.step();
      for (const car of sim.cars) {
        if (car.distance < 2) entryLanes.add(car.lane);
        if (car.distance < 30) {
          assert.ok(
            car.a > -0.6,
            `${reaction}: entry brake ${car.a} at ${car.distance}m`,
          );
          assert.equal(car.safety, false);
        }
        for (const lane of car.target === null
          ? [car.lane]
          : [car.lane, car.target])
          assert.ok(sim.neighbors(car, lane).gap >= 0.49);
      }
      conservation(sim);
    }
    assert.equal(sim.entered, 8);
    assert.equal(entryLanes.size, 2);
  }
});
test("newborns still have reaction delay for a hazard that appears after entry", () => {
  const sim = new Simulation(setup({ lanes: 1, reaction: 0.9 }));
  sim.step();
  const car = sim.cars[0];
  assert.ok(sim.addObstacle(0.09, 0));
  for (let i = 0; i < 16; i++) {
    sim.step();
    assert.ok(Math.abs(car.a) < 1e-8, `reacted before delay at ${sim.time}`);
  }
  sim.advance(0.4);
  assert.ok(car.a < -0.5);
});
test("closed-road entries wait rather than cut in front of a nearby fast rear car", () => {
  const sim = new Simulation(setup({ layout: "circle", lanes: 1 }));
  sim.step();
  sim.cars[0].q = 0.98;
  const id = enqueue(sim);
  sim.inflow();
  assert.equal(
    sim.cars.some((c) => c.id === id),
    false,
  );
  assert.equal(sim.stats.upstream, 1);
  sim.cars[0].q = 0.8;
  sim.inflow();
  assert.ok(sim.cars.some((c) => c.id === id));
  conservation(sim);
});
test("entry-time observations expire and are cleared on exit and reset", () => {
  const sim = new Simulation(setup({ reaction: 0.9 }));
  sim.step();
  assert.equal(sim.entryObservations.size, 1);
  sim.advance(1.1);
  assert.equal(sim.entryObservations.size, 0);
  sim.reset(setup());
  sim.step();
  sim.cars[0].q = sim.cars[0].travelled = 0.99999;
  sim.step();
  assert.equal(sim.cars.length, 0);
  assert.equal(sim.entryObservations.size, 0);
  sim.reset(setup());
  assert.equal(sim.entryObservations.size, 0);
  conservation(sim);
});
