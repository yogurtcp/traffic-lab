import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const template = await readFile(new URL("../sw.js", import.meta.url), "utf8");
class MemoryResponse {
  constructor(body) {
    this.body = body;
  }
  clone() {
    return new MemoryResponse(this.body);
  }
  async text() {
    return this.body;
  }
  async json() {
    return JSON.parse(this.body);
  }
}
const ROOT = "https://example.com/traffic-lab/",
  PREFIX = "loop-lab:/traffic-lab/:";
function environment() {
  const stores = new Map(),
    network = new Map();
  let offline = false;
  const fetch = async (request) => {
    if (offline) throw new Error("Offline");
    const url = typeof request === "string" ? request : request.url;
    if (!network.has(url)) throw new Error("Missing asset " + url);
    return new MemoryResponse(network.get(url));
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      const key = (request) =>
        typeof request === "string" ? request : request.url;
      return {
        match: async (request) => store.get(key(request))?.clone(),
        put: async (request, response) =>
          store.set(key(request), response.clone()),
        addAll: async (requests) => {
          const fetched = await Promise.all(
            requests.map(async (request) => [
              key(request),
              await fetch(request),
            ]),
          );
          for (const [url, response] of fetched) store.set(url, response);
        },
      };
    },
  };
  function release(version, { shell = version, missing = false } = {}) {
    network.set(ROOT, `<meta name="app-version" content="${shell}">`);
    network.set(
      ROOT + "index.html",
      `<meta name="app-version" content="${shell}">`,
    );
    if (!missing)
      network.set(ROOT + `src-${version}/model.js`, version + " model");
    const events = new Map(),
      calls = { skip: 0, claim: 0, messages: [] };
    const self = {
      registration: { scope: ROOT },
      addEventListener: (name, listener) => events.set(name, listener),
      skipWaiting: async () => {
        calls.skip++;
      },
      clients: {
        claim: async () => {
          calls.claim++;
        },
        matchAll: async () => [
          { postMessage: (message) => calls.messages.push(message) },
        ],
      },
    };
    const code = template
      .replace(
        'const VERSION = "development";',
        `const VERSION = "${version}";`,
      )
      .replace(
        /const ASSETS\s*=\s*\/\*PRECACHE\*\/\s*\[[\s\S]*?\];/,
        `const ASSETS = ["./", "./index.html", "./src-${version}/model.js"];`,
      );
    vm.runInNewContext(code, {
      self,
      caches,
      fetch,
      Request,
      Response: MemoryResponse,
      URL,
    });
    return {
      calls,
      async lifecycle(type) {
        let promise;
        events.get(type)({
          waitUntil: (value) => {
            promise = value;
          },
        });
        await promise;
      },
      async get(path, navigation = false) {
        let promise;
        const request = navigation
          ? { url: ROOT + path, method: "GET", mode: "navigate" }
          : new Request(ROOT + path);
        events.get("fetch")({
          request,
          respondWith: (value) => {
            promise = value;
          },
        });
        return promise;
      },
    };
  }
  return {
    stores,
    network,
    release,
    set offline(value) {
      offline = value;
    },
  };
}
test("the app shell and versioned modules remain available offline", async () => {
  const e = environment(),
    v1 = e.release("v1");
  await v1.lifecycle("install");
  await v1.lifecycle("activate");
  e.offline = true;
  assert.equal(v1.calls.skip, 1);
  assert.equal(v1.calls.claim, 1);
  assert.match(await (await v1.get("", true)).text(), /v1/);
  assert.equal(await (await v1.get("src-v1/model.js")).text(), "v1 model");
});
test("incomplete upgrades keep the old app; complete upgrades keep previous assets and other apps' caches", async () => {
  const e = environment(),
    v1 = e.release("v1");
  await v1.lifecycle("install");
  await v1.lifecycle("activate");
  e.stores.set("other-game:v1", new Map());
  e.stores.set(PREFIX + "old", new Map());
  const incomplete = e.release("v2", { shell: "v1" });
  await assert.rejects(incomplete.lifecycle("install"), /Incomplete release/);
  assert.equal(incomplete.calls.skip, 0);
  assert.equal(e.stores.has(PREFIX + "v2"), false);
  assert.ok(e.stores.has(PREFIX + "v1"));
  const missing = e.release("v3", { missing: true });
  await assert.rejects(missing.lifecycle("install"), /Missing asset/);
  assert.equal(e.stores.has(PREFIX + "v3"), false);
  const v2 = e.release("v2");
  await v2.lifecycle("install");
  await v2.lifecycle("activate");
  assert.ok(e.stores.has("other-game:v1"));
  assert.equal(e.stores.has(PREFIX + "old"), false);
  assert.ok(e.stores.has(PREFIX + "v1"));
  e.network.set(ROOT + "version.json", '{"version":"v3"}');
  assert.equal((await (await v2.get("version.json")).json()).version, "v3");
  e.offline = true;
  assert.match(await (await v2.get("", true)).text(), /v2/);
  assert.equal(await (await v2.get("src-v1/model.js")).text(), "v1 model");
  assert.equal(await (await v2.get("src-v2/model.js")).text(), "v2 model");
});
test("production manifest, icons, release marker and precache cover the whole installable app", async () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: new URL("../", import.meta.url),
    stdio: "pipe",
  });
  const read = (path) => readFile(new URL("../dist/" + path, import.meta.url));
  const html = (await read("index.html")).toString(),
    worker = (await read("sw.js")).toString();
  const { version } = JSON.parse(await read("version.json"));
  assert.ok(version !== "development");
  assert.ok(html.includes(`name="app-version" content="${version}"`));
  assert.ok(worker.includes(`const VERSION = "${version}"`));
  const manifest = JSON.parse(await read("manifest.webmanifest"));
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const bytes = await read(icon.src.slice(2));
    assert.equal(
      `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,
      icon.sizes,
    );
    assert.ok(worker.includes(icon.src));
  }
  const paths = [...html.matchAll(/(?:src|href)="\.\/(src-[^\"]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(paths.length >= 2);
  for (const path of paths) {
    await read(path);
    assert.ok(worker.includes("./" + path));
  }
  assert.ok(worker.includes("/pwa.js"));
  assert.ok(worker.includes("/handoff.js"));
  assert.ok(html.includes("Install app"));
});
