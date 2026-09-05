import type { GradingNode } from "./engine/GradingEngine";
export const adjustmentDefaults = {
  cdl: { slope: [1, 1, 1], offset: [0, 0, 0], power: [1, 1, 1], saturation: 1 },
  contrast: { contrast: 1, pivot: 0.18 },
  saturation: { saturation: 1, vibrance: 0 },
} satisfies Partial<Record<GradingNode["type"], GradingNode["data"]>>;
