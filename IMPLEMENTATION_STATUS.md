# Verification — 18 October 2026

## Automated model checks

`npm test`: 28 passing tests. Covers evenly spaced starts, seeded reproducibility, the leftmost slowpoke, lap geometry and speed units, recovery to all eight desired speeds without overshooting, smooth homogeneous flow across unequal lap lengths, reaction delay against an unbraked control, temporary braking versus persistent breakdown, repairs, obstacle rejection/removal, passing rules on both sides and across nonadjacent lanes, front/rear merge gaps, dense traffic with maximum reaction delay, queue separation, and a brake-induced traffic wave.

Four considerate-merge regressions check that Regulars reject a physically clear left-lane gap when it would force sharp braking, reserve extra room for a longer reaction delay, wait for an approaching car to pass, and complete a well-spaced merge without forcing the follower above 1.5 m/s² braking during the first four seconds. The check uses the follower's own car-following rule and converts the merging car's initial pace to the shorter destination lap. It applies to ordinary drivers moving left; Stuntman cut-in behavior and right-side obstacle bypasses retain their previous rules.

The slowpoke passing regression was reproduced before the fix: a slowpoke doing 70 km/h chose to pass a leader also doing 70, and a driver chose a safe passing lane even when its traffic was slower. Three regression tests now cover refusing equal-speed/faster leaders (including a 60 km/h follower behind a 65 km/h leader), preserving useful passes after following a genuinely slower car, and rejecting a passing lane without a speed advantage. Passing decisions continue to use delayed traffic perception; obstacle avoidance remains exempt from the discretionary speed-gain requirement.

The left-lane obstacle deadlock was reproduced with 36 Regular drivers on both two- and three-lane roads: all vehicles eventually stopped because the no-undertaking guard also blocked traffic beside the obstruction queue. Four regression tests cover a direct right-side bypass, bypassing a connected queue, adjacent traffic clearing room for a blocked car to merge, preserving ordinary passing restrictions for an unrelated distant obstacle, and sustained useful flow after 90 simulated seconds on both road configurations. Queue membership is computed from the connected following chain behind a stationary obstruction, with gaps and speed limiting its extent; delayed snapshots drive lane choice while current membership drives the final guard.

Three Stuntman tests confirm acceptance of tight gaps rejected by Regular drivers, choosing a better lane even when both acceleration estimates saturate at hard braking, and continued rejection of physically insufficient clearance. A cut-in is compared with the same traffic without that maneuver: the following Regular driver brakes harder than 3 m/s² and loses over 2 m/s of speed relative to the control within 1.5 seconds. Every step in that comparison checks separation in all occupied lanes. Brake lights also illuminate when the collision guard intervenes.

Stress cases ran for 30 simulated seconds each on 1, 3, and 5 lanes with a short road, mixed traffic, two-second delay, and incidents. These checks confirm finite nonnegative speeds, wrapped positions, and at least 0.49 m clearance in every occupied lane. Additional 100-second preset runs exercised sustained flow and incident recovery. Perfect flow was checked for 60 seconds: no cars below 30 km/h and no lane changes.

## Interface checks

An independent JSDOM 26.1.0 harness loaded the real HTML and application modules, supplying a mocked Canvas context and deterministic animation callbacks. It exercised initialization of all eight driver rows, exact totals, the vehicle list, playback and stepping, selection, braking, breakdown/repair, clearing incidents, presets, restart, road-pointer obstacle placement/removal, the explanation dialog, reaction-time edits, and empty-road guidance. Canvas drawing functions executed without exceptions. This is a DOM behavior check; it does not render layout.

The local server returned HTTP 200 with correct content types for the entry page and JavaScript. JavaScript syntax checks and the static production build passed. Publication was verified separately through GitHub Pages build state and HTTP requests for the public entry page and versioned app modules.

## Verification limit

The available computer-use connector reported no browser, and the in-app browser was unavailable. Desktop/mobile visual inspection and real-browser pointer behavior could not be checked in this session. Responsive CSS includes layouts for desktop, tablet, and narrow phones; those layouts still need visual review on a real device.
