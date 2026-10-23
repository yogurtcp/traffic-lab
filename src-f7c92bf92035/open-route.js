const clamp = (q) => Math.max(0, Math.min(1, q));
export const U_BEND_RADIUS = 1.05;
export function getOpenRoute(layout, intersection, length) {
  const points = [],
    markers = [];
  const add = (x, y) => points.push({ x, y });
  const line = (x, y) => {
    const a = points.at(-1);
    for (let i = 1; i <= 40; i++)
      add(a.x + ((x - a.x) * i) / 40, a.y + ((y - a.y) * i) / 40);
  };
  const arc = (x, y, r, a, b) => {
    for (let i = 1; i <= 96; i++) {
      const t = a + ((b - a) * i) / 96;
      add(x + r * Math.cos(t), y + r * Math.sin(t));
    }
  };
  const curve = (b, c, d) => {
    const a = points.at(-1);
    for (let i = 1; i <= 64; i++) {
      const t = i / 64,
        s = 1 - t;
      add(
        s * s * s * a.x +
          3 * s * s * t * b.x +
          3 * s * t * t * c.x +
          t * t * t * d.x,
        s * s * s * a.y +
          3 * s * s * t * b.y +
          3 * s * t * t * c.y +
          t * t * t * d.y,
      );
    }
  };
  if (layout === "u") {
    add(-1.6, -U_BEND_RADIUS);
    line(0.15, -U_BEND_RADIUS);
    arc(0.15, 0, U_BEND_RADIUS, -Math.PI / 2, Math.PI / 2);
    line(-1.6, U_BEND_RADIUS);
  } else {
    const arm = 2.1,
      edge = 0.65,
      core = 0.3,
      diag = core / Math.sqrt(2);
    add(-arm, 0);
    line(-edge, 0);
    const entryIndex = points.length - 1;
    if (intersection === "roundabout") {
      curve(
        { x: -core + 0.005, y: 0 },
        { x: -diag - core * 0.32, y: diag - core * 0.32 },
        { x: -diag, y: diag },
      );
      arc(0, 0, core, Math.PI * 0.75, Math.PI * 0.25);
      curve(
        { x: diag + core * 0.32, y: diag - core * 0.32 },
        { x: core - 0.005, y: 0 },
        { x: edge, y: 0 },
      );
    } else line(edge, 0);
    markers.push({ entryIndex, exitIndex: points.length - 1 });
    line(arm, 0);
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
  const total = lengths.at(-1),
    approaches = layout === "cross" ? 4 : 1;
  const rotate = (p, i) => {
    const t = (-i * Math.PI) / 2;
    return {
      x: p.x * Math.cos(t) - p.y * Math.sin(t),
      y: p.x * Math.sin(t) + p.y * Math.cos(t),
    };
  };
  const start = markers.length ? lengths[markers[0].entryIndex] : 0;
  const end = markers.length ? lengths[markers[0].exitIndex] : total;
  const entryQ = 0.5 - 20 / length,
    exitQ = 0.5 + 20 / length;
  const entries = markers.flatMap((m) =>
    Array.from({ length: approaches }, (_, i) => ({
      q: entryQ,
      exitQ,
      approach: i,
      axis: i % 2,
    })),
  );
  return {
    layout,
    intersection,
    closed: false,
    approaches,
    total,
    entries,
    points: Array.from({ length: approaches }, (_, i) =>
      points.map((p) => rotate(p, i)),
    ).flat(),
    sample(q, approach = 0) {
      q = clamp(q);
      // The road drawing exaggerates lane widths. Keep the controlled area
      // physically 40 m long instead of making it hundreds of metres wide.
      const distance = !markers.length
        ? q * total
        : q < entryQ
          ? (q / entryQ) * start
          : q <= exitQ
            ? start + ((q - entryQ) / (exitQ - entryQ)) * (end - start)
            : end + ((q - exitQ) / (1 - exitQ)) * (total - end);
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
      const p = rotate(
        { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        approach,
      );
      const heading =
        Math.atan2(b.y - a.y, b.x - a.x) - (approach * Math.PI) / 2;
      return { ...p, heading, nx: -Math.sin(heading), ny: Math.cos(heading) };
    },
    inside(q) {
      return entries.find((e) => q >= e.q && q <= e.exitQ);
    },
  };
}
