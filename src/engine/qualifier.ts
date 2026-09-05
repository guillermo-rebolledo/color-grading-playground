/** Hue is degrees; saturation/value are normalized. Softness extends outside the inclusive band. */
export type Band = [number, number, number];
export const qualifierDefaults = {
  hue: [0, 360, 0] as Band,
  sat: [0, 1, 0] as Band,
  value: [0, 1, 0] as Band,
};
export function validateQualifier(data: {
  hue?: Band;
  sat?: Band;
  value?: Band;
}) {
  for (const key of ["hue", "sat", "value"] as const) {
    const band = data[key],
      max = key === "hue" ? 360 : 1;
    if (
      !Array.isArray(band) ||
      band.length !== 3 ||
      !band.every((v) => Number.isFinite(v) && v >= 0 && v <= max) ||
      (key !== "hue" && band[0] > band[1])
    )
      throw new Error(
        `HSL Qualifier ${key} requires min, max and softness in 0–${max}; only hue may wrap.`,
      );
  }
}
export const qualifierShader = `
float membership(float x, vec3 band) {
  if (x >= band.x && x <= band.y) return 1.0;
  if (band.z <= 0.0) return 0.0;
  float distance = max(band.x - x, x - band.y);
  return 1.0 - smoothstep(0.0, band.z, distance);
}
float qualify(vec3 rgb, vec3 hue, vec3 sat, vec3 value) {
  vec3 c = clamp(rgb, 0.0, 1.0);
  float hi = max(c.r, max(c.g, c.b));
  float lo = min(c.r, min(c.g, c.b));
  float delta = hi - lo;
  float s = hi > 0.0 ? delta / hi : 0.0;
  float h = 0.0;
  if (delta > 0.0) {
    if (hi == c.r) h = mod((c.g-c.b)/delta, 6.0);
    else if (hi == c.g) h = (c.b-c.r)/delta + 2.0;
    else h = (c.r-c.g)/delta + 4.0;
    h = mod(h * 60.0 + 360.0, 360.0);
  }
  float hm = 1.0;
  if (hue.y - hue.x < 360.0) {
    float width = mod(hue.y - hue.x + 360.0, 360.0);
    float relative = mod(h - hue.x + 360.0, 360.0);
    hm = max(membership(relative, vec3(0.0, width, hue.z)),
             membership(relative - 360.0, vec3(0.0, width, hue.z)));
    if (delta == 0.0) hm = 0.0;
  }
  return hm * membership(s, sat) * membership(hi, value);
}
`;
