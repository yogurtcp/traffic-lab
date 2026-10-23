const VERSION = "development";
const ASSETS = /*PRECACHE*/ [
  "./",
  "./index.html",
  "./favicon.svg",
  "./manifest.webmanifest",
];
const SCOPE = new URL(self.registration.scope);
const PREFIX = `loop-lab:${SCOPE.pathname}:`;
const CACHE = PREFIX + VERSION;
const META = PREFIX + "metadata";
const ACTIVE = new URL("__active_version__", SCOPE).href;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(
          ASSETS.map(
            (path) => new Request(new URL(path, SCOPE), { cache: "reload" }),
          ),
        );
        const shell = await cache.match(new URL("index.html", SCOPE).href);
        if (
          !shell ||
          !(await shell.text()).includes(
            `name="app-version" content="${VERSION}"`,
          )
        )
          throw new Error("Incomplete release");
        await self.skipWaiting();
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const metadata = await caches.open(META);
      const previous = await metadata.match(ACTIVE);
      const previousCache = previous ? await previous.text() : null;
      const names = (await caches.keys()).filter((name) =>
        name.startsWith(PREFIX),
      );
      const keep = new Set([CACHE, META, previousCache]);
      await Promise.all(
        names
          .filter((name) => !keep.has(name))
          .map((name) => caches.delete(name)),
      );
      await metadata.put(ACTIVE, new Response(CACHE));
      await self.clients.claim();
      for (const client of await self.clients.matchAll({ type: "window" }))
        client.postMessage({ type: "APP_READY", version: VERSION });
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_VERSION")
    event.ports[0]?.postMessage({ version: VERSION });
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== SCOPE.origin ||
    !url.pathname.startsWith(SCOPE.pathname)
  )
    return;
  if (
    url.pathname === new URL("version.json", SCOPE).pathname ||
    url.pathname === new URL("sw.js", SCOPE).pathname
  ) {
    event.respondWith(fetch(new Request(request, { cache: "no-store" })));
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (request.mode === "navigate")
        return (
          (await cache.match(new URL("index.html", SCOPE).href)) ??
          fetch(request)
        );
      const cached = await cache.match(request);
      if (cached) return cached;
      for (const name of (await caches.keys())
        .filter(
          (name) => name.startsWith(PREFIX) && name !== CACHE && name !== META,
        )
        .reverse()) {
        const older = await (await caches.open(name)).match(request);
        if (older) return older;
      }
      return fetch(request);
    })(),
  );
});
