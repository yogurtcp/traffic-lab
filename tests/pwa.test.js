import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { startPwa, installInstructions } from "../src/pwa.js";
class Element extends EventTarget {
  hidden = false;
  textContent = "";
  open = false;
  click() {
    this.dispatchEvent(new Event("click"));
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}
function environment({
  online = true,
  current = "v1",
  published = "v1",
  saveFails = false,
} = {}) {
  const ids = Object.fromEntries(
    [
      "install-app",
      "install-help",
      "app-status",
      "install-now",
      "install-instructions",
      "install-close",
      "update-overlay",
    ].map((id) => [id, new Element()]),
  );
  ids["update-overlay"].hidden = true;
  const document = Object.assign(new EventTarget(), {
    baseURI: "https://example.com/traffic-lab/",
    hidden: false,
    getElementById: (id) => ids[id],
    querySelector: (key) => ids[key] ?? (ids[key] = new Element()),
  });
  const serviceWorker = new EventTarget();
  let active = current;
  const worker = {
    postMessage(_message, ports) {
      ports[0].postMessage({ version: active });
    },
  };
  serviceWorker.controller = worker;
  const calls = {
    fetch: 0,
    register: 0,
    update: 0,
    prepare: 0,
    save: 0,
    resume: 0,
    reload: 0,
    polling: 0,
  };
  serviceWorker.register = async () => {
    calls.register++;
    return {
      active: worker,
      update: async () => {
        calls.update++;
      },
    };
  };
  const window = Object.assign(new EventTarget(), {
    navigator: {
      onLine: online,
      serviceWorker,
      userAgent: "Chrome",
      platform: "Linux",
    },
  });
  Object.assign(globalThis, {
    window,
    document,
    crypto: webcrypto,
    fetch: async () => {
      calls.fetch++;
      return { ok: true, json: async () => ({ version: published }) };
    },
    setInterval: () => {
      calls.polling++;
      throw new Error("Polling forbidden");
    },
  });
  let payload;
  startPwa({
    version: "v1",
    prepare() {
      calls.prepare++;
      return { time: 42, history: new Map([[1, Infinity]]), draft: "80" };
    },
    resume() {
      calls.resume++;
    },
    save: async (value) => {
      calls.save++;
      if (saveFails) throw new Error("Quota");
      payload = value;
    },
    reload() {
      calls.reload++;
    },
  });
  return {
    ids,
    calls,
    window,
    document,
    serviceWorker,
    get payload() {
      return payload;
    },
    activate(version) {
      active = version;
      serviceWorker.dispatchEvent(new Event("controllerchange"));
    },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
test("online startup checks once and does not poll, refocus or reconnect-check", async () => {
  const e = environment();
  await settle();
  assert.equal(e.calls.fetch, 1);
  assert.equal(e.calls.update, 1);
  assert.equal(e.calls.polling, 0);
  e.window.dispatchEvent(new Event("focus"));
  e.window.dispatchEvent(new Event("online"));
  e.document.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(e.calls.fetch, 1);
  assert.equal(e.calls.update, 1);
  assert.equal(e.calls.prepare, 0);
  e.ids["install-app"].click();
  assert.equal(e.ids["install-help"].open, true);
});
test("a startup update waits for the complete new worker, saves work once, then reloads", async () => {
  const e = environment({ published: "v2" });
  await settle();
  assert.equal(e.calls.prepare, 0);
  e.activate("v2");
  await settle();
  assert.equal(e.calls.reload, 1);
  assert.equal(e.calls.save, 1);
  assert.equal(e.payload.session.time, 42);
  assert.equal(e.payload.session.history.get(1), Infinity);
  assert.equal(e.payload.session.draft, "80");
  assert.equal(e.payload.targetVersion, "v2");
  e.activate("v2");
  await settle();
  assert.equal(e.calls.save, 1);
  assert.equal(e.calls.fetch, 1);
});
test("storage failure preserves the current run instead of reloading or looping", async () => {
  const e = environment({ published: "v2", current: "v2", saveFails: true });
  await settle();
  assert.equal(e.calls.reload, 0);
  assert.equal(e.calls.resume, 1);
  assert.equal(e.ids["update-overlay"].hidden, true);
  assert.equal(e.document.querySelector("main").inert, false);
  assert.match(e.ids["app-status"].textContent, /could not be saved/);
});
test("offline startup keeps offline access without checking after reconnection", async () => {
  const e = environment({ online: false });
  await settle();
  e.window.navigator.onLine = true;
  e.window.dispatchEvent(new Event("online"));
  e.document.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(e.calls.fetch, 0);
  assert.equal(e.calls.register, 0);
  assert.equal(e.calls.reload, 0);
});
test("installation uses the browser prompt when supplied and offers accurate platform instructions otherwise", async () => {
  const e = environment();
  await settle();
  let prompted = 0;
  const event = new Event("beforeinstallprompt");
  Object.assign(event, {
    prompt: async () => {
      prompted++;
    },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  e.window.dispatchEvent(event);
  e.ids["install-app"].click();
  await settle();
  assert.equal(prompted, 1);
  e.window.dispatchEvent(new Event("appinstalled"));
  assert.equal(e.ids["install-app"].textContent, "App info");
  assert.match(
    installInstructions({ userAgent: "iPhone", platform: "iPhone" }),
    /Share.*Add to Home Screen/,
  );
  assert.match(
    installInstructions({ userAgent: "Safari", platform: "MacIntel" }),
    /Add to Dock/,
  );
});
