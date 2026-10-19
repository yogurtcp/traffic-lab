# Simulation videos

The CLI runs the same fixed-step traffic model and Canvas road renderer as the interactive game. You can ask for an experiment in plain language, for example: “Run three minutes on the long-arm road with traffic lights, 12 Regulars, two Slowpokes, and three Stuntmen; break down car 9 after 75 seconds, repair it at 105 seconds, and give me a 6× video.”

For the new open-road experiments, you can ask: “Run the + junction with traffic lights, one arrival every 1.5 seconds, 70% Regulars, 20% Slowpokes, and 10% Stuntmen. Simulate two minutes at 6× and count cars that exit.”

```sh
npm run simulate -- --scenario examples/open-road.json --output videos/open-road.mp4
npm run simulate -- --layout u --interval 2 --probabilities regular=70,slowpoke=30 \
  --duration 120 --speed 6 --output videos/u-road.mp4
```

`--interval` or `--probabilities` selects arrival mode; `--traffic stream` also selects it explicitly. Percentages must sum to 100 and omitted driver types have zero probability. The interval is total offered demand across all entrances, not per lane or entrance. Entrances at a `cross` are chosen uniformly using the seed. Every blocked arrival waits upstream; at most 180 cars occupy the visible road. Reports include `arrived`, `entered`, `upstream`, `active`, `completedTrips`, and exit-based `throughputPerMinute`. Each car counts once on exit, and paused time is excluded. The video labels this **Cars through** and uses percentages in its driver legend.

Both `u` (sideways U) and `cross` (+ junction) are open roads. Cars at the + go to the opposite exit; `stop`, `lights`, and `roundabout` controls are available. Existing `circle`, `rectangle`, and `figure8` shapes also support arrival mode, with one circuit per arriving car. Their original fixed-count behavior remains available using `--cars` or `--traffic fixed`.

Install the video tools once (Node 18+):

```sh
npm ci
```

Export the included experiment:

```sh
npm run simulate -- --scenario examples/long-arms.json --output videos/demo.mp4
```

This runs **180 simulated seconds**, shown in a **30-second MP4 at 6× speed**, with a temporary brake, breakdown, and repair. Encoding takes additional wall-clock time. Outputs are `demo.mp4`, `demo.json` (configuration, intervention results, final statistics, and per-second metrics), and `demo.png` (the final frame). Videos include completed laps, average speed, slow traffic, driver counts, intersection state, and charts when space permits. The MP4 uses H.264, has no audio, and works in ordinary video players.

For a custom setup:

```sh
npm run simulate -- --layout figure8 --intersection lights --lanes 2 \
  --cars regular=20,slowpoke=4,stuntman=3 --length 1000 --reaction 0.9 \
  --seed 42 --duration 180 --speed 6 --output videos/custom.mp4
```

`--cars` gives exact counts in fixed mode; every omitted personality has zero cars. Available keys for both counts and probabilities are `regular`, `slowpoke`, `hog`, `speedster`, `stuntman`, `cautious`, `tailgater`, and `eco`. The fixed-car combined limit is 180, and the cars must physically fit. Intersection settings affect `figure8` and `cross`.

Default video size is **1440 × 1080 at 30 fps**. Set `--width`, `--height`, or `--fps` to change it; dimensions must be even. `--speed` accepts 0.25–50, independently of the browser's playback controls. `--duration` is simulated seconds, rounded to the nearest 0.05-second model step. Use `--overwrite` to replace an existing export. Generated files stay in the ignored `videos/` directory by default.

For fast experiments without encoding:

```sh
npm run simulate -- --preset wave --duration 600 --no-video --output videos/wave.json
```

Use `npm run simulate -- --help` for all flags. Command-line values override scenario settings. Available presets are `stream`, `crossing`, `mixed`, `perfect`, `wave`, `hogs`, and `junction`. The first two use arrivals; the original presets retain fixed counts.

## Timed interventions

Save a JSON scenario with a `config`, timing settings, and an `events` array. See [the complete example](examples/long-arms.json). Events use simulated seconds; lanes are **1-based**, with lane 1 the leftmost lane. Car IDs are stable for a given configuration and seed. The browser's vehicle list shows the same IDs for the same setup.

```json
{
  "title": "A broken car and its traffic wave",
  "config": {
    "layout": "circle",
    "lanes": 2,
    "length": 1000,
    "reaction": 0.9,
    "seed": 42,
    "counts": { "regular": 20, "stuntman": 2 }
  },
  "duration": 180,
  "speed": 6,
  "events": [
    { "at": 20, "type": "brake", "car": 1, "duration": 3 },
    { "at": 60, "type": "breakdown", "car": 9 },
    { "at": 90, "type": "repair", "car": 9 },
    { "at": 120, "type": "obstacle", "lane": 1, "q": 0.4 },
    { "at": 150, "type": "clear" }
  ]
}
```

| Event | Fields | Effect |
| --- | --- | --- |
| `brake` | `car`, optional `duration` (default 3 s) | Temporary braking. |
| `breakdown` | `car` | Stops a car until repaired. |
| `repair` | `car` | Releases that car. |
| `obstacle` | `lane`, `q` (0–1, excluding 1) | Places a stationary blockage at route progress `q`. |
| `remove-obstacle` | `id`, e.g. `"o1"` | Removes an existing obstacle by ID. |
| `clear` | — | Repairs cars, ends brake interventions, and removes obstacles. |

At the + junction, an obstacle can additionally specify `"approach": 1` (west), `2` (south), `3` (east), or `4` (north); the default is west. Other layouts use approach 1. Lane numbers remain 1-based.

Events execute at the first model tick at or after their requested time. The report records actual execution times and whether each intervention was applied. Occupied positions and the shared junction reject obstacle placement; this is reported explicitly. In fixed mode, referring to a nonexistent car fails before rendering starts. In arrival mode, IDs are assigned to scheduled arrivals; a car that has not entered or has already left is reported as unavailable, and its intervention is skipped. Time-zero interventions run before the first car enters.

The seed and fixed model step make results reproducible across frame rates and playback speeds. Changes to simulation code can change results between versions. Throughput follows the app: exits in arrival mode, and full laps (including repeats) in fixed mode.

The renderer uses `@napi-rs/canvas`, bundled Liberation fonts under the [SIL Open Font License](scripts/fonts/LICENSE.txt), and `ffmpeg-static`. These are local export tools; browser play still needs no packages or backend. Set `FFMPEG_PATH` if you prefer an installed FFmpeg executable. Press Ctrl+C to cancel an export; unfinished encoding files are cleaned up.
