import { saveHandoff } from "./handoff.js";
export function workerVersion(worker) {
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => finish(null), 2000);
    function finish(value) {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(value);
    }
    channel.port1.onmessage = (event) => finish(event.data?.version ?? null);
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}
export function installInstructions(navigator) {
  const ua = navigator.userAgent ?? "";
  if (
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
    return "On iPhone or iPad, open Loop Lab in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if it is offered.";
  if (
    /Mac/.test(navigator.platform ?? "") &&
    /Safari/.test(ua) &&
    !/Chrome|Chromium|Edg/.test(ua)
  )
    return "In Safari on Mac, choose File → Add to Dock when available.";
  return "Use your browser’s Install app or Add to Home Screen command. In supported browsers, an install icon also appears near the address bar. If no install option is offered, open Loop Lab in a browser that supports web-app installation.";
}
export function startPwa({
  version,
  prepare,
  resume,
  save = saveHandoff,
  reload = () => location.reload(),
}) {
  const navigator = window.navigator;
  const button = document.getElementById("install-app"),
    dialog = document.getElementById("install-help");
  const status = document.getElementById("app-status"),
    promptButton = document.getElementById("install-now");
  let prompt = null,
    registration,
    wanted = null,
    finishing = null,
    updating = false,
    installed = false,
    attempted = false;
  const standalone = () =>
    globalThis.matchMedia?.("(display-mode: standalone)").matches ||
    navigator.standalone;
  const show = () => dialog.showModal();
  const refreshInstall = () => {
    button.textContent = standalone() || installed ? "App info" : "Install app";
    promptButton.hidden = !prompt;
  };
  document.getElementById("install-instructions").textContent =
    installInstructions(navigator);
  document
    .getElementById("install-close")
    .addEventListener("click", () => dialog.close());
  async function install() {
    if (!prompt) {
      show();
      return;
    }
    const event = prompt;
    prompt = null;
    refreshInstall();
    await event.prompt();
    await event.userChoice;
    refreshInstall();
  }
  button.addEventListener("click", () =>
    prompt ? install().catch(show) : show(),
  );
  promptButton.addEventListener("click", () => install().catch(show));
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event;
    refreshInstall();
  });
  window.addEventListener("appinstalled", () => {
    prompt = null;
    installed = true;
    refreshInstall();
  });
  refreshInstall();
  async function applyStartupUpdate() {
    if (!wanted || updating || attempted) return;
    const active = await workerVersion(
      navigator.serviceWorker?.controller ?? registration?.active,
    );
    if (active !== wanted) {
      status.textContent =
        "Downloading an update. Your simulation can keep running.";
      return;
    }
    if (wanted === version) {
      status.textContent =
        "Up to date · offline ready. Updates are checked at online startup.";
      return;
    }
    // The startup download is fully precached before the session is paused.
    attempted = true;
    updating = true;
    let saved = false;
    document.getElementById("update-overlay").hidden = false;
    document.querySelector("main").inert = true;
    document.querySelector("header").inert = true;
    try {
      const session = structuredClone(prepare());
      await save({
        schema: 1,
        token: crypto.randomUUID(),
        targetVersion: wanted,
        session,
      });
      saved = true;
      reload();
    } finally {
      if (!saved) {
        updating = false;
        document.getElementById("update-overlay").hidden = true;
        document.querySelector("main").inert = false;
        document.querySelector("header").inert = false;
        resume();
        status.textContent =
          "The update is ready, but your session could not be saved. Your run will keep going; we’ll try again on your next online startup.";
      }
    }
  }
  function finishStartup() {
    if (finishing || updating) return finishing;
    finishing = applyStartupUpdate()
      .catch(() => {})
      .finally(() => {
        finishing = null;
      });
    return finishing;
  }
  async function checkAtStartup() {
    if (navigator.onLine === false) {
      status.textContent =
        "Offline · using your downloaded app. Updates are checked on the next online startup.";
      return;
    }
    try {
      await registration?.update();
      const response = await fetch(new URL("version.json", document.baseURI), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Update check failed");
      wanted = (await response.json()).version;
      await finishStartup();
    } catch {
      status.textContent =
        "Could not check for updates just now. Your simulation is safe; we’ll try again on the next online startup.";
    }
  }
  if (version === "development" || !("serviceWorker" in navigator)) {
    status.textContent =
      version === "development"
        ? "Preview mode. Install the published app for offline use and automatic updates."
        : "Offline installation is not available in this browser. You can keep using Loop Lab here.";
    return;
  }
  // These events only finish an update already requested at startup. They
  // never fetch version metadata or start another update check.
  navigator.serviceWorker.addEventListener("controllerchange", finishStartup);
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "APP_READY") finishStartup();
  });
  if (navigator.onLine === false) {
    status.textContent =
      "Offline · using your downloaded app. Updates are checked on the next online startup.";
  } else
    navigator.serviceWorker
      .register(new URL("sw.js", document.baseURI), {
        scope: new URL("./", document.baseURI).pathname,
        updateViaCache: "none",
      })
      .then((value) => {
        registration = value;
        checkAtStartup();
      })
      .catch(() => {
        status.textContent =
          "Offline setup could not finish. We’ll try again on the next online startup.";
      });
  return;
}
