export type CurvePoint = { x: number; y: number };
export const curveChannels = ["master", "r", "g", "b"] as const;
export type CurveChannel = (typeof curveChannels)[number];
export type Curves = Record<CurveChannel, CurvePoint[]>;
export const identityCurves = (): Curves => ({
  master: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  r: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  g: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  b: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
});

export function validateCurves(curves: Curves | undefined) {
  for (const channel of curveChannels) {
    const points = curves?.[channel];
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length > 256 ||
      points.some(
        (p, i) =>
          !p ||
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < 0 ||
          p.x > 1 ||
          p.y < 0 ||
          p.y > 1 ||
          (i > 0 &&
            (Math.fround(p.x) <= Math.fround(points[i - 1].x) ||
              !Number.isFinite(
                Math.fround((p.y - points[i - 1].y) / (p.x - points[i - 1].x)),
              ))),
      ) ||
      points[0].x !== 0 ||
      points[points.length - 1].x !== 1
    )
      throw new Error(
        `Curves ${channel}: use 2–256 points in [0, 1], with unique increasing inputs (also in float32) endpoints at 0 and 1, and finite float32 secants.`,
      );
  }
}

/** Fritsch–Carlson: zero tangents at extrema/plateaus, then limit each segment. */
export function bakeCurve(points: CurvePoint[]) {
  const slopes = points
    .slice(1)
    .map((p, i) => (p.y - points[i].y) / (p.x - points[i].x));
  const tangents = points.map((_, i) =>
    i === 0
      ? slopes[0]
      : i === points.length - 1
        ? slopes[i - 1]
        : slopes[i - 1] * slopes[i] <= 0
          ? 0
          : (slopes[i - 1] + slopes[i]) / 2,
  );
  slopes.forEach((slope, i) => {
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      return;
    }
    const length = Math.hypot(tangents[i] / slope, tangents[i + 1] / slope);
    if (length > 3) {
      tangents[i] *= 3 / length;
      tangents[i + 1] *= 3 / length;
    }
  });
  const samples = new Float32Array(1024);
  let segment = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = i / 1023;
    while (segment < points.length - 2 && x > points[segment + 1].x) segment++;
    const a = points[segment],
      b = points[segment + 1],
      h = b.x - a.x,
      t = (x - a.x) / h;
    samples[i] =
      (2 * t * t * t - 3 * t * t + 1) * a.y +
      (t * t * t - 2 * t * t + t) * h * tangents[segment] +
      (-2 * t * t * t + 3 * t * t) * b.y +
      (t * t * t - t * t) * h * tangents[segment + 1];
  }
  return {
    samples,
    startSlope: tangents[0],
    endSlope: tangents[tangents.length - 1],
  };
}

export const curveShader = `
float sampleCurve(highp sampler2D table, float x, float startSlope, float endSlope) {
  if (x < 0.0) return texelFetch(table, ivec2(0, 0), 0).r + x * startSlope;
  if (x > 1.0) return texelFetch(table, ivec2(1023, 0), 0).r + (x - 1.0) * endSlope;
  float position = x * 1023.0;
  int left = int(floor(position));
  return mix(texelFetch(table, ivec2(left, 0), 0).r,
    texelFetch(table, ivec2(min(left + 1, 1023), 0), 0).r, fract(position));
}`;
