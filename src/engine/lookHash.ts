/** Stable content hash for a look definition.
 *
 * This is change detection, not security. A graph's provenance tag records the
 * hash of the definition it was inserted from, so the application can tell an
 * unedited look from an edited one and from one whose shipped definition has
 * moved on since. `scripts/verify-looks.mjs` imports this same module, so the
 * build and the browser can never disagree about what a definition hashes to.
 */

/** JSON with object keys in sorted order, so key order cannot change a hash. */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(
            (value as Record<string, unknown>)[key],
          )}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** FNV-1a over the canonical form, as eight lowercase hex digits. */
export function lookHash(definition: unknown): string {
  const text = canonicalize(definition);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
