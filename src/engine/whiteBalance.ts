import type { Encoding } from "./colour";
import { gamutMatrices } from "./colourMatrices";

// Row-major CAT02 and inverse; see docs/white-balance.md for references.
const cat02 = [
  [0.7328, 0.4296, -0.1624],
  [-0.7036, 1.6975, 0.0061],
  [0.003, 0.0136, 0.9834],
];
const inverseCat02 = [
  [1.096123820835514, -0.278869000218287, 0.182745179382773],
  [0.454369041975359, 0.473533154307412, 0.072097803717229],
  [-0.009627608738429, -0.005698031216113, 1.015325639954543],
];
function multiplyVector(
  matrix: readonly (readonly number[])[],
  vector: number[],
) {
  return matrix.map((row) =>
    row.reduce((sum, value, i) => sum + value * vector[i], 0),
  );
}
function locusUv(temperature: number) {
  const t = temperature;
  const x =
    t <= 4000
      ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t ** 3 +
        2.1070379e6 / t ** 2 +
        0.2226347e3 / t +
        0.24039;
  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 -
          1.37418593 * x ** 2 +
          2.09137015 * x -
          0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  const denominator = -2 * x + 12 * y + 3;
  return [(4 * x) / denominator, (6 * y) / denominator];
}

/** Source-relative target, normalized to Y=1. Returns GLSL column-major XYZ CAT02. */
export function whiteBalanceMatrix(
  primaries: Encoding["primaries"],
  temperature: number,
  tint: number,
) {
  if (temperature === 6500 && tint === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const source = multiplyVector(gamutMatrices[primaries].toXYZ, [1, 1, 1]);
  const denominator = source[0] + 15 * source[1] + 3 * source[2];
  const anchor = locusUv(6500),
    target = locusUv(temperature);
  const u = (4 * source[0]) / denominator + target[0] - anchor[0];
  const v =
    (6 * source[1]) / denominator + target[1] - anchor[1] + tint * 0.0001;
  const targetXYZ = [(1.5 * u) / v, 1, (4 - u - 10 * v) / (2 * v)];
  const sourceCone = multiplyVector(cat02, source);
  const targetCone = multiplyVector(cat02, targetXYZ);
  const scaled = cat02.map((row, i) =>
    row.map((value) => (value * targetCone[i]) / sourceCone[i]),
  );
  return [0, 1, 2].flatMap((column) =>
    multiplyVector(
      inverseCat02,
      scaled.map((row) => row[column]),
    ),
  );
}
