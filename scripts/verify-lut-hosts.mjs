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
const evidenceDir = fileURLToPath(evidence);
const inputsPath = new URL("host-inputs.json", evidence);
const hostMatrix = JSON.parse(
  readFileSync(new URL("release-hosts.json", import.meta.url)),
);

function ffmpegVersion() {
  try {
    return execFileSync("ffmpeg", ["-version"], { encoding: "utf8" })
      .split("\n")[0]
      .trim();
  } catch {
    return null;
  }
}

/** 16-bit RGB samples exactly as stored, so no rescaling hides a mismatch. */
function readSamples(file) {
  const png = PNG.sync.read(readFileSync(new URL(file, evidence)), {
    skipRescale: true,
  });
  return {
    width: png.width,
    height: png.height,
    samples: new Uint16Array(
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
  for (let i = 0; i < expected.samples.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const error =
        (Math.abs(expected.samples[i + c] - actual.samples[i + c]) / 65535) *
        255;
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

/** One FFmpeg run per artifact and interpolation, compared with its expectation. */
function verify(inputs) {
  const results = [];
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
        { cwd: evidenceDir },
      );
      const measured = compare(
        readSamples(artifact.expected[interpolation]),
        readSamples(output),
      );
      const passed =
        measured.maximum <= tolerance.maximum && measured.p95 <= tolerance.p95;
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
        `FFmpeg lut3d \u00b7 ${artifact.name} \u00b7 ${interpolation}: max ${measured.maximum.toFixed(4)}, P95 ${measured.p95.toFixed(4)} code values ${passed ? "OK" : "FAILED"}`,
      );
    }
  return results;
}

function main() {
  if (!existsSync(inputsPath)) {
    console.error(
      `Missing ${fileURLToPath(inputsPath)}. Run \`npm run release:evidence\` first.`,
    );
    return 1;
  }
  const version = ffmpegVersion();
  if (!version) {
    console.error(
      "FFmpeg is not installed. Missing tooling is a release blocker, not a pass.",
    );
    return 1;
  }
  const inputs = JSON.parse(readFileSync(inputsPath));
  const results = verify(inputs);
  const blockers = hostMatrix.hosts
    .filter((host) => !host.automated)
    .map((host) => `${host.name}: ${host.blocker}`);
  writeFileSync(
    new URL("host-verification.json", evidence),
    `${JSON.stringify(
      {
        generated: new Date().toISOString(),
        ffmpeg: version,
        probe: inputs.probe,
        probeDescription: inputs.probeDescription,
        range: inputs.range,
        tolerance,
        results,
        verifiedHosts: hostMatrix.hosts
          .filter((host) => host.automated)
          .map((host) => host.name),
        releaseBlockers: blockers,
      },
      null,
      2,
    )}\n`,
  );
  console.log(version);
  console.log(
    `Recorded ${fileURLToPath(new URL("host-verification.json", evidence))}`,
  );
  console.log(`Release readiness: ${blockers.length ? "BLOCKED" : "READY"}`);
  for (const blocker of blockers) console.log(`- ${blocker}`);

  const failures = results.filter((result) => !result.passed).length;
  if (failures) {
    console.error(
      `${failures} host comparison(s) exceeded the stated tolerance.`,
    );
    return 1;
  }
  // Only the release gate fails on manual blockers, so CI still reports the
  // FFmpeg comparison while Resolve, Photoshop and Lightroom stay unverified.
  if (blockers.length && process.argv.includes("--release")) {
    console.error(
      "Untested hosts remain release blockers; the MVP is not release-ready.",
    );
    return 1;
  }
  return 0;
}

process.exitCode = main();
