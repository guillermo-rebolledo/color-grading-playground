import type { CubeSize } from "./cube";
import { inspectGraph, type GradingGraph } from "./graph";

export type LutInterpolation = "trilinear" | "tetrahedral";
export type FidelityOptions = {
  size: CubeSize;
  interpolation: LutInterpolation;
  title?: string;
};
export type FidelityResult = {
  cube: string;
  size: CubeSize;
  interpolation: LutInterpolation;
  precision: "RGBA32F" | "RGBA16F";
  graphRevision: string;
  imageRevision: number;
  width: number;
  height: number;
  sampleCount: number;
  transparentCount: number;
  outOfDomainCount: number;
  channels: { maximum: number; p95: number }[];
  maximum: number;
  /** Top-down RGBA: absolute RGB error × 255; A = 1 measured, 0 transparent, -1 outside domain. */
  errors: Float32Array;
  /** Top-down false colour; excluded pixels are transparent. */
  overlay: Uint8ClampedArray;
  advice: string[];
};

/** Numeric parameters, topology, encodings and policy; canvas layout/selection are irrelevant. */
export function fidelityGraphRevision(graph: GradingGraph) {
  return JSON.stringify({
    colour: graph.colour,
    nodes: graph.nodes.map(({ id, type, data }) => ({ id, type, data })),
    edges: graph.edges.map(
      ({ id, source, target, sourceHandle, targetHandle }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
      }),
    ),
  });
}

// Explicit texel fetches make interpolation independent of float filtering support.
export const fidelityDeclarations = `
uniform highp sampler3D fidelityLut;
uniform bool tetrahedral;
vec3 lutValue(ivec3 p) { return texelFetch(fidelityLut, p, 0).rgb; }
vec3 applyLut(vec3 rgb) {
  int n = textureSize(fidelityLut, 0).x;
  vec3 p = clamp(rgb, 0.0, 1.0) * float(n - 1);
  ivec3 lo = min(ivec3(floor(p)), ivec3(n - 2));
  vec3 f = p - vec3(lo);
  vec3 c000 = lutValue(lo), c111 = lutValue(lo + ivec3(1));
  if (!tetrahedral) {
    vec3 z0 = mix(mix(c000, lutValue(lo + ivec3(1,0,0)), f.x),
                  mix(lutValue(lo + ivec3(0,1,0)), lutValue(lo + ivec3(1,1,0)), f.x), f.y);
    vec3 z1 = mix(mix(lutValue(lo + ivec3(0,0,1)), lutValue(lo + ivec3(1,0,1)), f.x),
                  mix(lutValue(lo + ivec3(0,1,1)), c111, f.x), f.y);
    return mix(z0, z1, f.z);
  }
  // Descending fractional axes choose one of the six tetrahedra.
  ivec3 a, b; vec3 w;
  if (f.x >= f.y) {
    if (f.y >= f.z) { a=ivec3(1,0,0); b=ivec3(1,1,0); w=f.xyz; }
    else if (f.x >= f.z) { a=ivec3(1,0,0); b=ivec3(1,0,1); w=f.xzy; }
    else { a=ivec3(0,0,1); b=ivec3(1,0,1); w=f.zxy; }
  } else {
    if (f.x >= f.z) { a=ivec3(0,1,0); b=ivec3(1,1,0); w=f.yxz; }
    else if (f.y >= f.z) { a=ivec3(0,1,0); b=ivec3(0,1,1); w=f.yzx; }
    else { a=ivec3(0,0,1); b=ivec3(0,1,1); w=f.zyx; }
  }
  return (1.0-w.x)*c000 + (w.x-w.y)*lutValue(lo+a) + (w.y-w.z)*lutValue(lo+b) + w.z*c111;
}`;

export const fidelityBody = `
  if (source.a <= 0.0) result = vec4(0.0);
  else if (any(lessThan(source.rgb, vec3(0.0))) || any(greaterThan(source.rgb, vec3(1.0))))
    result = vec4(0.0, 0.0, 0.0, -1.0);
  else result = vec4(abs(result.rgb - applyLut(source.rgb)), 1.0);
`;

/** Read exactly the decimal values written by our Cube serializer, including its rounding. */
export function serializedLutValues(cube: string, size: number) {
  const values = new Float32Array(size ** 3 * 4);
  const rows = cube.trimEnd().split("\n").slice(4);
  rows.forEach((row, i) => {
    values.set(row.split(" ").map(Number), i * 4);
    values[i * 4 + 3] = 1;
  });
  return values;
}

export function summarizeFidelity(
  errors: Float32Array,
  graph: GradingGraph,
  size: CubeSize,
) {
  let sampleCount = 0,
    transparentCount = 0,
    outOfDomainCount = 0;
  for (let i = 3; i < errors.length; i += 4) {
    if (errors[i] === 0) transparentCount++;
    else if (errors[i] < 0) outOfDomainCount++;
    else sampleCount++;
  }
  const values = [0, 1, 2].map(() => new Float32Array(sampleCount));
  const overlay = new Uint8ClampedArray(errors.length);
  let sample = 0;
  for (let i = 0; i < errors.length; i += 4) {
    if (errors[i + 3] !== 1) continue;
    for (let c = 0; c < 3; c++) {
      if (!Number.isFinite(errors[i + c]))
        throw new Error(
          "The grade produced non-finite fidelity errors. Adjust the grade or clamp the output.",
        );
      errors[i + c] *= 255;
      values[c][sample] = errors[i + c];
    }
    sample++;
    const peak = Math.max(errors[i], errors[i + 1], errors[i + 2]);
    // Blue at zero, yellow at two code values, red at four and above.
    const t = Math.min(1, peak / 2);
    overlay.set(
      [
        255 * t,
        255 * Math.min(t, Math.max(0, 2 - peak / 2)),
        255 * (1 - t),
        210,
      ],
      i,
    );
  }
  const channels = values.map((channel) => {
    channel.sort();
    return {
      maximum: channel[sampleCount - 1] ?? 0,
      p95: channel[Math.ceil(sampleCount * 0.95) - 1] ?? 0,
    };
  });
  const maximum = Math.max(...channels.map((c) => c.maximum));
  const advice: string[] = [];
  if (maximum > 2) {
    advice.push(
      size < 65
        ? "Try 65³ and measure again to reduce sampling error."
        : "At 65³, try softening keys or curves and measure again.",
    );
    for (const node of inspectGraph(graph)) {
      const name = node.data.label ?? node.id;
      if (
        node.type === "qualifier" &&
        [node.data.hue, node.data.sat, node.data.value].some(
          (b, axis) =>
            b?.[2] === 0 && (b[0] > 0 || b[1] < (axis === 0 ? 360 : 1)),
        )
      )
        advice.push(
          `Heuristic: ${name} has a hard qualifier edge; it may contribute to approximation error.`,
        );
      if (
        node.type === "curves" &&
        node.data.curves &&
        Object.values(node.data.curves).some((points) =>
          points.some(
            (p, i) =>
              i > 0 &&
              Math.abs((p.y - points[i - 1].y) / (p.x - points[i - 1].x)) > 4,
          ),
        )
      )
        advice.push(
          `Heuristic: ${name} has a steep curve segment; it may contribute to approximation error.`,
        );
    }
  }
  return {
    errors,
    overlay,
    channels,
    maximum,
    sampleCount,
    transparentCount,
    outOfDomainCount,
    advice,
  };
}
