/** Names shared by the service worker, the build plugin and the client so the
 * cache layout is defined once. The plugin injects these into the worker. */
export const appCachePrefix = "cgp-app-";
export const sampleCachePrefix = "cgp-samples-";
export const samplePrefix = "/samples/";
/** Full-size PNG16 samples are stored on demand, not at install. */
export function isFullSizeSample(path: string): boolean {
  return (
    path.startsWith(samplePrefix) &&
    path.endsWith(".png") &&
    !path.startsWith(`${samplePrefix}previews/`)
  );
}
