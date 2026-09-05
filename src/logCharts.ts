import type { Encoding, FloatImage } from "./engine/GradingEngine";

// Tabulated publisher-formula codes for L = 0, .01, .18, .9, 4, 16.
// Original synthetic fixtures; provenance and patch layout: docs/camera-log.md.
export const logCharts = {
  logc3: {
    name: "ARRI LogC3 EI 800",
    encoding: { transfer: "logc3", primaries: "arri-wide-gamut3" },
    greys: [
      0.092809, 0.14648555, 0.391006832034, 0.55943189173, 0.718701631374,
      0.867335728159,
    ],
  },
  slog3: {
    name: "Sony S-Log3",
    encoding: { transfer: "slog3", primaries: "sgamut3-cine" },
    greys: [
      0.092864125122, 0.15908356224, 0.410557184751, 0.584452842075,
      0.749098911819, 0.902790094475,
    ],
  },
} satisfies Record<
  string,
  { name: string; encoding: Encoding; greys: number[] }
>;

export function createLogChart(profile: keyof typeof logCharts): FloatImage {
  const { greys } = logCharts[profile];
  const black = greys[0],
    white = greys[3];
  const patches = [
    ...greys.map((v) => [v, v, v]),
    [white, black, black],
    [black, white, black],
    [black, black, white],
    [black, white, white],
    [white, black, white],
    [white, white, black],
  ];
  const width = 576,
    height = 160;
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const patch = patches[Math.floor(y / 80) * 6 + Math.floor(x / 96)];
      data.set([...patch, 1], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}
