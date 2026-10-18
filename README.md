# Loop Lab

**[Play the traffic playground](https://yogurtcp.github.io/traffic-lab/)** · [Source](https://github.com/yogurtcp/traffic-lab)

A traffic-loop experiment: mix drivers, compare road layouts and intersection rules, and turn one small brake into a wave of traffic. Standalone HTML, CSS, and JavaScript, deployed to GitHub Pages like the other games. No backend or runtime packages.

## Run locally

```sh
npm start
```

Open **http://localhost:4180**. Node 18+ is sufficient; no dependency installation is required. `PORT=4181 npm start` selects another port.

To export simulation videos, run `npm ci` once, then:

```sh
npm run simulate -- --scenario examples/long-arms.json --output videos/demo.mp4
```

This creates a 30-second MP4 showing three simulated minutes at 6× speed, plus a JSON statistics report and PNG preview. Customize the road, exact driver counts, speed, seed, and timed interventions through flags or a scenario file. See [simulation CLI documentation](SIMULATIONS.md).

## Make an experiment

1. Choose a circle, rounded rectangle, or four-arm figure-eight; then choose 1–5 lanes, a 600–2,000 m base lap, and a shared 0–2 second reaction time. On the figure-eight, choose the central intersection rule.
2. Enter the exact count of each driver type. The combined limit is 180; cars must also physically fit in their assigned lanes.
3. **Apply & reset**, then **Start simulation**. Circle and rectangle lanes start with identical intervals between cars at their desired speeds. On the four-arm loop, cars start at rest, evenly distributed over open road with the junction kept clear. A seed makes the driver order reproducible. Left-lane hogs start in lane 1; the remaining drivers fill the least populated lanes.
4. Use **Brake** to brake a car for three seconds, **Break down** for a persistent stoppage, or **Obstacle** to close a small patch of a lane. Obstacles cannot be placed inside cars. **Remove / repair** reverses incidents, and **Clear all incidents** releases the entire road.
5. Inspect a car for its speed, personality, following gap, and current behavior. The vehicle list offers keyboard-accessible alternatives to clicking cars.

Space toggles playback when focus is outside an input or button. Escape returns to Inspect. Pause, one-second stepping, restart, and ½×–5× time controls help inspect the chain reaction. Background tabs do not accumulate simulation time. Setup is saved locally; running experiments are not saved.

Presets: **Mixed company**, **Perfect flow**, **Phantom jam**, **Left-lane blockade**, and **Junction lab**. For a clear traffic-wave experiment, choose Phantom jam, apply, let it settle for 30 simulated seconds, then try the brake-pulse button. Junction lab starts with eight Regulars and one lane so the intersection rules are easy to compare; select a mode and apply to restart the same experiment.

## Layouts and junctions

Circle and rounded rectangle are uninterrupted loops. The four-arm figure-eight joins four approaches with smooth outer connections and revisits the central junction four times per full lap. Lane 1 is always the leftmost lane in the direction of travel; the junction approaches have separate incoming and outgoing carriageways.

The four-arm layout has extended straight approaches and generous constant-radius outer turns. A taller viewport, wider lanes, and enlarged car sprites make the road easier to read. Sprite sizes adapt to local spacing to keep queued cars distinct.

| Control        | Behavior                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All-way stop   | Each car must stop, wait one second plus the shared reaction delay, and take its turn in stopped-arrival order. One car clears the junction at a time. Equal-time arrivals use car ID for reproducibility.                                                                     |
| Traffic lights | East–west and north–south alternate: 12 seconds green, 2 amber, 1 all-red. New entries wait out the reaction delay at green. Conflicting traffic waits until already-admitted vehicles clear, even when the signal cycle advances. Cars on the same axis may proceed together. |
| Roundabout     | Cars yield to circulating traffic and can enter without a mandatory full stop when clear. This simplified roundabout admits one circulating car at a time; it does not model real multi-vehicle roundabout capacity.                                                           |

All personalities obey junction right of way. Lane changes are disabled near or inside the junction, and queued lanes may advance independently instead of triggering the ordinary no-passing-on-the-right rule. Junction speed targets are 25 km/h for stops, 45 for lights, and 35 for the roundabout. Incidents can be placed on approaches and outer loops; center placements are rejected. A broken car already admitted keeps the junction blocked until repaired and clear.

## Driver personalities

| Driver            | Desired speed    | Behavior                                                                      |
| ----------------- | ---------------- | ----------------------------------------------------------------------------- |
| Regular           | 90 km/h          | Passes cars doing 70 km/h or less on the left; keeps right when clear.        |
| Slowpoke          | 70 km/h          | Slower cruise, moderate following space; passes slower vehicles on the left.  |
| Annoying slowpoke | 70 km/h          | Stays in the leftmost lane. Avoids stationary obstructions and returns left.  |
| Speedster         | 110 km/h         | Same passing policy as Regular, with a higher desired speed.                  |
| Stuntman          | 160 km/h maximum | Cuts into small gaps on either side, forcing following drivers to brake.      |
| Cautious          | 80 km/h          | Large following distance, gentle acceleration, and conservative lane changes. |
| Tailgater         | 90 km/h          | Short following distance, eager acceleration, and hard braking.               |
| Eco driver        | 90 km/h          | Gentle acceleration and extra space to absorb speed changes.                  |

The road speed limit is 90 km/h. Speedster and Stuntman intentionally exceed it. All drivers use the same selected perception delay. Ordinary passing on the right is prevented for everyone except Stuntman, including across nonadjacent lanes. Stationary obstacles, broken vehicles, and their connected slow queues can be avoided on either side. This exception keeps the adjacent lane moving so blocked drivers can find a gap to merge; an unrelated obstacle elsewhere on the ring does not allow passing on the right.

Ordinary passing requires traffic ahead to be at least 2 km/h below the driver's desired speed and not pulling away. The passing lane must also offer more than 2 km/h of speed advantage over that traffic. A slowpoke therefore follows another car doing 70 km/h instead of moving out to pass it. Obstacle avoidance and the Annoying slowpoke's preference for the leftmost lane are separate decisions.

Regulars accept smaller lane-change gaps than steady cruising gaps: at least 4 m, with a half-second speed allowance and extra room for closing traffic. Returning right requires about 28 m of clear road at 90 km/h, rather than 100 m. Before moving either way, they check the destination follower's predicted braking after the shared reaction delay and the first half of the lane change. The estimate also accounts for their own slowing in the source lane. They accept comfortable braking up to 2.5 m/s², capped by that follower's own comfort setting, and still wait for a close, faster car to pass. Right-side obstacle bypasses retain their existing exception so a blocked queue can merge into moving traffic.

Other ordinary personalities retain their larger merge margins and the stricter left-merge check: the shared reaction delay plus the full 1.6-second maneuver, with at most 1.5 m/s² predicted follower braking (or its comfort setting, if lower). Cautious drivers still require extra space. Stuntmen skip the courtesy check and accept much tighter cut-ins.

## What to watch

- Average speed, cars below 30 km/h, lane changes, and speed as a percentage of the mix's desired speed.
- **Throughput** counts every full lap travelled from each car's own starting point, including repeat laps by the same car. A car spawned just before the reference marker does not count an initial partial lap. The smaller rate is completed laps per simulated minute, averaged since reset; paused wall-clock time is excluded. Inspecting a car also shows its own completed laps.
- The speed chart holds the last two simulated minutes.
- The road-position chart adds a row every half second, up to 240 rows. Horizontal position is progress around the ring; time runs downward. Red diagonal traces show slowdowns moving between road positions. Empty bins are pale; bins with several cars average their speed.
- Car colors identify personalities. Red rear lights indicate braking. **How it works** includes a switch to color cars by speed.

## Model and limits

This is an educational microsimulation, not a calibrated traffic forecast. Car following uses an [Intelligent Driver Model–style](https://www.mtreiber.de/publications/timedelay_TRR07_final.pdf) rule: acceleration depends on desired speed, following gap, and closing speed. The app applies the common reaction delay to past traffic snapshots; personality parameters set acceleration, comfortable braking, and desired following time. Lane choices are custom rules rather than the full MOBIL model.

Integration uses a fixed 0.05 s step, independent of rendering and playback speed. Lane 1 is the leftmost lane. Circle and rectangle travel counterclockwise; their outer laps grow by `2π × 3.7 m` per lane. Right-hand lanes in the four-lobed layout have shorter offset paths, approximated by subtracting `6π × 3.7 m` per lane. Cars in different lanes share a reference-path progress coordinate; local offset geometry is an approximation outside a circle, and bend speeds are not individually calibrated. Lane changes take 1.6 seconds and reserve both lanes. Ordinary drivers require comfortable front and rear gaps. Stuntmen accept much smaller physical gaps, disregard the following driver's comfortable braking distance, and can start another change 1.8 seconds after the previous one began. They consider extra room and faster traffic even when both lane acceleration estimates call for hard braking. Vehicles are 4.5 m long; the drawing enlarges their sprites for visibility.

A final safety guard prevents vehicle overlap and ordinary right-side passing, even with extreme delays or sudden obstructions. It can brake more sharply than the car-following model, so crashes are excluded. Reaction delay is therefore visible in ordinary following but can be overridden by this guard. These are closed routes without entrances, exits, trucks, weather, pedestrians, or crash physics. The optional lane-avoiding behavior around incidents uses delayed information, while the final merge safety check uses current positions. Junction reservations prevent conflicting approaches entering together; the controls are simplified experiments, not calibrated intersection engineering models.

## Checks and deployment

```sh
npm test
npm run build
npm run deploy
```

`npm test` covers initialization, seeded reproduction, physical units, desired speed caps, delayed braking, recovery and repairs, obstacle placement, passing law, merge safety, dense queues, and congestion waves. See [verification notes](IMPLEMENTATION_STATUS.md) for UI checks and limitations.

`npm run build` creates `dist/`, with content-versioned JavaScript and CSS to prevent mixed cached versions. All app paths are relative and work under the GitHub Pages repository subpath. The only optional external resource is Google Fonts; system fonts are used if it is unavailable.

Deployment requires Git and authenticated GitHub CLI. Push source to `main`, then run `npm run deploy`. It tests, builds, pushes a `gh-pages` commit using a separate Git index, and configures GitHub Pages. It does not change the source checkout or require a workflow token scope.

## Source map

- `src/model.js` — deterministic simulation, delayed perception, driver traits, lane changes, interventions, statistics.
- `src/view.js` — Canvas road, vehicles, hit testing, speed and road-position charts.
- `src/route.js` — closed reference paths, smooth curves, junction markers, and spawn placement.
- `src/junction.js` — stop ordering, signal phases, circulating priority, conflict reservations, and stop-line guards.
- `src/app.js` — setup, playback, persistent preferences, pointer and keyboard controls.
- `src/style.css` — responsive interface.
- `tests/model.test.js` — model regression checks using Node's built-in test runner.
- `tests/routes.test.js` — geometry, pointer placement, full-lap throughput, and intersection behavior/conflict checks.
- `tests/cli.test.js` — scenario validation, deterministic interventions, metrics, and CLI output protection.
- `scripts/simulate.mjs`, `scripts/lib/` — command-line experiments and MP4/JSON/PNG export.
- `examples/long-arms.json` — reproducible three-minute video scenario.
- `scripts/build.mjs`, `scripts/deploy.mjs` — standalone static build and GitHub Pages deployment.
