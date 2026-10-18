export const STEP = 0.05;
export const CAR_LENGTH = 4.5;
export const LANE_WIDTH = 3.7;
export const PERSONALITIES = {
  regular: {
    name: "Regular",
    speed: 90,
    color: "#477ae0",
    gap: 1.35,
    accel: 1.5,
    brake: 2.5,
    description:
      "90 km/h. Passes vehicles at 70 km/h or below, on the left. Keeps right when clear.",
  },
  slowpoke: {
    name: "Slowpoke",
    speed: 70,
    color: "#e0b94c",
    gap: 1.6,
    accel: 1.1,
    brake: 2,
    description: "70 km/h. Keeps right and passes slower traffic on the left.",
  },
  hog: {
    name: "Annoying slowpoke",
    speed: 70,
    color: "#e58b58",
    gap: 1.5,
    accel: 1.1,
    brake: 2,
    description:
      "70 km/h, in the leftmost lane. Only leaves to avoid an obstacle, then returns.",
  },
  speedster: {
    name: "Speedster",
    speed: 110,
    color: "#9d72d8",
    gap: 1.2,
    accel: 2,
    brake: 3,
    description:
      "110 km/h. Like Regular, passes traffic at 70 km/h or below, only on the left.",
  },
  stuntman: {
    name: "Stuntman",
    speed: 160,
    color: "#e75b71",
    gap: 0.55,
    accel: 3.6,
    brake: 5,
    description:
      "160 km/h maximum. Weaves through available gaps and passes on either side.",
  },
  cautious: {
    name: "Cautious",
    speed: 80,
    color: "#54a5b5",
    gap: 2.5,
    accel: 0.9,
    brake: 1.8,
    description:
      "80 km/h. Leaves a large gap and needs extra room to change lanes.",
  },
  tailgater: {
    name: "Tailgater",
    speed: 90,
    color: "#ba8b5d",
    gap: 0.65,
    accel: 2.5,
    brake: 4,
    description:
      "90 km/h. Follows very closely, accelerates eagerly, and brakes hard. Passes on the left.",
  },
  eco: {
    name: "Eco driver",
    speed: 90,
    color: "#64a179",
    gap: 2.1,
    accel: 0.65,
    brake: 1.5,
    description:
      "90 km/h. Gentle acceleration and extra following space smooth out speed changes.",
  },
};
export const KEYS = Object.keys(PERSONALITIES);
export const PRESETS = {
  mixed: {
    name: "Mixed company",
    lanes: 3,
    reaction: 0.9,
    length: 1000,
    seed: 42,
    counts: {
      regular: 28,
      slowpoke: 7,
      hog: 2,
      speedster: 7,
      stuntman: 2,
      cautious: 3,
      tailgater: 3,
      eco: 2,
    },
  },
  perfect: {
    name: "Perfect flow",
    lanes: 2,
    reaction: 0.9,
    length: 1000,
    seed: 42,
    counts: { regular: 32 },
  },
  wave: {
    name: "Phantom jam",
    lanes: 1,
    reaction: 1.1,
    length: 1000,
    seed: 42,
    counts: { regular: 36 },
  },
  hogs: {
    name: "Left-lane blockade",
    lanes: 3,
    reaction: 0.9,
    length: 1000,
    seed: 42,
    counts: { regular: 25, slowpoke: 5, hog: 5, speedster: 12, stuntman: 3 },
  },
};
export const mod = (v, n = 1) => ((v % n) + n) % n;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function normalizeConfig(input = {}) {
  const numeric = (value, fallback, lo, hi) =>
    Number.isFinite(Number(value)) ? clamp(Number(value), lo, hi) : fallback;
  const counts = Object.fromEntries(
    KEYS.map((key) => [
      key,
      Math.round(numeric(input.counts?.[key] ?? 0, 0, 0, 180)),
    ]),
  );
  let remaining = 180;
  for (const key of KEYS) {
    counts[key] = Math.min(counts[key], remaining);
    remaining -= counts[key];
  }
  return {
    lanes: Math.round(numeric(input.lanes, 3, 1, 5)),
    length: Math.round(numeric(input.length, 1000, 600, 2000)),
    reaction: numeric(input.reaction, 0.9, 0, 2),
    seed: Math.round(numeric(input.seed, 42, 1, 999999)),
    counts,
  };
}
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Simulation {
  constructor(config = PRESETS.mixed) {
    this.reset(config);
  }
  laneLength(lane) {
    return this.config.length + 2 * Math.PI * LANE_WIDTH * lane;
  }
  occupied(car, lane) {
    return car.lane === lane || car.target === lane;
  }
  reset(config) {
    this.config = normalizeConfig(config);
    this.time = 0;
    this.obstacles = [];
    this.changes = 0;
    this.laps = 0;
    this.hardBrakes = 0;
    this.safetyInterventions = 0;
    this.events = [];
    this.history = [];
    this.samples = [];
    this.nextObstacle = 1;
    const random = rng(this.config.seed);
    const types = KEYS.flatMap((type) =>
      Array(this.config.counts[type]).fill(type),
    );
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    const buckets = Array.from({ length: this.config.lanes }, () => []);
    // Place left-lane hogs first, then fill the least populated lane.
    for (const type of [
      ...types.filter((t) => t === "hog"),
      ...types.filter((t) => t !== "hog"),
    ]) {
      const lane =
        type === "hog"
          ? 0
          : buckets.reduce(
              (best, row, i) => (row.length < buckets[best].length ? i : best),
              this.config.lanes - 1,
            );
      buckets[lane].push(type);
    }
    let id = 1;
    this.cars = buckets.flatMap((types, lane) =>
      types.map((type, i) => ({
        id: id++,
        type,
        lane,
        target: null,
        from: lane,
        blend: 1,
        q: mod(i / types.length + lane * 0.003),
        v: PERSONALITIES[type].speed / 3.6,
        a: 0,
        cooldown: 1 + random() * 2,
        brakeUntil: 0,
        broken: false,
        laps: 0,
        distance: 0,
        safety: false,
      })),
    );
    // Congested starts must still fit physically, even if a chosen mix is extreme.
    this.cars = this.cars.filter(
      (c) =>
        buckets[c.lane].length * (CAR_LENGTH + 0.7) < this.laneLength(c.lane),
    );
    if (this.cars.length !== types.length)
      throw new Error(
        "Too many cars in one lane. Increase the road length, add lanes, or reduce the driver count.",
      );
    const snapshot = this.snapshot();
    this.history = Array.from({ length: 43 }, () => snapshot);
    this.sample();
  }
  snapshot() {
    return {
      cars: this.cars.map((c) => ({
        id: c.id,
        q: c.q,
        lane: c.lane,
        target: c.target,
        v: c.v,
        type: c.type,
        broken: c.broken,
      })),
      obstacles: this.obstacles.map((o) => ({ ...o })),
    };
  }
  forward(a, b, lane) {
    return mod(b - a) * this.laneLength(lane);
  }
  neighbors(car, lane, state = this) {
    let front = null,
      rear = null,
      gap = Infinity,
      backGap = Infinity;
    for (const other of [...state.cars, ...state.obstacles]) {
      if (other.id === car.id || !this.occupied(other, lane)) continue;
      const d = this.forward(car.q, other.q, lane);
      const g = d - (CAR_LENGTH + (other.length ?? CAR_LENGTH)) / 2;
      if (g < gap) {
        front = other;
        gap = g;
      }
      if (!other.obstacle) {
        const back = this.laneLength(lane) - d - CAR_LENGTH;
        if (back < backGap) {
          rear = other;
          backGap = back;
        }
      }
    }
    return { front, rear, gap, backGap };
  }
  acceleration(car, lane, state) {
    const p = PERSONALITIES[car.type];
    const { front, gap } = this.neighbors(car, lane, state);
    const closing = car.v - (front?.v ?? car.v);
    const desiredGap =
      2 +
      Math.max(
        0,
        car.v * p.gap + (car.v * closing) / (2 * Math.sqrt(p.accel * p.brake)),
      );
    let acceleration =
      p.accel *
      (1 -
        (car.v / (p.speed / 3.6)) ** 4 -
        (desiredGap / Math.max(0.2, gap)) ** 2);
    // Right-hand traffic: inner lane is left. Law-abiding drivers cannot
    // advance past a slower car immediately to their left, even without merging.
    if (car.type !== "stuntman" && lane > 0) {
      for (let leftLane = 0; leftLane < lane; leftLane++) {
        const left = this.neighbors(car, leftLane, state);
        const scale = this.laneLength(lane) / this.laneLength(leftLane);
        const leftSpeed = (left.front?.v ?? 0) * scale;
        const leftGap = (left.gap + CAR_LENGTH) * scale - CAR_LENGTH;
        if (
          left.front &&
          !left.front.obstacle &&
          !left.front.broken &&
          leftGap < Math.max(14, car.v * 1.8) &&
          leftSpeed < car.v
        ) {
          const legalGap =
            1 +
            Math.max(
              0,
              car.v * 0.7 +
                (car.v * (car.v - leftSpeed)) /
                  (2 * Math.sqrt(p.accel * p.brake)),
            );
          acceleration = Math.min(
            acceleration,
            p.accel * (1 - (legalGap / Math.max(0.2, leftGap)) ** 2),
          );
        }
      }
    }
    return clamp(acceleration, -8, p.accel);
  }
  safeLane(car, lane) {
    if (lane < 0 || lane >= this.config.lanes) return false;
    const { front, rear, gap, backGap } = this.neighbors(car, lane);
    const p = PERSONALITIES[car.type];
    const multiplier =
      car.type === "stuntman" ? 0.45 : car.type === "cautious" ? 1.3 : 0.85;
    return (
      gap >
        Math.max(
          6,
          car.v * multiplier + Math.max(0, car.v - (front?.v ?? car.v)) * 2,
        ) &&
      backGap >
        Math.max(
          6,
          (rear?.v ?? 0) * multiplier + Math.max(0, (rear?.v ?? 0) - car.v) * 2,
        )
    );
  }
  considerLane(car, delayed) {
    if (
      car.target !== null ||
      car.cooldown > 0 ||
      car.broken ||
      this.time < car.brakeUntil
    )
      return;
    const old = delayed.cars.find((c) => c.id === car.id) ?? car;
    const { front, gap } = this.neighbors(old, car.lane, delayed);
    const desiredSpeed = PERSONALITIES[car.type].speed / 3.6;
    const passMargin = 2 / 3.6;
    const lookAhead = Math.max(55, old.v * 3.5);
    const obstruction = front && (front.obstacle || front.broken);
    // Being near a car doing 70 does not itself justify passing: the driver
    // must be held below their own desired speed, and not be falling behind.
    const blocked =
      front &&
      gap < lookAhead &&
      (obstruction ||
        (front.v * 3.6 <= 70.5 &&
          front.v + passMargin < desiredSpeed &&
          front.v <= old.v + 0.05));
    let choices = [];
    if (car.type === "hog") {
      if (car.lane > 0) choices = [car.lane - 1];
      else if ((front?.obstacle || front?.broken) && blocked)
        choices = [car.lane + 1];
    } else if (car.type === "stuntman") {
      const current = this.acceleration(old, car.lane, delayed);
      choices = [car.lane - 1, car.lane + 1]
        .filter((l) => l >= 0 && l < this.config.lanes)
        .map((l) => ({
          l,
          score: this.acceleration(old, l, delayed) - current,
        }))
        .filter((x) => x.score > 0.35)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.l);
    } else {
      if (blocked && car.lane > 0) {
        const left = this.neighbors(old, car.lane - 1, delayed);
        // A safe gap can still lead straight into slower traffic. Only make
        // a discretionary pass if the destination lane offers a useful pace.
        const leftPace =
          left.front && left.gap < Math.max(80, desiredSpeed * 6)
            ? Math.min(desiredSpeed, left.front.v)
            : desiredSpeed;
        if (obstruction || leftPace > front.v + passMargin)
          choices.push(car.lane - 1);
      }
      // Moving right to escape a stationary obstacle is permitted. Passing
      // moving traffic on the right is not; acceleration also enforces that.
      if ((front?.obstacle || front?.broken) && blocked)
        choices.push(car.lane + 1);
      if (!blocked && car.lane < this.config.lanes - 1) {
        const right = this.neighbors(old, car.lane + 1, delayed);
        if (right.gap > Math.max(65, car.v * 4)) choices.push(car.lane + 1);
      }
    }
    for (const lane of choices) {
      if (this.safeLane(car, lane)) {
        car.from = car.lane;
        car.target = lane;
        car.blend = 0;
        car.cooldown = car.type === "stuntman" ? 2.4 : 5;
        this.changes++;
        break;
      }
    }
  }
  step(dt = STEP) {
    if (Math.abs(dt - STEP) > 1e-8)
      throw new Error("Use the fixed 0.05-second simulation step.");
    const delayed =
      this.history[
        Math.max(
          0,
          this.history.length - 1 - Math.round(this.config.reaction / STEP),
        )
      ];
    for (const c of this.cars) {
      c.cooldown -= dt;
      this.considerLane(c, delayed);
    }
    const moves = new Map();
    for (const car of this.cars) {
      const old = delayed.cars.find((c) => c.id === car.id) ?? car;
      let a = this.acceleration(old, car.lane, delayed);
      if (car.target !== null)
        a = Math.min(a, this.acceleration(old, car.target, delayed));
      if (car.broken || this.time < car.brakeUntil) a = -6;
      if (car.broken && car.v < 0.1) a = 0;
      if (a < -3 && car.a >= -3) this.hardBrakes++;
      car.a = a;
      car.safety = false;
      const nextV = clamp(
        car.v + a * dt,
        0,
        PERSONALITIES[car.type].speed / 3.6,
      );
      const length = this.laneLength(
        car.target === null
          ? car.lane
          : car.from + (car.target - car.from) * car.blend,
      );
      moves.set(car.id, {
        advance: (((car.v + nextV) / 2) * dt) / length,
        v: nextV,
      });
    }
    // A final non-physical guard prevents interpenetration at extreme delays.
    // Iterate through the queue so a hard stop propagates safely in this step.
    for (let pass = 0; pass < this.cars.length + 1; pass++) {
      let changed = false;
      for (const car of this.cars) {
        const move = moves.get(car.id);
        // Enforce the no-undertaking rule even if delayed perception would
        // otherwise let a lawful driver cross a left-hand vehicle's position.
        if (car.type !== "stuntman") {
          const leftmostOccupied =
            car.target === null ? car.lane : Math.max(car.lane, car.target);
          for (let leftLane = 0; leftLane < leftmostOccupied; leftLane++) {
            const { front, gap } = this.neighbors(car, leftLane);
            if (
              !front ||
              front.obstacle ||
              front.broken ||
              front.v / this.laneLength(leftLane) >
                car.v / this.laneLength(car.lane) ||
              gap > Math.max(14, car.v * 1.8)
            )
              continue;
            const maximum = Math.max(
              0,
              (gap + CAR_LENGTH - 0.1) / this.laneLength(leftLane) +
                (moves.get(front.id)?.advance ?? 0),
            );
            if (move.advance > maximum + 1e-10) {
              move.advance = maximum;
              move.v = Math.min(
                move.v,
                (maximum * this.laneLength(car.lane)) / dt,
              );
              changed = true;
            }
          }
        }
        for (const lane of car.target === null
          ? [car.lane]
          : [car.lane, car.target]) {
          const { front, gap } = this.neighbors(car, lane);
          if (!front) continue;
          const frontMove = moves.get(front.id)?.advance ?? 0;
          const maximum = Math.max(
            0,
            (gap - 0.5) / this.laneLength(lane) + frontMove,
          );
          if (move.advance > maximum + 1e-10) {
            move.advance = maximum;
            move.v = Math.min(move.v, (maximum * this.laneLength(lane)) / dt);
            car.safety = true;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    for (const car of this.cars) {
      const move = moves.get(car.id);
      if (car.safety) this.safetyInterventions++;
      car.distance += move.advance * this.laneLength(car.lane);
      if (car.q + move.advance >= 1) {
        car.laps++;
        this.laps++;
      }
      car.q = mod(car.q + move.advance);
      car.v = move.v;
      if (car.target !== null) {
        car.blend = Math.min(1, car.blend + dt / 1.6);
        if (car.blend >= 1) {
          car.lane = car.target;
          car.target = null;
        }
      }
    }
    this.time += dt;
    this.history.push(this.snapshot());
    if (this.history.length > 43) this.history.shift();
    if (
      Math.floor((this.time + 1e-6) * 2) >
      Math.floor((this.time - dt + 1e-6) * 2)
    )
      this.sample();
  }
  advance(seconds) {
    for (let i = 0; i < Math.round(seconds / STEP); i++) this.step();
  }
  get stats() {
    const speeds = this.cars.map((c) => c.v * 3.6);
    const average = speeds.reduce((a, b) => a + b, 0) / (speeds.length || 1);
    const target =
      this.cars.reduce((s, c) => s + PERSONALITIES[c.type].speed, 0) /
      (speeds.length || 1);
    return {
      average,
      target,
      slow: speeds.filter((v) => v < 30).length,
      stopped: speeds.filter((v) => v < 5).length,
      density:
        this.cars.length /
        (Array.from({ length: this.config.lanes }, (_, l) =>
          this.laneLength(l),
        ).reduce((a, b) => a + b, 0) /
          1000),
      efficiency: target ? average / target : 0,
    };
  }
  sample() {
    const stats = this.stats;
    const bins = Array.from({ length: 100 }, (_, i) => {
      const cars = this.cars.filter((c) => Math.floor(c.q * 100) === i);
      return cars.length
        ? cars.reduce((s, c) => s + c.v * 3.6, 0) / cars.length
        : null;
    });
    this.samples.push({
      time: this.time,
      average: stats.average,
      slow: stats.slow,
      bins,
    });
    if (this.samples.length > 240) this.samples.shift();
  }
  log(text) {
    this.events.unshift({ time: this.time, text });
    this.events.length = Math.min(5, this.events.length);
  }
  brakeCar(id, duration = 3) {
    const c = this.cars.find((c) => c.id === id);
    if (!c) return;
    c.brakeUntil = this.time + duration;
    this.log(`Car ${id}: ${duration}s brake pulse`);
  }
  breakCar(id) {
    const c = this.cars.find((c) => c.id === id);
    if (!c) return;
    c.broken = true;
    this.log(`Car ${id}: breakdown`);
  }
  repairCar(id) {
    const c = this.cars.find((c) => c.id === id);
    if (!c) return;
    c.broken = false;
    c.brakeUntil = 0;
    this.log(`Car ${id}: repaired`);
  }
  addObstacle(q, lane) {
    q = mod(q);
    lane = Math.round(clamp(lane, 0, this.config.lanes - 1));
    // Never place a physical object inside a vehicle or an existing object.
    const clear = [...this.cars, ...this.obstacles].every(
      (c) =>
        !this.occupied(c, lane) ||
        Math.min(mod(c.q - q), mod(q - c.q)) * this.laneLength(lane) > 9,
    );
    if (!clear) return false;
    this.obstacles.push({
      id: `o${this.nextObstacle++}`,
      q,
      lane,
      target: null,
      v: 0,
      length: 5,
      obstacle: true,
    });
    this.log(`Obstacle added in lane ${lane + 1}`);
    return true;
  }
  removeObstacle(id) {
    this.obstacles = this.obstacles.filter((o) => o.id !== id);
    this.log("Obstacle removed");
  }
  clearIncidents() {
    this.obstacles = [];
    for (const c of this.cars) {
      c.broken = false;
      c.brakeUntil = 0;
    }
    this.log("All incidents cleared");
  }
}
