// Structural and provenance checks for the look inventory.
//
// This script deliberately does not evaluate colour. Whether a look validates
// through the engine, compiles, differs from identity and differs from every
// other look is checked in tests/looks.spec.ts, where a real WebGL2 context
// exists. What is checked here is what a browser cannot check: that the shipped
// files agree with each other.
//
//   npm run looks:verify          structure, previews and hashes
//   npm run looks:release-check    also requires the full family coverage
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { lookHash } from "../src/engine/lookHash.ts";

const release = process.argv.includes("--release");
const root = new URL("../public/looks/", import.meta.url);
const inventory = JSON.parse(readFileSync(new URL("inventory.json", root)));
const hash = (data) => createHash("sha256").update(data).digest("hex");

const nodeTypes = new Set([
  "exposure",
  "cst",
  "cdl",
  "contrast",
  "saturation",
  "curves",
  "whiteBalance",
]);
const groups = new Set([
  "Colour negative",
  "Slide",
  "Black and white",
  "Motion picture",
]);

assert.equal(inventory.schemaVersion, 1);
assert.ok(inventory.lookSpace?.transfer, "Inventory needs a look space");
assert.ok(inventory.lookSpace?.primaries, "Look space needs primaries");
assert.ok(
  inventory.reference?.sample,
  "Previews need a recorded reference frame",
);
assert.ok(
  inventory.reference?.license,
  "The reference frame needs its licence",
);

const ids = inventory.looks.map((look) => look.id);
assert.equal(new Set(ids).size, ids.length, "Look ids must be unique");

for (const look of inventory.looks) {
  const where = `${look.id}:`;
  assert.match(look.id, /^[a-z0-9-]+$/, `${where} id must be kebab-case`);
  assert.ok(look.name, `${where} needs a family name`);
  assert.ok(groups.has(look.group), `${where} unknown group ${look.group}`);
  assert.ok(look.description, `${where} needs a description`);
  assert.ok(
    Array.isArray(look.referenceStocks) && look.referenceStocks.length,
    // The families are named generically precisely because the stocks are
    // trademarks and nothing here is measured; the reference list is what
    // makes the family legible, so it is not optional.
    `${where} needs at least one reference stock`,
  );
  assert.ok(look.nodes?.length, `${where} needs at least one node`);

  for (const node of look.nodes) {
    assert.ok(
      nodeTypes.has(node.type),
      `${where} unsupported node type ${node.type}`,
    );
    // Source, Output and the CST sandwich are supplied by the inserter; a
    // definition that shipped its own would be wired twice.
    if (node.type !== "curves") continue;
    for (const [channel, points] of Object.entries(node.data.curves)) {
      const at = `${where} curves/${channel}:`;
      assert.ok(
        points.length >= 2 && points.length <= 256,
        `${at} 2-256 points`,
      );
      assert.equal(points[0].x, 0, `${at} first input must be 0`);
      assert.equal(points.at(-1).x, 1, `${at} last input must be 1`);
      points.forEach((point, i) => {
        assert.ok(
          point.y >= 0 && point.y <= 1,
          `${at} output ${point.y} outside 0-1`,
        );
        if (i > 0)
          assert.ok(
            Math.fround(point.x) > Math.fround(points[i - 1].x),
            `${at} inputs must strictly increase, also in float32`,
          );
      });
    }
  }

  // The preview must have been rendered from the definition it sits beside.
  // Editing a look without re-rendering is the drift this exists to catch.
  const preview = look.preview;
  assert.ok(preview?.file, `${where} needs a preview`);
  assert.equal(
    preview.definitionHash,
    lookHash(look.nodes),
    `${where} preview is stale. Run npm run looks:previews.`,
  );
  const file = new URL(preview.file, root);
  assert.ok(existsSync(file), `${where} missing ${preview.file}`);
  assert.equal(
    hash(readFileSync(file)),
    preview.sha256,
    `${where} preview checksum mismatch`,
  );
}

// No preview may be left behind by a look that was renamed or removed.
const expected = new Set(
  inventory.looks.map((look) => look.preview.file.replace("previews/", "")),
);
for (const name of readdirSync(new URL("previews/", root)))
  assert.ok(expected.has(name), `Orphaned preview: ${name}`);

if (release) {
  assert.equal(inventory.looks.length, 13, "Release ships thirteen families");
  const covered = new Set(inventory.looks.map((look) => look.group));
  for (const group of groups)
    assert.ok(covered.has(group), `Release is missing the ${group} group`);
}

console.log(
  `looks: ${inventory.looks.length} verified${release ? " (release)" : ""}, previews rendered from ${inventory.reference.sample}`,
);
