import { whiteBalanceMatrix } from "./whiteBalance";
import { gamutMatrices } from "./colourMatrices";
import {
  defaultColour,
  matrixShader,
  encodingKey,
  validEncoding,
  transformShader,
  sameEncoding,
  type Encoding,
  type ColourSettings,
} from "./colour";
export type NodeType =
  | "source"
  | "exposure"
  | "cst"
  | "cdl"
  | "contrast"
  | "saturation"
  | "whiteBalance"
  | "output";
export type GradingNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    temperature?: number;
    tint?: number;
    stops?: number;
    slope?: [number, number, number];
    offset?: [number, number, number];
    power?: [number, number, number];
    saturation?: number;
    contrast?: number;
    pivot?: number;
    vibrance?: number;
    clamp?: "clamp" | "unbounded";
    from?: Encoding;
    to?: Encoding;
  };
  selected?: boolean;
};
export type GradingEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  selected?: boolean;
};
export type GradingGraph = {
  version: 1;
  colour: ColourSettings;
  nodes: GradingNode[];
  edges: GradingEdge[];
};
export function createGraph(): GradingGraph {
  return {
    version: 1,
    colour: structuredClone(defaultColour),
    nodes: [
      { id: "source", type: "source", position: { x: 0, y: 0 }, data: {} },
      {
        id: "exposure",
        type: "exposure",
        position: { x: 260, y: 0 },
        data: { stops: 0 },
        selected: true,
      },
      {
        id: "output",
        type: "output",
        position: { x: 520, y: 0 },
        data: { clamp: "clamp" },
      },
    ],
    edges: [
      {
        id: "source-exposure",
        source: "source",
        target: "exposure",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      },
      {
        id: "exposure-output",
        source: "exposure",
        target: "output",
        sourceHandle: "rgb",
        targetHandle: "rgb",
      },
    ],
  };
}

/** Draft mode allows missing endpoints/inputs, but never illegal edges or cycles. */
export function inspectGraph(
  graph: GradingGraph,
  draft = false,
): GradingNode[] {
  if (graph.version !== 1) throw new Error("Unsupported graph schema version.");
  if (
    !graph.colour ||
    ![graph.colour.input, graph.colour.working, graph.colour.output].every(
      validEncoding,
    )
  )
    throw new Error(
      "Choose supported input, working and output encoding pairs.",
    );
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  if (nodes.size !== graph.nodes.length || graph.nodes.some((n) => !n.id))
    throw new Error("Node IDs must be unique and nonempty.");
  for (const type of ["source", "output"] as const) {
    const count = graph.nodes.filter((n) => n.type === type).length;
    if (count > 1 || (!draft && count !== 1))
      throw new Error(
        `Graph requires exactly one ${type === "source" ? "Source" : "Output"}.`,
      );
  }
  for (const node of graph.nodes) {
    if (
      node.type === "cst" &&
      (!validEncoding(node.data.from) || !validEncoding(node.data.to))
    )
      throw new Error("CST requires supported from and to encoding pairs.");
    if (
      ![
        "source",
        "exposure",
        "cst",
        "cdl",
        "contrast",
        "saturation",
        "whiteBalance",
        "output",
      ].includes(node.type)
    )
      throw new Error("Unsupported node type.");
    if (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))
      throw new Error("Node positions must be finite.");
    if (
      node.type === "exposure" &&
      (!Number.isFinite(node.data.stops) ||
        node.data.stops! < -6 ||
        node.data.stops! > 6)
    )
      throw new Error("Exposure must be between −6 and +6 stops.");
    if (
      node.type === "saturation" &&
      ![node.data.saturation, node.data.vibrance].every(
        (v) => Number.isFinite(v) && Number.isFinite(Math.fround(v!)),
      )
    )
      throw new Error("Saturation and vibrance must be finite.");
    if (
      node.type === "contrast" &&
      (![node.data.contrast, node.data.pivot].every(
        (v) => Number.isFinite(v) && Number.isFinite(Math.fround(v!)),
      ) ||
        Math.fround(node.data.contrast!) <= 0 ||
        Math.fround(node.data.pivot!) <= 0)
    )
      throw new Error("Contrast amount and pivot must be finite and positive.");
    if (
      node.type === "whiteBalance" &&
      (!Number.isFinite(node.data.temperature) ||
        node.data.temperature! < 1667 ||
        node.data.temperature! > 25000 ||
        !Number.isFinite(node.data.tint) ||
        Math.abs(node.data.tint!) > 100)
    )
      throw new Error(
        "White Balance requires temperature 1667–25000 K and tint −100 to +100.",
      );
    if (node.type === "cdl") {
      for (const key of ["slope", "offset", "power"] as const) {
        const value = node.data[key];
        if (
          !Array.isArray(value) ||
          value.length !== 3 ||
          !value.every(
            (v) => Number.isFinite(v) && Number.isFinite(Math.fround(v)),
          )
        )
          throw new Error(`CDL ${key} requires three finite RGB values.`);
      }
      if (node.data.power!.some((v) => Math.fround(v) <= 0))
        throw new Error("CDL power must be positive.");
      if (
        !Number.isFinite(node.data.saturation) ||
        !Number.isFinite(Math.fround(node.data.saturation!))
      )
        throw new Error("CDL saturation must be finite.");
    }
    if (
      node.type === "output" &&
      !["clamp", "unbounded"].includes(node.data.clamp ?? "clamp")
    )
      throw new Error("Unsupported Output clamp policy.");
  }
  const inputs = new Map<string, string>();
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge.id || edgeIds.has(edge.id))
      throw new Error("Edge IDs must be unique and nonempty.");
    edgeIds.add(edge.id);
    const source = nodes.get(edge.source),
      target = nodes.get(edge.target);
    if (!source || !target)
      throw new Error("Connection refers to a missing node.");
    if (
      source.type === "output" ||
      target.type === "source" ||
      edge.sourceHandle !== "rgb" ||
      edge.targetHandle !== "rgb"
    )
      throw new Error(
        "Connect RGB outputs to RGB inputs. Mask ports are not supported by these nodes.",
      );
    if (inputs.has(target.id))
      throw new Error(
        "This RGB input already has a connection. Remove it first.",
      );
    inputs.set(target.id, source.id);
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("Connection would create a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    const input = inputs.get(id);
    if (input) visit(input);
    visiting.delete(id);
    visited.add(id);
  };
  graph.nodes.forEach((n) => visit(n.id));
  const ordered: GradingNode[] = [];
  const output = graph.nodes.find((n) => n.type === "output");
  const collect = (node: GradingNode) => {
    const input = inputs.get(node.id);
    if (node.type !== "source" && !input) {
      if (!draft)
        throw new Error(
          `${node.type === "cdl" ? "CDL" : node.type === "cst" ? "CST" : node.type[0].toUpperCase() + node.type.slice(1)} requires an RGB input. Connect it to Source.`,
        );
      return;
    }
    if (input) collect(nodes.get(input)!);
    ordered.push(node);
  };
  if (output) collect(output);
  return ordered;
}

/** Propagate declared encodings; never insert hidden repairs for a mismatched CST. */
export function encodingFlow(
  graph: GradingGraph,
  ordered = inspectGraph(graph),
) {
  const encodings = new Map<string, Encoding>();
  const inputs = new Map<string, Encoding>();
  const warnings: string[] = [];
  for (const node of ordered) {
    if (node.type === "source") {
      encodings.set(node.id, graph.colour.working);
      continue;
    }
    const edge = graph.edges.find((e) => e.target === node.id)!;
    const input = encodings.get(edge.source)!;
    inputs.set(node.id, input);
    if (node.type === "cst" && !sameEncoding(input, node.data.from!))
      warnings.push(
        `${node.id}: CST from encoding differs from its connected input. Check the declaration.`,
      );
    if (
      (node.type === "exposure" || node.type === "whiteBalance") &&
      input.transfer !== "linear"
    )
      warnings.push(
        `${node.id}: ${node.type === "whiteBalance" ? "White Balance" : "Exposure"} expects linear light. Insert a CST before this node.`,
      );
    encodings.set(
      node.id,
      node.type === "cst"
        ? node.data.to!
        : node.type === "output"
          ? graph.colour.output
          : input,
    );
  }
  return { inputs, warnings };
}

export function compileGraph(graph: GradingGraph) {
  const ordered = inspectGraph(graph);
  const flow = encodingFlow(graph, ordered);
  const index = new Map(ordered.map((n, i) => [n.id, i]));
  const edges = graph.edges
    .filter((e) => index.has(e.target))
    .map((e) => [
      index.get(e.source),
      index.get(e.target),
      e.sourceHandle,
      e.targetHandle,
    ])
    .sort((a, b) => String(a).localeCompare(String(b)));
  const key = JSON.stringify([
    [graph.colour.input, graph.colour.working, graph.colour.output].map(
      encodingKey,
    ),
    ordered.map((n) => [
      n.type,
      n.type === "output"
        ? (n.data.clamp ?? "clamp")
        : n.type === "cst"
          ? [encodingKey(n.data.from!), encodingKey(n.data.to!)]
          : null,
    ]),
    edges,
  ]);
  const uniforms: number[] = [];
  const scalar = (value: number) => `parameter${uniforms.push(value) - 1}`;
  const vector = (values: number[]) => `vec3(${values.map(scalar).join(", ")})`;
  const lines = ordered.map((node, i) => {
    if (node.type === "source")
      return `vec3 v${i} = ${transformShader("source.rgb", graph.colour.input, graph.colour.working)};`;
    const input = index.get(
      graph.edges.find((e) => e.target === node.id)!.source,
    )!;
    if (node.type === "whiteBalance") {
      const primaries = flow.inputs.get(node.id)!.primaries;
      const gamut = gamutMatrices[primaries];
      const adaptation = `mat3(${whiteBalanceMatrix(primaries, node.data.temperature!, node.data.tint!).map(scalar).join(", ")})`;
      const xyz = matrixShader(gamut.toXYZ, `v${input}`);
      return `vec3 v${i} = ${matrixShader(gamut.fromXYZ, `${adaptation} * ${xyz}`)};`;
    }
    if (node.type === "exposure") {
      return `vec3 v${i} = v${input} * exp2(${scalar(node.data.stops!)});`;
    }
    if (node.type === "saturation") {
      const saturation = scalar(node.data.saturation!),
        vibrance = scalar(node.data.vibrance!);
      return `float hi${i} = max(v${input}.r, max(v${input}.g, v${input}.b));
float lo${i} = min(v${input}.r, min(v${input}.g, v${input}.b));
float chroma${i} = clamp((hi${i} - lo${i}) / max(max(abs(hi${i}), abs(lo${i})), 1e-6), 0.0, 1.0);
vec3 v${i} = mix(vec3(dot(v${input}, vec3(0.2126, 0.7152, 0.0722))), v${input}, ${saturation} * (1.0 + ${vibrance} * (1.0 - chroma${i})));`;
    }
    if (node.type === "contrast") {
      const amount = scalar(node.data.contrast!),
        pivot = scalar(node.data.pivot!);
      return `vec3 v${i} = ${pivot} * pow(max(v${input}, vec3(1e-6)) / ${pivot}, vec3(${amount}));`;
    }
    if (node.type === "cdl") {
      const sop = `pow(max(v${input} * ${vector(node.data.slope!)} + ${vector(node.data.offset!)}, vec3(0.0)), ${vector(node.data.power!)})`;
      return `vec3 sop${i} = ${sop};
vec3 v${i} = mix(vec3(dot(sop${i}, vec3(0.2126, 0.7152, 0.0722))), sop${i}, ${scalar(node.data.saturation!)});`;
    }
    if (node.type === "cst")
      return `vec3 v${i} = ${transformShader(`v${input}`, node.data.from!, node.data.to!)};`;
    const converted = transformShader(
      `v${input}`,
      flow.inputs.get(node.id)!,
      graph.colour.output,
    );
    return `vec3 v${i} = ${node.data.clamp === "unbounded" ? converted : `clamp(${converted}, 0.0, 1.0)`};`;
  });
  return {
    key,
    uniforms,
    declarations: uniforms
      .map((_, i) => `uniform float parameter${i};`)
      .join("\n"),
    body:
      lines.join("\n") + `\nresult = vec4(v${ordered.length - 1}, source.a);`,
  };
}
