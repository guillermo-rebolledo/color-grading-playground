import { gamutMatrices, dciToD65, d65ToDci } from "./colourMatrices";
export const transfers = {
  linear: "Linear",
  srgb: "sRGB",
  rec709: "Rec.709 OETF",
  gamma22: "Gamma 2.2",
  gamma24: "Gamma 2.4",
} as const;
export const primaries = {
  rec709: "Rec.709 · D65",
  rec2020: "Rec.2020 · D65",
  "dci-p3": "DCI-P3 · DCI white",
  "display-p3": "Display P3 · D65",
} as const;
export type Encoding = {
  transfer: keyof typeof transfers;
  primaries: keyof typeof primaries;
};
export type ColourSettings = {
  input: Encoding;
  working: Encoding;
  output: Encoding;
};
export const displayEncoding: Encoding = {
  transfer: "srgb",
  primaries: "rec709",
};
export const defaultColour: ColourSettings = {
  input: { ...displayEncoding },
  working: { transfer: "linear", primaries: "rec709" },
  output: { ...displayEncoding },
};
export function validEncoding(value: Encoding | undefined): value is Encoding {
  return (
    !!value &&
    Object.hasOwn(transfers, value.transfer) &&
    Object.hasOwn(primaries, value.primaries)
  );
}
export function encodingKey(value: Encoding) {
  return [value.transfer, value.primaries];
}
export function sameEncoding(a: Encoding, b: Encoding) {
  return a.transfer === b.transfer && a.primaries === b.primaries;
}
export function encodingLabel(value: Encoding) {
  return `${transfers[value.transfer]} / ${primaries[value.primaries]}`;
}
// Piecewise toes extend linearly below zero; pure gamma uses a signed power.
// See docs/colour-management.md for normative sources and exact thresholds.
export const transferShader = `
float decodeSrgb(float c) { if(c <= 0.04045) return c / 12.92; return pow((c + 0.055) / 1.055, 2.4); }
float encodeSrgb(float c) { if(c <= 0.0031308) return c * 12.92; return 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
float decode709(float c) { if(c < 0.081) return c / 4.5; return pow((c + 0.099) / 1.099, 1.0 / 0.45); }
float encode709(float c) { if(c < 0.018) return c * 4.5; return 1.099 * pow(c, 0.45) - 0.099; }
`;
function transfer(value: string, type: Encoding["transfer"], encode: boolean) {
  if (type === "linear") return value;
  if (type === "gamma22" || type === "gamma24") {
    const gamma = type === "gamma22" ? "2.2" : "2.4";
    return `(sign(${value}) * pow(abs(${value}), vec3(${encode ? `1.0 / ${gamma}` : gamma})))`;
  }
  const fn = `${encode ? "encode" : "decode"}${type === "srgb" ? "Srgb" : "709"}`;
  return `vec3(${["r", "g", "b"].map((c) => `${fn}((${value}).${c})`).join(",")})`;
}
export function transformShader(value: string, from: Encoding, to: Encoding) {
  if (sameEncoding(from, to)) return value;
  let linear = transfer(value, from.transfer, false);
  if (from.primaries !== to.primaries) {
    linear = matrixShader(gamutMatrices[from.primaries].toXYZ, linear);
    if (from.primaries === "dci-p3") linear = matrixShader(dciToD65, linear);
    else if (to.primaries === "dci-p3") linear = matrixShader(d65ToDci, linear);
    linear = matrixShader(gamutMatrices[to.primaries].fromXYZ, linear);
  }
  return transfer(linear, to.transfer, true);
}

function matrixShader(matrix: readonly (readonly number[])[], value: string) {
  // GLSL matrix constructors consume columns.
  const columns = [0, 1, 2].flatMap((c) =>
    matrix.map((row) => row[c].toFixed(12)),
  );
  return `(mat3(${columns.join(",")}) * ${value})`;
}
