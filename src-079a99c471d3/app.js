import {
  Simulation,
  PERSONALITIES,
  KEYS,
  PRESETS,
  STEP,
  normalizeConfig,
  clamp,
} from "./model.js";
import { RoadView, drawCharts } from "./view.js";
import { ReplayBuffer } from "./replay.js";
import { startPwa } from "./pwa.js";
import { readHandoff, clearHandoff } from "./handoff.js";
const $ = (id) => document.getElementById(id);
let initial = PRESETS.stream;
try {
  const saved = JSON.parse(localStorage.getItem("loop-lab-setup-v1"));
  if (saved?.counts)
    initial = normalizeConfig(
      saved.traffic
        ? saved
        : {
            ...PRESETS.stream,
            lanes: saved.lanes,
            length: saved.length,
            reaction: saved.reaction,
            seed: saved.seed,
            counts: saved.counts,
          },
    );
} catch {}
let sim;
try {
  sim = new Simulation(initial);
} catch {
  sim = new Simulation(PRESETS.stream);
}
let recording = new ReplayBuffer(),
  liveSim = sim,
  replaying = false,
  replayCursor = 0;
recording.capture(sim);
let running = false,
  tool = "select",
  selected = null,
  speedOverlay = false,
  configurationValid = true,
  editPlaybackIntent = null,
  last = 0,
  accumulator = 0,
  lastHUD = -1,
  toastTimer;
const road = new RoadView($("road"));
let mixMode = sim.config.traffic,
  draftMix = {
    fixed: { ...sim.config.counts },
    stream: { ...sim.config.probabilities },
  },
  fleetVersion = -1;
const hints = {
  select: "Click a car to see its personality, speed, and following gap.",
  brake: "Click a car to brake for 3 seconds, then watch the ripple behind it.",
  breakdown: "Click a car to break it down. It stays stopped until repaired.",
  obstacle:
    "Click an empty patch of a lane to place an obstacle. Cars will try to go around it.",
  remove:
    "Click an obstacle to remove it, or a car to repair it and release its brakes.",
};
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3800);
}
function recordLive() {
  if (!replaying) recording.capture(sim, true);
}
function canPlay() {
  return (
    configurationValid &&
    (replaying ? replayCursor < recording.end - 1e-8 : hasTraffic())
  );
}
function updateReplay() {
  const timeline = $("replay-timeline");
  timeline.min = recording.start;
  timeline.max = recording.end;
  timeline.value = sim.time;
  timeline.disabled = !configurationValid || recording.end <= recording.start;
  timeline.setAttribute(
    "aria-valuetext",
    `${timeLabel(sim.time)} of ${timeLabel(recording.end)}`,
  );
  $("rewind").disabled =
    timeline.disabled || sim.time <= recording.start + 1e-8;
  $("return-live").disabled = !replaying;
  $("replay-position").textContent = replaying
    ? `REPLAY · ${timeLabel(sim.time)} / ${timeLabel(recording.end)}`
    : `LIVE · ${timeLabel(sim.time)}`;
  timeline.closest(".replay-controls").classList.toggle("replaying", replaying);
  $("replay-note").textContent = replaying
    ? "Live traffic is paused. Play replays the recording; Back to live returns to your paused run."
    : "Last 3 simulated minutes. Rewind pauses live traffic; press play to watch again.";
  document
    .querySelectorAll(
      '[data-tool]:not([data-tool="select"]), #vehicle-brake, #vehicle-break, #vehicle-repair, #clear, #pulse, #vehicle-variance, #selection [data-action]',
    )
    .forEach((button) => (button.disabled = replaying));
}
function seekReplay(time) {
  if (!configurationValid || recording.end <= recording.start) return;
  if (!replaying) {
    recordLive();
    liveSim = sim;
    replaying = true;
    document.querySelector('[data-tool="select"]').click();
  }
  replayCursor = clamp(time, recording.start, recording.end);
  sim = recording.at(replayCursor);
  fleetVersion = -1;
  setRunning(false);
  updateHUD();
  draw();
}
function returnLive() {
  if (!replaying) return;
  sim = liveSim;
  replaying = false;
  fleetVersion = -1;
  setRunning(false);
  updateHUD();
  draw();
}
function liveEditAllowed() {
  if (!replaying) return true;
  toast("Use Back to live before changing traffic.");
  return false;
}
function advanceReplay(seconds) {
  replayCursor = Math.min(recording.end, replayCursor + seconds);
  const next = recording.at(replayCursor);
  if (next !== sim) {
    sim = next;
    fleetVersion = -1;
  }
  if (replayCursor >= recording.end - 1e-8) setRunning(false);
}
function advanceLive() {
  sim.step();
  recording.capture(sim);
}
function hasTraffic() {
  return sim.stream ? sim.probabilityTotal > 0 : sim.cars.length > 0;
}
function formError() {
  const values = KEYS.map((k) => Number($(`count-${k}`).value));
  if (
    values.some(
      (n) =>
        !Number.isFinite(n) ||
        n < 0 ||
        n > (mixMode === "stream" ? 100 : 180) ||
        (mixMode === "fixed" && !Number.isInteger(n)),
    )
  )
    return mixMode === "stream"
      ? "Use probabilities between 0% and 100%."
      : "Use whole car counts between 0 and 180.";
  if (
    KEYS.some(
      (k) =>
        !Number.isFinite(Number($(`variance-${k}`).value)) ||
        Number($(`variance-${k}`).value) < 0 ||
        Number($(`variance-${k}`).value) > 20,
    )
  )
    return "Use speed variance between ±0 and ±20 km/h.";
  const total = updateTotal();
  if (mixMode === "stream" && total !== 0 && Math.abs(total - 100) > 0.01)
    return `Mix totals ${Number(total.toFixed(2))}%. Set 100% or use Balance. All zero stops arrivals.`;
  if (mixMode === "fixed" && total > 180) return "Use 180 cars or fewer.";
  for (const [id, min, max, integer] of [
    ["seed", 1, 999999, true],
    ["length", 600, 2000, true],
    ["reaction", 0, 2, false],
    ...(mixMode === "stream" ? [["interval", 0.2, 60, false]] : []),
  ]) {
    const value = Number($(id).value);
    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      return `${id === "interval" ? "Arrival interval" : id[0].toUpperCase() + id.slice(1)} must be between ${min} and ${max}${integer ? " (whole numbers)" : ""}.`;
  }
  return null;
}
function configurationChanged(custom = true) {
  const resume = editPlaybackIntent ?? running;
  if (custom !== false) $("preset").value = "custom";
  updateTotal();
  let error = formError();
  if (!error) {
    configurationValid = true;
    if (reset(readConfig(), { syncControls: false, resume, quiet: true })) {
      editPlaybackIntent = hasTraffic() ? null : resume;
      return true;
    }
    error = $("setup-note").textContent;
  }
  // Keep the new road visible while an in-progress mix or numeric field is
  // invalid. Leave the user's inputs intact and resume once they are valid.
  editPlaybackIntent = resume;
  configurationValid = false;
  const zero = Object.fromEntries(KEYS.map((k) => [k, 0]));
  reset(
    { ...readConfig(), counts: zero, probabilities: zero },
    { syncControls: false, persist: false, quiet: true },
  );
  $("setup-note").textContent = error;
  $("setup-note").classList.add("invalid");
  return false;
}
function updateTotal() {
  const total = KEYS.reduce(
    (sum, k) => sum + (Number($(`count-${k}`).value) || 0),
    0,
  );
  $("total").textContent = Number(total.toFixed(2));
  $("total").parentElement.classList.toggle(
    "invalid",
    mixMode === "stream" && total !== 0 && Math.abs(total - 100) > 0.01,
  );
  return total;
}
for (const [key, p] of Object.entries(PERSONALITIES)) {
  const row = document.createElement("div");
  row.className = "driver";
  row.innerHTML = `<span class="car-icon" style="--color:${p.color}" aria-hidden="true"></span><div class="driver-desc" tabindex="0" title="${p.description}" aria-label="${p.name}: ${p.description}"><span class="driver-name">${p.name}</span><span class="driver-speed">${p.speed} km/h${key === "stuntman" ? " max" : ""}</span></div><div class="driver-count"><button data-delta="-1" aria-label="Remove one ${p.name}">−</button><input id="count-${key}" type="number" min="0" max="180" value="0" aria-label="Number of ${p.name} drivers"><span class="probability-unit">%</span><button data-delta="1" aria-label="Add one ${p.name}">+</button></div><div class="driver-variance"><label for="variance-${key}">Speed variance</label><input id="variance-${key}" type="range" min="0" max="20" step="1" value="0" aria-label="${p.name} speed variance in km/h"><output id="variance-value-${key}" for="variance-${key}">±0 km/h</output></div>`;
  row.querySelectorAll("[data-delta]").forEach((b) =>
    b.addEventListener("click", () => {
      const input = $(`count-${key}`);
      input.value = clamp(
        (Number(input.value) || 0) + Number(b.dataset.delta),
        0,
        mixMode === "stream" ? 100 : 180,
      );
      configurationChanged();
    }),
  );
  row
    .querySelector(`#count-${key}`)
    .addEventListener("input", () => configurationChanged());
  row.querySelector(`#variance-${key}`).addEventListener("input", () => {
    updateLabels();
    configurationChanged();
  });
  const desc = row.querySelector(".driver-desc");
  desc.addEventListener("click", () => toast(p.description));
  desc.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      toast(p.description);
    }
  });
  $("drivers").append(row);
}
for (let lane = 1; lane <= 5; lane++) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = lane;
  b.dataset.lanes = lane;
  b.setAttribute("aria-label", `${lane} lane${lane > 1 ? "s" : ""}`);
  b.addEventListener("click", () => {
    $("lanes").value = lane;
    updateLaneButtons();
    configurationChanged();
  });
  $("lane-buttons").append(b);
}
function updateLaneButtons() {
  document.querySelectorAll("[data-lanes]").forEach((b) => {
    const active = Number(b.dataset.lanes) === Number($("lanes").value);
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active);
  });
}
function showConfig(config) {
  draftMix = {
    fixed: { ...config.counts },
    stream: { ...config.probabilities },
  };
  mixMode = config.traffic;
  $("traffic").value = config.traffic;
  $("interval").value = config.interval;
  $("layout").value = config.layout ?? "circle";
  $("intersection").value = config.intersection ?? "stop";
  updateIntersectionFields();
  $("lanes").value = config.lanes;
  $("length").value = config.length;
  $("reaction").value = config.reaction;
  $("seed").value = config.seed;
  for (const k of KEYS) $(`variance-${k}`).value = config.speedVariance[k];
  updateTrafficFields(false);
  updateLaneButtons();
  updateLabels();
  updateTotal();
}
function updateIntersectionFields() {
  const active = ["figure8", "cross"].includes($("layout").value);
  $("intersection").disabled = !active;
  $("intersection-note").textContent = active
    ? $("layout").value === "cross"
      ? "Four entrances. Cars continue to the opposite exit."
      : "Four approaches. Choose how traffic takes turns."
    : "Choose the + intersection or four-arm loop for junction controls.";
}
function updateTrafficFields(preserve = true) {
  if (preserve)
    draftMix[mixMode] = Object.fromEntries(
      KEYS.map((k) => [k, Number($(`count-${k}`).value) || 0]),
    );
  const open = ["u", "cross"].includes($("layout").value);
  if (open) $("traffic").value = "stream";
  $("traffic").querySelector('[value="fixed"]').disabled = open;
  mixMode = $("traffic").value;
  const stream = mixMode === "stream";
  for (const k of KEYS) {
    const input = $(`count-${k}`);
    input.value = draftMix[mixMode][k] ?? 0;
    input.max = stream ? 100 : 180;
    input.step = stream ? "any" : 1;
    input.setAttribute(
      "aria-label",
      `${stream ? "Probability (%) of" : "Number of"} ${PERSONALITIES[k].name} drivers`,
    );
    input.closest(".driver-count").classList.toggle("probability", stream);
  }
  $("arrival-settings").hidden = !stream;
  $("normalize-probabilities").hidden = !stream;
  $("total-unit").textContent = stream ? "%" : " cars";
  $("mix-note").textContent = stream
    ? "Chance of each arriving personality. Use 100% total, or zero all to stop arrivals."
    : "Choose exactly who gets on the closed road.";
  $("length-label").textContent = stream
    ? "Visible trip length"
    : "Base lap length";
  document.querySelector('label[for="lanes"]').textContent = [
    "cross",
    "figure8",
  ].includes($("layout").value)
    ? "Lanes per direction"
    : "Lanes";
  updateLabels();
  updateTotal();
}
function updateLabels() {
  for (const k of KEYS) {
    $(`variance-value-${k}`).textContent = `±${$(`variance-${k}`).value} km/h`;
    $(`variance-${k}`).setAttribute(
      "aria-valuetext",
      `plus or minus ${$(`variance-${k}`).value} kilometres per hour`,
    );
  }
  $("length-value").textContent =
    `${Number($("length").value).toLocaleString()} m`;
  $("reaction-value").textContent =
    `${Number($("reaction").value).toFixed(1)} s`;
  const interval = Number($("interval").value);
  $("arrival-note").textContent =
    interval > 0
      ? `${(60 / interval).toFixed(1)} arrivals/min total${$("layout").value === "cross" ? " · shared across four entrances" : ""}. Blocked entrances queue upstream.`
      : "Choose a positive interval.";
}
function readConfig() {
  return {
    traffic: $("traffic").value,
    interval: Number($("interval").value),
    speedVariance: Object.fromEntries(
      KEYS.map((k) => [k, Number($(`variance-${k}`).value)]),
    ),
    probabilities:
      mixMode === "stream"
        ? Object.fromEntries(
            KEYS.map((k) => [k, Number($(`count-${k}`).value)]),
          )
        : draftMix.stream,
    layout: $("layout").value,
    intersection: $("intersection").value,
    lanes: Number($("lanes").value),
    length: Number($("length").value),
    reaction: Number($("reaction").value),
    seed: Number($("seed").value),
    counts:
      mixMode === "fixed"
        ? Object.fromEntries(
            KEYS.map((k) => [k, Number($(`count-${k}`).value)]),
          )
        : draftMix.fixed,
  };
}
function updatePlay() {
  $("play").disabled = !canPlay();
  $("step").disabled = !configurationValid || (replaying && !canPlay());
  const wasStarted = sim.time > 0;
  $("play").innerHTML = replaying
    ? running
      ? '<span aria-hidden="true">Ⅱ</span> Pause replay'
      : '<span aria-hidden="true">▶</span> Play replay'
    : running
      ? '<span aria-hidden="true">Ⅱ</span> Pause simulation'
      : `<span aria-hidden="true">▶</span> ${wasStarted ? "Resume" : "Start"} simulation`;
  $("state").textContent = !configurationValid
    ? "COMPLETE SETUP"
    : replaying
      ? running
        ? "REPLAY PLAYING"
        : "REPLAY PAUSED"
      : running
        ? "EXPERIMENT RUNNING"
        : wasStarted
          ? "EXPERIMENT PAUSED"
          : "READY TO ROLL";
  $("state-dot").classList.toggle("running", running);
}
function setRunning(value) {
  running = value;
  accumulator = 0;
  updatePlay();
}
function reset(
  config,
  { syncControls = true, persist = true, resume = false, quiet = false } = {},
) {
  let next;
  try {
    next = new Simulation(config);
  } catch (e) {
    if (quiet) $("setup-note").textContent = e.message;
    else toast(e.message);
    return false;
  }
  sim = next;
  liveSim = sim;
  replaying = false;
  recording = new ReplayBuffer();
  recording.capture(sim);
  selected = null;
  setRunning(resume && configurationValid && hasTraffic());
  $("setup-note").classList.remove("invalid");
  $("setup-note").textContent = !hasTraffic()
    ? "No drivers selected. Add a count or set an arriving mix to 100%."
    : running
      ? "Settings updated. Simulation restarted and is running."
      : sim.stream
        ? "Road starts empty. Press play to begin arrivals."
        : sim.route.entries.length
          ? "Evenly spaced on open road; the junction starts clear."
          : "Evenly spaced in each lane. Ready when you are.";
  if (syncControls) showConfig(sim.config);
  if (persist)
    try {
      localStorage.setItem("loop-lab-setup-v1", JSON.stringify(sim.config));
    } catch {}
  populateVehicles();
  updateHUD();
  draw();
  return true;
}
function populateVehicles() {
  const select = $("vehicle");
  const previous = select.value;
  select.replaceChildren();
  for (const c of sim.cars) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = `#${c.id} · ${PERSONALITIES[c.type].name}`;
    select.append(o);
  }
  select.disabled = !sim.cars.length;
  if (sim.cars.some((c) => String(c.id) === previous)) select.value = previous;
  fleetVersion = sim.fleetVersion;
}
function draw() {
  const g = road.draw(sim, selected, speedOverlay);
  $("road-view").dataset.layout = sim.config.layout;
  const scale = Math.min(1, (g.inner - 12) / 118);
  $("road-view").querySelector(".center-readout").style.transform =
    `translate(-50%,-45%) scale(${scale})`;
}
function timeLabel(t) {
  t = Math.max(0, t + 1e-8);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}
function updateHUD() {
  if (fleetVersion !== sim.fleetVersion) populateVehicles();
  const stats = sim.stats;
  $("sim-time").textContent = timeLabel(sim.time);
  $("center-speed").textContent = sim.cars.length
    ? Math.round(stats.average)
    : "—";
  $("stat-speed").textContent = sim.cars.length
    ? Math.round(stats.average)
    : "—";
  $("stat-slow").textContent = stats.slow;
  $("slow-total").textContent = `/ ${sim.cars.length} cars`;
  $("stat-changes").textContent = sim.changes;
  $("stat-efficiency").textContent = Math.round(stats.efficiency * 100);
  $("stat-laps").textContent = sim.stream
    ? stats.completedTrips
    : stats.completedLaps;
  $("throughput-unit").textContent = sim.stream ? "cars through" : "full laps";
  document.querySelector(".throughput-stat").title = sim.stream
    ? "Cars that exited the visible road. Each car is counted once."
    : "Every full lap from each car’s start, including repeat laps.";
  $("stat-throughput").textContent =
    `${stats.throughputPerMinute.toFixed(1)} ${sim.stream ? "cars" : "laps"}/min · average`;
  $("flow-status").hidden = !sim.stream;
  $("flow-status").textContent = !configurationValid
    ? "Arrivals paused while setup is incomplete."
    : `${stats.active} on road · ${stats.entered} entered · ${stats.upstream} waiting upstream · ${(hasTraffic() ? 60 / sim.config.interval : 0).toFixed(1)} arrivals/min`;
  $("junction-status").hidden = !sim.route.entries.length;
  $("junction-status").textContent = sim.junction.label(sim.time);
  $("road-caption").textContent =
    sim.config.layout === "u"
      ? "Sideways U · enter at the upper left → exit at the lower left"
      : sim.config.layout === "cross"
        ? "+ junction · four entrances → opposite exits"
        : sim.config.layout === "figure8"
          ? "Four-arm loop · keep right · pass left"
          : sim.config.layout === "rectangle"
            ? "Rounded loop · counterclockwise · keep right"
            : "↶ Counterclockwise · keep right · pass left";
  const congested = stats.slow > sim.cars.length * 0.2 && sim.cars.length > 0;
  $("center-label").textContent =
    sim.time === 0
      ? "ROOM TO EXPERIMENT"
      : congested
        ? "THE RIPPLE IS SPREADING"
        : "AVERAGE ROAD SPEED";
  $("center-copy").textContent = !configurationValid
    ? "Complete the setup to begin."
    : !hasTraffic()
      ? "An empty road. Add some drivers."
      : !sim.cars.length
        ? sim.stream
          ? "Press play. Cars arrive over time."
          : "An empty road. Add some drivers."
        : sim.time === 0
          ? "Press play. Then stir things up."
          : stats.stopped
            ? `${stats.stopped} car${stats.stopped === 1 ? " is" : "s are"} almost stopped.`
            : congested
              ? "A little patience goes a long way."
              : "Every driver is part of the flow.";
  if (sim.time > 0) {
    $("insight").textContent = sim.obstacles.length
      ? `${sim.obstacles.length} obstacle${sim.obstacles.length > 1 ? "s are" : " is"} narrowing the road. Watch for queues upstream and gaps downstream.`
      : stats.slow > 0
        ? `${stats.slow} car${stats.slow > 1 ? "s are" : " is"} below 30 km/h. Watch whether the slowdown fades or travels backward through the road.`
        : sim.events.length
          ? "The immediate disruption has cleared. The speed chart shows how quickly the road recovers."
          : "Traffic is flowing. Brake a single car to see how a small change spreads through the pack.";
  } else {
    $("insight").textContent =
      "Try “Phantom jam”, press play, then brake one car. Watch what the drivers behind it do.";
  }
  const card = $("selection");
  const car = sim.cars.find((c) => c.id === selected);
  const obstacle = sim.obstacles.find((o) => o.id === selected);
  if (car) {
    const p = PERSONALITIES[car.type],
      n = sim.neighbors(car, car.lane);
    card.hidden = false;
    // Keep the controls mounted as live metrics change, preserving keyboard focus.
    if (card.dataset.selected !== String(car.id)) {
      card.innerHTML = `<button class="close-selection" aria-label="Close vehicle details">×</button><strong><span style="color:${p.color}">●</span> #${car.id} ${p.name}</strong><p style="white-space:pre-line"></p><div class="vehicle-variance"><label for="vehicle-variance">Speed variance</label><input id="vehicle-variance" type="range" min="0" max="20" step="1" aria-label="Selected car speed variance in km/h"><output for="vehicle-variance"></output></div><button data-action="brake">Brake 3s</button><button class="breakdown-action"></button>`;
      card.dataset.selected = String(car.id);
    }
    const status = car.broken
      ? "⚡ Broken down"
      : sim.time < car.brakeUntil
        ? "Ⅱ Braking"
        : car.target !== null
          ? "↔ Changing lanes"
          : car.safety
            ? "Emergency safety brake"
            : car.yieldFor != null
              ? "Making room for a merge"
              : car.a < -0.5
                ? "Braking"
                : car.a > 0.2
                  ? "Accelerating"
                  : "Cruising";
    card.querySelector("p").textContent =
      `${Math.round(car.v * 3.6)} km/h · target ${(sim.desiredSpeed(car) * 3.6).toFixed(1)} · base ${p.speed} · lane ${car.lane + 1}\n${Number.isFinite(n.gap) ? Math.max(0, n.gap).toFixed(1) + " m to next vehicle" : "Open road ahead"}\n${status}${sim.stream ? " · " + Math.round(car.q * 100) + "% through road" : " · " + car.laps + " full laps"}`;
    card.querySelector("#vehicle-variance").value = sim.variance(car);
    card.querySelector(".vehicle-variance output").textContent =
      `±${sim.variance(car)} km/h`;
    const button = card.querySelector(".breakdown-action");
    button.dataset.action = car.broken ? "repair" : "breakdown";
    button.textContent = car.broken ? "Repair" : "Break down";
    $("vehicle").value = car.id;
  } else if (obstacle) {
    card.hidden = false;
    if (card.dataset.selected !== obstacle.id) {
      card.innerHTML = `<button class="close-selection" aria-label="Close obstacle details">×</button><strong>△ Obstacle · lane ${obstacle.lane + 1}</strong><p>A stationary obstruction. Drivers will try to go around it.</p><button data-action="remove">Remove obstacle</button>`;
      card.dataset.selected = obstacle.id;
    }
  } else {
    card.hidden = true;
    card.dataset.selected = "";
  }
  const events = $("events");
  events.replaceChildren();
  if (!sim.events.length) {
    const li = document.createElement("li");
    li.textContent = "No interventions yet. The road is yours.";
    events.append(li);
  } else
    for (const event of sim.events) {
      const li = document.createElement("li");
      li.textContent = `${timeLabel(event.time)} — ${event.text}`;
      events.append(li);
    }
  drawCharts($("speed-chart"), $("wave-chart"), sim);
  updatePlay();
  updateReplay();
}
function action(kind, id) {
  if (!liveEditAllowed()) return;
  const car = sim.cars.find((c) => c.id === id);
  if (kind === "remove" && !car) {
    sim.removeObstacle(id);
    selected = null;
  } else if (!car) {
    toast("Choose a car first.");
    return;
  } else {
    selected = id;
    if (kind === "brake") sim.brakeCar(id);
    else if (kind === "breakdown") sim.breakCar(id);
    else if (kind === "repair" || kind === "remove") sim.repairCar(id);
  }
  recordLive();
  if (!running)
    toast(
      kind === "repair" || kind === "remove"
        ? "Incident cleared. Press play to see the road recover."
        : "Incident added. Press play to see what happens.",
    );
  updateHUD();
  draw();
}
$("selection").addEventListener("input", (e) => {
  if (e.target.id !== "vehicle-variance" || !liveEditAllowed()) return;
  if (sim.setSpeedVariance(selected, Number(e.target.value))) {
    recordLive();
    updateHUD();
    draw();
  }
});
$("selection").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  if (button.classList.contains("close-selection")) {
    selected = null;
    updateHUD();
    draw();
  } else if (button.dataset.action) action(button.dataset.action, selected);
});
$("preset").addEventListener("change", () => {
  const p = PRESETS[$("preset").value];
  if (p) {
    showConfig(normalizeConfig(p));
    configurationChanged(false);
  }
});
for (const id of ["length", "reaction", "seed", "interval"])
  $(id).addEventListener("input", () => {
    updateLabels();
    configurationChanged();
  });
for (const id of ["layout", "intersection"])
  $(id).addEventListener("change", () => {
    updateIntersectionFields();
    updateTrafficFields();
    configurationChanged();
  });
$("shuffle").addEventListener("click", () => {
  $("seed").value = Math.floor(Math.random() * 999998) + 1;
  configurationChanged();
});
$("zero-cars").addEventListener("click", () => {
  editPlaybackIntent = false;
  setRunning(false);
  for (const k of KEYS) $(`count-${k}`).value = 0;
  configurationChanged();
});
$("restart").addEventListener("click", () => {
  configurationChanged(false);
});
$("play").addEventListener("click", () => {
  if (!canPlay()) return;
  editPlaybackIntent = null;
  setRunning(!running);
});
$("step").addEventListener("click", () => {
  editPlaybackIntent = null;
  setRunning(false);
  if (replaying) advanceReplay(1);
  else for (let i = 0; i < Math.round(1 / STEP); i++) advanceLive();
  updatePlay();
  updateHUD();
  draw();
});
$("rewind").addEventListener("click", () => seekReplay(sim.time - 10));
$("replay-timeline").addEventListener("input", () =>
  seekReplay(Number($("replay-timeline").value)),
);
$("return-live").addEventListener("click", returnLive);
document.querySelectorAll("[data-tool]").forEach((button) =>
  button.addEventListener("click", () => {
    tool = button.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", b === button);
    });
    $("tool-hint").textContent = hints[tool];
  }),
);
$("road").addEventListener("pointerdown", (e) => {
  const bounds = $("road").getBoundingClientRect(),
    x = e.clientX - bounds.left,
    y = e.clientY - bounds.top;
  const hit = road.hit(x, y);
  if (tool === "obstacle") {
    if (!liveEditAllowed()) return;
    const location = road.roadLocation(x, y, sim);
    if (!location) {
      toast(
        sim.config.layout === "figure8"
          ? "Place obstacles on an approach or outer loop, outside the junction."
          : "Place the obstacle on a lane of the road.",
      );
      return;
    }
    if (sim.addObstacle(location.q, location.lane, location.approach)) {
      recordLive();
      toast(
        running
          ? "Obstacle placed. Watch the approaching cars."
          : "Obstacle placed. Press play to see the response.",
      );
    } else {
      toast("That spot is occupied. Try an empty patch of road.");
    }
    updateHUD();
    draw();
    return;
  }
  if (!hit) {
    selected = null;
    updateHUD();
    draw();
    return;
  }
  selected = hit.id;
  if (tool === "select") {
    updateHUD();
    draw();
  } else if (tool === "remove") action("remove", hit.id);
  else if (!hit.obstacle) action(tool, hit.id);
  else {
    toast("Choose a car for this tool.");
    updateHUD();
    draw();
  }
});
for (const [button, kind] of [
  ["vehicle-inspect", "select"],
  ["vehicle-brake", "brake"],
  ["vehicle-break", "breakdown"],
  ["vehicle-repair", "repair"],
])
  $(button).addEventListener("click", () => {
    const id = Number($("vehicle").value);
    if (!sim.cars.some((c) => c.id === id)) {
      toast("There are no cars on this road yet.");
      return;
    }
    selected = id;
    if (kind === "select") {
      updateHUD();
      draw();
    } else action(kind, id);
  });
$("clear").addEventListener("click", () => {
  if (!liveEditAllowed()) return;
  sim.clearIncidents();
  recordLive();
  selected = null;
  updateHUD();
  draw();
  toast("Incidents cleared. Give the road time to recover.");
});
$("pulse").addEventListener("click", () => {
  if (!liveEditAllowed()) return;
  let car = sim.cars.find((c) => c.id === selected && !c.broken);
  if (!car)
    car = [...sim.cars].filter((c) => !c.broken).sort((a, b) => b.v - a.v)[0];
  if (!car) {
    toast("Add a working car first.");
    return;
  }
  selected = car.id;
  sim.brakeCar(car.id);
  recordLive();
  setRunning(true);
  updateHUD();
  toast(`Car ${car.id} is braking for 3 seconds. Follow the wave behind it.`);
});
for (const id of ["about-open", "about-footer"])
  $(id).addEventListener("click", () => $("about").showModal());
$("about-close").addEventListener("click", () => $("about").close());
$("about").addEventListener("click", (e) => {
  if (e.target === $("about")) {
    const r = $("about").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("about").close();
  }
});
$("heat-overlay").addEventListener("change", () => {
  speedOverlay = $("heat-overlay").checked;
  draw();
});
window.addEventListener("keydown", (e) => {
  if (
    /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName) ||
    $("about").open
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    if (canPlay()) {
      editPlaybackIntent = null;
      setRunning(!running);
    }
  }
  if (e.key === "Escape") {
    selected = null;
    document.querySelector('[data-tool="select"]').click();
    updateHUD();
    draw();
  }
});
document.addEventListener("visibilitychange", () => {
  last = 0;
  accumulator = 0;
});
new ResizeObserver(() => {
  draw();
  drawCharts($("speed-chart"), $("wave-chart"), sim);
}).observe($("road-view"));
function frame(now) {
  const delta = last ? Math.min((now - last) / 1000, 0.15) : 0;
  last = now;
  if (running && !document.hidden) {
    accumulator += delta * Number($("rate").value);
    let steps = 0;
    while (running && accumulator >= STEP && steps < 20) {
      if (replaying) advanceReplay(STEP);
      else advanceLive();
      accumulator = Math.max(0, accumulator - STEP);
      steps++;
    }
    draw();
  }
  if (now - lastHUD > 200) {
    updateHUD();
    lastHUD = now;
  }
  requestAnimationFrame(frame);
}
$("traffic").addEventListener("change", () => {
  updateTrafficFields();
  configurationChanged();
});
$("normalize-probabilities").addEventListener("click", () => {
  const weights = KEYS.map((k) => ({
    k,
    value: Math.max(0, Number($(`count-${k}`).value) || 0),
  }));
  const total = weights.reduce((s, w) => s + w.value, 0);
  if (!total) {
    toast("Give at least one personality a positive probability.");
    return;
  }
  const rows = weights.map((w) => ({
    ...w,
    exact: (w.value / total) * 10000,
    units: Math.floor((w.value / total) * 10000),
  }));
  const remainder = 10000 - rows.reduce((s, w) => s + w.units, 0);
  [...rows]
    .sort((a, b) => b.exact - b.units - (a.exact - a.units))
    .slice(0, remainder)
    .forEach((w) => w.units++);
  rows.forEach((w) => ($(`count-${w.k}`).value = w.units / 100));
  configurationChanged();
});
const formIds = [
  "traffic",
  "interval",
  "layout",
  "intersection",
  "lanes",
  "length",
  "reaction",
  "seed",
  "preset",
  "rate",
  ...KEYS.flatMap((k) => [`count-${k}`, `variance-${k}`]),
];
let restored = null;
document.querySelector("main").inert = true;
const handoff = await readHandoff();
if (handoff?.schema === 1 && handoff.session?.schema === 1) {
  try {
    const session = handoff.session;
    if (!session.form || !session.draftMix)
      throw new Error("Incomplete handoff");
    const live = Simulation.fromState(session.live);
    const buffer = ReplayBuffer.fromState(session.recording, live);
    const view = session.replaying ? buffer.at(session.replayCursor) : live;
    if (!view) throw new Error("Empty replay");
    liveSim = live;
    recording = buffer;
    replaying = session.replaying;
    replayCursor = session.replayCursor;
    sim = view;
    selected = session.selected;
    speedOverlay = session.speedOverlay;
    configurationValid = session.configurationValid;
    editPlaybackIntent = session.editPlaybackIntent;
    restored = session;
  } catch {
    /* Keep the saved handoff available for recovery. */
  }
}
showConfig(sim.config);
if (restored) {
  draftMix = restored.draftMix;
  mixMode = restored.mixMode;
  for (const id of formIds)
    if (Object.hasOwn(restored.form, id)) $(id).value = restored.form[id];
  updateIntersectionFields();
  updateTrafficFields(false);
  for (const id of formIds)
    if (Object.hasOwn(restored.form, id)) $(id).value = restored.form[id];
  updateLaneButtons();
  updateLabels();
  updateTotal();
  $("heat-overlay").checked = speedOverlay;
  $("setup-note").textContent = restored.note;
  $("setup-note").classList.toggle("invalid", !configurationValid);
  document.querySelector(`[data-tool="${restored.tool}"]`)?.click();
  setRunning(restored.running && canPlay());
} else {
  if (!hasTraffic())
    $("setup-note").textContent =
      "No drivers selected. Add a count or set an arriving mix to 100%.";
  $("preset").value =
    initial === PRESETS.stream
      ? "stream"
      : initial === PRESETS.mixed
        ? "mixed"
        : "custom";
}
populateVehicles();
updatePlay();
updateHUD();
draw();
document.querySelector("main").inert = false;
if (restored?.focus) $(restored.focus)?.focus();
for (const id of restored?.dialogs ?? []) $(id)?.showModal();
if (restored) {
  try {
    await clearHandoff();
  } catch {}
}
requestAnimationFrame(frame);
let upgradePlayback = false;
startPwa({
  version: document.querySelector('meta[name="app-version"]').content,
  prepare() {
    upgradePlayback = running;
    setRunning(false);
    return {
      schema: 1,
      live: liveSim.exportState(),
      recording: recording.exportState(),
      focus: document.activeElement?.id,
      dialogs: ["about", "install-help"].filter((id) => $(id).open),
      replaying,
      replayCursor,
      running: upgradePlayback,
      selected,
      tool,
      speedOverlay,
      configurationValid,
      editPlaybackIntent,
      mixMode,
      draftMix,
      form: Object.fromEntries(formIds.map((id) => [id, $(id).value])),
      note: $("setup-note").textContent,
    };
  },
  resume() {
    setRunning(upgradePlayback && canPlay());
  },
});
