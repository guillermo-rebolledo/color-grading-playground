import { gamutMatrices, dciToD65, d65ToDci } from "./colourMatrices";
export const transfers = {
  linear: "Linear",
  srgb: "sRGB",
  rec709: "Rec.709 OETF",
  gamma22: "Gamma 2.2",
  gamma24: "Gamma 2.4",
  logc3: "ARRI LogC3 EI 800",
  slog3: "Sony S-Log3",
  "davinci-intermediate": "DaVinci Intermediate",
  "apple-log": "Apple Log",
} as const;
export const primaries = {
  rec709: "Rec.709 · D65",
  rec2020: "Rec.2020 · D65",
  "dci-p3": "DCI-P3 · DCI white",
  "display-p3": "Display P3 · D65",
  "arri-wide-gamut3": "ARRI Wide Gamut 3 · D65",
  "sgamut3-cine": "S-Gamut3.Cine · D65",
  "davinci-wide-gamut": "DaVinci Wide Gamut · D65",
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
// Toe extensions are profile-specific; Apple Log retains its published floor.
// See docs/colour-management.md for normative sources and exact thresholds.
export const transferShader = `
float decodeSrgb(float c) { if(c <= 0.04045) return c / 12.92; return pow((c + 0.055) / 1.055, 2.4); }
float encodeSrgb(float c) { if(c <= 0.0031308) return c * 12.92; return 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
float decode709(float c) { if(c < 0.081) return c / 4.5; return pow((c + 0.099) / 1.099, 1.0 / 0.45); }
float encode709(float c) { if(c < 0.018) return c * 4.5; return 1.099 * pow(c, 0.45) - 0.099; }
// ARRI Log C V3, 2017-03-09, EI 800 exposure-value coefficients.
float decodeLogC3(float c) { if(c <= 5.367655 * 0.010591 + 0.092809) return (c - 0.092809) / 5.367655; return (pow(10.0, (c - 0.385537) / 0.247190) - 0.052272) / 5.555556; }
float encodeLogC3(float c) { if(c <= 0.010591) return 5.367655 * c + 0.092809; return 0.247190 * log(5.555556 * c + 0.052272) / log(10.0) + 0.385537; }
// Sony Technical Summary appendix, scene reflection, full-range CV / 1023.
float decodeSLog3(float c) { if(c < 171.2102946929 / 1023.0) return (c * 1023.0 - 95.0) * 0.01125 / (171.2102946929 - 95.0); return pow(10.0, (c * 1023.0 - 420.0) / 261.5) * 0.19 - 0.01; }
float encodeSLog3(float c) { if(c < 0.01125) return (c * (171.2102946929 - 95.0) / 0.01125 + 95.0) / 1023.0; return (420.0 + log((c + 0.01) / 0.19) / log(10.0) * 261.5) / 1023.0; }
// Blackmagic DaVinci Wide Gamut Intermediate v1.1, August 2021.
float decodeIntermediate(float c) { if(c <= 0.02740668) return c / 10.44426855; return exp2(c / 0.07329248 - 7.0) - 0.0075; }
float encodeIntermediate(float c) { if(c <= 0.00262409) return c * 10.44426855; return (log2(c + 0.0075) + 7.0) * 0.07329248; }
// Apple Log Profile White Paper, September 2023 p5. Not Apple Log 2.
float decodeAppleLog(float c) {
  if(c >= 47.28711236 * 0.06641088 * 0.06641088) return exp2((c - 0.69336945) / 0.08550479) - 0.00964052;
  if(c >= 0.0) return sqrt(c / 47.28711236) - 0.05641088;
  return -0.05641088;
}
float encodeAppleLog(float c) {
  if(c >= 0.01) return 0.08550479 * log2(c + 0.00964052) + 0.69336945;
  if(c >= -0.05641088) return 47.28711236 * (c + 0.05641088) * (c + 0.05641088);
  return 0.0;
}
`;
function transfer(value: string, type: Encoding["transfer"], encode: boolean) {
  if (type === "linear") return value;
  if (type === "gamma22" || type === "gamma24") {
    const gamma = type === "gamma22" ? "2.2" : "2.4";
    return `(sign(${value}) * pow(abs(${value}), vec3(${encode ? `1.0 / ${gamma}` : gamma})))`;
  }
  const suffix = {
    srgb: "Srgb",
    rec709: "709",
    logc3: "LogC3",
    slog3: "SLog3",
    "davinci-intermediate": "Intermediate",
    "apple-log": "AppleLog",
  }[type];
  const fn = `${encode ? "encode" : "decode"}${suffix}`;
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
