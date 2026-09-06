// MEM-220 host interoperability check: apply the exact downloaded .cube artifacts
// in FFmpeg's lut3d filter and compare against the test-only independent applier
// used by tests/cube-tools.ts. It never calls the application's grading engine, so
// agreement is evidence of interoperability rather than of shared code.
//
// Run `npm run release:evidence` first; it writes release-evidence/host-inputs.json.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const evidence = new URL("../release-evidence/", import.meta.url);
const inputsPath = new URL("host-inputs.json", evidence);
if (!existsSync(inputsPath)) {
  console.error(
    `Missing ${fileURLToPath(inputsPath)}. Run \`npm run release:evidence\` first.`,
  );
  process.exit(1);
}
const inputs = JSON.parse(readFileSync(inputsPath));
const matrix = JSON.parse(
  readFileSync(new URL("release-hosts.json", import.meta.url)),
);
const dir = fileURLToPath(evidence);

function ffmpegVersion() {
  try {
    return execFileSync("ffmpeg", ["-version"], { encoding: "utf8" })
      .split("\n")[0]
      .trim();
  } catch {
    return null;
  }
}

const version = ffmpegVersion();
if (!version) {
  console.error(
    "FFmpeg is not installed. An untested host is a release blocker, not a pass.",
  );
  process.exit(1);
}

/** 16-bit RGB samples exactly as stored, so no rescaling hides a mismatch. */
function codes(file) {
  const png = PNG.sync.read(readFileSync(new URL(file, evidence)), {
    skipRescale: true,
  });
  return {
    width: png.width,
    height: png.height,
    data: new Uint16Array(
      png.data.buffer,
      png.data.byteOffset,
      png.data.byteLength / 2,
    ),
  };
}

/** Absolute RGB error in eight-bit code values: maximum and nearest-rank P95. */
function compare(expected, actual) {
  if (expected.width !== actual.width || expected.height !== actual.height)
    throw new Error("The host output has different dimensions.");
  const errors = [];
  let maximum = 0;
  for (let i = 0; i < expected.data.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const error =
        (Math.abs(expected.data[i + c] - actual.data[i + c]) / 65535) * 255;
      errors.push(error);
      maximum = Math.max(maximum, error);
    }
  errors.sort((a, b) => a - b);
  return {
    maximum,
    p95: errors[
      Math.min(errors.length - 1, Math.ceil(errors.length * 0.95) - 1)
    ],
    samples: errors.length,
  };
}

// Quantization budget: the probe, the expectation and the host output are each
// rounded to 16-bit codes, and lut3d interpolates in single precision.
const tolerance = { maximum: 0.05, p95: 0.02 };
const results = [];
let failures = 0;
for (const artifact of inputs.artifacts)
  for (const interpolation of inputs.interpolations) {
    const output = `host-${artifact.name}-${interpolation}-ffmpeg.png`;
    const filter = `format=rgb48le,lut3d=file=${artifact.cube}:interp=${interpolation}`;
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        inputs.probe,
        "-vf",
        filter,
        "-pix_fmt",
        "rgb48le",
        output,
      ],
      { cwd: dir },
    );
    const measured = compare(
      codes(artifact.expected[interpolation]),
      codes(output),
    );
    const passed =
      measured.maximum <= tolerance.maximum && measured.p95 <= tolerance.p95;
    if (!passed) failures++;
    results.push({
      artifact: artifact.name,
      grade: artifact.grade,
      cube: artifact.cube,
      size: artifact.size,
      interpolation,
      filter,
      output,
      maximumCodeValues: Number(measured.maximum.toFixed(4)),
      p95CodeValues: Number(measured.p95.toFixed(4)),
      samples: measured.samples,
      passed,
    });
    console.log(
      `FFmpeg lut3d · ${artifact.name} · ${interpolation}: max ${measured.maximum.toFixed(4)}, P95 ${measured.p95.toFixed(4)} code values ${passed ? "OK" : "FAILED"}`,
    );
  }

const blockers = matrix.hosts
  .filter((host) => !host.automated)
  .map((host) => `${host.name}: ${host.blocker}`);
const record = {
  generated: new Date().toISOString(),
  ffmpeg: version,
  probe: inputs.probe,
  probeDescription: inputs.probeDescription,
  range: inputs.range,
  tolerance,
  results,
  verifiedHosts: matrix.hosts.filter((h) => h.automated).map((h) => h.name),
  releaseBlockers: blockers,
};
writeFileSync(
  new URL("host-verification.json", evidence),
  `${JSON.stringify(record, null, 2)}\n`,
);
console.log(`${version}`);
console.log(
  `Recorded ${fileURLToPath(new URL("host-verification.json", evidence))}`,
);
console.log(`Release readiness: ${blockers.length ? "BLOCKED" : "READY"}`);
for (const blocker of blockers) console.log(`- ${blocker}`);
if (failures) {
  console.error(
    `${failures} host comparison(s) exceeded the stated tolerance.`,
  );
  process.exitCode = 1;
} else if (blockers.length && process.argv.includes("--release")) {
  console.error("Untested hosts remain release blockers.");
  process.exitCode = 1;
}
