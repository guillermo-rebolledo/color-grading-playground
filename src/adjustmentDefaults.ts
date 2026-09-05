import { qualifierDefaults } from "./engine/qualifier";
import { identityCurves } from "./engine/curves";
import type { GradingNode } from "./engine/GradingEngine";
export const adjustmentDefaults = {
  blend: { amount: 1 },
  qualifier: qualifierDefaults,
  curves: { curves: identityCurves() },
  whiteBalance: { temperature: 6500, tint: 0 },
  cdl: { slope: [1, 1, 1], offset: [0, 0, 0], power: [1, 1, 1], saturation: 1 },
  contrast: { contrast: 1, pivot: 0.18 },
  saturation: { saturation: 1, vibrance: 0 },
} satisfies Partial<Record<GradingNode["type"], GradingNode["data"]>>;
