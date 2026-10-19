const wrap = (v) => ((v % 1) + 1) % 1;
const HALF_CAR = 2.25;
export class Junction {
  constructor(route, config) {
    this.route = route;
    this.config = config;
    this.reservations = new Map();
    this.arrivals = new Map();
    this.stops = new Map();
    this.crossings = 0;
    this.phase = null;
  }
  next(car) {
    return this.route.entries
      .filter(
        (e) =>
          this.route.layout !== "cross" ||
          (e.approach === (car.approach ?? 0) && car.q <= e.exitQ),
      )
      .map((e) => ({
        ...e,
        distance: this.route.closed ? wrap(e.q - car.q) : e.q - car.q,
      }))
      .sort((a, b) => a.distance - b.distance)[0];
  }
  get mode() {
    return this.config.intersection;
  }
  signal(time) {
    const within = time % 15,
      axis = Math.floor(time / 15) % 2;
    return {
      axis,
      stage: within < 12 ? "green" : within < 14 ? "amber" : "red",
      since: within,
      remaining: (within < 12 ? 12 : within < 14 ? 14 : 15) - within,
    };
  }
  update(sim) {
    if (!this.route.entries.length) return;
    for (const [id, permit] of this.reservations) {
      const car = sim.cars.find((c) => c.id === id);
      if (!car || car.travelled >= permit.releaseAt) {
        this.reservations.delete(id);
        this.arrivals.delete(id);
        this.stops.delete(id);
        this.crossings++;
      }
    }
    this.phase = this.signal(sim.time);
    const candidates = [];
    for (const car of sim.cars) {
      if (this.reservations.has(car.id)) continue;
      const entry = this.next(car);
      if (!entry) {
        this.arrivals.delete(car.id);
        this.stops.delete(car.id);
        continue;
      }
      const distance = entry.distance * sim.laneLength(car.lane) - HALF_CAR - 1;
      if (distance > 50) {
        this.arrivals.delete(car.id);
        this.stops.delete(car.id);
        continue;
      }
      if (!this.arrivals.has(car.id))
        this.arrivals.set(car.id, { time: sim.time, entry: entry.approach });
      if (distance < 3.2 && car.v < 0.3) {
        if (!this.stops.has(car.id)) this.stops.set(car.id, sim.time);
      } else this.stops.delete(car.id);
      if (car.broken || sim.time < car.brakeUntil || car.target !== null)
        continue;
      const stopped = this.stops.get(car.id);
      const ready =
        this.mode === "stop"
          ? stopped !== undefined &&
            sim.time - stopped >= 1 + this.config.reaction
          : distance < 10;
      if (ready)
        candidates.push({
          car,
          entry,
          distance,
          arrival:
            this.mode === "stop" ? stopped : this.arrivals.get(car.id).time,
        });
    }
    candidates.sort((a, b) => a.arrival - b.arrival || a.car.id - b.car.id);
    for (const { car, entry } of candidates) {
      if (this.mode === "lights") {
        if (
          this.phase.stage !== "green" ||
          this.phase.axis !== entry.axis ||
          this.phase.since < this.config.reaction
        )
          continue;
        if ([...this.reservations.values()].some((p) => p.axis !== entry.axis))
          continue;
      } else if (this.reservations.size) break;
      // Do not enter a junction whose exit is already blocked by a queue.
      const exitCars = sim.cars.filter(
        (c) =>
          c.id !== car.id &&
          sim.sameRoad(car, c) &&
          sim.occupied(c, car.lane) &&
          (this.route.closed ? wrap(c.q - entry.exitQ) : c.q - entry.exitQ) >=
            0 &&
          (this.route.closed ? wrap(c.q - entry.exitQ) : c.q - entry.exitQ) *
            sim.laneLength(car.lane) <
            10,
      );
      if (exitCars.some((c) => c.v < 1)) continue;
      const releaseAt =
        car.travelled +
        (this.route.closed ? wrap(entry.exitQ - car.q) : entry.exitQ - car.q) +
        (HALF_CAR + 1) / sim.laneLength(car.lane);
      this.reservations.set(car.id, {
        axis: entry.axis,
        approach: entry.approach,
        releaseAt,
      });
      this.arrivals.delete(car.id);
      this.stops.delete(car.id);
      if (this.mode !== "lights") break;
    }
  }
  gate(car, sim) {
    if (!this.route.entries.length || this.reservations.has(car.id))
      return null;
    const entry = this.next(car);
    if (!entry) return null;
    const distance = entry.distance * sim.laneLength(car.lane) - HALF_CAR - 1;
    if (
      this.mode === "lights" &&
      this.phase?.stage === "green" &&
      this.phase.axis === entry.axis &&
      this.phase.since >= this.config.reaction &&
      ![...this.reservations.values()].some((p) => p.axis !== entry.axis)
    )
      return null;
    return {
      ...entry,
      gap: Math.max(0, distance),
      q: this.route.closed
        ? wrap(entry.q - (HALF_CAR + 1) / sim.laneLength(car.lane))
        : entry.q - (HALF_CAR + 1) / sim.laneLength(car.lane),
    };
  }
  canChangeLane(car, sim) {
    if (!this.route.entries.length) return true;
    const entry = this.next(car);
    if (!entry) return !this.reservations.has(car.id);
    return (
      !this.reservations.has(car.id) &&
      !this.route.inside(car.q) &&
      entry.distance * sim.laneLength(car.lane) > Math.max(35, car.v * 3)
    );
  }
  inApproachQueue(car, sim) {
    return (
      this.route.entries.length > 0 &&
      car.v * 3.6 <= 70.5 &&
      !!this.next(car) &&
      this.next(car).distance * sim.laneLength(car.lane) < 65
    );
  }
  speedLimit(car, sim) {
    if (!this.route.entries.length) return Infinity;
    const entry = this.next(car);
    if (!entry) return Infinity;
    const near = entry.distance * sim.laneLength(car.lane) < 70;
    if (!near && !this.reservations.has(car.id)) return Infinity;
    return (
      (this.mode === "stop" ? 25 : this.mode === "roundabout" ? 35 : 45) / 3.6
    );
  }
  label(time) {
    if (this.mode === "stop")
      return `All-way stop · ${this.arrivals.size} waiting`;
    if (this.mode === "roundabout")
      return `Roundabout · yield to circulating traffic`;
    const phase = this.signal(time);
    return `${phase.axis === 0 ? "East–west" : "North–south"} ${phase.stage} · ${Math.ceil(phase.remaining)}s`;
  }
}
