import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = new URL("../public/samples/", import.meta.url);
const inventory = JSON.parse(readFileSync(new URL("inventory.json", root)));
const sources = JSON.parse(
  readFileSync(new URL("log-sample-sources.json", import.meta.url)),
);
const hash = (data) => createHash("sha256").update(data).digest("hex");
assert.equal(inventory.schemaVersion, 1);
assert.equal(inventory.assets.length, sources.length);
assert.equal(
  new Set(inventory.assets.map((asset) => asset.id)).size,
  sources.length,
);
assert.deepEqual(
  readdirSync(root)
    .filter((name) => name.endsWith(".png"))
    .sort(),
  inventory.assets.map((asset) => asset.file).sort(),
);

for (const asset of inventory.assets) {
  const source = sources.find(({ id }) => id === asset.id);
  assert.ok(source, `Unknown source: ${asset.id}`);
  for (const key of Object.keys(source))
    assert.deepEqual(asset[key], source[key]);
  assert.match(asset.file, /^[a-z-]+\.png$/);
  assert.equal(asset.license, "BSD-3-Clause");
  assert.equal(asset.licenseFile, "licenses/OpenEXR.txt");
  assert.ok(readFileSync(new URL(asset.licenseFile, root)).length > 1000);
  assert.equal(asset.bitDepth, 16);
  assert.equal(asset.codeRange, "full");
  assert.equal(asset.codeNormalization, "uint16 / 65535");
  assert.equal(asset.alpha, "opaque");
  const bytes = readFileSync(new URL(asset.file, root));
  assert.equal(hash(bytes), asset.sha256, `${asset.id}: checksum mismatch`);
  assert.equal(bytes.length, asset.bytes);
  const png = PNG.sync.read(bytes, { skipRescale: true, checkCRC: true });
  assert.equal(png.depth, 16);
  assert.equal(png.colorType, 2);
  assert.equal(png.width, asset.width);
  assert.equal(png.height, asset.height);
  assert.ok(Math.max(png.width, png.height) <= 2048);
  let min = 65535;
  let max = 0;
  const codes = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      min = Math.min(min, png.data[i + c]);
      max = Math.max(max, png.data[i + c]);
      codes.add(png.data[i + c]);
    }
    assert.equal(png.data[i + 3], 65535);
  }
  assert.equal(min, asset.measurements.codeMin);
  assert.equal(max, asset.measurements.codeMax);
  assert.equal(codes.size, asset.measurements.distinctCodes);
  assert.ok(codes.size > 256, `${asset.id}: insufficient code precision`);
  assert.ok(asset.measurements.sourceRgbMax > 1);
  assert.ok(asset.measurements.preparedLinearMax > 1);
  assert.equal(asset.measurements.clippedChannels, 0);
  assert.ok(asset.probes.length >= 25);
  console.log(
    `${asset.id}: verified PNG16, ${png.width}×${png.height}, SHA-256 ${asset.sha256}`,
  );
}

const missing = [];
if (inventory.assets.length < 6 || inventory.assets.length > 10)
  missing.push("6–10 assets");
for (const transfer of ["logc3", "slog3", "davinci-intermediate"])
  if (!inventory.assets.some((asset) => asset.encoding.transfer === transfer))
    missing.push(transfer);
for (const scene of [
  "skin-tones",
  "high-contrast-exterior",
  "tungsten-interior",
  "neutral-chart",
])
  if (!inventory.assets.some((asset) => asset.scene === scene))
    missing.push(scene);
const ready = missing.length === 0 && inventory.releaseBlockers.length === 0;
assert.equal(
  inventory.releaseReady,
  ready,
  "Release status contradicts inventory coverage",
);
console.log(`Inventory verified: ${fileURLToPath(root)}`);
console.log(`Release readiness: ${ready ? "READY" : "BLOCKED"}`);
for (const blocker of inventory.releaseBlockers) console.log(`- ${blocker}`);
if (process.argv.includes("--release") && !ready) {
  console.error(`Release gate failed; missing coverage: ${missing.join(", ")}`);
  process.exitCode = 1;
}
