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
let initial = PRESETS.mixed;
try {
  const saved = JSON.parse(localStorage.getItem("loop-lab-setup-v1"));
  if (saved?.counts) initial = normalizeConfig(saved);
} catch {}
let sim;
try {
  sim = new Simulation(initial);
} catch {
  sim = new Simulation(PRESETS.mixed);
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
  $("total").textContent = total;
  return total;
}
for (const [key, p] of Object.entries(PERSONALITIES)) {
  const row = document.createElement("div");
  row.className = "driver";
  row.innerHTML = `<span class="car-icon" style="--color:${p.color}" aria-hidden="true"></span><div class="driver-desc" tabindex="0" title="${p.description}" aria-label="${p.name}: ${p.description}"><span class="driver-name">${p.name}</span><span class="driver-speed">${p.speed} km/h${key === "stuntman" ? " max" : ""}</span></div><div class="driver-count"><button data-delta="-1" aria-label="Remove one ${p.name}">−</button><input id="count-${key}" type="number" min="0" max="180" value="0" aria-label="Number of ${p.name} drivers"><button data-delta="1" aria-label="Add one ${p.name}">+</button></div>`;
  row.querySelectorAll("[data-delta]").forEach((b) =>
    b.addEventListener("click", () => {
      const input = $(`count-${key}`);
      input.value = clamp(
        (Number(input.value) || 0) + Number(b.dataset.delta),
        0,
        180,
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
  $("lanes").value = config.lanes;
  $("length").value = config.length;
  $("reaction").value = config.reaction;
  $("seed").value = config.seed;
  for (const k of KEYS) $(`count-${k}`).value = config.counts[k] ?? 0;
  updateLaneButtons();
  updateLabels();
  updateTotal();
}
function updateLabels() {
  $("length-value").textContent =
    `${Number($("length").value).toLocaleString()} m`;
  $("reaction-value").textContent =
    `${Number($("reaction").value).toFixed(1)} s`;
}
function readConfig() {
  return {
    lanes: Number($("lanes").value),
    length: Number($("length").value),
    reaction: Number($("reaction").value),
    seed: Number($("seed").value),
    counts: Object.fromEntries(
      KEYS.map((k) => [k, Number($(`count-${k}`).value)]),
    ),
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
  $("setup-note").textContent =
    "Evenly spaced in each lane. Ready when you are.";
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
  select.replaceChildren();
  for (const c of sim.cars) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = `#${c.id} · ${PERSONALITIES[c.type].name}`;
    select.append(o);
  }
  select.disabled = !sim.cars.length;
}
function draw() {
  const g = road.draw(sim, selected, speedOverlay);
  const scale = Math.min(1, (g.inner - 12) / 118);
  $("road-view").querySelector(".center-readout").style.transform =
    `translate(-50%,-45%) scale(${scale})`;
}
function timeLabel(t) {
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}
function updateHUD() {
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
  const congested = stats.slow > sim.cars.length * 0.2 && sim.cars.length > 0;
  $("center-label").textContent =
    sim.time === 0
      ? "ROOM TO EXPERIMENT"
      : congested
        ? "THE RIPPLE IS SPREADING"
        : "AVERAGE ROAD SPEED";
  $("center-copy").textContent = !sim.cars.length
    ? "An empty road. Add some drivers."
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
      `${Math.round(car.v * 3.6)} / ${p.speed} km/h · lane ${car.lane + 1}\n${Number.isFinite(n.gap) ? Math.max(0, n.gap).toFixed(1) + " m to next vehicle" : "Open road ahead"}\n${status}`;
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
for (const id of ["length", "reaction", "seed"])
  $(id).addEventListener("input", () => {
    updateLabels();
    markDirty();
  });
$("shuffle").addEventListener("click", () => {
  $("seed").value = Math.floor(Math.random() * 999998) + 1;
  markDirty();
});
$("apply").addEventListener("click", () => {
  if (updateTotal() > 180) {
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
  if (!sim.cars.length) {
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
      toast("Place the obstacle on a lane of the road.");
      return;
    }
    if (sim.addObstacle(location.q, location.lane)) {
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
    if (sim.cars.length) setRunning(!running);
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
showConfig(sim.config);
$("preset").value = initial === PRESETS.mixed ? "mixed" : "custom";
populateVehicles();
updatePlay();
updateHUD();
draw();
requestAnimationFrame(frame);
