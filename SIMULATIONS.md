# Simulation videos

The CLI runs the same fixed-step traffic model and Canvas road renderer as the interactive game. You can ask for an experiment in plain language, for example: “Run three minutes on the long-arm road with traffic lights, 12 Regulars, two Slowpokes, and three Stuntmen; break down car 9 after 75 seconds, repair it at 105 seconds, and give me a 6× video.”

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

`--cars` gives exact counts; every omitted personality has zero cars. Available keys are `regular`, `slowpoke`, `hog`, `speedster`, `stuntman`, `cautious`, `tailgater`, and `eco`. The combined limit is 180, and the cars must physically fit. Layouts are `circle`, `rectangle`, and `figure8`; intersection modes are `stop`, `lights`, and `roundabout` (the latter settings affect only the figure-eight).

Default video size is **1440 × 1080 at 30 fps**. Set `--width`, `--height`, or `--fps` to change it; dimensions must be even. `--speed` accepts 0.25–50, independently of the browser's playback controls. `--duration` is simulated seconds, rounded to the nearest 0.05-second model step. Use `--overwrite` to replace an existing export. Generated files stay in the ignored `videos/` directory by default.

For fast experiments without encoding:

```sh
npm run simulate -- --preset wave --duration 600 --no-video --output videos/wave.json
```

Use `npm run simulate -- --help` for all flags. Command-line values override scenario settings. Available presets are `mixed`, `perfect`, `wave`, `hogs`, and `junction`.

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

Events execute at the first model tick at or after their requested time. The report records actual execution times and whether each intervention was applied. Occupied positions and the shared junction reject obstacle placement; this is reported explicitly. Referring to a nonexistent car fails before rendering starts.

The seed and fixed model step make results reproducible across frame rates and playback speeds. Changes to simulation code can change results between versions. Throughput uses the same definition as the app: every full lap from each car's own starting position, including repeated laps.

The renderer uses `@napi-rs/canvas`, bundled Liberation fonts under the [SIL Open Font License](scripts/fonts/LICENSE.txt), and `ffmpeg-static`. These are local export tools; browser play still needs no packages or backend. Set `FFMPEG_PATH` if you prefer an installed FFmpeg executable. Press Ctrl+C to cancel an export; unfinished encoding files are cleaned up.
