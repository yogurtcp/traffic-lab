import { parseArgs } from "node:util";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { resolveExperiment, ExperimentRunner } from "./lib/experiment.mjs";

const help = `Loop Lab simulation CLI

  npm run simulate -- --scenario examples/long-arms.json --output videos/demo.mp4
  npm run simulate -- --layout figure8 --intersection lights --lanes 2 \\
    --cars regular=20,slowpoke=4,stuntman=3 --duration 180 --speed 6 --output videos/run.mp4

Options:
  --scenario PATH       JSON scenario, including optional timed interventions
  --preset NAME         stream, crossing, mixed, perfect, wave, hogs, junction
  --layout NAME         circle, rectangle, figure8, u, cross
  --traffic MODE        stream (arrivals/exits) or fixed (closed-road counts)
  --interval SECONDS    Seconds between arrivals; 0.2–60, total across entrances
  --probabilities MIX   Percentages adding to 100, e.g. regular=70,slowpoke=30
  --intersection NAME   stop, lights, roundabout (figure8 or cross)
  --cars TYPE=COUNT,...  Exact mix; unspecified driver types have zero cars
  --lanes N             1–5 lanes
  --length METRES       600–2000 m base lap
  --reaction SECONDS    Shared 0–2 second reaction delay
  --seed N              Reproducible shuffle seed
  --duration SECONDS    Simulated time; default 120
  --speed MULTIPLIER    Simulated seconds per video second; default 4
  --fps N               Video frame rate; default 30
  --width N --height N  Even dimensions; default 1440 × 1080
  --title TEXT          Video title
  --output PATH         MP4 path (or JSON with --no-video)
  --no-video            Run quickly and export a JSON report without rendering
  --overwrite           Replace existing export files
  --help                Show this help

Video exports include matching .json metrics and a .png final-frame poster.
Run npm ci once to install rendering/encoder dependencies. Browser play needs none.
`;
async function main() {
  const strings = [
    "scenario",
    "preset",
    "layout",
    "intersection",
    "cars",
    "traffic",
    "interval",
    "probabilities",
    "lanes",
    "length",
    "reaction",
    "seed",
    "duration",
    "speed",
    "fps",
    "width",
    "height",
    "output",
    "title",
  ];
  const { values } = parseArgs({
    options: {
      ...Object.fromEntries(strings.map((k) => [k, { type: "string" }])),
      help: { type: "boolean" },
      overwrite: { type: "boolean" },
      "no-video": { type: "boolean" },
    },
    strict: true,
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const scenario = values.scenario
    ? JSON.parse(await readFile(resolve(values.scenario), "utf8"))
    : {};
  const experiment = resolveExperiment(scenario, values),
    runner = new ExperimentRunner(experiment);
  const output = resolve(
    values.output ??
      (values["no-video"] ? "videos/simulation.json" : "videos/simulation.mp4"),
  );
  if (values["no-video"]) {
    if (!/\.json$/i.test(output))
      throw new Error("--no-video requires a .json output path.");
    runner.advanceTo(experiment.duration);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(runner.report(), null, 2) + "\n", {
      flag: values.overwrite ? "w" : "wx",
    });
    console.log(`Report: ${output}`);
  } else {
    if (!/\.mp4$/i.test(output))
      throw new Error("Video output must end in .mp4.");
    const { renderVideo } = await import("./lib/video.mjs");
    const result = await renderVideo(runner, output, {
      overwrite: values.overwrite,
      progress: ({ frame, frames, simulated }) =>
        console.log(
          `Rendering ${Math.round((frame / frames) * 100)}% · ${simulated.toFixed(1)} simulated seconds`,
        ),
    });
    console.log(
      `Video: ${result.output}\nReport: ${result.report}\nPoster: ${result.poster}`,
    );
  }
  const stats = runner.sim.stats;
  console.log(
    `${runner.sim.time.toFixed(1)} simulated seconds · ${runner.sim.stream ? stats.completedTrips + " cars through" : stats.completedLaps + " full laps"} · ${stats.throughputPerMinute.toFixed(2)} ${runner.sim.stream ? "cars" : "laps"}/min · ${stats.average.toFixed(1)} km/h average`,
  );
  for (const event of runner.eventResults.filter((e) => !e.applied))
    console.warn(`Skipped ${event.type} at ${event.at}s: ${event.reason}`);
}
main().catch((error) => {
  console.error(`Simulation failed: ${error.message}`);
  process.exitCode = 1;
});
