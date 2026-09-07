import inventory from "../public/looks/inventory.json";
import { adjustmentDefaults } from "./adjustmentDefaults";
import { lookHash, canonicalize } from "./engine/lookHash";
import type {
  Encoding,
  GradingEdge,
  GradingGraph,
  GradingNode,
  NodeType,
} from "./engine/GradingEngine";

/** One node of a look, as authored. `data` is merged over the node type's
 * defaults, so a definition states only what it changes. */
export type LookNodeSpec = {
  type: NodeType;
  data?: GradingNode["data"];
};

export type LookDefinition = {
  id: string;
  name: string;
  group: string;
  description: string;
  referenceStocks: string[];
  nodes: LookNodeSpec[];
};

/** The shared authoring container. Every look is a transform within this
 * encoding, and ships the CSTs that get it there and back. */
export const lookSpace = inventory.lookSpace as Encoding;

export const looks = inventory.looks as LookDefinition[];

export const findLook = (id: string | undefined) =>
  looks.find((look) => look.id === id) ?? null;

/** The definition's content hash. Computed rather than stored, so a definition
 * and its hash cannot drift apart. */
export const definitionHash = (look: LookDefinition) => lookHash(look.nodes);

/** A spec's parameters, with the node type's defaults filled in. */
export const resolveSpec = (spec: LookNodeSpec) => ({
  ...structuredClone(
    (adjustmentDefaults as Record<string, GradingNode["data"]>)[spec.type] ??
      {},
  ),
  ...structuredClone(spec.data ?? {}),
});

/** Provenance and plumbing are not part of what the author wrote. */
const authored = (data: GradingNode["data"]) => {
  const { look, lookHash: hash, label, ...rest } = data;
  void look;
  void hash;
  void label;
  return canonicalize(rest);
};

/** Both are multiples of the editor's 16-unit drag grid, and every look node is
 * placed at one of these offsets from the node the look branches from, so an
 * aligned graph stays aligned. */
const columnWidth = 256;
const rowOffset = 160;
/** Width reserved for a look with `count` nodes between its branch and Output. */
const reserved = (count: number) => (count + 1) * columnWidth;

export type LookState = {
  /** The id recorded on the graph's tagged nodes. */
  id: string;
  /** The shipped definition, when the id is still in the inventory. */
  definition: LookDefinition | null;
  /** The tagged cluster still forms the expected chain into Output. */
  intact: boolean;
  /** Inner node parameters differ from the shipped definition. */
  modified: boolean;
  /** The tag's hash does not match the definition shipping today. */
  outdated: boolean;
  /** What to show in the inspector. */
  label: string;
  nodeIds: string[];
  blendId: string | null;
  innerIds: string[];
  intensity: number;
};

const taggedNodes = (graph: GradingGraph) =>
  graph.nodes.filter((node) => typeof node.data.look === "string");

/** Walk the tagged cluster back from Output. Returns the chain in flow order
 * — CST, the authored nodes, CST — with its Blend and the node it branches
 * from, or null when the cluster has been rewired or partly deleted. */
function traceLook(graph: GradingGraph, tagged: GradingNode[]) {
  const ids = new Set(tagged.map((node) => node.id));
  const output = graph.nodes.find((node) => node.type === "output");
  if (!output) return null;
  const inputOf = (id: string, port: string) =>
    graph.edges.find(
      (edge) => edge.target === id && edge.targetHandle === port,
    );
  const node = (id: string | undefined) =>
    graph.nodes.find((candidate) => candidate.id === id);

  const blend = node(inputOf(output.id, "rgb")?.source);
  if (!blend || blend.type !== "blend" || !ids.has(blend.id)) return null;

  const chain: GradingNode[] = [];
  let cursor = node(inputOf(blend.id, "b")?.source);
  while (cursor && ids.has(cursor.id)) {
    chain.unshift(cursor);
    if (chain.length > tagged.length) return null;
    cursor = node(inputOf(cursor.id, "rgb")?.source);
  }
  const upstream = cursor;
  if (!upstream || chain.length < 2) return null;
  if (chain[0].type !== "cst" || chain[chain.length - 1].type !== "cst")
    return null;
  if (node(inputOf(blend.id, "a")?.source)?.id !== upstream.id) return null;
  // Every tagged node must belong to the cluster; a stray tag means the user
  // has copied or rewired part of it.
  if (chain.length + 1 !== tagged.length) return null;
  return { chain, blend, upstream };
}

/** Derived from the graph on every read, so the tag is never load-bearing. */
export function lookState(graph: GradingGraph): LookState | null {
  const tagged = taggedNodes(graph);
  if (!tagged.length) return null;
  const ids = new Set(tagged.map((node) => node.data.look!));
  const id = tagged[0].data.look!;
  const definition = ids.size === 1 ? findLook(id) : null;
  const traced = ids.size === 1 ? traceLook(graph, tagged) : null;
  const outdated =
    !!definition &&
    tagged.some((node) => node.data.lookHash !== definitionHash(definition));
  const inner = traced?.chain.slice(1, -1) ?? [];
  const modified =
    !!definition &&
    !!traced &&
    !outdated &&
    (inner.length !== definition.nodes.length ||
      inner.some(
        (node, i) =>
          node.type !== definition.nodes[i].type ||
          authored(node.data) !==
            canonicalize(resolveSpec(definition.nodes[i])),
      ));
  const name = definition?.name ?? null;
  const label = !traced
    ? name
      ? `Custom look (from ${name})`
      : "Custom look"
    : !name
      ? "Custom look"
      : outdated
        ? `${name} (older version)`
        : modified
          ? `${name} (modified)`
          : name;
  return {
    id,
    definition,
    intact: !!traced,
    modified,
    outdated,
    label,
    nodeIds: tagged.map((node) => node.id),
    blendId: traced?.blend.id ?? null,
    innerIds: inner.map((node) => node.id),
    intensity: traced?.blend.data.amount ?? 1,
  };
}

/** Why a look cannot be inserted right now, or null. */
export function lookSlotError(graph: GradingGraph) {
  const output = graph.nodes.find((node) => node.type === "output");
  if (!output) return "Add an Output node before choosing a look.";
  const edge = graph.edges.find(
    (e) => e.target === output.id && e.targetHandle === "rgb",
  );
  if (!edge)
    return "Connect a node to Output before choosing a look. A look is applied at the end of the chain.";
  return null;
}

/** Delete every tagged node and reconnect whatever fed the look into Output.
 * Works on a dismantled cluster too, which is why it takes the upstream from
 * the graph rather than from the trace. */
export function withoutLook(graph: GradingGraph): GradingGraph {
  const state = lookState(graph);
  if (!state) return graph;
  const removed = new Set(state.nodeIds);
  const output = graph.nodes.find((node) => node.type === "output");
  const traced = traceLook(graph, taggedNodes(graph));
  // An intact cluster is closed exactly as it was opened: the reserved width is
  // given back, and the edge into Output keeps the identity it had before.
  const shift = traced ? reserved(traced.chain.length) : 0;
  const anchor = traced?.upstream.position.x ?? 0;
  const nodes = graph.nodes
    .filter((node) => !removed.has(node.id))
    .map((node) =>
      shift && node.position.x > anchor
        ? {
            ...node,
            position: { ...node.position, x: node.position.x - shift },
          }
        : node,
    );
  const into = graph.edges.find(
    (edge) => edge.target === output?.id && edge.targetHandle === "rgb",
  );
  const edges = graph.edges.flatMap((edge) => {
    if (output && traced && edge.id === into?.id)
      return [
        {
          id: edge.id,
          source: traced.upstream.id,
          target: output.id,
          sourceHandle: "rgb",
          targetHandle: "rgb",
        },
      ];
    return removed.has(edge.source) || removed.has(edge.target) ? [] : [edge];
  });
  return { ...graph, nodes, edges };
}

/** Insert a look on the edge feeding Output, replacing any look already there. */
export function withLook(
  graph: GradingGraph,
  look: LookDefinition,
  intensity = 1,
): GradingGraph {
  const base = withoutLook(graph);
  const output = base.nodes.find((node) => node.type === "output")!;
  const feeding = base.edges.find(
    (edge) => edge.target === output.id && edge.targetHandle === "rgb",
  )!;
  const upstream = base.nodes.find((node) => node.id === feeding.source)!;
  const hash = definitionHash(look);
  const tag = { look: look.id, lookHash: hash };

  const specs: LookNodeSpec[] = [
    {
      type: "cst",
      data: { from: { ...base.colour.working }, to: { ...lookSpace } },
    },
    ...look.nodes,
    {
      type: "cst",
      data: { from: { ...lookSpace }, to: { ...base.colour.working } },
    },
  ];
  // Everything downstream of the branch slides right to open a gap exactly the
  // width of the look, so the cluster never lands on the user's own nodes and
  // removing it puts the layout back where it was.
  const shift = reserved(specs.length);
  const anchor = upstream.position;
  const chain = specs.map((spec, i) => ({
    id: crypto.randomUUID(),
    type: spec.type,
    position: { x: anchor.x + (i + 1) * columnWidth, y: anchor.y + rowOffset },
    data: { ...resolveSpec(spec), ...tag },
    selected: false,
  })) satisfies GradingNode[];
  const blend: GradingNode = {
    id: crypto.randomUUID(),
    type: "blend",
    position: { x: anchor.x + shift, y: anchor.y },
    data: {
      ...structuredClone(adjustmentDefaults.blend),
      amount: intensity,
      ...tag,
    },
    selected: true,
  };
  const edge = (
    source: string,
    target: string,
    targetHandle = "rgb",
  ): GradingEdge => ({
    id: crypto.randomUUID(),
    source,
    target,
    sourceHandle: "rgb",
    targetHandle,
  });
  return {
    ...base,
    nodes: [
      ...base.nodes.map((node) => ({
        ...node,
        position:
          node.position.x > anchor.x
            ? { ...node.position, x: node.position.x + shift }
            : node.position,
        selected: false,
      })),
      ...chain,
      blend,
    ],
    edges: [
      // The displaced edge is retargeted in place rather than replaced, so it
      // keeps both its id and its position and removal is an exact inverse.
      ...base.edges.map((e) =>
        e.id === feeding.id
          ? { ...edge(blend.id, output.id), id: feeding.id }
          : { ...e, selected: false },
      ),
      edge(upstream.id, chain[0].id),
      ...chain.slice(1).map((node, i) => edge(chain[i].id, node.id)),
      edge(chain[chain.length - 1].id, blend.id, "b"),
      edge(upstream.id, blend.id, "a"),
    ],
  };
}

/** Restore the shipped parameters in place, keeping node identity, position
 * and history. Also re-points the CSTs at the current working encoding and
 * returns intensity to full. */
export function withLookReset(graph: GradingGraph): GradingGraph {
  const state = lookState(graph);
  if (!state?.definition || !state.intact) return graph;
  const traced = traceLook(graph, taggedNodes(graph))!;
  const hash = definitionHash(state.definition);
  const inner = new Map(
    traced.chain.slice(1, -1).map((node, i) => [node.id, i] as const),
  );
  const first = traced.chain[0].id;
  const last = traced.chain[traced.chain.length - 1].id;
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (
        !inner.has(node.id) &&
        node.id !== first &&
        node.id !== last &&
        node.id !== traced.blend.id
      )
        return node;
      const tag = { look: state.id, lookHash: hash };
      if (node.id === first)
        return {
          ...node,
          data: {
            from: { ...graph.colour.working },
            to: { ...lookSpace },
            ...tag,
          },
        };
      if (node.id === last)
        return {
          ...node,
          data: {
            from: { ...lookSpace },
            to: { ...graph.colour.working },
            ...tag,
          },
        };
      if (node.id === traced.blend.id)
        return {
          ...node,
          data: { ...structuredClone(adjustmentDefaults.blend), ...tag },
        };
      return {
        ...node,
        data: {
          ...resolveSpec(state.definition!.nodes[inner.get(node.id)!]),
          ...tag,
        },
      };
    }),
  };
}
