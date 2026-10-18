import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseCars,
  resolveExperiment,
  ExperimentRunner,
} from "../scripts/lib/experiment.mjs";

test("CLI car mixes use exact counts and reject unknown or malformed driver types", () => {
  const cars = parseCars("regular=20,slowpoke=4,stuntman=2");
  assert.equal(cars.regular, 20);
  assert.equal(cars.stuntman, 2);
  assert.equal(cars.eco, 0);
  assert.throws(() => parseCars("regular=-2"), /count/);
  assert.throws(() => parseCars("racecar=2"), /Invalid driver/);
  assert.throws(() => parseCars("regular=2=3"), /Invalid driver/);
});
test("CLI options override scenario settings and preserve unspecified values", () => {
  const e = resolveExperiment(
    {
      config: { layout: "figure8", seed: 75, counts: { regular: 10 } },
      duration: 60,
    },
    { intersection: "lights", lanes: "2", cars: "stuntman=3", speed: "6" },
  );
  assert.equal(e.config.layout, "figure8");
  assert.equal(e.config.intersection, "lights");
  assert.equal(e.config.seed, 75);
  assert.equal(e.config.lanes, 2);
  assert.equal(e.config.counts.regular, 0);
  assert.equal(e.config.counts.stuntman, 3);
  assert.equal(e.duration, 60);
  assert.equal(e.speed, 6);
});
test("CLI refuses invalid physics, rendering settings, and intervention times", () => {
  for (const options of [
    { layout: "triangle" },
    { lanes: "9" },
    { duration: "NaN" },
    { fps: "0" },
    { width: "641" },
    { cars: "regular=180,stuntman=2" },
  ])
    assert.throws(() => resolveExperiment({}, options));
  assert.throws(
    () =>
      resolveExperiment({ duration: 10, events: [{ at: 11, type: "clear" }] }),
    /time/,
  );
  assert.throws(
    () =>
      resolveExperiment({
        duration: 1.01,
        events: [{ at: 1.01, type: "clear" }],
      }),
    /time/,
  );
  assert.throws(() => resolveExperiment({ events: {} }), /array/);
  assert.throws(
    () =>
      resolveExperiment({
        events: [{ at: 1, type: "obstacle", q: 0.5, lane: 6 }],
      }),
    /lane/,
  );
});
test("scripted interventions run at deterministic simulation ticks", () => {
  const e = resolveExperiment({
    config: { lanes: 1, counts: { regular: 1 } },
    duration: 4,
    events: [{ at: 0.55, type: "brake", car: 1, duration: 0.5 }],
  });
  const a = new ExperimentRunner(e),
    b = new ExperimentRunner(e);
  a.advanceTo(4);
  b.advanceTo(1);
  b.advanceTo(4);
  assert.deepEqual(a.report(), b.report());
  assert.equal(a.eventResults[0].actualTime, 0.55);
  assert.equal(a.eventResults[0].applied, true);
  assert.equal(a.metrics.length, 5);
});
test("scripted obstacles use one-based lane numbers and support remove, breakdown, and repair", () => {
  const runner = new ExperimentRunner(
    resolveExperiment({
      config: { lanes: 2, counts: { regular: 2 } },
      duration: 4,
      events: [
        { at: 0, type: "obstacle", lane: 2, q: 0.3 },
        { at: 1, type: "breakdown", car: 1 },
        { at: 2, type: "repair", car: 1 },
        { at: 3, type: "remove-obstacle", id: "o1" },
      ],
    }),
  );
  assert.equal(runner.sim.obstacles[0].lane, 1);
  runner.advanceTo(4);
  assert.equal(runner.sim.obstacles.length, 0);
  assert.equal(runner.sim.cars[0].broken, false);
  assert.ok(runner.eventResults.every((e) => e.applied));
});
test("occupied obstacle placements are reported as skipped instead of silently claimed", () => {
  const runner = new ExperimentRunner(
    resolveExperiment({
      config: { lanes: 1, counts: { regular: 1 } },
      events: [{ at: 0, type: "obstacle", lane: 1, q: 0 }],
    }),
  );
  assert.equal(runner.eventResults[0].applied, false);
  assert.match(runner.eventResults[0].reason, /occupied/);
  assert.equal(runner.sim.obstacles.length, 0);
});
test("events referring to nonexistent cars fail before a run starts", () => {
  assert.throws(
    () =>
      new ExperimentRunner(
        resolveExperiment({
          config: { counts: { regular: 1 } },
          events: [{ at: 0, type: "brake", car: 2 }],
        }),
      ),
    /not in this experiment/,
  );
});
test("the CLI runs without video and protects an existing result from overwriting", () => {
  const directory = mkdtempSync(join(tmpdir(), "loop-cli-test-")),
    output = join(directory, "run.json");
  const command = [
    "scripts/simulate.mjs",
    "--no-video",
    "--cars",
    "regular=1",
    "--lanes",
    "1",
    "--duration",
    "80",
    "--reaction",
    "0",
    "--output",
    output,
  ];
  try {
    const result = execFileSync(process.execPath, command, {
      encoding: "utf8",
    });
    assert.match(result, /2 full laps/);
    const contents = readFileSync(output, "utf8"),
      report = JSON.parse(contents);
    assert.equal(report.final.completedLaps, 2);
    assert.equal(report.simulatedSeconds, 80);
    assert.equal(report.video, null);
    const repeat = spawnSync(process.execPath, command, { encoding: "utf8" });
    assert.notEqual(repeat.status, 0);
    assert.equal(readFileSync(output, "utf8"), contents);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("CLI help is available and unknown options fail clearly", () => {
  assert.match(
    execFileSync(process.execPath, ["scripts/simulate.mjs", "--help"], {
      encoding: "utf8",
    }),
    /Video exports include/,
  );
  const result = spawnSync(
    process.execPath,
    ["scripts/simulate.mjs", "--unknown"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option/);
});
