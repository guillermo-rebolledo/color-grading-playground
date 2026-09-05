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
import { useGraph, connectionError } from "./graphStore";
import {
  GradingEngine,
  encodingLabel,
  type GradingNode,
} from "./engine/GradingEngine";

function GradeNode({
  type,
  data,
  selected,
}: NodeProps<Node<GradingNode["data"]>>) {
  const colour = useGraph((s) => s.graph.colour);
  const title =
    type === "qualifier"
      ? "HSL Qualifier"
      : type === "whiteBalance"
        ? "White Balance"
        : type === "cdl"
          ? "CDL"
          : type === "cst"
            ? "CST"
            : type[0].toUpperCase() + type.slice(1);
  return (
    <div className={`graph-node ${selected ? "active" : ""}`}>
      {type !== "source" &&
        (type === "blend" ? ["a", "b", "mask"] : ["rgb"]).map((port, i) => (
          <Handle
            key={port}
            type="target"
            position={Position.Left}
            id={port}
            className={port === "mask" ? "mask-port" : "rgb-port"}
            style={type === "blend" ? { top: `${25 + i * 25}%` } : undefined}
            aria-label={`${title} ${port === "mask" ? "mask" : port === "rgb" ? "RGB" : `RGB ${port.toUpperCase()}`} input`}
          />
        ))}
      {type === "blend" &&
        ["A", "B", "Mask"].map((port, i) => (
          <span
            key={port}
            className="port-label"
            style={{ top: `${25 + i * 25}%` }}
          >
            {port}
          </span>
        ))}
      <div className="node-top">
        <h3>{data.label ?? title}</h3>
        <span>{type === "qualifier" ? "MASK" : "RGB"}</span>
      </div>
      <p>
        {type === "blend"
          ? `A → B · Amount ${data.amount} · Mask optional`
          : type === "qualifier"
            ? "Hue / Saturation / Value"
            : type === "curves"
              ? "Master → R/G/B"
              : type === "whiteBalance"
                ? `${data.temperature} K · Tint ${data.tint}`
                : type === "cst"
                  ? `${encodingLabel(data.from!)} → ${encodingLabel(data.to!)}`
                  : type === "exposure"
                    ? `${(data.stops ?? 0).toFixed(2)} stops`
                    : type === "cdl"
                      ? "Unbounded SOP · Rec.709 luma"
                      : type === "contrast"
                        ? `Amount ${data.contrast} · Pivot ${data.pivot}`
                        : type === "saturation"
                          ? `Saturation ${data.saturation} · Vibrance ${data.vibrance}`
                          : type === "source"
                            ? encodingLabel(colour.input)
                            : encodingLabel(colour.output)}
      </p>
      {type !== "output" && (
        <Handle
          type="source"
          position={Position.Right}
          id={type === "qualifier" ? "mask" : "rgb"}
          className={type === "qualifier" ? "mask-port" : "rgb-port"}
          aria-label={`${title} ${type === "qualifier" ? "mask" : "RGB"} output`}
        />
      )}
    </div>
  );
}
const nodeTypes = {
  source: GradeNode,
  exposure: GradeNode,
  cst: GradeNode,
  cdl: GradeNode,
  contrast: GradeNode,
  saturation: GradeNode,
  whiteBalance: GradeNode,
  curves: GradeNode,
  output: GradeNode,
  qualifier: GradeNode,
  blend: GradeNode,
};
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest(
    'input:not([type="range"]), textarea, [contenteditable="true"]',
  );

export function GraphEditor() {
  const state = useGraph();
  const { graph } = state;
  const [flow, setFlow] = useState<ReactFlowInstance<GradingNode> | null>(null);
  useEffect(() => {
    if (flow) void flow.fitView({ padding: 0.2, maxZoom: 1.25 });
  }, [flow, graph.nodes.length]);
  const error = GradingEngine.validate(graph);
  const warnings = GradingEngine.warnings(graph);
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
          {(
            [
              "source",
              "exposure",
              "cst",
              "cdl",
              "contrast",
              "saturation",
              "whiteBalance",
              "curves",
              "qualifier",
              "blend",
              "output",
            ] as const
          ).map((type) => (
            <button key={type} onClick={() => state.add(type)}>
              Add{" "}
              {type === "qualifier"
                ? "HSL Qualifier"
                : type === "whiteBalance"
                  ? "White Balance"
                  : type === "cdl"
                    ? "CDL"
                    : type === "cst"
                      ? "CST"
                      : type[0].toUpperCase() + type.slice(1)}
            </button>
          ))}
          {state.solo && (
            <button onClick={() => useGraph.setState({ solo: null })}>
              {graph.nodes.find((n) => n.id === state.solo)?.type ===
              "qualifier"
                ? "Exit mask solo"
                : "Exit solo"}
            </button>
          )}
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
            : "Live graph · RGB: solid · Mask: dashed · Double-click a node to solo · Drag ports to connect · Shift-drag to box select · Ctrl/Cmd+C/V/Z to copy, paste, undo")}
      </div>
      {warnings.length > 0 && (
        <div className="graph-feedback" role="status">
          {warnings.join(" ")}
        </div>
      )}
      <div className="flow-canvas">
        <ReactFlow<GradingNode>
          onInit={setFlow}
          nodes={graph.nodes}
          edges={graph.edges.map((e) => ({
            ...e,
            className: e.sourceHandle === "mask" ? "mask-edge" : "rgb-edge",
          }))}
          onNodeDoubleClick={(_, node) => {
            useGraph.setState((s) => ({
              solo: s.solo === node.id ? null : node.id,
            }));
          }}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView
          multiSelectionKeyCode="Shift"
          deleteKeyCode={["Backspace", "Delete"]}
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
            !connectionError(useGraph.getState().graph, {
              ...connection,
              sourceHandle: connection.sourceHandle ?? "",
              targetHandle: connection.targetHandle ?? "",
              id: "candidate",
            })
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
                sourceHandle:
                  (forward
                    ? connection.fromHandle?.id
                    : connection.toHandle?.id) ?? "",
                targetHandle:
                  (forward
                    ? connection.toHandle?.id
                    : connection.fromHandle?.id) ?? "",
              };
              useGraph.setState({
                feedback: to
                  ? (connectionError(useGraph.getState().graph, edge) ??
                    "Connect matching RGB or mask ports.")
                  : "Connection canceled. Drop on a matching input port.",
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
