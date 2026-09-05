import { adjustmentDefaults } from "./adjustmentDefaults";
import { create } from "zustand";
import {
  GradingEngine,
  createGraph,
  type GradingGraph,
  type GradingNode,
  type GradingEdge,
  type NodeType,
  type ColourSettings,
} from "./engine/GradingEngine";

type GraphState = {
  graph: GradingGraph;
  past: GradingGraph[];
  future: GradingGraph[];
  transaction: GradingGraph | null;
  clipboard: GradingGraph | null;
  feedback: string;
  edit: (graph: GradingGraph) => void;
  select: (nodes: GradingNode[], edges?: GradingEdge[]) => void;
  begin: () => void;
  end: () => void;
  undo: () => void;
  redo: () => void;
  add: (type: NodeType) => void;
  remove: (nodeIds: string[], edgeIds: string[]) => void;
  connect: (edge: GradingEdge) => void;
  updateParameters: (id: string, parameters: GradingNode["data"]) => void;
  updateColour: (colour: ColourSettings) => void;
  copy: () => void;
  paste: () => void;
};
const sameContent = (a: GradingGraph, b: GradingGraph) =>
  JSON.stringify({
    ...a,
    nodes: a.nodes.map(({ selected, ...n }) => n),
    edges: a.edges.map(({ selected, ...e }) => e),
  }) ===
  JSON.stringify({
    ...b,
    nodes: b.nodes.map(({ selected, ...n }) => n),
    edges: b.edges.map(({ selected, ...e }) => e),
  });
const append = (history: GradingGraph[], graph: GradingGraph) => [
  ...history.slice(-99),
  graph,
];

export function connectionError(graph: GradingGraph, edge: GradingEdge) {
  return GradingEngine.validate(
    { ...graph, edges: [...graph.edges, edge] },
    true,
  );
}

// Immutable whole-graph snapshots keep history independent of individual node types.
export const useGraph = create<GraphState>()((set, get) => ({
  graph: createGraph(),
  past: [],
  future: [],
  transaction: null,
  clipboard: null,
  feedback: "",
  edit: (graph) => {
    const state = get();
    if (sameContent(state.graph, graph)) return;
    set({
      graph,
      future: [],
      feedback: "",
      past: state.transaction ? state.past : append(state.past, state.graph),
    });
  },
  select: (nodes, edges) =>
    set((s) => ({
      graph: { ...s.graph, nodes, edges: edges ?? s.graph.edges },
    })),
  begin: () => {
    if (!get().transaction) set({ transaction: get().graph });
  },
  end: () => {
    const { transaction, graph, past } = get();
    if (transaction)
      set({
        transaction: null,
        past: sameContent(transaction, graph)
          ? past
          : append(past, transaction),
      });
  },
  undo: () => {
    get().end();
    const { past, graph, future } = get();
    if (past.length)
      set({
        graph: past[past.length - 1],
        past: past.slice(0, -1),
        future: append(future, graph),
        feedback: "",
      });
  },
  redo: () => {
    get().end();
    const { past, graph, future } = get();
    if (future.length)
      set({
        graph: future[future.length - 1],
        future: future.slice(0, -1),
        past: append(past, graph),
        feedback: "",
      });
  },
  add: (type) => {
    get().end();
    const { graph } = get();
    if (
      (type === "source" || type === "output") &&
      graph.nodes.some((n) => n.type === type)
    ) {
      set({
        feedback: `Only one ${type === "source" ? "Source" : "Output"} is allowed. Delete the existing node first.`,
      });
      return;
    }
    const node: GradingNode = {
      id: crypto.randomUUID(),
      type,
      position: { x: 260, y: 144 + (graph.nodes.length % 3) * 112 },
      data:
        type === "cdl" ||
        type === "contrast" ||
        type === "saturation" ||
        type === "whiteBalance"
          ? structuredClone(adjustmentDefaults[type])
          : type === "cst"
            ? {
                from: { ...graph.colour.working },
                to: { ...graph.colour.working },
              }
            : type === "exposure"
              ? { stops: 0 }
              : type === "output"
                ? { clamp: "clamp" }
                : {},
      selected: true,
    };
    get().edit({
      ...graph,
      nodes: [...graph.nodes.map((n) => ({ ...n, selected: false })), node],
      edges: graph.edges.map((e) => ({ ...e, selected: false })),
    });
  },
  remove: (nodeIds, edgeIds) => {
    get().end();
    const { graph } = get();
    get().edit({
      ...graph,
      nodes: graph.nodes.filter((n) => !nodeIds.includes(n.id)),
      edges: graph.edges.filter(
        (e) =>
          !edgeIds.includes(e.id) &&
          !nodeIds.includes(e.source) &&
          !nodeIds.includes(e.target),
      ),
    });
  },
  connect: (edge) => {
    get().end();
    const graph = { ...get().graph, edges: [...get().graph.edges, edge] };
    const error = connectionError(get().graph, edge);
    if (error) set({ feedback: error });
    else get().edit(graph);
  },
  updateParameters: (id, parameters) => {
    const { graph } = get();
    const next = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...parameters } } : n,
      ),
    };
    const error = GradingEngine.validate(next, true);
    if (error) set({ feedback: error });
    else get().edit(next);
  },
  updateColour: (colour) => {
    get().end();
    const graph = { ...get().graph, colour };
    const error = GradingEngine.validate(graph, true);
    if (error) set({ feedback: error });
    else get().edit(graph);
  },
  copy: () => {
    const { graph } = get();
    const nodes = graph.nodes.filter((n) => n.selected);
    if (!nodes.length) return;
    const ids = new Set(nodes.map((n) => n.id));
    set({
      clipboard: structuredClone({
        ...graph,
        nodes,
        edges: graph.edges.filter(
          (e) => ids.has(e.source) && ids.has(e.target),
        ),
      }),
      feedback: `Copied ${nodes.length} node${nodes.length === 1 ? "" : "s"}.`,
    });
  },
  paste: () => {
    get().end();
    const { clipboard, graph } = get();
    if (!clipboard) return;
    if (
      clipboard.nodes.some(
        (n) =>
          (n.type === "source" || n.type === "output") &&
          graph.nodes.some((existing) => existing.type === n.type),
      )
    ) {
      set({
        feedback:
          "Paste would duplicate Source or Output. Copy adjustments alone, or delete the existing endpoint first.",
      });
      return;
    }
    const ids = new Map(
      clipboard.nodes.map((n) => [n.id, crypto.randomUUID()]),
    );
    const nodes = clipboard.nodes.map((n) => ({
      ...structuredClone(n),
      id: ids.get(n.id)!,
      position: { x: n.position.x + 32, y: n.position.y + 32 },
      selected: true,
    }));
    const edges = clipboard.edges.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      source: ids.get(e.source)!,
      target: ids.get(e.target)!,
      selected: true,
    }));
    get().edit({
      ...graph,
      nodes: [...graph.nodes.map((n) => ({ ...n, selected: false })), ...nodes],
      edges: [...graph.edges.map((e) => ({ ...e, selected: false })), ...edges],
    });
    set({
      clipboard: {
        ...clipboard,
        nodes: clipboard.nodes.map((n) => ({
          ...n,
          position: { x: n.position.x + 32, y: n.position.y + 32 },
        })),
      },
    });
  },
}));
