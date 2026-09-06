import { useEffect, useRef, useState } from "react";
import { sampleCachePrefix, samplePrefix } from "./offline/contract";
import { samples } from "./samples";

export type OfflineSupport = "unsupported" | "installing" | "ready" | "failed";
export type OfflineState = {
  support: OfflineSupport;
  online: boolean;
  updateReady: boolean;
  error: string;
};

/** Registers the production service worker and tracks connectivity, install
 * progress and waiting updates. Updates are applied only through applyUpdate. */
export function useOffline(): OfflineState & { applyUpdate(): void } {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [support, setSupport] = useState<OfflineSupport>(() =>
    import.meta.env.PROD && "serviceWorker" in navigator
      ? "installing"
      : "unsupported",
  );
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const applying = useRef(false);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  useEffect(() => {
    if (support === "unsupported") return;
    let active = true;
    const container = navigator.serviceWorker;
    // Only a user-requested update reloads; the first install claims silently.
    const controllerChanged = () => {
      if (applying.current) location.reload();
    };
    container.addEventListener("controllerchange", controllerChanged);
    const fail = (reason: string) => {
      if (!active) return;
      setSupport("failed");
      setError(reason);
    };
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        if (!active) return;
        // Without a controller this is the first install, not an update.
        if (worker.state === "installed" && container.controller)
          setWaiting(worker);
        // A worker that never activates has failed to store its files.
        if (worker.state === "redundant" && !container.controller)
          fail(
            "The app files could not be stored. Reload while online to retry.",
          );
      };
      check();
      worker.addEventListener("statechange", check);
    };
    container
      .register("/sw.js")
      .then(async (registration) => {
        if (!active) return;
        track(registration.waiting);
        track(registration.installing);
        registration.addEventListener("updatefound", () =>
          track(registration.installing),
        );
        await container.ready;
        // Fetches are only routed through the worker once it controls this page.
        if (!container.controller)
          await new Promise<void>((resolve) =>
            container.addEventListener("controllerchange", () => resolve(), {
              once: true,
            }),
          );
        if (active) setSupport("ready");
      })
      .catch((cause: unknown) =>
        fail(
          cause instanceof Error && cause.message
            ? cause.message
            : "The offline copy could not be stored.",
        ),
      );
    return () => {
      active = false;
      container.removeEventListener("controllerchange", controllerChanged);
    };
    // Registers once; `support` only changes through this effect afterwards.
  }, []);
  return {
    support,
    online,
    updateReady: waiting !== null,
    error,
    applyUpdate: () => {
      if (!waiting) return;
      applying.current = true;
      waiting.postMessage({ type: "skip-waiting" });
    },
  };
}

/** IDs of bundled samples whose full-size PNG is in the sample cache. */
export async function storedSamples(): Promise<Set<string>> {
  const stored = new Set<string>();
  if (!("caches" in window)) return stored;
  try {
    for (const name of await caches.keys()) {
      if (!name.startsWith(sampleCachePrefix)) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const file = new URL(request.url).pathname.slice(samplePrefix.length);
        const sample = samples.find((sample) => sample.file === file);
        if (sample) stored.add(sample.id);
      }
    }
  } catch {
    // Cache inspection is advisory; loading still works without it.
  }
  return stored;
}

/** Downloads every sample once so the service worker stores it. Sequential to
 * keep memory bounded; stops at the first failure with a clear reason. */
export async function storeAllSamples(
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  if (!navigator.serviceWorker?.controller)
    throw new Error(
      "Offline storage is not ready yet. Reload once online, then try again.",
    );
  const stored = await storedSamples();
  let done = 0;
  for (const sample of samples) {
    if (!stored.has(sample.id)) {
      let response: Response | null = null;
      try {
        response = await fetch(`${samplePrefix}${sample.file}`);
      } catch {
        // Treated like a failed response below.
      }
      if (!response?.ok)
        throw new Error(
          navigator.onLine && response
            ? `Could not download ${sample.title}. Try again.`
            : `You're offline. Reconnect to store ${sample.title}.`,
        );
      await response.arrayBuffer();
    }
    onProgress(++done, samples.length);
  }
}

export function offlineStatusText(offline: OfflineState): string {
  if (offline.updateReady)
    return "A new app version is ready. Save your project, then reload to update.";
  if (!offline.online)
    return offline.support === "ready"
      ? "Offline. The stored app, saved projects and stored samples still work."
      : "Offline. Saving still works, but unstored resources cannot load.";
  switch (offline.support) {
    case "ready":
      return "Stored for offline use. Samples are stored when first opened.";
    case "installing":
      return "Storing the app for offline use (this first load needs a connection)…";
    case "failed":
      return `Offline use is unavailable: ${offline.error}`;
    default:
      return "Offline use is unavailable in this browser or session.";
  }
}

export function sampleLoadError(title: string, response: Response | null) {
  if (!navigator.onLine || response?.status === 503)
    return `You're offline and ${title} is not stored on this device yet. Reconnect and open it once, or store all samples while online.`;
  return `Could not load ${title}. Try again or choose another sample.`;
}
