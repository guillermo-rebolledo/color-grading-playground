// Service worker source. The build plugin (scripts/offline-plugin.ts) compiles
// this file to /sw.js and replaces __OFFLINE__ with the versioned precache list.
// Not part of the React bundle; it uses no DOM and imports nothing.
declare const __OFFLINE__: {
  version: string;
  samplesVersion: string;
  precache: string[];
  appCachePrefix: string;
  sampleCachePrefix: string;
  samplePrefix: string;
};
type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & {
  request: Request;
  respondWith(response: Response | Promise<Response>): void;
};
type WorkerScope = {
  location: Location;
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(
    type: "install" | "activate",
    h: (e: ExtendableEvent) => void,
  ): void;
  addEventListener(type: "fetch", h: (e: FetchEvent) => void): void;
  addEventListener(type: "message", h: (e: MessageEvent) => void): void;
};
const worker = self as unknown as WorkerScope;
const { appCachePrefix, sampleCachePrefix, samplePrefix } = __OFFLINE__;
const appCache = appCachePrefix + __OFFLINE__.version;
const sampleCache = sampleCachePrefix + __OFFLINE__.samplesVersion;
const precache = new Set(__OFFLINE__.precache);

worker.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(appCache);
      // Bypass the HTTP cache so unhashed files (index.html, inventory) are current.
      await cache.addAll(
        [...precache].map((path) => new Request(path, { cache: "reload" })),
      );
    })(),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        const stale =
          (name.startsWith(appCachePrefix) && name !== appCache) ||
          (name.startsWith(sampleCachePrefix) && name !== sampleCache);
        if (stale) await caches.delete(name);
      }
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener("message", (event) => {
  if (event.data?.type === "skip-waiting") void worker.skipWaiting();
});

async function cacheFirst(
  name: string,
  path: string,
  request: Request,
): Promise<Response> {
  const cache = await caches.open(name);
  const hit = await cache.match(path);
  if (hit) return hit;
  let response: Response;
  try {
    response = await fetch(request);
  } catch {
    return new Response("", { status: 503, statusText: "Offline" });
  }
  if (response.ok) {
    // A full cache must not turn a successful download into an offline error.
    try {
      await cache.put(path, response.clone());
    } catch {
      // Storage failure only means the file is not kept for next time.
    }
  }
  return response;
}

worker.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== worker.location.origin) return;
  const path = url.pathname;
  if (precache.has(path))
    event.respondWith(cacheFirst(appCache, path, request));
  else if (request.mode === "navigate")
    // Any other in-app URL (e.g. /#project=…) is the single-page shell.
    event.respondWith(cacheFirst(appCache, "/index.html", request));
  else if (path.startsWith(samplePrefix) && path.endsWith(".png"))
    event.respondWith(cacheFirst(sampleCache, path, request));
  // Anything else goes to the network untouched.
});

export {};
