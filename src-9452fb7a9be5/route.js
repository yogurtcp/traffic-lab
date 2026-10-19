import { getOpenRoute } from "./open-route.js";
const tau = Math.PI * 2;
const wrap = (v) => ((v % 1) + 1) % 1;
const cache = new Map();
export const FIGURE8_GEOMETRY = {
  arm: 2.1,
  core: 0.3,
  edge: 0.65,
  bendRadius: 0.8,
};

// One continuous reference path. The four-lobed layout visits a four-arm
// crossing from west, south, east, and north, in that order each lap.
export function getRoute(
  layout = "circle",
  intersection = "stop",
  length = 1000,
) {
  const key = `${layout}:${intersection}${layout === "cross" ? ":" + length : ""}`;
  if (cache.has(key)) return cache.get(key);
  if (layout === "u" || layout === "cross") {
    const route = getOpenRoute(layout, intersection, length);
    cache.set(key, route);
    return route;
  }
  const points = [],
    markers = [];
  const add = (x, y) => points.push({ x, y });
  const line = (x, y) => {
    const start = points.at(-1),
      n = 32;
    for (let i = 1; i <= n; i++)
      add(start.x + ((x - start.x) * i) / n, start.y + ((y - start.y) * i) / n);
  };
  const curve = (c1, c2, end) => {
    const start = points.at(-1);
    for (let i = 1; i <= 100; i++) {
      const t = i / 100,
        s = 1 - t;
      add(
        s * s * s * start.x +
          3 * s * s * t * c1.x +
          3 * s * t * t * c2.x +
          t * t * t * end.x,
        s * s * s * start.y +
          3 * s * s * t * c1.y +
          3 * s * t * t * c2.y +
          t * t * t * end.y,
      );
    }
  };
  const arc = (cx, cy, radius, from, to) => {
    for (let i = 1; i <= 64; i++) {
      const a = from + ((to - from) * i) / 64;
      add(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    }
  };
  if (layout === "rectangle") {
    const r = 0.34,
      x = 1,
      y = 0.68;
    add(0, -y);
    line(-x + r, -y);
    arc(-x + r, -y + r, r, -Math.PI / 2, -Math.PI);
    line(-x, y - r);
    arc(-x + r, y - r, r, Math.PI, Math.PI / 2);
    line(x - r, y);
    arc(x - r, y - r, r, Math.PI / 2, 0);
    line(x, -y + r);
    arc(x - r, -y + r, r, 0, -Math.PI / 2);
    line(0, -y);
  } else if (layout === "figure8") {
    const { arm, core, edge, bendRadius } = FIGURE8_GEOMETRY;
    const rotated = (x, y, i) => ({
      x: x * Math.cos((-i * Math.PI) / 2) - y * Math.sin((-i * Math.PI) / 2),
      y: x * Math.sin((-i * Math.PI) / 2) + y * Math.cos((-i * Math.PI) / 2),
    });
    const rline = (x, y, i) => {
      const p = rotated(x, y, i);
      line(p.x, p.y);
    };
    add(-arm, 0);
    for (let i = 0; i < 4; i++) {
      rline(-edge, 0, i);
      const entryIndex = points.length - 1;
      if (intersection === "roundabout") {
        const diag = core / Math.sqrt(2);
        curve(
          rotated(-core + 0.005, 0, i),
          rotated(-diag - core * 0.32, diag - core * 0.32, i),
          rotated(-diag, diag, i),
        );
        for (let j = 1; j <= 48; j++) {
          const a = Math.PI * 0.75 - (Math.PI * 0.5 * j) / 48;
          const p = rotated(Math.cos(a) * core, Math.sin(a) * core, i);
          add(p.x, p.y);
        }
        curve(
          rotated(diag + core * 0.32, diag - core * 0.32, i),
          rotated(core - 0.005, 0, i),
          rotated(edge, 0, i),
        );
      } else rline(edge, 0, i);
      markers.push({
        entryIndex,
        exitIndex: points.length - 1,
        approach: i,
        axis: i % 2,
      });
      rline(arm, 0, i);
      // Two constant-radius bends joined by a diagonal keep the long arms
      // smooth. Unlike a single cubic, these cannot pinch at the outer tips
      // when the inside lanes are widened.
      const turn = (-i * Math.PI) / 2;
      const first = rotated(arm, bendRadius, i);
      arc(
        first.x,
        first.y,
        bendRadius,
        -Math.PI / 2 + turn,
        Math.PI / 4 + turn,
      );
      rline(
        bendRadius * (1 + Math.SQRT1_2),
        arm + bendRadius * Math.SQRT1_2,
        i,
      );
      const second = rotated(bendRadius, arm, i);
      arc(second.x, second.y, bendRadius, Math.PI / 4 + turn, Math.PI + turn);
    }
  } else {
    for (let i = 0; i <= 512; i++) {
      const a = -Math.PI / 2 - (tau * i) / 512;
      add(Math.cos(a), Math.sin(a));
    }
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        ),
    );
  const total = lengths.at(-1);
  const entries = markers.map((m) => ({
    ...m,
    q: lengths[m.entryIndex] / total,
    exitQ: lengths[m.exitIndex] / total,
  }));
  const route = {
    closed: true,
    approaches: 1,
    layout,
    intersection,
    points,
    total,
    entries,
    sample(q) {
      const distance = wrap(q) * total;
      let lo = 0,
        hi = lengths.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (lengths[mid] <= distance) lo = mid;
        else hi = mid;
      }
      const a = points[lo],
        b = points[hi],
        f = (distance - lengths[lo]) / (lengths[hi] - lengths[lo] || 1);
      const heading = Math.atan2(b.y - a.y, b.x - a.x);
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        heading,
        nx: -Math.sin(heading),
        ny: Math.cos(heading),
      };
    },
    inside(q) {
      return entries.find((e) => q >= e.q && q <= e.exitQ);
    },
    usableIntervals(buffer = 0) {
      const usable = [];
      let start = 0;
      for (const e of entries) {
        const end = Math.max(0, e.q - buffer);
        if (end > start) usable.push([start, end]);
        start = Math.min(1, e.exitQ + buffer);
      }
      if (start < 1) usable.push([start, 1]);
      return usable;
    },
    spawn(u, buffer = 0) {
      const intervals = this.usableIntervals(buffer),
        available = intervals.reduce((s, [a, b]) => s + b - a, 0);
      let remaining = wrap(u) * available;
      for (const [a, b] of intervals) {
        if (remaining <= b - a) return a + remaining;
        remaining -= b - a;
      }
      return 0;
    },
  };
  cache.set(key, route);
  return route;
}
