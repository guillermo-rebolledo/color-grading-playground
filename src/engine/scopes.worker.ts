import type { ScopePixels, ScopeDistribution } from "./scopes";

self.onmessage = (event: MessageEvent<ScopePixels>) => {
  const { pixels, width, height } = event.data;
  const result: ScopeDistribution = {
    histogram: Array.from({ length: 3 }, () => new Uint32Array(256)),
    parade: Array.from({ length: 3 }, () => new Uint32Array(width * 256)),
    sampleCount: 0,
    below: [0, 0, 0],
    above: [0, 0, 0],
    nonFinite: [0, 0, 0],
  };
  for (let i = 0; i < width * height; i++) {
    if (pixels[i * 4 + 3] <= 0) continue;
    result.sampleCount++;
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[i * 4 + channel];
      if (!Number.isFinite(value)) {
        result.nonFinite[channel]++;
        continue;
      }
      if (value < 0) result.below[channel]++;
      if (value > 1) result.above[channel]++;
      const bin = Math.min(255, Math.max(0, Math.floor(value * 256)));
      result.histogram[channel][bin]++;
      result.parade[channel][bin * width + (i % width)]++;
    }
  }
  self.postMessage(result);
};
