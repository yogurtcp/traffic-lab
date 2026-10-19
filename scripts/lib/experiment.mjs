import {
  Simulation,
  PRESETS,
  KEYS,
  STEP,
  normalizeConfig,
} from "../../src/model.js";

function number(value, name, min, max, integer = false) {
  const n = Number(value);
  if (
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new Error(
      `${name} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`,
    );
  return n;
}
function choice(value, name, choices) {
  if (!choices.includes(value))
    throw new Error(`${name} must be one of: ${choices.join(", ")}.`);
  return value;
}
export function parseCars(text) {
  const counts = Object.fromEntries(KEYS.map((k) => [k, 0]));
  for (const entry of text.split(",")) {
    const [key, value, ...extra] = entry.trim().split("=");
    if (!KEYS.includes(key) || value === undefined || extra.length)
      throw new Error(
        `Invalid driver count '${entry}'. Use regular=20,slowpoke=4,stuntman=2. Types: ${KEYS.join(", ")}.`,
      );
    counts[key] = number(value, `${key} count`, 0, 180, true);
  }
  return counts;
}
export function parseProbabilities(text) {
  const result = Object.fromEntries(KEYS.map((k) => [k, 0]));
  for (const entry of text.split(",")) {
    const [key, value, ...extra] = entry.trim().split("=");
    choice(key, "driver type", KEYS);
    if (value === undefined || extra.length)
      throw new Error(
        "Use probabilities such as regular=70,slowpoke=20,stuntman=10.",
      );
    result[key] = number(value, `${key} probability`, 0, 100);
  }
  return result;
}
export function resolveExperiment(scenario = {}, options = {}) {
  const preset = options.preset ?? scenario.preset ?? "mixed";
  choice(preset, "preset", Object.keys(PRESETS));
  const config = { ...PRESETS[preset], ...scenario.config };
  for (const key of [
    "layout",
    "intersection",
    "lanes",
    "length",
    "reaction",
    "seed",
    "traffic",
    "interval",
  ])
    if (options[key] !== undefined) config[key] = options[key];
  if (options.cars !== undefined) config.counts = parseCars(options.cars);
  if (options.probabilities !== undefined)
    config.probabilities = parseProbabilities(options.probabilities);
  if (
    options.traffic === undefined &&
    (options.probabilities !== undefined || options.interval !== undefined)
  )
    config.traffic = "stream";
  if (
    options.cars !== undefined &&
    options.traffic === undefined &&
    options.probabilities === undefined &&
    options.interval === undefined
  )
    config.traffic = "fixed";
  choice(config.layout ?? "circle", "layout", [
    "circle",
    "rectangle",
    "figure8",
    "u",
    "cross",
  ]);
  choice(config.intersection ?? "stop", "intersection", [
    "stop",
    "lights",
    "roundabout",
  ]);
  choice(config.traffic ?? "fixed", "traffic", ["fixed", "stream"]);
  number(config.interval ?? 2, "interval", 0.2, 60);
  if (options.cars !== undefined && ["u", "cross"].includes(config.layout))
    throw new Error(
      "Fixed car counts need a circle, rectangle, or figure-eight. Use --probabilities for open roads.",
    );
  if (config.probabilities)
    for (const [k, v] of Object.entries(config.probabilities)) {
      choice(k, "driver type", KEYS);
      number(v, `${k} probability`, 0, 100);
    }
  const normalized = normalizeConfig(config);
  if (
    normalized.traffic === "stream" &&
    Math.abs(
      Object.values(normalized.probabilities).reduce((a, b) => a + b, 0) - 100,
    ) > 0.01
  )
    throw new Error("Driver probabilities must add up to 100%.");
  for (const [key, min, max, integer] of [
    ["lanes", 1, 5, true],
    ["length", 600, 2000, true],
    ["reaction", 0, 2, false],
    ["seed", 1, 999999, true],
  ])
    number(config[key], key, min, max, integer);
  const counts = config.counts ?? {};
  for (const [key, value] of Object.entries(counts)) {
    choice(key, "driver type", KEYS);
    number(value, `${key} count`, 0, 180, true);
  }
  if (Object.values(counts).reduce((s, v) => s + Number(v), 0) > 180)
    throw new Error("The combined driver count cannot exceed 180.");
  const duration = number(
    options.duration ?? scenario.duration ?? 120,
    "duration",
    0.05,
    86400,
  );
  const speed = number(options.speed ?? scenario.speed ?? 4, "speed", 0.25, 50);
  const fps = number(options.fps ?? scenario.fps ?? 30, "fps", 1, 60, true);
  const width = number(
    options.width ?? scenario.width ?? 1440,
    "width",
    640,
    3840,
    true,
  );
  const height = number(
    options.height ?? scenario.height ?? 1080,
    "height",
    480,
    2160,
    true,
  );
  if (width % 2 || height % 2)
    throw new Error("Video width and height must both be even numbers.");
  const simulatedDuration = Math.round(duration / STEP) * STEP;
  if (scenario.events !== undefined && !Array.isArray(scenario.events))
    throw new Error("Scenario events must be an array.");
  const events = (scenario.events ?? [])
    .map((event, i) => {
      const at = number(event.at, `event ${i + 1} time`, 0, simulatedDuration);
      const type = choice(event.type, `event ${i + 1} type`, [
        "brake",
        "breakdown",
        "repair",
        "obstacle",
        "remove-obstacle",
        "clear",
      ]);
      const result = { ...event, at, type };
      if (["brake", "breakdown", "repair"].includes(type))
        result.car = number(
          event.car,
          `event ${i + 1} car ID`,
          1,
          1000000000,
          true,
        );
      if (type === "brake")
        result.duration = number(
          event.duration ?? 3,
          `event ${i + 1} brake duration`,
          0.05,
          120,
        );
      if (type === "obstacle") {
        result.q = number(event.q, `event ${i + 1} road position`, 0, 0.999999);
        result.lane = number(
          event.lane,
          `event ${i + 1} lane`,
          1,
          config.lanes,
          true,
        );
        result.approach = number(
          event.approach ?? 1,
          `event ${i + 1} entrance`,
          1,
          config.layout === "cross" ? 4 : 1,
          true,
        );
      }
      if (
        type === "remove-obstacle" &&
        (typeof event.id !== "string" || !/^o\d+$/.test(event.id))
      )
        throw new Error(`event ${i + 1} needs an obstacle ID such as o1.`);
      return result;
    })
    .sort((a, b) => a.at - b.at);
  return {
    title: String(
      options.title ?? scenario.title ?? "Loop Lab · traffic experiment",
    ).slice(0, 160),
    config: normalized,
    duration: simulatedDuration,
    speed,
    fps,
    width,
    height,
    events,
  };
}
export class ExperimentRunner {
  constructor(experiment) {
    this.experiment = experiment;
    this.sim = new Simulation(experiment.config);
    this.nextEvent = 0;
    this.eventResults = [];
    this.metrics = [];
    this.sampledSecond = -1;
    for (const event of experiment.events)
      if (
        event.car &&
        !this.sim.stream &&
        !this.sim.cars.some((c) => c.id === event.car)
      )
        throw new Error(
          `Event at ${event.at}s refers to car ${event.car}, which is not in this experiment.`,
        );
    this.applyEvents();
    this.sample();
  }
  applyEvents() {
    while (
      this.nextEvent < this.experiment.events.length &&
      this.experiment.events[this.nextEvent].at <= this.sim.time + 1e-8
    ) {
      const event = this.experiment.events[this.nextEvent++];
      let applied = true,
        reason;
      if (event.car && !this.sim.cars.some((c) => c.id === event.car)) {
        applied = false;
        reason = "That car is not currently on the visible road.";
      } else if (event.type === "brake")
        this.sim.brakeCar(event.car, event.duration);
      else if (event.type === "breakdown") this.sim.breakCar(event.car);
      else if (event.type === "repair") this.sim.repairCar(event.car);
      else if (event.type === "clear") this.sim.clearIncidents();
      else if (event.type === "obstacle") {
        applied = this.sim.addObstacle(
          event.q,
          event.lane - 1,
          (event.approach ?? 1) - 1,
        );
        if (!applied)
          reason =
            "The requested position is occupied or inside the shared junction.";
      } else if (event.type === "remove-obstacle") {
        applied = this.sim.obstacles.some((o) => o.id === event.id);
        if (applied) this.sim.removeObstacle(event.id);
        else reason = "That obstacle does not exist.";
      }
      this.eventResults.push({
        ...event,
        actualTime: Number(this.sim.time.toFixed(6)),
        applied,
        ...(reason ? { reason } : {}),
      });
    }
  }
  sample() {
    const second = Math.floor(this.sim.time + 1e-8);
    if (second !== this.sampledSecond) {
      this.sampledSecond = second;
      this.metrics.push({
        time: Number(this.sim.time.toFixed(6)),
        ...this.sim.stats,
        junctionCrossings: this.sim.junction.crossings,
        hardBrakes: this.sim.hardBrakes,
        laneChanges: this.sim.changes,
      });
    }
  }
  advanceTo(time) {
    if (time < this.sim.time - STEP - 1e-8)
      throw new Error("An experiment cannot run backward.");
    const target = Math.min(
      this.experiment.duration,
      Math.round(time / STEP) * STEP,
    );
    while (this.sim.time + STEP <= target + 1e-8) {
      this.applyEvents();
      this.sim.step();
      this.sample();
    }
    this.applyEvents();
    return this.sim;
  }
  report(video = null) {
    return {
      schemaVersion: 1,
      title: this.experiment.title,
      config: this.experiment.config,
      simulatedSeconds: Number(this.sim.time.toFixed(6)),
      video,
      final: {
        ...this.sim.stats,
        junctionCrossings: this.sim.junction.crossings,
        laneChanges: this.sim.changes,
        hardBrakes: this.sim.hardBrakes,
      },
      events: this.eventResults,
      metrics: this.metrics,
    };
  }
}
