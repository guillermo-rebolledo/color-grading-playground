import LZString from "lz-string";
import { maxProjectLength, parseProject, type Project } from "./projects";

const maxFragmentLength = 16 * 1024;
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

/** lz-string 1.5 URI decoder, adapted to reject expansion before accumulating output.
 * Copyright (c) 2013 pieroxy, MIT license: docs/licenses/lz-string.txt.
 */
function decompress(input: string): string {
  let cursor = 0;
  function bits(count: number) {
    let value = 0;
    for (let bit = 0; bit < count; bit++, cursor++) {
      if (cursor >= input.length * 6)
        throw new Error("Corrupt or truncated share link.");
      const digit = alphabet.indexOf(input[Math.floor(cursor / 6)]);
      value |= ((digit >> (5 - (cursor % 6))) & 1) << bit;
    }
    return value;
  }
  const first = bits(2);
  if (first > 1) throw new Error("Corrupt share link.");
  let previous = String.fromCharCode(bits(first === 0 ? 8 : 16));
  const dictionary: string[] = [];
  dictionary[3] = previous;
  const output = [previous];
  let length = 1,
    size = 4,
    remaining = 4,
    width = 3;
  function grow() {
    if (remaining === 0) {
      remaining = 2 ** width;
      width++;
    }
  }
  while (true) {
    let code = bits(width);
    if (code === 2) return output.join("");
    if (code === 0 || code === 1) {
      dictionary[size++] = String.fromCharCode(bits(code === 0 ? 8 : 16));
      code = size - 1;
      remaining--;
    }
    grow();
    const entry =
      dictionary[code] ?? (code === size ? previous + previous[0] : null);
    if (!entry) throw new Error("Corrupt share link.");
    length += entry.length;
    if (length > maxProjectLength)
      throw new Error("Shared project is too large (maximum 256 KiB decoded).");
    output.push(entry);
    dictionary[size++] = previous + entry[0];
    remaining--;
    previous = entry;
    grow();
  }
}

export function readSharedProject(fragment: string): Project {
  if (fragment.length > maxFragmentLength)
    throw new Error("Share link is too large (maximum 16 KiB).");
  const payload = fragment.slice("#project=".length);
  if (
    !fragment.startsWith("#project=") ||
    !payload ||
    !/^[A-Za-z0-9+$-]+$/.test(payload)
  )
    throw new Error("Corrupt share link.");
  const decoded = decompress(payload);
  let value: unknown;
  try {
    value = JSON.parse(decoded);
  } catch {
    throw new Error("Corrupt shared project JSON.");
  }
  return parseProject(value);
}

export function createShareLink(project: Project): string {
  const payload = LZString.compressToEncodedURIComponent(
    JSON.stringify(parseProject(project)),
  );
  const fragment = `#project=${payload}`;
  if (fragment.length > maxFragmentLength)
    throw new Error(
      "This grade is too large for a share link (maximum 16 KiB). Save it locally or simplify the graph.",
    );
  const url = new URL(location.href);
  url.hash = fragment;
  return url.href;
}
