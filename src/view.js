import { PERSONALITIES, clamp, mod } from "./model.js";
export function speedColor(speed) {
  const a =
    speed < 45 ? [219, 106, 85] : speed < 75 ? [224, 179, 88] : [106, 166, 124];
  return `rgb(${a.join(",")})`;
}
function fit(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, rect.width),
    h = Math.max(1, rect.height);
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
export class RoadView {
  constructor(canvas) {
    this.canvas = canvas;
    this.hits = [];
  }
  geometry(sim) {
    const { width: w, height: h } = this.canvas.getBoundingClientRect();
    if (sim.config.layout !== "circle") {
      const laneWidth =
        sim.config.layout === "figure8"
          ? clamp(Math.min(w, h) / (sim.config.lanes * 10 + 35), 5, 12)
          : clamp(Math.min(w, h) * 0.035, 10, 18);
      const maxX = Math.max(...sim.route.points.map((p) => Math.abs(p.x))),
        maxY = Math.max(...sim.route.points.map((p) => Math.abs(p.y)));
      const scale = Math.max(
        20,
        Math.min(
          (w / 2 - 24 - laneWidth * sim.config.lanes) / maxX,
          (h / 2 - 45 - laneWidth * sim.config.lanes) / maxY,
        ),
      );
      const inner = Math.min(maxX, maxY) * scale - 12;
      return {
        w,
        h,
        cx: w / 2,
        cy: h / 2 + 3,
        laneWidth,
        scale,
        inner,
        outer: inner + laneWidth * sim.config.lanes,
        radius: (l) => inner + laneWidth * (l + 0.5),
        config: sim.config,
      };
    }
    const outer = Math.min(w * 0.445, h * 0.432);
    const laneWidth = clamp(outer * 0.078, 12, 19);
    const inner = outer - laneWidth * sim.config.lanes;
    return {
      w,
      h,
      cx: w / 2,
      cy: h / 2 + 3,
      inner,
      outer,
      laneWidth,
      radius: (lane) => inner + laneWidth * (lane + 0.5),
      config: sim.config,
    };
  }
  point(q, lane, sim) {
    const g =
      this.lastGeometry?.config === sim.config
        ? this.lastGeometry
        : this.geometry(sim);
    this.lastGeometry = g;
    if (sim.config.layout !== "circle") {
      const p = sim.route.sample(q),
        offset = (lane + 0.5) * g.laneWidth;
      return {
        x: g.cx + p.x * g.scale + p.nx * offset,
        y: g.cy + p.y * g.scale + p.ny * offset,
        angle: p.heading + Math.PI / 2,
      };
    }
    const angle = -q * Math.PI * 2 - Math.PI / 2;
    return {
      x: g.cx + Math.cos(angle) * g.radius(lane),
      y: g.cy + Math.sin(angle) * g.radius(lane),
      angle,
    };
  }
  roadLocation(x, y, sim) {
    const g = this.geometry(sim);
    this.lastGeometry = g;
    if (sim.config.layout !== "circle") {
      let best = null;
      for (let lane = 0; lane < sim.config.lanes; lane++)
        for (let i = 0; i < 1400; i++) {
          const q = i / 1400,
            p = this.point(q, lane, sim),
            distance = Math.hypot(p.x - x, p.y - y);
          if (
            distance < g.laneWidth * 0.6 &&
            (!best || distance < best.distance)
          )
            best = { q, lane, distance };
        }
      // Keep the shared junction clear of user-placed obstructions. Incidents
      // can still be placed on every approach and outer connecting road.
      if (best && sim.route.inside(best.q)) return null;
      return best;
    }
    const dx = x - g.cx,
      dy = y - g.cy;
    const r = Math.hypot(dx, dy);
    if (r < g.inner || r > g.outer) return null;
    return {
      q: mod((-Math.atan2(dy, dx) - Math.PI / 2) / (2 * Math.PI)),
      lane: clamp(
        Math.floor((r - g.inner) / g.laneWidth),
        0,
        sim.config.lanes - 1,
      ),
    };
  }
  hit(x, y) {
    return this.hits
      .map((h) => ({ ...h, distance: Math.hypot(h.x - x, h.y - y) }))
      .filter((h) => h.distance < 14)
      .sort((a, b) => a.distance - b.distance)[0];
  }
  draw(sim, selected, speedOverlay = false) {
    const { ctx, w, h } = fit(this.canvas);
    const g = this.geometry(sim);
    this.lastGeometry = g;
    const { cx, cy, inner, outer, laneWidth } = g;
    this.hits = [];
    // Simple map vegetation is drawn in code; nothing is downloaded at runtime.
    const tree = (x, y, r) => {
      ctx.fillStyle = "#d6dfc9";
      ctx.beginPath();
      ctx.arc(x + 2, y + 3, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#c5d4b6";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#ccd9be";
      ctx.beginPath();
      ctx.arc(x - r / 4, y - r / 4, r * 0.66, 0, 7);
      ctx.fill();
    };
    [
      [0.09, 0.28, 9],
      [0.12, 0.32, 7],
      [0.86, 0.76, 10],
      [0.9, 0.72, 7],
      [0.83, 0.79, 6],
      [0.16, 0.8, 8],
      [0.89, 0.22, 9],
    ].forEach(([x, y, r]) => {
      if (Math.hypot(w * x - cx, h * y - cy) > outer + 17)
        tree(w * x, h * y, r);
    });
    if (sim.config.layout === "circle") {
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#c7d3b8";
      ctx.beginPath();
      ctx.arc(cx, cy, outer + 6, 0, 7);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#d6e0c9";
      ctx.beginPath();
      ctx.arc(cx, cy, inner - 7, 0, 7);
      ctx.stroke();
      ctx.fillStyle = "#343f3c";
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, 7);
      ctx.arc(cx, cy, inner, 0, 7, true);
      ctx.fill("evenodd");
      for (let l = 1; l < sim.config.lanes; l++) {
        ctx.setLineDash([6, 9]);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "#8a979079";
        ctx.beginPath();
        ctx.arc(cx, cy, inner + l * laneWidth, 0, 7);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#b0bba17d";
      for (const r of [inner + 2, outer - 2]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 7);
        ctx.stroke();
      }
      // A fixed measuring gate makes completed laps and travel direction legible.
      ctx.strokeStyle = "#c7d7b936";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - inner - 1);
      ctx.lineTo(cx, cy - outer + 1);
      ctx.stroke();
      for (let lane = 0; lane < sim.config.lanes; lane++) {
        const r = g.radius(lane);
        for (const q of [0.125, 0.375, 0.625, 0.875]) {
          const p = this.point(q, lane, sim);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle - Math.PI / 2);
          ctx.strokeStyle = "#b8c5b329";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-3, -3);
          ctx.lineTo(1, 0);
          ctx.lineTo(-3, 3);
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = "#b7c6a66b";
        ctx.font = "7px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(lane + 1, cx + r, cy + 2);
      }
      ctx.font = "7px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#91a082";
      ctx.fillText("LEFT / PASSING", cx, cy - inner + 13);
      ctx.fillText("RIGHT / CRUISING", cx, cy + outer + 16);
    } else this.drawNetwork(ctx, sim, g);
    for (const o of sim.obstacles) {
      const p = this.point(o.q, o.lane, sim);
      this.hits.push({ ...p, id: o.id, obstacle: true });
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle - Math.PI / 2);
      ctx.fillStyle = "#e6a263";
      ctx.strokeStyle = "#fff0cf";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-6, -4, 12, 8, 1);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#785136";
      ctx.beginPath();
      ctx.moveTo(-4, -3);
      ctx.lineTo(0, 3);
      ctx.moveTo(1, -3);
      ctx.lineTo(5, 3);
      ctx.stroke();
      ctx.restore();
    }
    for (const car of sim.cars) {
      const smooth = car.blend * car.blend * (3 - 2 * car.blend);
      const lane =
        car.target === null
          ? car.lane
          : car.from + (car.target - car.from) * smooth;
      const p = this.point(car.q, lane, sim);
      this.hits.push({ ...p, id: car.id, obstacle: false });
      const len = clamp(CAR_LENGTH_PIXELS(sim, car, g), 8, 12),
        wid = laneWidth * 0.43;
      if (car.v * 3.6 < 30) {
        ctx.strokeStyle = `rgba(224,112,85,${0.15 + (30 - car.v * 3.6) / 110})`;
        ctx.lineWidth = laneWidth * 0.75;
        ctx.beginPath();
        if (sim.config.layout === "circle")
          ctx.arc(cx, cy, g.radius(lane), p.angle - 0.025, p.angle + 0.025);
        else {
          ctx.moveTo(
            p.x - 3 * Math.cos(p.angle - Math.PI / 2),
            p.y - 3 * Math.sin(p.angle - Math.PI / 2),
          );
          ctx.lineTo(
            p.x + 3 * Math.cos(p.angle - Math.PI / 2),
            p.y + 3 * Math.sin(p.angle - Math.PI / 2),
          );
        }
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle - Math.PI / 2);
      if (car.id === selected) {
        ctx.strokeStyle = "#eaf7bb";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(-len / 2 - 3, -wid / 2 - 3, len + 6, wid + 6, 3);
        ctx.stroke();
      }
      ctx.fillStyle = "#111c1655";
      ctx.beginPath();
      ctx.roundRect(-len / 2 + 0.6, -wid / 2 + 1.2, len, wid, 1.8);
      ctx.fill();
      ctx.fillStyle = car.broken
        ? "#6b716b"
        : speedOverlay
          ? speedColor(car.v * 3.6)
          : PERSONALITIES[car.type].color;
      ctx.beginPath();
      ctx.roundRect(-len / 2, -wid / 2, len, wid, 1.8);
      ctx.fill();
      ctx.fillStyle = "#e9efdbb5";
      ctx.fillRect(len * 0.07, -wid * 0.33, len * 0.2, wid * 0.66);
      ctx.fillStyle = "#213f3d88";
      ctx.fillRect(-len * 0.28, -wid * 0.3, len * 0.15, wid * 0.6);
      const braking =
        car.a < -0.5 || car.safety || car.broken || sim.time < car.brakeUntil;
      ctx.fillStyle = braking ? "#ff6464" : "#c56d64";
      ctx.fillRect(-len / 2, -wid * 0.39, 1.5, wid * 0.24);
      ctx.fillRect(-len / 2, wid * 0.15, 1.5, wid * 0.24);
      ctx.fillStyle = "#fff1b1";
      ctx.fillRect(len / 2 - 1, -wid * 0.39, 1, wid * 0.2);
      ctx.fillRect(len / 2 - 1, wid * 0.19, 1, wid * 0.2);
      if (car.target !== null) {
        ctx.fillStyle = Math.sin(sim.time * 12) > 0 ? "#ffe56b" : "#9b854b";
        ctx.fillRect(0, car.target < car.from ? -wid / 2 : wid / 2 - 1, 2, 1);
      }
      if (car.broken) {
        ctx.strokeStyle = "#fff3c0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-2, -2);
        ctx.lineTo(2, 2);
        ctx.moveTo(2, -2);
        ctx.lineTo(-2, 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    return g;
  }
  drawNetwork(ctx, sim, g) {
    if (
      this.networkCache?.config !== sim.config ||
      this.networkCache.w !== g.w ||
      this.networkCache.h !== g.h
    )
      this.networkCache = {
        config: sim.config,
        w: g.w,
        h: g.h,
        paths: new Map(),
      };
    const trace = (lane, skipCenter = false) => {
      if (!this.networkCache.paths.has(lane)) {
        const path = [];
        for (let i = 0; i <= 1000; i++)
          path.push({
            ...this.point(i / 1000, lane, sim),
            inside: !!sim.route.inside(i / 1000),
          });
        this.networkCache.paths.set(lane, path);
      }
      ctx.beginPath();
      let fresh = true;
      for (const p of this.networkCache.paths.get(lane)) {
        if (skipCenter && p.inside) {
          fresh = true;
          continue;
        }
        if (fresh) {
          ctx.moveTo(p.x, p.y);
          fresh = false;
        } else ctx.lineTo(p.x, p.y);
      }
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    for (let lane = 0; lane < sim.config.lanes; lane++) {
      trace(lane);
      ctx.lineWidth = g.laneWidth + 1;
      ctx.strokeStyle = "#343f3c";
      ctx.stroke();
    }
    for (let boundary = 0; boundary <= sim.config.lanes; boundary++) {
      trace(boundary - 0.5, true);
      ctx.lineWidth = boundary === 0 || boundary === sim.config.lanes ? 1 : 0.8;
      ctx.strokeStyle =
        boundary === 0 || boundary === sim.config.lanes
          ? "#a6b49a88"
          : "#8a979079";
      ctx.setLineDash(
        boundary === 0 || boundary === sim.config.lanes ? [] : [6, 9],
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (sim.config.layout === "figure8") {
      const core = 0.17 * g.scale;
      if (sim.config.intersection === "roundabout") {
        ctx.strokeStyle = "#343f3c";
        ctx.lineWidth = g.laneWidth * sim.config.lanes + 2;
        ctx.beginPath();
        ctx.arc(
          g.cx,
          g.cy,
          core + (g.laneWidth * sim.config.lanes) / 2,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        for (let l = 1; l < sim.config.lanes; l++) {
          ctx.strokeStyle = "#8a979079";
          ctx.lineWidth = 0.8;
          ctx.setLineDash([5, 8]);
          ctx.beginPath();
          ctx.arc(g.cx, g.cy, core + l * g.laneWidth, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = "#d2dfbd";
        ctx.strokeStyle = "#a8bd93";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, core - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#79916a";
        ctx.textAlign = "center";
        ctx.font = "18px sans-serif";
        ctx.fillText("↶", g.cx, g.cy + 6);
      } else {
        ctx.fillStyle = "#343f3c";
        const half = Math.max(core, g.laneWidth * sim.config.lanes + 1);
        ctx.fillRect(g.cx - half, g.cy - half, half * 2, half * 2);
      }
      for (const entry of sim.route.entries) {
        const a = this.point(entry.q, -0.5, sim),
          b = this.point(entry.q, sim.config.lanes - 0.5, sim),
          sign = this.point(entry.q, sim.config.lanes + 0.7, sim);
        ctx.strokeStyle = "#eceddb";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (sim.config.intersection === "lights") {
          const phase = sim.junction.signal(sim.time),
            active = phase.axis === entry.axis;
          ctx.fillStyle = "#26332c";
          ctx.beginPath();
          ctx.roundRect(sign.x - 5, sign.y - 12, 10, 26, 3);
          ctx.fill();
          ["red", "amber", "green"].forEach((stage, i) => {
            ctx.fillStyle = (active ? phase.stage === stage : stage === "red")
              ? { red: "#ef7567", amber: "#edc169", green: "#a5d485" }[stage]
              : "#4a5647";
            ctx.beginPath();
            ctx.arc(sign.x, sign.y - 6 + i * 7, 2.3, 0, Math.PI * 2);
            ctx.fill();
          });
        } else if (sim.config.intersection === "stop") {
          ctx.fillStyle = "#bd5b50";
          ctx.strokeStyle = "#fff3df";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const t = Math.PI / 8 + (i * Math.PI) / 4,
              x = sign.x + 8 * Math.cos(t),
              y = sign.y + 8 * Math.sin(t);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#fff7df";
          ctx.font = "bold 4px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("STOP", sign.x, sign.y + 1.5);
        } else {
          ctx.fillStyle = "#fff3df";
          ctx.strokeStyle = "#bd6656";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sign.x - 6, sign.y - 4);
          ctx.lineTo(sign.x + 6, sign.y - 4);
          ctx.lineTo(sign.x, sign.y + 6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    for (let lane = 0; lane < sim.config.lanes; lane++)
      for (let i = 0; i < 12; i++) {
        const q = (i + 0.4) / 12;
        if (sim.route.inside(q)) continue;
        const p = this.point(q, lane, sim);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle - Math.PI / 2);
        ctx.strokeStyle = "#b8c5b34d";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-3, -2);
        ctx.lineTo(0, 0);
        ctx.lineTo(-3, 2);
        ctx.stroke();
        ctx.restore();
      }
    const gateA = this.point(0, -0.5, sim),
      gateB = this.point(0, sim.config.lanes - 0.5, sim);
    ctx.strokeStyle = "#e6efc47a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gateA.x, gateA.y);
    ctx.lineTo(gateB.x, gateB.y);
    ctx.stroke();
  }
}
function CAR_LENGTH_PIXELS(sim, car, g) {
  if (sim.config.layout !== "circle")
    return ((4.5 * g.scale * sim.route.total) / sim.laneLength(car.lane)) * 1.1;
  return (
    ((4.5 * 2 * Math.PI * g.radius(car.lane)) / sim.laneLength(car.lane)) * 1.35
  );
}
export function drawCharts(speedCanvas, waveCanvas, sim) {
  const { ctx, w, h } = fit(speedCanvas);
  const left = 24,
    right = w - 7,
    top = 8,
    bottom = h - 19;
  ctx.font = "7px sans-serif";
  ctx.textAlign = "right";
  for (const v of [0, 40, 80, 120, 160]) {
    const y = bottom - (v / 160) * (bottom - top);
    ctx.strokeStyle = "#ebeee4";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = "#a1ab95";
    ctx.fillText(v, left - 5, y + 2);
  }
  const samples = sim.samples;
  const end = Math.max(120, sim.time),
    start = end - 120;
  const points = samples
    .filter((s) => s.time >= start)
    .map((s) => ({
      x: left + ((s.time - start) / 120) * (right - left),
      y: bottom - (clamp(s.average, 0, 160) / 160) * (bottom - top),
    }));
  if (points.length) {
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, "#adc79166");
    gradient.addColorStop(1, "#adc79109");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(points[0].x, bottom);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points.at(-1).x, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#6e9663";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.fillStyle = "#a1ab95";
  ctx.textAlign = "left";
  ctx.fillText(`${Math.floor(start)}s`, left, h - 3);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.floor(end)}s`, right, h - 3);
  const wave = fit(waveCanvas);
  wave.ctx.fillStyle = "#f0f1e9";
  wave.ctx.fillRect(0, 0, wave.w, wave.h);
  const rows = samples.slice(-240);
  const rowHeight = wave.h / 240;
  rows.forEach((sample, i) =>
    sample.bins.forEach((speed, j) => {
      if (speed === null) return;
      wave.ctx.fillStyle = speedColor(speed);
      wave.ctx.fillRect(
        (j * wave.w) / 100,
        i * rowHeight,
        wave.w / 100 + 0.5,
        Math.max(1, rowHeight + 0.2),
      );
    }),
  );
  wave.ctx.strokeStyle = "#d9dfd0";
  wave.ctx.lineWidth = 0.6;
  wave.ctx.strokeRect(0.5, 0.5, wave.w - 1, wave.h - 1);
}
