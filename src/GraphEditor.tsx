import { useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  type ReactFlowInstance,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraph } from "./graphStore";
import { GradingEngine, type GradingNode } from "./engine/GradingEngine";

function GradeNode({
  type,
  data,
  selected,
}: NodeProps<Node<GradingNode["data"]>>) {
  const title = type[0].toUpperCase() + type.slice(1);
  return (
    <div className={`graph-node ${selected ? "active" : ""}`}>
      {type !== "source" && (
        <Handle
          type="target"
          position={Position.Left}
          id="rgb"
          aria-label={`${title} RGB input`}
        />
      )}
      <div className="node-top">
        <h3>{title}</h3>
        <span>RGB</span>
      </div>
      <p>
        {type === "exposure"
          ? `${(data.stops ?? 0).toFixed(2)} stops`
          : type === "source"
            ? "sRGB image"
            : "sRGB display"}
      </p>
      {type !== "output" && (
        <Handle
          type="source"
          position={Position.Right}
          id="rgb"
          aria-label={`${title} RGB output`}
        />
      )}
    </div>
  );
}
const nodeTypes = { source: GradeNode, exposure: GradeNode, output: GradeNode };
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest('input, textarea, select, [contenteditable="true"]');

export function GraphEditor() {
  const state = useGraph();
  const { graph } = state;
  const [flow, setFlow] = useState<ReactFlowInstance<GradingNode> | null>(null);
  useEffect(() => {
    if (flow) void flow.fitView({ padding: 0.2, maxZoom: 1.25 });
  }, [flow, graph.nodes.length]);
  const error = GradingEngine.validate(graph);
  const removeSelection = () =>
    state.remove(
      graph.nodes.filter((n) => n.selected).map((n) => n.id),
      graph.edges.filter((e) => e.selected).map((e) => e.id),
    );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (isTyping(event.target) || !(event.ctrlKey || event.metaKey)) return;
      const state = useGraph.getState();
      const key = event.key.toLowerCase();
      if (["z", "y", "c", "v"].includes(key)) event.preventDefault();
      if (key === "z") event.shiftKey ? state.redo() : state.undo();
      if (key === "y") state.redo();
      if (key === "c") state.copy();
      if (key === "v") state.paste();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <section className="graph-panel" aria-label="Grading graph">
      <div className="panel-bar graph-toolbar">
        <h2>Graph</h2>
        <div className="graph-actions">
          {(["source", "exposure", "output"] as const).map((type) => (
            <button key={type} onClick={() => state.add(type)}>
              Add {type[0].toUpperCase() + type.slice(1)}
            </button>
          ))}
          <button onClick={state.undo} disabled={!state.past.length}>
            Undo
          </button>
          <button onClick={state.redo} disabled={!state.future.length}>
            Redo
          </button>
          <button
            onClick={state.copy}
            disabled={!graph.nodes.some((n) => n.selected)}
          >
            Copy
          </button>
          <button onClick={state.paste} disabled={!state.clipboard}>
            Paste
          </button>
          <button
            onClick={removeSelection}
            disabled={
              !graph.nodes.some((n) => n.selected) &&
              !graph.edges.some((e) => e.selected)
            }
          >
            Delete selection
          </button>
        </div>
      </div>
      <div className="graph-feedback" role="status">
        {state.feedback ||
          (error
            ? `Preview paused: ${error}`
            : "Live graph · Drag RGB ports to connect · Shift-drag to box select · Ctrl/Cmd+C/V/Z to copy, paste, undo")}
      </div>
      <div className="flow-canvas">
        <ReactFlow<GradingNode>
          onInit={setFlow}
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView
          multiSelectionKeyCode="Shift"
          snapToGrid
          snapGrid={[16, 16]}
          minZoom={0.25}
          onNodesChange={(changes) => {
            const applicable = changes.filter(
              (c) => c.type === "position" || c.type === "select",
            );
            if (!applicable.length) return;
            const nodes = applyNodeChanges(
              applicable,
              useGraph.getState().graph.nodes,
            );
            if (applicable.some((c) => c.type === "position"))
              state.edit({ ...useGraph.getState().graph, nodes });
            else state.select(nodes);
          }}
          onEdgesChange={(changes) => {
            const applicable = changes.filter((c) => c.type === "select");
            if (applicable.length)
              state.select(
                useGraph.getState().graph.nodes,
                applyEdgeChanges(applicable, useGraph.getState().graph.edges),
              );
          }}
          onNodeDragStart={state.begin}
          onNodeDragStop={state.end}
          onSelectionDragStart={state.begin}
          onSelectionDragStop={state.end}
          onDelete={({ nodes, edges }) =>
            state.remove(
              nodes.map((n) => n.id),
              edges.map((e) => e.id),
            )
          }
          onConnect={(connection) =>
            state.connect({
              ...connection,
              sourceHandle: connection.sourceHandle ?? "",
              targetHandle: connection.targetHandle ?? "",
              id: crypto.randomUUID(),
            })
          }
          isValidConnection={(connection) =>
            !GradingEngine.validate(
              {
                ...useGraph.getState().graph,
                edges: [
                  ...useGraph.getState().graph.edges,
                  {
                    ...connection,
                    sourceHandle: connection.sourceHandle ?? "",
                    targetHandle: connection.targetHandle ?? "",
                    id: "candidate",
                  },
                ],
              },
              true,
            )
          }
          onConnectEnd={(_, connection) => {
            if (!connection.isValid && connection.fromNode) {
              const from = connection.fromNode.id,
                to = connection.toNode?.id;
              const forward = connection.fromHandle?.type === "source";
              const edge = {
                id: crypto.randomUUID(),
                source: forward ? from : (to ?? ""),
                target: forward ? (to ?? "") : from,
                sourceHandle: "rgb",
                targetHandle: "rgb",
              };
              useGraph.setState({
                feedback: to
                  ? (GradingEngine.validate(
                      {
                        ...useGraph.getState().graph,
                        edges: [...useGraph.getState().graph.edges, edge],
                      },
                      true,
                    ) ?? "Connect an RGB output to an RGB input.")
                  : "Connection canceled. Drop on an RGB input port.",
              });
            }
          }}
        >
          <Background gap={16} />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  );
}
