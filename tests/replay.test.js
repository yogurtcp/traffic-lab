import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, PRESETS } from "../src/model.js";
import { ReplayBuffer } from "../src/replay.js";

const config = { ...PRESETS.stream, probabilities: { regular: 100 } };
function advance(sim, recording, seconds) {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    sim.step();
    recording.capture(sim);
  }
}
test("replay preserves car state, incidents, counters and charts at their original times", () => {
  const sim = new Simulation(config),
    recording = new ReplayBuffer();
  recording.capture(sim);
  advance(sim, recording, 3);
  sim.brakeCar(1);
  sim.addObstacle(0.8, 0);
  recording.capture(sim, true);
  const incident = recording.at(3);
  advance(sim, recording, 3);
  sim.clearIncidents();
  recording.capture(sim, true);
  advance(sim, recording, 4);
  const before = recording.at(2);
  assert.equal(before.events.length, 0);
  assert.equal(before.obstacles.length, 0);
  assert.equal(before.cars[0].brakeUntil, 0);
  assert.equal(incident.events.length, 2);
  assert.equal(incident.obstacles.length, 1);
  assert.ok(Math.abs(incident.cars[0].brakeUntil - 6) < 1e-8);
  assert.equal(recording.at(6).obstacles.length, 0);
  assert.equal(recording.at(6).cars[0].brakeUntil, 0);
  assert.ok(before.cars[0].q < incident.cars[0].q);
  assert.equal(before.stats.entered, 1);
  assert.ok(incident.stats.entered > before.stats.entered);
  assert.ok(before.samples.every((s) => s.time <= before.time));
  assert.equal(before.neighbors(before.cars[0], 1).front, null);
  assert.equal(recording.at(0).cars.length, 0);
});
test("recording and seeking leave the live run and future seeded arrivals unchanged", () => {
  const live = new Simulation(config),
    control = new Simulation(config),
    recording = new ReplayBuffer();
  recording.capture(live);
  advance(live, recording, 15);
  control.advance(15);
  const state = JSON.stringify(live.cars);
  for (let t = 0; t < 15; t += 0.1) {
    const frame = recording.at(t);
    assert.ok(Number.isFinite(frame.stats.average));
  }
  assert.equal(JSON.stringify(live.cars), state);
  assert.deepEqual(live.cars, control.cars);
  live.advance(10);
  control.advance(10);
  assert.deepEqual(live.cars, control.cars);
  assert.deepEqual(live.pending, control.pending);
  assert.equal(recording.at(15).time, recording.end);
});
test("replay keeps junction waiting and light phases from the recorded instant", () => {
  const sim = new Simulation({ ...PRESETS.crossing }),
    recording = new ReplayBuffer();
  sim.junction.arrivals.set(1, { time: 0, entry: 0 });
  recording.capture(sim);
  const first = recording.at(0);
  sim.junction.arrivals.clear();
  advance(sim, recording, 16);
  assert.equal(first.junction.arrivals.size, 1);
  assert.match(first.junction.label(first.time), /East–west green/);
  assert.match(recording.at(16).junction.label(16), /North–south green/);
});
test("replay retention is bounded, supports fixed roads, and clamps seeks at either end", () => {
  const sim = new Simulation({ ...PRESETS.perfect, counts: { regular: 1 } });
  const recording = new ReplayBuffer(2);
  recording.capture(sim);
  advance(sim, recording, 5);
  assert.ok(recording.frames.length <= 22);
  assert.ok(recording.start >= 2.9 - 1e-8);
  assert.ok(recording.end - recording.start <= 2.1);
  assert.equal(recording.at(-100), recording.frames[0]);
  assert.equal(recording.at(100), recording.frames.at(-1));
  assert.equal(recording.at(4).stats.completedTrips, 0);
  assert.equal(new ReplayBuffer().at(0), null);
});

test("replay throughput follows the recorded time for exits and repeat laps", () => {
  for (const setup of [
    { ...config, length: 600, interval: 60 },
    { ...PRESETS.perfect, length: 600, counts: { regular: 1 } },
  ]) {
    const sim = new Simulation(setup),
      recording = new ReplayBuffer();
    recording.capture(sim);
    advance(sim, recording, 60);
    const before = recording.at(10),
      after = recording.at(60);
    assert.equal(before.stats.throughputPerMinute, 0);
    const count = sim.stream
      ? after.stats.completedTrips
      : after.stats.completedLaps;
    assert.ok(count > 0);
    assert.equal(after.stats.throughputPerMinute, (count * 60) / after.time);
    assert.equal(before.stats.throughputPerMinute, 0);
  }
});
