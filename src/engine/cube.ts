/** Adobe Cube 3D LUT serialization. Lattice samples come from the GPU grading program. */
export const cubeSizes = [17, 33, 65] as const;
export type CubeSize = (typeof cubeSizes)[number];
export const defaultCubeSize: CubeSize = 33;

export function isCubeSize(value: number): value is CubeSize {
  return (cubeSizes as readonly number[]).includes(value);
}

/** Printable ASCII, no quotes or control characters, at most 240 characters. */
export function sanitizeCubeTitle(title: string) {
  const clean = title
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
    .trim();
  return clean || "Grade";
}

/** Upper bound for a 0–1 lattice: headers with a 240-byte title, then 27 bytes per row. */
export function cubeFileBytes(size: number) {
  return 340 + size ** 3 * 27;
}

const cell = (value: number) => (Object.is(value, -0) ? 0 : value).toFixed(6);

/** samples: exactly size³ RGBA floats, red index fastest, then green, then blue. */
export function serializeCube({
  title,
  size,
  samples,
}: {
  title: string;
  size: number;
  samples: Float32Array;
}) {
  const rows = size ** 3;
  if (samples.length !== rows * 4)
    throw new Error(`A ${size}³ LUT needs ${rows} RGBA samples.`);
  const lines = [
    `TITLE "${sanitizeCubeTitle(title)}"`,
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0.000000 0.000000 0.000000",
    "DOMAIN_MAX 1.000000 1.000000 1.000000",
  ];
  for (let i = 0; i < rows; i++) {
    const r = samples[i * 4],
      g = samples[i * 4 + 1],
      b = samples[i * 4 + 2];
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b))
      throw new Error(
        "The grade produced non-finite values. Clamp the output or adjust the grade before exporting.",
      );
    lines.push(`${cell(r)} ${cell(g)} ${cell(b)}`);
  }
  return lines.join("\n") + "\n";
}
