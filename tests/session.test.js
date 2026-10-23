import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, PRESETS } from "../src/model.js";
import { ReplayBuffer } from "../src/replay.js";
import { indexedDB } from "fake-indexeddb";
import { webcrypto } from "node:crypto";

test("an upgrade checkpoint preserves RNG, reaction history, incidents, queues and future traffic", () => {
  const live = new Simulation({
    ...PRESETS.crossing,
    interval: 0.5,
    speedVariance: { regular: 10 },
  });
  live.addObstacle(0.02, 0, 0);
  live.addObstacle(0.02, 1, 0);
  live.advance(35);
  live.brakeCar(live.cars[0].id);
  const restored = Simulation.fromState(structuredClone(live.exportState()));
  assert.deepEqual(restored.cars, live.cars);
  assert.deepEqual(restored.history, live.history);
  assert.deepEqual(restored.pending, live.pending);
  assert.deepEqual(restored.entryObservations, live.entryObservations);
  assert.deepEqual(restored.junction.reservations, live.junction.reservations);
  live.advance(15);
  restored.advance(15);
  assert.deepEqual(restored.cars, live.cars);
  assert.deepEqual(restored.pending, live.pending);
  assert.deepEqual(restored.stats, live.stats);
  assert.deepEqual(restored.junction.reservations, live.junction.reservations);
});
test("checkpoints preserve a moving lane change and courtesy intent", () => {
  const sim = new Simulation({
    ...PRESETS.perfect,
    lanes: 2,
    counts: { regular: 2 },
  });
  const c = sim.cars[0];
  c.target = 1;
  c.from = c.lane = 0;
  c.blend = 0.4;
  sim.cars[1].yieldFor = c.id;
  sim.cars[1].yieldStopDistance = 400;
  const restored = Simulation.fromState(structuredClone(sim.exportState()));
  assert.equal(restored.cars[0].blend, 0.4);
  assert.equal(restored.cars[1].yieldFor, c.id);
  assert.equal(restored.cars[1].yieldStopDistance, 400);
});
test("replay survives a structured-clone upgrade and remains isolated from the live model", () => {
  const live = new Simulation(PRESETS.stream),
    replay = new ReplayBuffer();
  replay.capture(live);
  for (let i = 0; i < 200; i++) {
    live.step();
    replay.capture(live);
  }
  const packet = structuredClone({
    live: live.exportState(),
    replay: replay.exportState(),
  });
  const next = Simulation.fromState(packet.live),
    recording = ReplayBuffer.fromState(packet.replay, next);
  assert.equal(recording.frames.length, replay.frames.length);
  for (const t of [0, 2, 8, 10]) {
    assert.deepEqual(recording.at(t).cars, replay.at(t).cars);
    assert.deepEqual(recording.at(t).stats, replay.at(t).stats);
    assert.equal(
      recording.at(t).junction.label(t),
      replay.at(t).junction.label(t),
    );
  }
  next.advance(3);
  assert.deepEqual(recording.at(8).cars, replay.at(8).cars);
});
test("IndexedDB handoffs round-trip Maps and infinite gaps independently for each window", async () => {
  globalThis.indexedDB = indexedDB;
  globalThis.crypto = webcrypto;
  globalThis.location = { href: "https://example.com/traffic-lab/" };
  const storage = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  const { saveHandoff, readHandoff, clearHandoff } = await import(
    "../src/handoff.js"
  );
  await saveHandoff({ schema: 1, values: new Map([[1, Infinity]]), draft: "" });
  const first = await readHandoff();
  assert.equal(first.values.get(1), Infinity);
  assert.equal(first.draft, "");
  const firstKey = new Map(storage);
  storage.clear();
  assert.equal(await readHandoff(), undefined);
  await saveHandoff({ second: true });
  storage.clear();
  for (const [k, v] of firstKey) storage.set(k, v);
  assert.deepEqual(await readHandoff(), first);
  await clearHandoff();
  assert.equal(await readHandoff(), undefined);
  delete globalThis.indexedDB;
  delete globalThis.sessionStorage;
  delete globalThis.location;
});
