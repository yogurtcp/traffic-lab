import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  link,
  rename,
  writeFile,
  access,
} from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { RoadView, drawCharts } from "../../src/view.js";
import { PERSONALITIES } from "../../src/model.js";

const stamp = (t) => {
  const seconds = Math.floor(t + 1e-7);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = "#fffefb";
  ctx.strokeStyle = "#dce2d3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  ctx.stroke();
}
export async function renderVideo(
  runner,
  output,
  { overwrite = false, progress = () => {} } = {},
) {
  let createCanvas, GlobalFonts, encoder;
  try {
    ({ createCanvas, GlobalFonts } = await import("@napi-rs/canvas"));
    encoder =
      process.env.FFMPEG_PATH || (await import("ffmpeg-static")).default;
  } catch {
    throw new Error(
      "Video rendering dependencies are missing. Run npm ci, then try again.",
    );
  }
  // Bundled fonts keep exports readable on machines without desktop fonts.
  for (const [file, family] of [
    ["LiberationSans-Regular.ttf", "sans-serif"],
    ["LiberationSans-Bold.ttf", "sans-serif"],
    ["LiberationMono-Bold.ttf", "monospace"],
  ]) {
    if (
      !GlobalFonts.registerFromPath(
        fileURLToPath(new URL(`../fonts/${file}`, import.meta.url)),
        family,
      )
    )
      throw new Error(`Could not load export font ${file}.`);
  }
  if (!encoder)
    throw new Error(
      "No video encoder is available. Set FFMPEG_PATH to a working ffmpeg executable.",
    );
  const e = runner.experiment,
    frames = Math.max(2, Math.ceil((e.duration / e.speed) * e.fps));
  if (frames > 216000)
    throw new Error(
      "This export exceeds 216,000 frames. Increase --speed, or reduce --duration or --fps.",
    );
  const reportPath = output.replace(/\.mp4$/i, ".json"),
    posterPath = output.replace(/\.mp4$/i, ".png");
  if (!overwrite)
    for (const path of [output, reportPath, posterPath]) {
      try {
        await access(path);
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      throw new Error(
        `${path} already exists. Choose another output or use --overwrite.`,
      );
    }
  await mkdir(dirname(output), { recursive: true });
  const temp = await mkdtemp(join(dirname(output), ".loop-export-")),
    tempVideo = join(temp, "video.mp4");
  const canvas = createCanvas(e.width, e.height),
    ctx = canvas.getContext("2d");
  const margin = Math.max(16, Math.round(e.width * 0.018)),
    sidebar = Math.max(210, Math.round(e.width * 0.23));
  const header = Math.max(90, Math.round(e.height * 0.105)),
    roadWidth = e.width - sidebar - margin * 3,
    roadHeight = e.height - header - margin * 2;
  const roadCanvas = createCanvas(roadWidth, roadHeight);
  roadCanvas.getBoundingClientRect = () => ({
    width: roadWidth,
    height: roadHeight,
  });
  const road = new RoadView(roadCanvas);
  const chart = createCanvas(sidebar - 28, 120),
    wave = createCanvas(sidebar - 28, 70);
  chart.getBoundingClientRect = () => ({ width: sidebar - 28, height: 120 });
  wave.getBoundingClientRect = () => ({ width: sidebar - 28, height: 70 });
  const child = spawn(
    encoder,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-framerate",
      String(e.fps),
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      tempVideo,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let errors = "",
    cancelled = false,
    lastPng;
  child.stderr.on("data", (data) => {
    errors = (errors + data.toString()).slice(-12000);
  });
  child.stdin.on("error", () => {});
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Video encoder exited with ${code}: ${errors}`)),
    );
  });
  done.catch(() => {});
  const interrupt = () => {
    cancelled = true;
    child.kill("SIGTERM");
  };
  process.once("SIGINT", interrupt);
  try {
    for (let frame = 0; frame < frames; frame++) {
      if (cancelled) throw new Error("Video export cancelled.");
      const sim = runner.advanceTo((frame / (frames - 1)) * e.duration),
        stats = sim.stats;
      ctx.fillStyle = "#f4f3ed";
      ctx.fillRect(0, 0, e.width, e.height);
      ctx.fillStyle = "#2d4735";
      ctx.font = `bold ${Math.max(18, Math.min(e.width * 0.023, header * 0.36))}px sans-serif`;
      ctx.fillText("LOOP LAB", margin, header * 0.39);
      ctx.font = `${Math.max(12, Math.min(e.width * 0.012, header * 0.19))}px sans-serif`;
      ctx.fillStyle = "#78866d";
      ctx.fillText(e.title, margin, header * 0.69, e.width - margin * 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#304a36";
      ctx.font = `bold ${Math.max(15, Math.min(e.width * 0.017, header * 0.29))}px monospace`;
      ctx.fillText(
        `${stamp(sim.time)}  ·  ${e.speed}×`,
        e.width - margin,
        header * 0.39,
      );
      ctx.textAlign = "left";
      road.draw(sim, null);
      const rc = roadCanvas.getContext("2d");
      rc.globalCompositeOperation = "destination-over";
      rc.fillStyle = "#eaf0df";
      rc.fillRect(0, 0, roadWidth, roadHeight);
      rc.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(margin, header, roadWidth, roadHeight, 18);
      ctx.clip();
      ctx.drawImage(roadCanvas, margin, header);
      ctx.restore();
      const x = roadWidth + margin * 2,
        y = header,
        w = sidebar;
      panel(ctx, x, y, w, roadHeight);
      const fontScale = Math.min(1.3, Math.max(0.72, e.height / 900));
      let at = y + 30;
      const label = (text) => {
        ctx.font = `${Math.round(10 * fontScale)}px sans-serif`;
        ctx.fillStyle = "#839077";
        ctx.fillText(text, x + 18, at);
        at += 20 * fontScale;
      };
      const metric = (name, value, unit) => {
        label(name);
        ctx.font = `bold ${Math.round(29 * fontScale)}px sans-serif`;
        ctx.fillStyle = "#314b36";
        ctx.fillText(String(value), x + 18, at + 8);
        ctx.font = `${Math.round(10 * fontScale)}px sans-serif`;
        ctx.fillStyle = "#819074";
        ctx.fillText(
          unit,
          x +
            18 +
            Math.min(w * 0.49, String(value).length * 18 * fontScale + 10),
          at + 7,
        );
        at += 42 * fontScale;
      };
      metric("COMPLETED LAPS", stats.completedLaps, "including repeat laps");
      metric("AVERAGE SPEED", Math.round(stats.average), "km/h");
      metric("SLOW TRAFFIC", stats.slow, `/ ${sim.cars.length} cars`);
      label(
        `${sim.config.layout.toUpperCase()} · ${sim.config.lanes} LANE${sim.config.lanes > 1 ? "S" : ""}`,
      );
      ctx.font = `${Math.round(10 * fontScale)}px sans-serif`;
      ctx.fillStyle = "#586f4d";
      const control = sim.route.entries.length
        ? sim.junction.label(sim.time)
        : "Uninterrupted loop";
      ctx.fillText(control, x + 18, at, w - 36);
      at += 24 * fontScale;
      label("THE DRIVER MIX");
      for (const [key, p] of Object.entries(PERSONALITIES)) {
        const count = sim.config.counts[key];
        if (!count) continue;
        ctx.fillStyle = p.color;
        ctx.fillRect(x + 18, at - 8, 9, 9);
        ctx.fillStyle = "#53664b";
        ctx.font = `${Math.round(11 * fontScale)}px sans-serif`;
        ctx.fillText(`${count}  ${p.name}`, x + 36, at, w - 50);
        at += 19 * fontScale;
      }
      if (at + 150 < y + roadHeight) {
        at += 12;
        label("SPEED OVER TIME");
        drawCharts(chart, wave, sim);
        ctx.drawImage(chart, x + 14, at);
        at += 132;
      }
      if (at + 125 < y + roadHeight) {
        label("ROAD POSITION → · TIME ↓");
        ctx.drawImage(wave, x + 14, at);
        at += 90;
      }
      if (at + 45 < y + roadHeight) {
        label("LATEST INTERVENTION");
        ctx.font = `${Math.round(10 * fontScale)}px sans-serif`;
        ctx.fillStyle = "#8e6146";
        const event = sim.events[0];
        ctx.fillText(
          event
            ? `${stamp(event.time)} · ${event.text}`
            : "No intervention yet",
          x + 18,
          at,
          w - 36,
        );
      }
      lastPng = await canvas.encode("png");
      await new Promise((resolve, reject) =>
        child.stdin.write(lastPng, (error) =>
          error ? reject(error) : resolve(),
        ),
      );
      if (
        frame % Math.max(1, Math.round(e.fps * 5)) === 0 ||
        frame === frames - 1
      )
        progress({ frame: frame + 1, frames, simulated: sim.time });
    }
    child.stdin.end();
    await done;
    if (overwrite) await rename(tempVideo, output);
    else await link(tempVideo, output);
    const video = {
      file: basename(output),
      fps: e.fps,
      frames,
      width: e.width,
      height: e.height,
      seconds: frames / e.fps,
      playbackSpeed: e.speed,
    };
    await writeFile(
      reportPath,
      JSON.stringify(runner.report(video), null, 2) + "\n",
      { flag: overwrite ? "w" : "wx" },
    );
    await writeFile(posterPath, lastPng, { flag: overwrite ? "w" : "wx" });
    return { output, report: reportPath, poster: posterPath, video };
  } catch (error) {
    child.kill("SIGTERM");
    await done.catch(() => {});
    throw error;
  } finally {
    process.off("SIGINT", interrupt);
    await rm(temp, { recursive: true, force: true });
  }
}
