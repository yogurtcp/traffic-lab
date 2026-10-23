# Loop Lab

**[Play the traffic playground](https://yogurtcp.github.io/traffic-lab/)** · [Source](https://github.com/yogurtcp/traffic-lab)

A traffic experiment: watch a section of a larger road, choose how often cars arrive and their personality probabilities, and measure how many get through. Closed-road experiments remain available. Standalone HTML, CSS, and JavaScript, deployed to GitHub Pages like the other games. No backend or runtime packages.

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

For continuous arrivals and exit-based throughput, use `--scenario examples/open-road.json`, or pass `--layout u --interval 2 --probabilities regular=70,slowpoke=20,stuntman=10`.

## Install and updates

Choose **Install app** on the live site. Supporting browsers show an install prompt; the button also provides platform instructions (Safari on iPhone/iPad: Share → Add to Home Screen; Safari on Mac: File → Add to Dock when available). Installation depends on browser support; see [MDN's installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). After the first complete online download, the app shell, icons, scripts and styles work offline.

Loop Lab checks for a published update **only at online startup**. It does not poll, check on focus/foreground return, or check on reconnection. The startup download is fully cached and validated before the old document hands off: the live model, random state, reaction history, incidents, queues, junctions, lane changes, replay, playback, selection, settings, unfinished setup fields and focus are saved locally per window and restored after an automatic reload. Failed downloads keep the old offline app. If the session cannot be saved, the current run stays open and the update waits for the next online startup. Browser/OS activity while the app is closed is outside the app's control; no closed-app background-update guarantee is made. The [service worker lifecycle](https://web.dev/articles/service-worker-lifecycle) explains the browser-controlled portion.

Ordinary manual reloads still start a new experiment; the upgrade handoff specifically preserves active work during automatic updates. The source preview uses no worker cache; install from the published site, or serve the built `dist/` for production-like installation testing.

## Make an experiment

1. Start with **Continuous arrivals**, the default. Choose the sideways U, the **+ intersection**, or an existing loop. Set 1–5 lanes, a 600–2,000 m trip length, and a shared 0–2 second reaction time. Junction lane counts are per direction.
2. Set the **seconds between new cars** (0.2–60) and each personality's **probability**. Percentages must add up to 100%; **Balance to 100%** normalizes the values while keeping zero-probability types at zero. **Zero all** clears the current driver mix, cars, incidents, queue, and throughput counters; all-zero probabilities stop arrivals. Each car is an independent seeded draw; short runs need not match the percentages exactly.
3. Settings reset the road immediately as you edit; there is no Apply step. Changes preserve playback when running, or leave it paused. A partially entered probability mix pauses arrivals with an inline message until the total returns to 100%. Press **Start simulation** to begin. The road starts empty. The first arrival is scheduled when play begins, followed by fixed simulated-time intervals. The + junction chooses each of its four entrances with equal probability. The interval is global, not per lane or entrance: 2 seconds means 30 offered arrivals per minute in total. Blocked arrivals queue off-screen and enter when safe; they are never silently dropped. The status strip separates cars on the road, cumulative entries, and upstream waiting.
4. Use **Brake** to brake a car for three seconds, **Break down** for a persistent stoppage, or **Obstacle** to close a small patch of a lane. Obstacles cannot be placed inside cars. **Remove / repair** reverses incidents, and **Clear all incidents** releases the entire road.
5. Inspect a car for its speed, personality, following gap, and current behavior. The vehicle list offers keyboard-accessible alternatives to clicking cars.

Arrivals compare all entrance lanes before joining. They use a clear/faster lane when the preferred lane is busy, retaining the usual right-lane preference (or the Annoying slowpoke's left-lane preference) when entry speeds differ by no more than 2 km/h. Entry speed is fitted to the actual following gap and reaction allowance, so a car does not appear at a speed that immediately demands braking. A far-away slow vehicle no longer sets every arrival's speed. Blocked entrances still queue upstream, and loop entries wait for a gap that will not force a nearby rear car to brake sharply.

New drivers initially use a consistent view from the moment they enter until their reaction history becomes available. This avoids comparing a newborn's current position with an older position of its leader, which previously invented short gaps and braking ripples. Hazards appearing after entry still have the selected reaction delay.

To retain exact-count experiments, choose a circle, rounded rectangle, or four-arm loop and select **Fixed cars · closed loop**. The combined limit remains 180 and cars must physically fit. Circle/rectangle cars start evenly spaced at desired speeds; the four-arm loop starts at rest with the junction clear. Switching setup modes preserves separate counts and probability mixes. A seed reproduces arrival personalities, entrances, and driver order. Existing saved setups migrate to the new arrivals mode with their old fixed counts retained for switching back.

Each driver type has a **Speed variance** slider from **±0 to ±20 km/h**. For example, Regular at ±5 varies its target within 85–95 km/h. Each car independently drifts between seeded random targets over 6–12 seconds, accelerating/braking through the normal driving model; traffic, obstacles, and junctions can slow it further. The absolute top speed remains 160 km/h. Zero keeps the original steady target and is the default for saved setups and presets.

You can also inspect a car and adjust **its own Speed variance** during the run. This affects that vehicle without resetting the road or changing the type default. The inspector shows actual speed, current target, and base speed. Individual adjustments appear in the event log and replay; replay's slider is read-only. Type-default changes reset immediately like other settings, while individual overrides last for that car in the current run.

Use **−10s** or drag the **Replay** timeline when a jam appears. The last three simulated minutes are recorded automatically, including incidents, vehicle details, charts, and throughput at each moment. Rewinding pauses the live run. **Play replay**, **+1s**, and the Time selector let you inspect how congestion developed; replay stops at the recording's end. **Back to live** returns to the exact paused live state, where you can resume or intervene. Road interventions are disabled during replay. Changing settings, Restart, or Zero all starts a fresh recording; recordings stay in this browser session and survive automatic upgrades; ordinary reloads start a fresh recording.

Space toggles playback when focus is outside an input or button. Escape returns to Inspect. Pause, one-second stepping, restart, and ½×–5× time controls help inspect the chain reaction. Background tabs do not accumulate simulation time. Setup is saved locally; automatic upgrades preserve the current run through a local handoff. Ordinary reloads start a fresh run.

Presets: **Open-road arrivals** (sideways U), **Four-way arrivals** (+ junction), **Mixed company**, **Perfect flow**, **Phantom jam**, **Left-lane blockade**, and **Junction lab**. The original five presets retain fixed-count behavior. For a clear traffic-wave experiment, choose Phantom jam, let it settle for 30 simulated seconds, then try the brake-pulse button. Junction lab starts with eight Regulars and one lane so the intersection rules are easy to compare; select a mode to restart the same experiment immediately.

## Layouts and junctions

The **sideways U** is an open, one-way road: cars enter at the upper left, follow the bend, and exit at the lower left. The **+ intersection** has four independent incoming streams and opposite exits; vehicles go straight through, without turn-choice routing. Choose all-way stop, lights, or roundabout. No departing car reappears upstream.

Circle and rounded rectangle are uninterrupted loops. The four-arm figure-eight joins four approaches with smooth outer connections and revisits the central junction four times per full lap. All three retain fixed-count mode; in arrival mode each new car travels one circuit and exits at the marked gate. Lane 1 is always the leftmost lane in the direction of travel; junction approaches have separate incoming and outgoing carriageways.

The four-arm layout has extended straight approaches and generous constant-radius outer turns. A taller viewport, wider lanes, and enlarged car sprites make the road easier to read. Car drawings keep a constant size for the current viewport and lane width, including in queues; the enlarged drawings can overlap without changing physical separation in the model.

| Control        | Behavior                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All-way stop   | Each car must stop, wait one second plus the shared reaction delay, and take its turn in stopped-arrival order. One car clears the junction at a time. Equal-time arrivals use car ID for reproducibility.                                                                     |
| Traffic lights | East–west and north–south alternate: 12 seconds green, 2 amber, 1 all-red. New entries wait out the reaction delay at green. Conflicting traffic waits until already-admitted vehicles clear, even when the signal cycle advances. Cars on the same axis may proceed together. |
| Roundabout     | Cars yield to circulating traffic and can enter without a mandatory full stop when clear. This simplified roundabout admits one circulating car at a time; it does not model real multi-vehicle roundabout capacity.                                                           |

All personalities obey junction right of way. Lane changes are disabled near or inside the junction, and queued lanes may advance independently instead of triggering the ordinary no-passing-on-the-right rule. Junction speed targets are 25 km/h for stops, 45 for lights, and 35 for the roundabout. Incidents can be placed on approaches and outer loops; center placements are rejected. A broken car already admitted keeps the junction blocked until repaired and clear.

## Driver personalities

| Driver            | Desired speed    | Behavior                                                                      |
| ----------------- | ---------------- | ----------------------------------------------------------------------------- |
| Regular           | 90 km/h          | Passes slower or persistently held-up traffic on the left; keeps right when clear. |
| Slowpoke          | 70 km/h          | Slower cruise, moderate following space; passes slower vehicles on the left.  |
| Annoying slowpoke | 70 km/h          | Stays in the leftmost lane. Avoids stationary obstructions and returns left.  |
| Speedster         | 110 km/h         | Same passing policy as Regular, with a higher desired speed.                  |
| Stuntman          | 160 km/h maximum | Cuts into small gaps on either side, forcing following drivers to brake.      |
| Cautious          | 80 km/h          | Large following distance, gentle acceleration, and conservative lane changes. |
| Tailgater         | 90 km/h          | Short following distance, eager acceleration, and hard braking.               |
| Eco driver        | 90 km/h          | Gentle acceleration and extra space to absorb speed changes.                  |

The road speed limit is 90 km/h. Speedster and Stuntman intentionally exceed it. All drivers use the same selected perception delay. Ordinary passing on the right is prevented for everyone except Stuntman, including across nonadjacent lanes. Stationary obstacles, broken vehicles, and their connected slow queues can be avoided on either side. This exception keeps the adjacent lane moving so blocked drivers can find a gap to merge; an unrelated obstacle elsewhere on the ring does not allow passing on the right.

Discretionary passing requires more than 2 km/h of attainable speed advantage. Drivers compare cruising intent, but can also pass a normally fast car that traffic is holding back: after observing it for at least 1.5 seconds, they compare its smoothed actual pace and current speed against their own target. This observation respects the selected reaction delay. An unimpeded leader recovering to an equal or higher target still does not justify pulling out. A constrained follower that has already braked slightly below the leader's speed can move left to accelerate. There is no 70 km/h cutoff, so a Speedster can also pass a Regular doing 90. The passing lane must offer a useful speed gain and satisfy the same front/rear merge forecasts. A Slowpoke still follows another car doing 70 instead of moving out to pass it. Obstacle avoidance and the Annoying slowpoke's preference for the leftmost lane are separate decisions.

Drivers stay left while a pass remains worthwhile, accelerate past the slower car, and return right when clear. If the speed advantage disappears, they give up the pass and return right when a safe gap opens. They also stay in position while approaching a slower vehicle they can soon pass, instead of moving farther right before catching it. If slower traffic to the left holds a car back under the no-undertaking rule, it can move left in stages, get behind that vehicle, and pass using the lane to its left. A slow car already in the leftmost lane still cannot legally be passed on its right.

Regulars retain practical geometric gaps (at least 4 m, with a half-second speed allowance and extra room for closing traffic), then forecast the affected cars for 4–4.6 seconds. They account for the full 1.6-second merge, reaction delay, follower acceleration, lane-length differences, and slowing behind traffic in either lane. A merge is rejected if the forecast requires the follower to brake harder than 1.5 m/s². A normal return to the right also checks the merging car itself against that gentle-braking budget, even when nobody is behind. The check uses the destination leader’s speed, gap and current slowing; predicted contact with that leader is rejected. Drivers stay left until a comfortable return is possible rather than dropping into a closing gap. This applies to moves in both directions and obstacle bypasses. Regulars can still use a 50 m rear gap at 90 km/h when surrounding traffic makes it comfortable; a tight destination leader can require more room. Stuntman cut-ins retain their aggressive behavior.

At a blocked lane with no safe opening, an approaching Regular can gently ease off, up to 1 m/s², to make a gap in advance. It starts only with enough stopping room, avoids unnecessary yielding when a safe opening already exists, and releases after the merging car is established in its lane. The inspector labels this **Making room for a merge**. Yielding respects junction lane-change restrictions and stops when the obstruction is cleared.

Other ordinary personalities retain their larger merge margins and the stricter left-merge check: the shared reaction delay plus the full 1.6-second maneuver, with at most 1.5 m/s² predicted follower braking (or its comfort setting, if lower). Cautious drivers still require extra space. Stuntmen skip the courtesy check and accept much tighter cut-ins.

## What to watch

- Average speed, cars below 30 km/h, lane changes, and speed as a percentage of the mix's desired speed.
- **Throughput in arrival mode** counts every car that finishes its trip and exits, exactly once. The rate is exits per simulated minute, averaged since reset, so the initially empty road has a warm-up period. Offered arrivals and upstream queues do not count as throughput. Paused wall-clock time is excluded.
- **Throughput in fixed mode** retains every full lap travelled from each car's own starting point, including repeat laps by the same car. An initial partial marker crossing does not count.
- The speed chart holds the last two simulated minutes.
- The road-position chart adds a row every half second, up to 240 rows. Horizontal position is progress through the road (or around the loop); time runs downward. At a + junction, all four approaches contribute to the same progress bins. Red traces show slowdowns; empty bins are pale, and bins with several cars average their speed.
- Car colors identify personalities. Red rear lights indicate braking. **How it works** includes a switch to color cars by speed.

## Model and limits

This is an educational microsimulation, not a calibrated traffic forecast. Car following uses an [Intelligent Driver Model–style](https://www.mtreiber.de/publications/timedelay_TRR07_final.pdf) rule: acceleration depends on desired speed, following gap, and closing speed. The app applies the common reaction delay to past traffic snapshots; personality parameters set acceleration, comfortable braking, and desired following time. Lane choices are custom rules rather than the full MOBIL model.

Integration uses a fixed 0.05 s step, independent of rendering and playback speed. Lane 1 is the leftmost lane. Circle and rectangle travel counterclockwise; their outer laps grow by `2π × 3.7 m` per lane. Right-hand lanes in the four-lobed layout have shorter offset paths, approximated by subtracting `6π × 3.7 m` per lane. Cars in different lanes share a reference-path progress coordinate; local offset geometry is an approximation outside a circle, and bend speeds are not individually calibrated. Lane changes take 1.6 seconds and reserve both lanes. Ordinary drivers require comfortable front and rear gaps. Stuntmen accept much smaller physical gaps, disregard the following driver's comfortable braking distance, and can start another change 1.8 seconds after the previous one began. They consider extra room and faster traffic even when both lane acceleration estimates call for hard braking. Vehicles are 4.5 m long; the drawing enlarges their sprites for visibility.

A final safety guard prevents physical vehicle overlap and ordinary right-side passing, even with extreme delays or sudden obstructions. It can brake more sharply than the car-following model, so crashes are excluded. Reaction delay is therefore visible in ordinary following but can be overridden by this guard. Open roads use finite progress, route-specific following, persistent upstream queues, and single departures. Up to 180 cars can be visible; further demand waits upstream. The + junction's drawn width is exaggerated for readability, so its controlled section is parametrized as 40 physical metres rather than scaling with the whole trip. Sideways-U inner lanes shorten by `π × 3.7 m` per lane. Beyond the entry queues and unconstrained exits, upstream/downstream roads are not simulated. There are no trucks, weather, pedestrians, turning choices, or crash physics. Junction controls remain simplified experiments rather than calibrated capacity estimates.

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
- `src/open-route.js` — finite sideways-U and four-approach junction paths.
- `src/junction.js` — stop ordering, signal phases, circulating priority, conflict reservations, and stop-line guards.
- `src/app.js` — setup, playback, persistent preferences, pointer and keyboard controls.
- `src/style.css` — responsive interface.
- `tests/model.test.js` — model regression checks using Node's built-in test runner.
- `tests/routes.test.js` — geometry, pointer placement, full-lap throughput, and intersection behavior/conflict checks.
- `tests/cli.test.js` — scenario validation, deterministic interventions, metrics, and CLI output protection.
- `src/replay.js` — bounded, read-only recordings for timeline playback.
- `tests/replay.test.js` — historical cars/incidents/charts/throughput, junction states, bounded retention, and unchanged future arrivals.
- `tests/passing.test.js` — held-up traffic above/below 70 km/h across loops and U roads, temporary slowdowns, variance reversals, stale perception, multi-lane staging, and safely abandoning unproductive passes.
- `tests/variance.test.js` — smooth independent speed drift, bounds, reproducibility, individual overrides/replay, dense traffic safety, and CLI configuration.
- `src/pwa.js`, `src/handoff.js`, `sw.js`, `manifest.webmanifest` — installation, startup-only updates, offline caching, and per-window upgrade handoffs.
- `tests/pwa.test.js`, `tests/offline.test.js`, `tests/session.test.js` — installation/update timing, failed updates, offline assets, and exact session restoration.
- `tests/closing-merge.test.js` — relative-speed checks, no-follower returns, destination braking, collision prediction, and actual comfortable merges.
- `tests/merge.test.js` — destination-leader braking, careful obstacle bypasses, reaction/acceleration forecasts, actual follower braking across 216 scenarios, gentle yielding, and forecast isolation.
- `tests/entry.test.js` — clear-lane admissions, gap-matched entry speed, startup braking, newborn reaction delay, safe loop entry, and observation cleanup.
- `tests/stream.test.js` — arrivals, probabilities, upstream conservation/recovery, single exits, finite geometry, approach isolation, and controlled open junctions.
- `scripts/simulate.mjs`, `scripts/lib/` — command-line experiments and MP4/JSON/PNG export.
- `examples/long-arms.json` — reproducible three-minute video scenario.
- `examples/open-road.json` — continuous-arrival + junction video scenario.
- `scripts/build.mjs`, `scripts/deploy.mjs` — standalone static build and GitHub Pages deployment.
