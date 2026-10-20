import { getRoute } from "./route.js";
import { Junction } from "./junction.js";

export const STEP = 0.05;
export const CAR_LENGTH = 4.5;
export const LANE_WIDTH = 3.7;
const LANE_CHANGE_TIME = 1.6;
export const PERSONALITIES = {
  regular: {
    name: "Regular",
    speed: 90,
    color: "#477ae0",
    gap: 1.35,
    accel: 1.5,
    brake: 2.5,
    description:
      "90 km/h. Passes traffic at 70 km/h or below on the left. Checks follower braking before merging, makes room gently at blocked lanes, and keeps right when clear.",
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
      "160 km/h maximum. Squeezes into small gaps on either side, making other drivers brake.",
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
export const DEFAULT_PROBABILITIES = {
  regular: 60,
  slowpoke: 12,
  hog: 4,
  speedster: 10,
  stuntman: 4,
  cautious: 4,
  tailgater: 3,
  eco: 3,
};
export const PRESETS = {
  stream: {
    name: "Open-road traffic",
    traffic: "stream",
    layout: "u",
    lanes: 2,
    reaction: 0.9,
    length: 1000,
    seed: 42,
    interval: 2,
    probabilities: DEFAULT_PROBABILITIES,
    counts: {},
  },
  crossing: {
    name: "Four-way arrivals",
    traffic: "stream",
    layout: "cross",
    intersection: "lights",
    lanes: 2,
    reaction: 0.9,
    length: 1000,
    seed: 42,
    interval: 1.5,
    probabilities: DEFAULT_PROBABILITIES,
    counts: {},
  },
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
  junction: {
    name: "Junction lab",
    layout: "figure8",
    intersection: "stop",
    lanes: 1,
    length: 1000,
    reaction: 0.9,
    seed: 42,
    counts: { regular: 8 },
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
    traffic:
      ["u", "cross"].includes(input.layout) || input.traffic === "stream"
        ? "stream"
        : "fixed",
    interval: numeric(input.interval, 2, 0.2, 60),
    speedVariance: Object.fromEntries(
      KEYS.map((k) => [k, numeric(input.speedVariance?.[k] ?? 0, 0, 0, 20)]),
    ),
    probabilities: Object.fromEntries(
      KEYS.map((k) => [
        k,
        numeric(
          input.probabilities
            ? (input.probabilities[k] ?? 0)
            : DEFAULT_PROBABILITIES[k],
          DEFAULT_PROBABILITIES[k],
          0,
          100,
        ),
      ]),
    ),
    layout: ["circle", "rectangle", "figure8", "u", "cross"].includes(
      input.layout,
    )
      ? input.layout
      : "circle",
    intersection: ["stop", "lights", "roundabout"].includes(input.intersection)
      ? input.intersection
      : "stop",
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
// Stateless seeded noise keeps each car independent without consuming the
// arrival/shuffle RNG. Smooth interpolation avoids frame-to-frame jitter.
function speedNoise(seed, id, index) {
  let x =
    Math.imul(seed ^ 0x51ed270b, 0x85ebca6b) ^
    Math.imul(id, 0xc2b2ae35) ^
    Math.imul(index, 0x27d4eb2d);
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export class Simulation {
  constructor(config = PRESETS.mixed) {
    this.reset(config);
  }
  variance(car) {
    return car.speedVariance ?? this.config.speedVariance[car.type];
  }
  desiredSpeed(car, time = this.time) {
    const base = PERSONALITIES[car.type].speed;
    const amplitude = this.variance(car);
    if (!amplitude) return base / 3.6;
    const period = 6 + speedNoise(this.config.seed, car.id, -1) * 6;
    const phase = speedNoise(this.config.seed, car.id, -2) * period;
    const position = (time + phase) / period;
    const index = Math.floor(position),
      fraction = position - index;
    const blend = fraction * fraction * (3 - 2 * fraction);
    const a = speedNoise(this.config.seed, car.id, index) * 2 - 1;
    const b = speedNoise(this.config.seed, car.id, index + 1) * 2 - 1;
    return clamp(base + amplitude * (a + (b - a) * blend), 10, 160) / 3.6;
  }
  laneLength(lane) {
    return (
      this.config.length +
      (this.config.layout === "figure8"
        ? -6
        : this.config.layout === "u"
          ? -1
          : this.config.layout === "cross"
            ? 0
            : 2) *
        Math.PI *
        LANE_WIDTH *
        lane
    );
  }
  occupied(car, lane) {
    return car.lane === lane || car.target === lane;
  }
  reset(config) {
    this.config = normalizeConfig(config);
    this.route = getRoute(
      this.config.layout,
      this.config.intersection,
      this.config.length,
    );
    this.stream = this.config.traffic === "stream";
    this.junction = new Junction(this.route, this.config);
    this.time = 0;
    this.obstacles = [];
    this.changes = 0;
    this.laps = 0;
    this.hardBrakes = 0;
    this.safetyInterventions = 0;
    this.events = [];
    this.history = [];
    this.entryObservations = new Map();
    this.queueCache = new WeakMap();
    this.samples = [];
    this.nextObstacle = 1;
    const random = rng(this.config.seed);
    this.random = random;
    this.nextCar = 1;
    this.nextArrival = 0;
    this.arrived = 0;
    this.entered = 0;
    this.exited = 0;
    this.pending = Array.from({ length: this.route.approaches }, () => []);
    this.fleetVersion = 0;
    if (this.stream) {
      const total = Object.values(this.config.probabilities).reduce(
        (a, b) => a + b,
        0,
      );
      if (total !== 0 && Math.abs(total - 100) > 0.01)
        throw new Error(
          "Driver probabilities must add up to 100%, or all be zero.",
        );
      this.probabilityTotal = total;
      this.cars = [];
      this.history = Array.from({ length: 43 }, () => this.snapshot());
      this.sample();
      return;
    }
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
        speedVariance: this.config.speedVariance[type],
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
        travelled: 0,
        distance: 0,
        safety: false,
      })),
    );
    for (const car of this.cars) car.v = this.desiredSpeed(car);
    if (this.route.entries.length) {
      for (const car of this.cars) {
        car.q = this.route.spawn(car.q, 7 / this.laneLength(car.lane));
        car.v = 0;
      }
      if (
        buckets.some((cars, lane) => {
          const length = this.laneLength(lane);
          const available = this.route
            .usableIntervals(7 / length)
            .reduce((s, [a, b]) => s + b - a, 0);
          return cars.length * (CAR_LENGTH + 0.7) > length * available;
        })
      )
        throw new Error(
          "Too many cars for the open road around this junction. Add lanes, lengthen the road, or reduce cars.",
        );
    }
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
        speedVariance: c.speedVariance,
        broken: c.broken,
        approach: c.approach ?? 0,
      })),
      obstacles: this.obstacles.map((o) => ({ ...o })),
    };
  }
  forward(a, b, lane) {
    return (this.route.closed ? mod(b - a) : b - a) * this.laneLength(lane);
  }
  sameRoad(a, b) {
    return (
      this.config.layout !== "cross" || (a.approach ?? 0) === (b.approach ?? 0)
    );
  }
  inflow() {
    if (!this.probabilityTotal) return;
    while (this.nextArrival <= this.time + 1e-8) {
      let draw = this.random() * this.probabilityTotal,
        type = KEYS.findLast((k) => this.config.probabilities[k] > 0);
      for (const key of KEYS) {
        draw -= this.config.probabilities[key];
        if (draw < 0) {
          type = key;
          break;
        }
      }
      const approach = Math.floor(this.random() * this.route.approaches);
      this.pending[approach].push({ id: this.nextCar++, type, approach });
      this.arrived++;
      this.nextArrival += this.config.interval;
    }
    for (const queue of this.pending) {
      if (!queue.length || this.cars.length >= 180) continue;
      const arrival = queue[0];
      const lanes =
        arrival.type === "hog"
          ? Array.from({ length: this.config.lanes }, (_, i) => i)
          : Array.from(
              { length: this.config.lanes },
              (_, i) => this.config.lanes - 1 - i,
            );
      const state = this.snapshot();
      const candidates = [];
      for (const lane of lanes) {
        const car = {
          ...arrival,
          speedVariance: this.config.speedVariance[arrival.type],
          lane,
          from: lane,
          target: null,
          blend: 1,
          q: 0,
          v: 0,
          a: 0,
          cooldown: 2,
          brakeUntil: 0,
          broken: false,
          laps: 0,
          travelled: 0,
          distance: 0,
          safety: false,
        };
        const n = this.neighbors(car, lane, state);
        if (n.gap < 6 || n.backGap < 6) continue;
        const target = this.desiredSpeed(car);
        // Admit at a pace the actual following model can sustain, including
        // room to react to a slower leader. A distant slow car must not set
        // our entry speed regardless of the hundreds of metres between us.
        const entryAcceleration = (speed) => {
          car.v = speed;
          const projectedGap =
            n.gap -
            Math.max(0, speed - (n.front?.v ?? speed)) * this.config.reaction;
          return Math.min(
            this.acceleration(car, lane, state),
            this.followingAcceleration(car, n.front, projectedGap),
          );
        };
        if (entryAcceleration(target) < -1e-9) {
          let lo = 0,
            hi = target;
          for (let i = 0; i < 14; i++) {
            const mid = (lo + hi) / 2;
            if (entryAcceleration(mid) >= 0) lo = mid;
            else hi = mid;
          }
          car.v = lo;
        } else car.v = target;
        if (n.rear) {
          const closing = Math.max(0, n.rear.v - car.v);
          const projectedGap = n.backGap - closing * this.config.reaction;
          if (
            projectedGap < 6 ||
            this.followingAcceleration(n.rear, { v: car.v }, projectedGap) <
              -0.2
          )
            continue;
        }
        candidates.push(car);
      }
      if (!candidates.length) continue;
      const fastest = Math.max(...candidates.map((car) => car.v));
      // Keep the personality's lane preference when paces are comparable;
      // otherwise use the clear/faster lane instead of manufacturing a queue.
      const car = candidates.find((car) => car.v >= fastest - 2 / 3.6);
      this.cars.push(car);
      queue.shift();
      this.entered++;
      this.fleetVersion++;
      // Until this driver appears in the delayed history, hold a coherent
      // entry-time view. Mixing its current position with an older leader
      // position invents a short gap and triggers artificial hard braking.
      this.entryObservations.set(car.id, this.snapshot());
    }
  }
  neighbors(car, lane, state = this) {
    let front = null,
      rear = null,
      gap = Infinity,
      backGap = Infinity;
    for (const other of [...state.cars, ...state.obstacles]) {
      if (
        other.id === car.id ||
        !this.occupied(other, lane) ||
        !this.sameRoad(car, other)
      )
        continue;
      const d = this.forward(car.q, other.q, lane);
      const g = d - (CAR_LENGTH + (other.length ?? CAR_LENGTH)) / 2;
      if ((this.route.closed || d >= 0) && g < gap) {
        front = other;
        gap = g;
      }
      if (!other.obstacle) {
        const back = this.route.closed
          ? this.laneLength(lane) - d - CAR_LENGTH
          : -d - CAR_LENGTH;
        if ((this.route.closed || d < 0) && back < backGap) {
          rear = other;
          backGap = back;
        }
      }
    }
    return { front, rear, gap, backGap };
  }
  obstructionQueues(state = this) {
    // Snapshots are immutable. Live positions are only read once per step,
    // after new lane reservations have been made.
    if (state !== this && this.queueCache.has(state))
      return this.queueCache.get(state);
    const queues = Array.from({ length: this.config.lanes }, () => new Set());
    for (let lane = 0; lane < this.config.lanes; lane++) {
      for (let approach = 0; approach < this.route.approaches; approach++) {
        const entries = [...state.cars, ...state.obstacles]
          .filter(
            (c) =>
              this.occupied(c, lane) &&
              (this.config.layout !== "cross" ||
                (c.approach ?? 0) === approach),
          )
          .sort((a, b) => a.q - b.q);
        for (let i = 0; i < entries.length; i++) {
          if (!entries[i].obstacle && !entries[i].broken) continue;
          let leader = entries[i];
          for (let offset = 1; offset < entries.length; offset++) {
            if (!this.route.closed && i - offset < 0) break;
            const car = entries[mod(i - offset, entries.length)];
            if (car.obstacle || car.broken || queues[lane].has(car.id)) break;
            const gap =
              this.forward(car.q, leader.q, lane) -
              (CAR_LENGTH + (leader.length ?? CAR_LENGTH)) / 2;
            if (gap > Math.max(55, car.v * 3.5)) break;
            // Follow the connected slow queue, not unrelated traffic elsewhere
            // around the ring. The first car directly facing the hazard may
            // still be travelling quickly when it needs to get out of the way.
            if (
              !leader.obstacle &&
              !leader.broken &&
              (car.v * 3.6 > 70.5 || leader.v * 3.6 > 70.5)
            )
              break;
            queues[lane].add(car.id);
            leader = car;
          }
        }
      }
    }
    if (state !== this) this.queueCache.set(state, queues);
    return queues;
  }
  followingAcceleration(car, front, gap) {
    const p = PERSONALITIES[car.type];
    const closing = car.v - (front?.v ?? car.v);
    const desiredGap =
      2 +
      Math.max(
        0,
        car.v * p.gap + (car.v * closing) / (2 * Math.sqrt(p.accel * p.brake)),
      );
    return clamp(
      p.accel *
        (1 -
          (car.v / this.desiredSpeed(car)) ** 4 -
          (desiredGap / Math.max(0.2, gap)) ** 2),
      -8,
      p.accel,
    );
  }
  acceleration(car, lane, state) {
    const p = PERSONALITIES[car.type];
    const { front, gap } = this.neighbors(car, lane, state);
    let acceleration = this.followingAcceleration(car, front, gap);
    // Right-hand traffic: inner lane is left. Law-abiding drivers cannot
    // advance past a slower car immediately to their left, even without merging.
    if (car.type !== "stuntman" && lane > 0) {
      const queues = this.obstructionQueues(state);
      for (let leftLane = 0; leftLane < lane; leftLane++) {
        const left = this.neighbors(car, leftLane, state);
        const scale = this.laneLength(lane) / this.laneLength(leftLane);
        const leftSpeed = (left.front?.v ?? 0) * scale;
        const leftGap = (left.gap + CAR_LENGTH) * scale - CAR_LENGTH;
        if (
          left.front &&
          !left.front.obstacle &&
          !left.front.broken &&
          !queues[leftLane].has(left.front.id) &&
          !this.junction.inApproachQueue(left.front, this) &&
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
    if (
      this.obstacles.some(
        (o) =>
          this.occupied(o, lane) &&
          this.sameRoad(car, o) &&
          (this.route.closed
            ? Math.min(mod(o.q - car.q), mod(car.q - o.q))
            : Math.abs(o.q - car.q)) *
            this.laneLength(lane) <
            (CAR_LENGTH + o.length) / 2 + 0.5,
      )
    )
      return false;
    const { front, rear, gap, backGap } = this.neighbors(car, lane);
    if (car.type === "stuntman") {
      // Risky cut-ins deliberately ignore the following driver's comfortable
      // headway. Physical clearance and the collision guard still apply.
      return (
        gap >
          Math.max(
            1.5,
            car.v * 0.1 + Math.max(0, car.v - (front?.v ?? car.v)) * 0.3,
          ) &&
        backGap >
          Math.max(
            1.2,
            (rear?.v ?? 0) * 0.04 + Math.max(0, (rear?.v ?? 0) - car.v) * 0.1,
          )
      );
    }
    const regular = car.type === "regular";
    const multiplier = regular ? 0.5 : car.type === "cautious" ? 1.3 : 0.85;
    const minimumGap = regular ? 4 : 6;
    const closingTime = regular ? 1 : 2;
    if (
      !(
        gap >
          Math.max(
            minimumGap,
            car.v * multiplier +
              Math.max(0, car.v - (front?.v ?? car.v)) * closingTime,
          ) &&
        backGap >
          Math.max(
            minimumGap,
            (rear?.v ?? 0) * multiplier +
              Math.max(0, (rear?.v ?? 0) - car.v) * closingTime,
          )
      )
    )
      return false;
    if (
      rear &&
      regular &&
      !this.comfortableMerge(car, lane, { front, rear, gap, backGap })
    )
      return false;
    if (rear && !regular && lane < car.lane) {
      const mergeSpeed =
        (car.v * this.laneLength(lane)) / this.laneLength(car.lane);
      const projectedGap =
        backGap -
        Math.max(0, rear.v - mergeSpeed) *
          (this.config.reaction + LANE_CHANGE_TIME);
      if (
        projectedGap <= 0 ||
        this.followingAcceleration(rear, { v: mergeSpeed }, projectedGap) <
          -Math.min(1.5, PERSONALITIES[rear.type].brake)
      )
        return false;
    }
    return true;
  }
  yieldAcceleration(car) {
    if (car.yieldFor == null) return Infinity;
    const gap = car.yieldStopDistance - car.distance;
    return -Math.min(1, car.v ** 2 / (2 * Math.max(1, gap)));
  }
  // At a blocked lane, make room early by coasting gently from far enough
  // away. A stationary driver otherwise cannot join an unbroken fast queue.
  updateMergeCourtesy() {
    const reserved = new Set();
    for (const rear of this.cars) {
      if (rear.yieldFor == null) continue;
      const waiting = this.cars.find((c) => c.id === rear.yieldFor);
      if (waiting?.lane === rear.lane && waiting.target === null)
        rear.yieldCompletedAt ??= this.time;
      const source = waiting ? this.neighbors(waiting, waiting.lane) : null;
      const opening = waiting ? this.neighbors(waiting, rear.lane) : null;
      if (
        !waiting ||
        rear.broken ||
        this.time < rear.brakeUntil ||
        (rear.yieldCompletedAt != null &&
          this.time - rear.yieldCompletedAt >= this.config.reaction) ||
        (waiting.target === null &&
          waiting.lane !== rear.lane &&
          (!this.junction.canChangeLane(waiting, this) ||
            (opening.front && opening.gap < 4 && opening.front.v < 0.5) ||
            !(source?.front?.obstacle || source?.front?.broken) ||
            source.gap > 40))
      ) {
        delete rear.yieldFor;
        delete rear.yieldStopDistance;
        delete rear.yieldCompletedAt;
      } else reserved.add(waiting.id);
    }
    for (const waiting of this.cars) {
      if (
        waiting.type !== "regular" ||
        waiting.yieldFor != null ||
        !this.junction.canChangeLane(waiting, this) ||
        this.time < waiting.brakeUntil ||
        waiting.broken ||
        waiting.target !== null ||
        waiting.v > 5 ||
        reserved.has(waiting.id)
      )
        continue;
      const source = this.neighbors(waiting, waiting.lane);
      if (source.gap > 30 || (!source.front?.obstacle && !source.front?.broken))
        continue;
      for (const lane of [waiting.lane - 1, waiting.lane + 1]) {
        if (lane < 0 || lane >= this.config.lanes) continue;
        const opening = this.neighbors(waiting, lane);
        if (
          (opening.front && opening.gap < 4 && opening.front.v < 0.5) ||
          this.safeLane(waiting, lane)
        )
          continue;
        let chosen = null,
          closest = Infinity;
        for (const rear of this.cars) {
          if (
            rear.type !== "regular" ||
            rear.lane !== lane ||
            rear.target !== null ||
            rear.broken ||
            rear.yieldFor != null ||
            this.time < rear.brakeUntil ||
            !this.sameRoad(rear, waiting)
          )
            continue;
          const distance =
            this.forward(rear.q, waiting.q, lane) - CAR_LENGTH - 6;
          const stoppingRoom =
            rear.v * this.config.reaction + rear.v ** 2 / 2 + 12;
          if (
            distance >= stoppingRoom &&
            distance < stoppingRoom + Math.max(80, rear.v * 3) &&
            distance < closest
          ) {
            chosen = rear;
            closest = distance;
          }
        }
        if (chosen) {
          chosen.yieldFor = waiting.id;
          chosen.yieldStopDistance = chosen.distance + closest;
          reserved.add(waiting.id);
          break;
        }
      }
    }
  }
  // Trial only the affected vehicles for the merge plus reaction/recovery.
  // Delayed observations, lane geometry, front-car slowing and physical stops
  // all matter; the discarded forecast never advances the live simulation.
  comfortableMerge(car, lane, { front, rear, gap, backGap }) {
    const source = this.neighbors(car, car.lane);
    const sourceLength = this.laneLength(car.lane),
      destinationLength = this.laneLength(lane);
    const initial = {
      q: 0,
      v: car.v,
      rearQ: -(backGap + CAR_LENGTH) / destinationLength,
      rearV: rear.v,
      sourceQ: source.front
        ? (source.gap +
            (CAR_LENGTH + (source.front.length ?? CAR_LENGTH)) / 2) /
          sourceLength
        : Infinity,
      sourceV: source.front?.v ?? 0,
      frontQ: front
        ? (gap + (CAR_LENGTH + (front.length ?? CAR_LENGTH)) / 2) /
          destinationLength
        : Infinity,
      frontV: front?.v ?? 0,
    };
    const observations = [initial];
    const delay = Math.round(this.config.reaction / STEP);
    const horizon = Math.ceil(
      Math.max(4, this.config.reaction + LANE_CHANGE_TIME + 1) / STEP,
    );
    const forecast = Object.create(this);
    const brakingLimit = Math.min(1.5, PERSONALITIES[rear.type].brake);
    const rearBeforeNoticing = Math.min(
      this.yieldAcceleration(rear),
      Math.max(rear.a ?? 0, this.acceleration(rear, lane, this)),
    );
    const ownCap =
      Math.min(160, PERSONALITIES[car.type].speed + this.variance(car)) / 3.6;
    const rearCap =
      Math.min(160, PERSONALITIES[rear.type].speed + this.variance(rear)) / 3.6;
    const leaderMove = (leader, speed) => {
      if (!leader || leader.obstacle) return { speed: 0, distance: 0 };
      const actor = { ...leader, v: speed };
      const a = leader.broken
        ? -6
        : Math.min(
            leader.a ?? 0,
            forecast.followingAcceleration(actor, null, Infinity),
          );
      const next = Math.max(0, speed + a * STEP);
      return { speed: next, distance: ((speed + next) * STEP) / 2 };
    };
    for (let i = 0; i < horizon; i++) {
      const time = i * STEP;
      forecast.time = this.time + time;
      const now = observations[i],
        seen = observations[Math.max(0, i - delay)];
      const own = { ...car, v: seen.v };
      let ownA = forecast.followingAcceleration(
        own,
        front ? { v: seen.frontV } : null,
        (seen.frontQ - seen.q) * destinationLength -
          (CAR_LENGTH + (front?.length ?? CAR_LENGTH)) / 2,
      );
      if (time < LANE_CHANGE_TIME)
        ownA = Math.min(
          ownA,
          forecast.followingAcceleration(
            own,
            source.front ? { v: seen.sourceV } : null,
            (seen.sourceQ - seen.q) * sourceLength -
              (CAR_LENGTH + (source.front?.length ?? CAR_LENGTH)) / 2,
          ),
        );
      let rearA =
        i < delay
          ? rearBeforeNoticing
          : forecast.followingAcceleration(
              { ...rear, v: seen.rearV },
              { v: seen.v },
              (seen.q - seen.rearQ) * destinationLength - CAR_LENGTH,
            );
      if (
        rear.yieldFor === car.id &&
        time < LANE_CHANGE_TIME + this.config.reaction
      ) {
        const remaining =
          rear.yieldStopDistance -
          rear.distance -
          (now.rearQ - initial.rearQ) * destinationLength;
        rearA = Math.min(
          rearA,
          -Math.min(1, now.rearV ** 2 / (2 * Math.max(1, remaining))),
        );
      }
      if (i >= delay && rearA < -brakingLimit) return false;
      const nextV = clamp(now.v + ownA * STEP, 0, Math.max(now.v, ownCap));
      const nextRearV = clamp(
        now.rearV + rearA * STEP,
        0,
        Math.max(now.rearV, rearCap),
      );
      const blend = Math.min(1, time / LANE_CHANGE_TIME);
      const length = this.laneLength(car.lane + (lane - car.lane) * blend);
      const sourceMove = leaderMove(source.front, now.sourceV);
      const frontMove = leaderMove(front, now.frontV);
      const next = {
        q: now.q + ((now.v + nextV) * STEP) / (2 * length),
        v: nextV,
        rearQ:
          now.rearQ +
          ((now.rearV + nextRearV) * STEP) / (2 * destinationLength),
        rearV: nextRearV,
        sourceQ: now.sourceQ + sourceMove.distance / sourceLength,
        sourceV: sourceMove.speed,
        frontQ: now.frontQ + frontMove.distance / destinationLength,
        frontV: frontMove.speed,
      };
      let maximumQ =
        next.frontQ -
        ((CAR_LENGTH + (front?.length ?? CAR_LENGTH)) / 2 + 0.5) /
          destinationLength;
      if (time + STEP < LANE_CHANGE_TIME)
        maximumQ = Math.min(
          maximumQ,
          next.sourceQ -
            ((CAR_LENGTH + (source.front?.length ?? CAR_LENGTH)) / 2 + 0.5) /
              sourceLength,
        );
      if (next.q > maximumQ) {
        next.q = Math.max(now.q, maximumQ);
        next.v = Math.min(next.v, ((next.q - now.q) * length) / STEP);
      }
      if ((next.q - next.rearQ) * destinationLength - CAR_LENGTH < 0.5)
        return false;
      observations.push(next);
    }
    return true;
  }
  canOvertake(car, leader, requireClosing = true) {
    if (!leader || leader.obstacle || leader.broken) return false;
    const live = this.cars.find((c) => c.id === leader.id);
    if (!live) return false;
    // A brief brake or a favourable variance swing is not a lasting passing
    // advantage. Compare both cruising intent and the current target; do not
    // pull out behind someone who is already moving away in the live state.
    const ownPace = Math.min(
      this.desiredSpeed(car),
      PERSONALITIES[car.type].speed / 3.6,
    );
    const leaderPace = Math.max(
      live.v,
      this.desiredSpeed(live),
      PERSONALITIES[live.type].speed / 3.6,
    );
    return (
      ownPace > leaderPace + 2 / 3.6 &&
      (!requireClosing || car.v + 0.05 >= live.v)
    );
  }
  considerLane(car, delayed) {
    if (
      car.target !== null ||
      car.yieldFor != null ||
      car.cooldown > 0 ||
      car.broken ||
      !this.junction.canChangeLane(car, this) ||
      this.time < car.brakeUntil
    )
      return;
    const old = delayed.cars.find((c) => c.id === car.id) ?? car;
    const { front, gap } = this.neighbors(old, car.lane, delayed);
    const desiredSpeed = this.desiredSpeed(car);
    const passMargin = 2 / 3.6;
    const lookAhead = Math.max(55, old.v * 3.5);
    const passingRange = Math.max(80, desiredSpeed * 6);
    const slowAhead =
      front &&
      gap < passingRange &&
      front.v * 3.6 <= 70.5 &&
      this.canOvertake(car, front, false);
    const obstruction =
      front &&
      (front.obstacle ||
        front.broken ||
        this.obstructionQueues(delayed)[car.lane].has(car.id));
    // Being near a car doing 70 does not itself justify passing: the driver
    // must be held below their own desired speed, and not be falling behind.
    const blocked =
      front &&
      gap < lookAhead &&
      (obstruction ||
        (front.v * 3.6 <= 70.5 &&
          this.canOvertake(car, front) &&
          front.v <= old.v + 0.05));
    let choices = [];
    if (car.type === "hog") {
      if (car.lane > 0) choices = [car.lane - 1];
      else if (obstruction && blocked) choices = [car.lane + 1];
    } else if (car.type === "stuntman") {
      if (front && !obstruction && !this.canOvertake(car, front)) return;
      const current = this.acceleration(old, car.lane, delayed);
      choices = [car.lane - 1, car.lane + 1]
        .filter((l) => l >= 0 && l < this.config.lanes)
        .map((l) => {
          const next = this.neighbors(old, l, delayed);
          // Both acceleration estimates can saturate at hard braking in tight
          // traffic. Still try a better gap or faster leader in that case.
          const roomGain = clamp(
            (Math.min(next.gap, 120) - Math.min(gap, 120)) / 10,
            -3,
            3,
          );
          const paceGain = clamp(
            ((next.front?.v ?? desiredSpeed) - (front?.v ?? desiredSpeed)) / 5,
            -2,
            2,
          );
          return {
            l,
            score:
              this.acceleration(old, l, delayed) -
              current +
              roomGain * 0.5 +
              paceGain,
          };
        })
        .filter((x) => x.score > 0.2)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.l);
    } else {
      // The no-undertaking rule may hold us behind a slower car several lanes
      // to the left even when our own lane is empty. Move left in stages to
      // get behind it, then use its left-hand lane to complete a legal pass.
      let heldByLeft = false;
      if (car.lane > 1) {
        const queues = this.obstructionQueues(delayed);
        for (let lane = 1; lane < car.lane; lane++) {
          const left = this.neighbors(old, lane, delayed);
          const vehicle = left.front;
          if (
            vehicle &&
            !vehicle.obstacle &&
            !vehicle.broken &&
            !queues[lane].has(vehicle.id) &&
            !this.junction.inApproachQueue(vehicle, this) &&
            left.gap < passingRange &&
            vehicle.v * 3.6 <= 70.5 &&
            this.canOvertake(car, vehicle) &&
            (vehicle.v * this.laneLength(car.lane)) / this.laneLength(lane) <=
              old.v + 0.05
          ) {
            heldByLeft = true;
            break;
          }
        }
      }
      if (heldByLeft && !blocked) choices.push(car.lane - 1);
      if (blocked && car.lane > 0) {
        const left = this.neighbors(old, car.lane - 1, delayed);
        // A safe gap can still lead straight into slower traffic. Only make
        // a discretionary pass if the destination lane offers a useful pace.
        const leftPace =
          left.front && left.gap < passingRange
            ? Math.min(desiredSpeed, left.front.v)
            : desiredSpeed;
        if (obstruction || leftPace > front.v + passMargin)
          choices.push(car.lane - 1);
      }
      // Moving right to escape a stationary obstacle is permitted. Passing
      // moving traffic on the right is not; acceleration also enforces that.
      if (obstruction && blocked) choices.push(car.lane + 1);
      if (
        !blocked &&
        !slowAhead &&
        !heldByLeft &&
        car.lane < this.config.lanes - 1
      ) {
        const right = this.neighbors(old, car.lane + 1, delayed);
        const clearRoad =
          car.type === "regular"
            ? Math.max(16, car.v * 1.1)
            : Math.max(65, car.v * 4);
        // Stay in the passing lane while the slower vehicle is still ahead
        // on our right. Moving back behind it just restarts the same pass.
        const rightPace =
          right.front && right.gap < passingRange
            ? right.front.v
            : desiredSpeed;
        const giveUpPass =
          right.front &&
          !right.front.obstacle &&
          !right.front.broken &&
          !this.obstructionQueues(delayed)[car.lane + 1].has(right.front.id) &&
          !this.canOvertake(car, right.front, false);
        if (
          right.gap > clearRoad &&
          (giveUpPass || rightPace + passMargin >= desiredSpeed)
        )
          choices.push(car.lane + 1);
      }
    }
    for (const lane of choices) {
      if (this.safeLane(car, lane)) {
        car.from = car.lane;
        car.target = lane;
        car.blend = 0;
        car.cooldown = car.type === "stuntman" ? 1.8 : 5;
        this.changes++;
        break;
      }
    }
  }
  perceivedState(car, delayed) {
    if (delayed.cars.some((c) => c.id === car.id)) {
      this.entryObservations.delete(car.id);
      return delayed;
    }
    return this.entryObservations.get(car.id) ?? this.snapshot();
  }
  step(dt = STEP) {
    if (Math.abs(dt - STEP) > 1e-8)
      throw new Error("Use the fixed 0.05-second simulation step.");
    if (this.stream) this.inflow();
    this.junction.update(this);
    this.updateMergeCourtesy();
    const delayed =
      this.history[
        Math.max(
          0,
          this.history.length - 1 - Math.round(this.config.reaction / STEP),
        )
      ];
    const perceptions = new Map(
      this.cars.map((car) => [car.id, this.perceivedState(car, delayed)]),
    );
    for (const c of this.cars) {
      c.cooldown -= dt;
      this.considerLane(c, perceptions.get(c.id));
    }
    const liveQueues = this.obstructionQueues();
    const moves = new Map();
    for (const car of this.cars) {
      const perceived = perceptions.get(car.id);
      const old = perceived.cars.find((c) => c.id === car.id) ?? car;
      let a = this.acceleration(old, car.lane, perceived);
      if (car.target !== null)
        a = Math.min(a, this.acceleration(old, car.target, perceived));
      const gate = this.junction.gate(car, this);
      if (gate)
        a = Math.min(a, this.followingAcceleration(old, { v: 0 }, gate.gap));
      const junctionLimit = this.junction.speedLimit(car, this);
      if (Number.isFinite(junctionLimit))
        a = Math.min(
          a,
          clamp(
            PERSONALITIES[car.type].accel * (1 - (car.v / junctionLimit) ** 4),
            -6,
            PERSONALITIES[car.type].accel,
          ),
        );
      a = Math.min(a, this.yieldAcceleration(car));
      if (car.broken || this.time < car.brakeUntil) a = -6;
      if (car.broken && car.v < 0.1) a = 0;
      if (a < -3 && car.a >= -3) this.hardBrakes++;
      car.a = a;
      car.safety = false;
      const nextV = clamp(
        car.v + a * dt,
        0,
        Math.max(
          car.v,
          Math.min(160, PERSONALITIES[car.type].speed + this.variance(car)) /
            3.6,
        ),
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
      if (gate) {
        const move = moves.get(car.id),
          maximum = gate.gap / length;
        if (move.advance > maximum) {
          move.advance = maximum;
          move.v = Math.min(move.v, (maximum * length) / dt);
          car.safety = true;
        }
      }
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
              liveQueues[leftLane].has(front.id) ||
              this.junction.inApproachQueue(front, this) ||
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
      car.travelled += move.advance;
      const completed = Math.floor(car.travelled + 1e-9);
      if (!this.stream) this.laps += completed - car.laps;
      car.laps = completed;
      car.q = this.route.closed
        ? mod(car.q + move.advance)
        : car.q + move.advance;
      car.v = move.v;
      if (car.target !== null) {
        car.blend = Math.min(1, car.blend + dt / LANE_CHANGE_TIME);
        if (car.blend >= 1) {
          car.lane = car.target;
          car.target = null;
        }
      }
    }
    this.time += dt;
    if (this.stream) {
      const leaving = this.cars.filter((c) => c.travelled >= 1 - 1e-9);
      if (leaving.length) {
        this.exited += leaving.length;
        for (const car of leaving) this.entryObservations.delete(car.id);
        this.cars = this.cars.filter((c) => c.travelled < 1 - 1e-9);
        this.fleetVersion++;
      }
    }
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
      this.cars.reduce((s, c) => s + this.desiredSpeed(c) * 3.6, 0) /
      (speeds.length || 1);
    return {
      average,
      target,
      slow: speeds.filter((v) => v < 30).length,
      stopped: speeds.filter((v) => v < 5).length,
      density:
        this.cars.length /
        ((Array.from({ length: this.config.lanes }, (_, l) =>
          this.laneLength(l),
        ).reduce((a, b) => a + b, 0) *
          this.route.approaches) /
          1000),
      efficiency: target ? average / target : 0,
      completedLaps: this.laps,
      completedTrips: this.exited,
      arrived: this.arrived,
      entered: this.entered,
      upstream: this.arrived - this.entered,
      active: this.cars.length,
      throughputPerMinute:
        this.time > 0
          ? ((this.stream ? this.exited : this.laps) * 60) / this.time
          : 0,
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
  setSpeedVariance(id, value) {
    const car = this.cars.find((c) => c.id === id);
    if (!car || !Number.isFinite(value) || value < 0 || value > 20)
      return false;
    car.speedVariance = value;
    this.log(`Car ${id}: speed variance ±${value} km/h`);
    return true;
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
  addObstacle(q, lane, approach = 0) {
    q = this.route.closed ? mod(q) : clamp(q, 0, 1);
    if (this.route.inside(q)) return false;
    lane = Math.round(clamp(lane, 0, this.config.lanes - 1));
    // Never place a physical object inside a vehicle or an existing object.
    const clear = [...this.cars, ...this.obstacles].every(
      (c) =>
        !this.occupied(c, lane) ||
        !this.sameRoad(c, { approach }) ||
        (this.route.closed
          ? Math.min(mod(c.q - q), mod(q - c.q))
          : Math.abs(c.q - q)) *
          this.laneLength(lane) >
          9,
    );
    if (!clear) return false;
    this.obstacles.push({
      id: `o${this.nextObstacle++}`,
      q,
      lane,
      approach,
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
      delete c.yieldFor;
      delete c.yieldStopDistance;
      delete c.yieldCompletedAt;
    }
    this.log("All incidents cleared");
  }
}
