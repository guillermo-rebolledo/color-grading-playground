import type { GradingNode, NodeType } from "./engine/GradingEngine";

// One list of display names. Adding a node type must not mean editing the
// inspector, the canvas card, the toolbar and the adjustment panel separately.
const titles: Record<NodeType, string> = {
  source: "Source",
  exposure: "Exposure",
  cst: "Colour Space Transform",
  cdl: "CDL",
  contrast: "Contrast",
  saturation: "Saturation",
  whiteBalance: "White Balance",
  curves: "Curves",
  qualifier: "HSL Qualifier",
  blend: "Blend",
  output: "Output",
};

/** The canvas card and toolbar abbreviate CST; the inspector spells it out. */
export function nodeTypeTitle(type: NodeType, short = false) {
  return short && type === "cst" ? "CST" : titles[type];
}

/** A user label always wins over the type name. */
export function nodeTitle(node: GradingNode | undefined, short = false) {
  return node ? (node.data.label ?? nodeTypeTitle(node.type, short)) : "";
}
