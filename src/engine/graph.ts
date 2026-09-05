import {
  defaultColour,
  encodingKey,
  validEncoding,
  transformShader,
  sameEncoding,
  type Encoding,
  type ColourSettings,
} from "./colour";
export type NodeType = "source" | "exposure" | "cst" | "output";
export type GradingNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    stops?: number;
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
    if (!["source", "exposure", "cst", "output"].includes(node.type))
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
          `${node.type === "output" ? "Output" : node.type === "cst" ? "CST" : "Exposure"} requires an RGB input. Connect it to Source.`,
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
    if (node.type === "exposure" && input.transfer !== "linear")
      warnings.push(
        `${node.id}: Exposure expects linear light. Insert a CST before this node.`,
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
  const lines = ordered.map((node, i) => {
    if (node.type === "source")
      return `vec3 v${i} = ${transformShader("source.rgb", graph.colour.input, graph.colour.working)};`;
    const input = index.get(
      graph.edges.find((e) => e.target === node.id)!.source,
    )!;
    if (node.type === "exposure") {
      const slot = uniforms.push(node.data.stops!) - 1;
      return `vec3 v${i} = v${input} * exp2(stops${slot});`;
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
    declarations: uniforms.map((_, i) => `uniform float stops${i};`).join("\n"),
    body:
      lines.join("\n") + `\nresult = vec4(v${ordered.length - 1}, source.a);`,
  };
}
