import {
  qualifierDefaults,
  qualifierShader,
  validateQualifier,
  type Band,
} from "./qualifier";
import {
  bakeCurve,
  curveChannels,
  curveShader,
  validateCurves,
  type Curves,
} from "./curves";
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
  | "curves"
  | "whiteBalance"
  | "blend"
  | "qualifier"
  | "output";
export type GradingNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label?: string;
    hue?: Band;
    sat?: Band;
    value?: Band;
    amount?: number;
    curves?: Curves;
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
  solo?: string,
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
    if (node.data.label !== undefined && typeof node.data.label !== "string")
      throw new Error("Node labels must be text.");
    if (node.type === "qualifier") validateQualifier(node.data);
    if (
      node.type === "blend" &&
      (!Number.isFinite(node.data.amount) ||
        node.data.amount! < 0 ||
        node.data.amount! > 1)
    )
      throw new Error("Blend amount must be between 0 and 1.");
    if (node.type === "curves") validateCurves(node.data.curves);
    if (
      node.type === "cst" &&
      (!validEncoding(node.data.from) || !validEncoding(node.data.to))
    )
      throw new Error("CST requires supported from and to encoding pairs.");
    if (
      ![
        "blend",
        "qualifier",
        "source",
        "exposure",
        "cst",
        "cdl",
        "contrast",
        "saturation",
        "whiteBalance",
        "curves",
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
    const outputPort = source.type === "qualifier" ? "mask" : "rgb";
    const targetPorts = target.type === "blend" ? ["a", "b", "mask"] : ["rgb"];
    const inputType = edge.targetHandle === "mask" ? "mask" : "rgb";
    if (
      source.type === "output" ||
      target.type === "source" ||
      edge.sourceHandle !== outputPort ||
      !targetPorts.includes(edge.targetHandle) ||
      outputPort !== inputType
    )
      throw new Error(
        "Connect RGB outputs to RGB inputs and mask outputs to mask inputs.",
      );
    const key = `${target.id}:${edge.targetHandle}`;
    if (inputs.has(key))
      throw new Error(
        "This input already has a connection. Select that connection and press Delete, then reconnect.",
      );
    inputs.set(key, source.id);
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id))
      throw new Error(
        "Connection would create a cycle. Keep connections flowing toward Output; do not reconnect a branch to itself.",
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of graph.edges.filter((e) => e.target === id))
      visit(edge.source);
    visiting.delete(id);
    visited.add(id);
  };
  graph.nodes.forEach((n) => visit(n.id));
  const ordered: GradingNode[] = [];
  const output = solo
    ? graph.nodes.find((n) => n.id === solo)
    : graph.nodes.find((n) => n.type === "output");
  if (solo && !output) throw new Error("Choose an existing node to solo.");
  const collected = new Set<string>();
  const collect = (node: GradingNode) => {
    if (collected.has(node.id)) return;
    const required =
      node.type === "source"
        ? []
        : node.type === "blend"
          ? ["a", "b"]
          : ["rgb"];
    for (const port of required) {
      if (!inputs.has(`${node.id}:${port}`) && !draft)
        throw new Error(
          `${node.type} requires an RGB input (${port}). Connect that input to an RGB output from Source or an adjustment node.`,
        );
    }
    for (const edge of graph.edges.filter((e) => e.target === node.id))
      collect(nodes.get(edge.source)!);
    collected.add(node.id);
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
    const edge = graph.edges.find(
      (e) =>
        e.target === node.id &&
        e.targetHandle === (node.type === "blend" ? "a" : "rgb"),
    )!;
    const input = encodings.get(edge.source)!;
    inputs.set(node.id, input);
    if (node.type === "blend") {
      const branch = graph.edges.find(
        (e) => e.target === node.id && e.targetHandle === "b",
      )!;
      if (!sameEncoding(input, encodings.get(branch.source)!))
        warnings.push(
          `${node.id}: Blend has incompatible branch encodings. Insert an explicit CST to match them.`,
        );
    }
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
  return { inputs, encodings, warnings };
}

export function compileGraph(graph: GradingGraph, solo?: string) {
  const ordered = inspectGraph(graph, false, solo);
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
    Boolean(solo),
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
  const curves: ReturnType<typeof bakeCurve>[] = [];
  const scalar = (value: number) => `parameter${uniforms.push(value) - 1}`;
  const vector = (values: number[]) => `vec3(${values.map(scalar).join(", ")})`;
  const lines = ordered.map((node, i) => {
    if (node.type === "source")
      return `vec3 v${i} = ${transformShader("source.rgb", graph.colour.input, graph.colour.working)};`;
    const input = index.get(
      graph.edges.find(
        (e) =>
          e.target === node.id &&
          e.targetHandle === (node.type === "blend" ? "a" : "rgb"),
      )!.source,
    )!;
    if (node.type === "qualifier")
      return `float v${i} = qualify(v${input}, ${vector(node.data.hue!)}, ${vector(node.data.sat!)}, ${vector(node.data.value!)});`;
    if (node.type === "blend") {
      const branch = (port: string) =>
        graph.edges.find(
          (e) => e.target === node.id && e.targetHandle === port,
        );
      const b = index.get(branch("b")!.source)!;
      const mask = branch("mask");
      return `vec3 v${i} = mix(v${input}, v${b}, ${scalar(node.data.amount!)} * ${mask ? `clamp(v${index.get(mask.source)}, 0.0, 1.0)` : "1.0"});`;
    }
    if (node.type === "curves") {
      const calls = curveChannels.map((channel) => {
        const curve = bakeCurve(node.data.curves![channel]);
        const name = `curve${curves.push(curve) - 1}`;
        const start = scalar(curve.startSlope),
          end = scalar(curve.endSlope);
        return (value: string) =>
          `sampleCurve(${name}, ${value}, ${start}, ${end})`;
      });
      return `vec3 v${i} = vec3(${["r", "g", "b"].map((c, j) => calls[j + 1](calls[0](`v${input}.${c}`))).join(", ")});`;
    }
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
    curves,
    declarations:
      (ordered.some((n) => n.type === "qualifier") ? qualifierShader : "") +
      curves.map((_, i) => `uniform highp sampler2D curve${i};`).join("\n") +
      (curves.length ? curveShader : "") +
      uniforms.map((_, i) => `uniform float parameter${i};`).join("\n"),
    body:
      lines.join("\n") +
      `\nresult = vec4(${solo ? `vec3(v${ordered.length - 1})` : `v${ordered.length - 1}`}, source.a);`,
  };
}

/** The user-facing template; createGraph remains the neutral engine configuration. */
export function createStarterGraph(): GradingGraph {
  const graph = createGraph();
  graph.nodes.find((n) => n.id === "output")!.position = { x: 1040, y: 0 };
  graph.nodes.push(
    {
      id: "cool",
      type: "cdl",
      position: { x: 520, y: -120 },
      data: {
        label: "Cool CDL",
        slope: [0.94, 1, 1.08],
        offset: [0, 0, 0],
        power: [1, 1, 1],
        saturation: 1,
      },
    },
    {
      id: "warm",
      type: "cdl",
      position: { x: 520, y: 0 },
      data: {
        label: "Warm CDL",
        slope: [1.08, 1, 0.94],
        offset: [0, 0, 0],
        power: [1, 1, 1],
        saturation: 1,
      },
    },
    {
      id: "qualifier",
      type: "qualifier",
      position: { x: 520, y: 140 },
      data: { ...structuredClone(qualifierDefaults), value: [0.45, 1, 0.2] },
    },
    {
      id: "blend",
      type: "blend",
      position: { x: 780, y: 0 },
      data: { amount: 1 },
    },
  );
  const edge = (
    source: string,
    target: string,
    targetHandle = "rgb",
    sourceHandle = "rgb",
  ): GradingEdge => ({
    id: `${source}-${target}-${targetHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle,
  });
  graph.edges = [
    edge("source", "exposure"),
    edge("exposure", "cool"),
    edge("exposure", "warm"),
    edge("exposure", "qualifier"),
    edge("cool", "blend", "a"),
    edge("warm", "blend", "b"),
    edge("qualifier", "blend", "mask", "mask"),
    edge("blend", "output"),
  ];
  return graph;
}
