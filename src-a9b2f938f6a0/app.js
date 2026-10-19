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
let running = false,
  tool = "select",
  selected = null,
  speedOverlay = false,
  dirty = false,
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
function markDirty() {
  dirty = true;
  $("apply").classList.add("dirty");
  $("setup-note").textContent =
    "Setup changed. Apply & reset to use these settings.";
  $("preset").value = "custom";
  updateTotal();
}
function updateTotal() {
  const total = KEYS.reduce(
    (sum, k) => sum + (Number($(`count-${k}`).value) || 0),
    0,
  );
  $("total").textContent = Number(total.toFixed(2));
  $("total").parentElement.classList.toggle(
    "invalid",
    mixMode === "stream" && Math.abs(total - 100) > 0.01,
  );
  return total;
}
for (const [key, p] of Object.entries(PERSONALITIES)) {
  const row = document.createElement("div");
  row.className = "driver";
  row.innerHTML = `<span class="car-icon" style="--color:${p.color}" aria-hidden="true"></span><div class="driver-desc" tabindex="0" title="${p.description}" aria-label="${p.name}: ${p.description}"><span class="driver-name">${p.name}</span><span class="driver-speed">${p.speed} km/h${key === "stuntman" ? " max" : ""}</span></div><div class="driver-count"><button data-delta="-1" aria-label="Remove one ${p.name}">−</button><input id="count-${key}" type="number" min="0" max="180" value="0" aria-label="Number of ${p.name} drivers"><span class="probability-unit">%</span><button data-delta="1" aria-label="Add one ${p.name}">+</button></div>`;
  row.querySelectorAll("[data-delta]").forEach((b) =>
    b.addEventListener("click", () => {
      const input = $(`count-${key}`);
      input.value = clamp(
        (Number(input.value) || 0) + Number(b.dataset.delta),
        0,
        mixMode === "stream" ? 100 : 180,
      );
      markDirty();
    }),
  );
  row.querySelector("input").addEventListener("input", markDirty);
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
    markDirty();
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
    ? "Chance of each personality for every arriving car. Total must be 100%."
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
  const wasStarted = sim.time > 0;
  $("play").innerHTML = running
    ? '<span aria-hidden="true">Ⅱ</span> Pause simulation'
    : `<span aria-hidden="true">▶</span> ${wasStarted ? "Resume" : "Start"} simulation`;
  $("state").textContent = running
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
function reset(config) {
  let next;
  try {
    next = new Simulation(config);
  } catch (e) {
    toast(e.message);
    return false;
  }
  sim = next;
  selected = null;
  dirty = false;
  setRunning(false);
  $("apply").classList.remove("dirty");
  $("setup-note").textContent = sim.stream
    ? "Road starts empty. Press play to begin arrivals."
    : sim.route.entries.length
      ? "Evenly spaced on open road; the junction starts clear."
      : "Evenly spaced in each lane. Ready when you are.";
  showConfig(sim.config);
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
  $("flow-status").textContent =
    `${stats.active} on road · ${stats.entered} entered · ${stats.upstream} waiting upstream · ${(60 / sim.config.interval).toFixed(1)} arrivals/min`;
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
  $("center-copy").textContent = !sim.cars.length
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
      card.innerHTML = `<button class="close-selection" aria-label="Close vehicle details">×</button><strong><span style="color:${p.color}">●</span> #${car.id} ${p.name}</strong><p style="white-space:pre-line"></p><button data-action="brake">Brake 3s</button><button class="breakdown-action"></button>`;
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
            : car.a < -0.5
              ? "Braking"
              : car.a > 0.2
                ? "Accelerating"
                : "Cruising";
    card.querySelector("p").textContent =
      `${Math.round(car.v * 3.6)} / ${p.speed} km/h · lane ${car.lane + 1}\n${Number.isFinite(n.gap) ? Math.max(0, n.gap).toFixed(1) + " m to next vehicle" : "Open road ahead"}\n${status}${sim.stream ? " · " + Math.round(car.q * 100) + "% through road" : " · " + car.laps + " full laps"}`;
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
}
function action(kind, id) {
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
  if (!running)
    toast(
      kind === "repair" || kind === "remove"
        ? "Incident cleared. Press play to see the road recover."
        : "Incident added. Press play to see what happens.",
    );
  updateHUD();
  draw();
}
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
    dirty = true;
    $("apply").classList.add("dirty");
    $("setup-note").textContent =
      "Scenario loaded. Apply & reset to put it on the road.";
  }
});
for (const id of ["length", "reaction", "seed", "interval"])
  $(id).addEventListener("input", () => {
    updateLabels();
    markDirty();
  });
for (const id of ["layout", "intersection"])
  $(id).addEventListener("change", () => {
    updateIntersectionFields();
    updateTrafficFields();
    markDirty();
  });
$("shuffle").addEventListener("click", () => {
  $("seed").value = Math.floor(Math.random() * 999998) + 1;
  markDirty();
});
$("apply").addEventListener("click", () => {
  if (
    KEYS.some((k) => {
      const n = Number($(`count-${k}`).value);
      return (
        !Number.isFinite(n) ||
        n < 0 ||
        n > (mixMode === "stream" ? 100 : 180) ||
        (mixMode === "fixed" && !Number.isInteger(n))
      );
    })
  ) {
    toast(
      mixMode === "stream"
        ? "Each probability must be between 0% and 100%."
        : "Use whole car counts between 0 and 180.",
    );
    return;
  }
  if (mixMode === "stream" && Math.abs(updateTotal() - 100) > 0.01) {
    toast(
      "Driver probabilities must add up to 100%. Use “Balance probabilities” to adjust them.",
    );
    return;
  }
  if (
    mixMode === "stream" &&
    (!Number.isFinite(Number($("interval").value)) ||
      Number($("interval").value) < 0.2 ||
      Number($("interval").value) > 60)
  ) {
    toast("Use an arrival interval between 0.2 and 60 seconds.");
    return;
  }
  if (mixMode === "fixed" && updateTotal() > 180) {
    toast("Keep the experiment to 180 cars or fewer.");
    return;
  }
  const preset = $("preset").value;
  if (reset(readConfig())) {
    $("preset").value = preset;
    toast("Fresh road. Your experiment is ready.");
  }
});
$("restart").addEventListener("click", () => {
  reset(sim.config);
  toast("Same setup, same starting positions.");
});
$("play").addEventListener("click", () => {
  if (!sim.cars.length && !sim.stream) {
    toast("Add some drivers, then apply your setup.");
    return;
  }
  setRunning(!running);
  if (dirty)
    toast("Running the current road. Apply & reset to use your new setup.");
});
$("step").addEventListener("click", () => {
  setRunning(false);
  sim.advance(1);
  updatePlay();
  updateHUD();
  draw();
});
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
  sim.clearIncidents();
  selected = null;
  updateHUD();
  draw();
  toast("Incidents cleared. Give the road time to recover.");
});
$("pulse").addEventListener("click", () => {
  let car = sim.cars.find((c) => c.id === selected && !c.broken);
  if (!car)
    car = [...sim.cars].filter((c) => !c.broken).sort((a, b) => b.v - a.v)[0];
  if (!car) {
    toast("Add a working car first.");
    return;
  }
  selected = car.id;
  sim.brakeCar(car.id);
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
    if (sim.cars.length || sim.stream) setRunning(!running);
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
    while (accumulator >= STEP && steps < 20) {
      sim.step();
      accumulator -= STEP;
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
  markDirty();
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
  markDirty();
});
showConfig(sim.config);
$("preset").value =
  initial === PRESETS.stream
    ? "stream"
    : initial === PRESETS.mixed
      ? "mixed"
      : "custom";
populateVehicles();
updatePlay();
updateHUD();
draw();
requestAnimationFrame(frame);
