# Offline use (MEM-219)

After one complete online load, the production build keeps working without a
network: the application shell, saved projects and any bundled sample that has
already been opened or stored. No account, backend or grading API exists;
uploaded images and grade data never leave the device, offline or online.

## What is cached and when

`npm run build` runs the Vite plugin in [scripts/offline-plugin.ts](../scripts/offline-plugin.ts),
which compiles [src/offline/sw.ts](../src/offline/sw.ts) to `dist/sw.js` and
embeds a precache list. Two Cache Storage caches are used:

| Cache                     | Contents                                                                                                                                | Filled                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `cgp-app-<version>`       | `index.html`, hashed JS/CSS chunks including the scopes worker, `samples/inventory.json`, previews, licenses, and the whole of `looks/` | During service worker install   |
| `cgp-samples-<inventory>` | Full-size PNG16 samples (51 MiB for all nine)                                                                                           | On first open, or **Store all** |

`<version>` is a digest of every precached file, so any change to the shell
produces a new cache. The look inventory and its thirteen previews are part of
that digest, so **editing any look invalidates the application cache** and every
client re-downloads the shell on its next visit. The thirteen previews are 932 KiB in total, in the
same 240 px 8-bit format as the sample previews; look assets are never stored on
demand the way full-size samples are, because there are no full-size look
assets. `<inventory>` is a digest of `inventory.json`, which
records each sample's SHA-256, so stored samples survive application updates
and are discarded only when the sample set changes. Old caches are deleted
when a new worker activates.

Requests are handled cache-first: precached paths (including linked licence
and inventory files) come from the app cache, any other navigation such as
`/#project=…` is served the cached `index.html`, and `/samples/*.png` comes from
the sample cache, storing successful network responses. All other requests go
to the network untouched. A failed network request for an uncached resource
returns a 503 rather than hanging; a failed cache write (for example a full
disk) still returns the downloaded file. The cache layout is defined once in
[src/offline/contract.ts](../src/offline/contract.ts).

If the install cannot store its files, the status reports that offline use is
unavailable instead of waiting forever. The service worker is registered only
in production builds. The dev server
(`npm run dev`) shows "Offline use is unavailable in this browser or session".

## Initial-load requirements

The first visit needs a connection until the toolbar's offline status reads
"Stored for offline use". Samples are only available offline after being opened
once online, or after **Store all samples offline** in the sample gallery,
which downloads the remaining files one at a time and reports progress. The
gallery marks stored samples. Offline, opening an unstored sample explains the
situation and keeps the current image, source tags and edits; retry after
reconnecting. Save, share links, precision charts and uploads work offline.

Browsers may evict Cache Storage or IndexedDB under storage pressure, and
private windows discard them at the end of the session. Storage in one browser
profile or origin is not visible to another.

## Updates

The browser checks `sw.js` on each navigation. When a new version has finished
installing, the toolbar shows "A new app version is ready. Save your project,
then reload to update" with a **Reload to update** button. Nothing reloads
automatically; unsaved edits stay open until the user chooses. The button asks
the waiting worker to take over and then reloads the page, which restores the
last saved project.

## Verification

`tests/offline.spec.ts` runs against `vite preview` on port 4173 (see
`playwright.config.ts`, which builds to the ignored `dist-test` directory). It
loads the app online, saves a private upload, opens one sample, switches the
browser context offline, reloads, checks the restored grade pixel-for-pixel,
opens the stored sample, confirms an unstored sample explains the offline
failure without losing work, saves offline, reconnects, and asserts that no
non-GET or cross-origin request was made. A second test stores all samples and
opens them offline. A third registers a second worker URL to simulate a deploy
and checks that the update waits for the explicit reload. Chromium's offline
emulation applies to the worker's own fetches, which is why the unstored sample
fails as expected. Unit-level behaviour of Cache Storage eviction and real
mobile browsers is not covered.
