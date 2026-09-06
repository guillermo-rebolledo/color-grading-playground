import inventory from "../public/samples/inventory.json";
import type { Encoding } from "./engine/GradingEngine";

export const samples = inventory.assets.map((asset) => ({
  ...asset,
  encoding: asset.encoding as Encoding,
}));
export type Sample = (typeof samples)[number];
