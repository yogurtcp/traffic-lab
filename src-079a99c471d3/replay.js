import { Simulation } from "./model.js";

// Observational history: replay never advances or mutates the live model.
// Sample at 10 Hz and retain three simulated minutes, including chart/event
// history. Samples/config/route are immutable and can be shared between frames.
export class ReplayBuffer {
  constructor(seconds = 180) {
    this.seconds = seconds;
    this.frames = [];
  }
  exportState() {
    return {
      seconds: this.seconds,
      frames: this.frames.map((frame) => {
        const { route, junction, ...data } = frame;
        return { ...data, junction: { arrivals: junction.arrivals } };
      }),
    };
  }
  static fromState(saved, live) {
    const recording = new ReplayBuffer(saved.seconds);
    recording.frames = saved.frames.map((data) =>
      Object.assign(Object.create(Simulation.prototype), data, {
        config: live.config,
        route: live.route,
        junction: Object.assign(
          Object.create(Object.getPrototypeOf(live.junction)),
          data.junction,
          { route: live.route, config: live.config },
        ),
      }),
    );
    return recording;
  }
  get start() {
    return this.frames[0]?.time ?? 0;
  }
  get end() {
    return this.frames.at(-1)?.time ?? 0;
  }
  capture(sim, force = false) {
    const last = this.frames.at(-1);
    if (!force && last && sim.time - last.time < 0.1 - 1e-8) return;
    const frame = Object.create(Simulation.prototype);
    for (const key of [
      "config",
      "route",
      "stream",
      "probabilityTotal",
      "time",
      "changes",
      "laps",
      "arrived",
      "entered",
      "exited",
      "fleetVersion",
    ])
      frame[key] = sim[key];
    frame.cars = sim.cars.map((car) => ({ ...car }));
    frame.obstacles = sim.obstacles.map((obstacle) => ({ ...obstacle }));
    frame.events = sim.events.map((event) => ({ ...event }));
    frame.samples = sim.samples.slice();
    frame.junction = Object.assign(
      Object.create(Object.getPrototypeOf(sim.junction)),
      {
        route: sim.route,
        config: sim.config,
        arrivals: new Map(sim.junction.arrivals),
      },
    );
    if (last && Math.abs(last.time - sim.time) < 1e-8) this.frames.pop();
    this.frames.push(frame);
    // Keep one frame on/before the cutoff so the whole advertised interval
    // remains seekable, even after an intervention between regular samples.
    const cutoff = sim.time - this.seconds;
    while (this.frames.length > 1 && this.frames[1].time <= cutoff)
      this.frames.shift();
  }
  at(time) {
    if (!this.frames.length) return null;
    let lo = 0,
      hi = this.frames.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].time <= time + 1e-8) lo = mid;
      else hi = mid;
    }
    return this.frames[lo];
  }
}
