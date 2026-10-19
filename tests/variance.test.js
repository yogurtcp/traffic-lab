import test from "node:test";
import assert from "node:assert/strict";
import {
  Simulation,
  PRESETS,
  KEYS,
  PERSONALITIES,
  STEP,
  normalizeConfig,
} from "../src/model.js";
import { ReplayBuffer } from "../src/replay.js";
import {
  parseSpeedVariance,
  resolveExperiment,
  ExperimentRunner,
} from "../scripts/lib/experiment.mjs";
const setup = (extra = {}) => ({
  ...PRESETS.perfect,
  lanes: 1,
  length: 2000,
  counts: { regular: 1 },
  speedVariance: { regular: 10 },
  ...extra,
});

test("variance defaults to zero, normalizes bounds, and produces steady legacy targets", () => {
  const config = normalizeConfig({
    speedVariance: { regular: 99, slowpoke: -5, eco: NaN },
  });
  assert.equal(config.speedVariance.regular, 20);
  assert.equal(config.speedVariance.slowpoke, 0);
  assert.equal(config.speedVariance.eco, 0);
  const sim = new Simulation(setup({ speedVariance: {} }));
  const car = sim.cars[0];
  for (let t = 0; t < 100; t++)
    assert.equal(sim.desiredSpeed(car, t) * 3.6, 90);
  sim.advance(60);
  assert.equal(car.v * 3.6, 90);
});
test("an unimpeded car drifts above and below its base with continuous targets and bounded acceleration", () => {
  const sim = new Simulation(setup());
  const car = sim.cars[0],
    speeds = [],
    targets = [];
  let previousTarget = sim.desiredSpeed(car),
    previousSpeed = car.v;
  for (let i = 0; i < 2400; i++) {
    sim.step();
    const target = sim.desiredSpeed(car);
    assert.ok(target * 3.6 >= 80 && target * 3.6 <= 100);
    assert.ok(Math.abs(target - previousTarget) < 0.1);
    assert.ok(
      car.v - previousSpeed <= PERSONALITIES.regular.accel * STEP + 1e-8,
    );
    assert.ok(previousSpeed - car.v <= 8 * STEP + 1e-8);
    assert.ok(car.v * 3.6 >= 80 - 1e-8 && car.v * 3.6 <= 100 + 1e-8);
    assert.equal(car.safety, false);
    speeds.push(car.v * 3.6);
    targets.push(target * 3.6);
    previousTarget = target;
    previousSpeed = car.v;
  }
  assert.ok(Math.min(...speeds) < 86);
  assert.ok(Math.max(...speeds) > 94);
});
test("cars drift independently, repeat with the seed, and reset exactly", () => {
  const config = setup({ counts: { regular: 2 } });
  const a = new Simulation(config),
    b = new Simulation(config);
  const first = a.cars[0],
    second = a.cars[1];
  assert.notEqual(a.desiredSpeed(first), a.desiredSpeed(second));
  a.advance(20);
  b.advance(20);
  assert.deepEqual(a.cars, b.cars);
  a.reset(config);
  a.advance(20);
  assert.deepEqual(a.cars, b.cars);
  const otherSeed = new Simulation({ ...config, seed: 43 });
  assert.notEqual(
    otherSeed.desiredSpeed(otherSeed.cars[0], 20),
    a.desiredSpeed(a.cars[0]),
  );
});
test("variance does not consume the personality or entrance random sequence", () => {
  const run = (speedVariance) => {
    const sim = new Simulation({
      ...PRESETS.crossing,
      interval: 0.2,
      speedVariance,
    });
    for (let approach = 0; approach < 4; approach++)
      for (let lane = 0; lane < 2; lane++)
        assert.ok(sim.addObstacle(0.001, lane, approach));
    sim.advance(20);
    return sim;
  };
  const a = run({}),
    b = run(Object.fromEntries(KEYS.map((k) => [k, 20])));
  assert.equal(a.arrived, 100);
  assert.deepEqual(a.pending, b.pending);
});
test("individual overrides preserve the run, keep other cars unchanged, and replay historical targets", () => {
  const sim = new Simulation(setup({ counts: { regular: 2 } }));
  const recording = new ReplayBuffer();
  sim.advance(2);
  recording.capture(sim);
  const before = recording.at(2),
    id = sim.cars[0].id;
  const time = sim.time;
  assert.equal(sim.setSpeedVariance(id, 3), true);
  assert.equal(sim.time, time);
  assert.equal(sim.cars[1].speedVariance, 10);
  sim.advance(1);
  recording.capture(sim);
  assert.equal(before.cars[0].speedVariance, 10);
  assert.equal(recording.at(3).cars[0].speedVariance, 3);
  assert.equal(
    before.desiredSpeed(before.cars[0]),
    new Simulation(setup()).desiredSpeed({ ...before.cars[0] }, before.time),
  );
  assert.equal(sim.setSpeedVariance(999, 5), false);
  assert.equal(sim.setSpeedVariance(id, -1), false);
  assert.equal(sim.setSpeedVariance(id, NaN), false);
  // Tightening a range must decelerate physically, not clip actual speed.
  sim.cars[0].v = 99 / 3.6;
  sim.setSpeedVariance(id, 0);
  const v = sim.cars[0].v;
  sim.step();
  assert.ok(v - sim.cars[0].v <= 8 * STEP + 1e-8);
});
test("maximum variance preserves separation on loops and all open junction controls", () => {
  const mixes = Object.fromEntries(KEYS.map((k) => [k, 20]));
  const configs = [
    setup({
      lanes: 3,
      length: 600,
      counts: PRESETS.mixed.counts,
      speedVariance: mixes,
    }),
    {
      ...PRESETS.stream,
      length: 600,
      interval: 0.5,
      reaction: 2,
      speedVariance: mixes,
    },
    ...["stop", "lights", "roundabout"].map((intersection) => ({
      ...PRESETS.crossing,
      lanes: 3,
      length: 600,
      interval: 0.5,
      reaction: 2,
      intersection,
      speedVariance: mixes,
    })),
  ];
  for (const config of configs) {
    const sim = new Simulation(config);
    for (let i = 0; i < 600; i++) {
      sim.step();
      for (const car of sim.cars) {
        assert.ok(
          Number.isFinite(car.v) && car.v >= 0 && car.v * 3.6 <= 160 + 1e-8,
        );
        for (const lane of car.target === null
          ? [car.lane]
          : [car.lane, car.target])
          assert.ok(
            sim.neighbors(car, lane).gap >= 0.49,
            `${config.layout}: car ${car.id}`,
          );
      }
    }
  }
});
test("CLI validates variance mixes and applies timed individual overrides", () => {
  assert.equal(parseSpeedVariance("regular=5,slowpoke=3").regular, 5);
  assert.throws(() => parseSpeedVariance("regular=21"), /speed variance/);
  assert.throws(() => parseSpeedVariance("regular="), /speed variance/);
  assert.throws(() => parseSpeedVariance("racer=5"), /driver type/);
  assert.throws(
    () => resolveExperiment({ config: { speedVariance: { regular: -1 } } }),
    /speed variance/,
  );
  const experiment = resolveExperiment(
    { events: [{ at: 1, type: "speed-variance", car: 1, value: 8 }] },
    { cars: "regular=1", "speed-variance": "regular=5" },
  );
  assert.equal(experiment.config.speedVariance.regular, 5);
  const runner = new ExperimentRunner(experiment);
  runner.advanceTo(2);
  assert.equal(runner.sim.cars[0].speedVariance, 8);
  assert.equal(runner.eventResults[0].applied, true);
  assert.throws(
    () =>
      resolveExperiment({
        events: [{ at: 1, type: "speed-variance", car: 1, value: 21 }],
      }),
    /speed variance/,
  );
});
