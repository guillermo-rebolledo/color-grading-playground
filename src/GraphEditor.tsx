import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/icons";
import { cn } from "@/lib/utils";
import {
  ReactFlow,
  Background,
  Controls,
  useViewport,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  type ReactFlowInstance,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { useGraph, connectionError } from "@/graphStore";
import {
  GradingEngine,
  encodingLabel,
  type GradingNode,
  type NodeType,
} from "@/engine/GradingEngine";
import { nodeTypeTitle } from "@/nodeTitles";

function GradeNode({
  id,
  type,
  data,
  selected,
}: NodeProps<Node<GradingNode["data"]>>) {
  const colour = useGraph((s) => s.graph.colour);
  const solo = useGraph((s) => s.solo === id);
  const title = nodeTypeTitle(type as NodeType, true);
  return (
    <div
      className={cn(
        "graph-node relative w-[185px] shrink-0 border border-solid bg-secondary",
        selected ? "border-primary bg-input" : "border-line-strong",
        solo && "outline-2 outline-offset-2 outline-primary",
      )}
    >
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
            className="pointer-events-none absolute right-[calc(100%+10px)] -translate-y-1/2 bg-card text-[10px] text-foreground"
            style={{ top: `${25 + i * 25}%` }}
          >
            {port}
          </span>
        ))}
      <div className="flex items-center gap-2 border-x-0 border-t-0 border-b border-solid border-border p-3">
        <h3 className="m-0 text-xs font-medium">{data.label ?? title}</h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {type === "qualifier" ? "MASK" : "RGB"}
        </span>
      </div>
      <p className="m-0 p-3 font-mono text-[11px] tabular-nums text-foreground">
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
/* One fit for the panel: the toolbar's Fit View, the automatic fit and the
 * first paint all leave the same margin. The margin is wide because the dock
 * is short — nodes fitted tight against the pane edge sit inside the band
 * where a connection drag auto-pans the canvas away from the pointer. */
const fit = { padding: 0.3, maxZoom: 1.25 };
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest(
    'input:not([type="range"]), textarea, [contenteditable="true"]',
  );

/* Keep React Flow's navigation controls and their accessibility contract;
 * only their DOM placement changes, from the canvas into the toolbar. */
function GraphNavigation({ container }: { container: HTMLDivElement }) {
  const { zoom } = useViewport();
  return createPortal(
    <Controls
      className="graph-navigation"
      orientation="horizontal"
      fitViewOptions={fit}
    >
      <span
        role="group"
        aria-label="Graph zoom"
        className="inline-flex w-[5ch] shrink-0 items-center justify-end font-mono text-[11px] tabular-nums text-foreground"
      >
        {Math.round(zoom * 100)}%
      </span>
    </Controls>,
    container,
  );
}

export function GraphEditor() {
  const [navigation, setNavigation] = useState<HTMLDivElement | null>(null);
  const state = useGraph();
  const { graph } = state;
  const [flow, setFlow] = useState<ReactFlowInstance<GradingNode> | null>(null);
  useEffect(() => {
    if (flow) void flow.fitView(fit);
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
    <>
      <div className="graph-toolbar flex min-h-7 shrink-0 items-center gap-2 overflow-x-auto border-x-0 border-t-0 border-b border-solid border-border px-2">
        <div className="flex min-w-[100px] flex-1 items-center gap-1.5 overflow-x-auto py-1">
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
            <Button size="toolbar" key={type} onClick={() => state.add(type)}>
              <Icon.Plus /> Add {nodeTypeTitle(type, true)}
            </Button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 py-1 [&_button]:px-1">
          {state.solo && (
            <Button
              size="toolbar"
              onClick={() => useGraph.setState({ solo: null })}
            >
              <Icon.X />
              {graph.nodes.find((n) => n.id === state.solo)?.type ===
              "qualifier"
                ? "Exit mask solo"
                : "Exit solo"}
            </Button>
          )}
          <Button
            size="toolbar"
            onClick={state.undo}
            disabled={!state.past.length}
          >
            <Icon.Undo2 /> Undo
          </Button>
          <Button
            size="toolbar"
            onClick={state.redo}
            disabled={!state.future.length}
          >
            <Icon.Redo2 /> Redo
          </Button>
          <Button
            size="toolbar"
            onClick={state.copy}
            disabled={!graph.nodes.some((n) => n.selected)}
          >
            <Icon.Copy /> Copy
          </Button>
          <Button
            size="toolbar"
            onClick={state.paste}
            disabled={!state.clipboard}
          >
            <Icon.ClipboardPaste /> Paste
          </Button>
          <Button
            size="toolbar"
            onClick={removeSelection}
            disabled={
              !graph.nodes.some((n) => n.selected) &&
              !graph.edges.some((e) => e.selected)
            }
          >
            <Icon.Trash2 /> Delete selection
          </Button>
        </div>
        <div ref={setNavigation} className="shrink-0" />
      </div>
      <div className="flex min-h-[22px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-x-0 border-t-0 border-b border-solid border-border px-2 py-1 text-[11px] leading-[14px] text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-4 border-x-0 border-b-0 border-t-2 border-solid border-port-rgb"
          />
          RGB: solid
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-4 border-x-0 border-b-0 border-t-2 border-dashed border-port-mask"
          />
          Mask: dashed
        </span>
        <span>Double-click a node to solo</span>
        <span>Drag ports to connect</span>
        <span>Shift-drag to box select</span>
      </div>
      <div className="flow-canvas relative min-h-[140px] flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-card">
          <div
            className="h-[22px] shrink-0 overflow-x-auto whitespace-nowrap border-x-0 border-t-0 border-b border-solid border-border px-2 py-1 text-[11px] leading-[14px] text-foreground"
            role="status"
          >
            {state.feedback ||
              (error
                ? `Preview paused: ${error}`
                : "Live graph · Ctrl/Cmd+C/V/Z to copy, paste, undo")}
          </div>
          {warnings.length > 0 && (
            <div
              className="h-[22px] shrink-0 overflow-x-auto whitespace-nowrap border-x-0 border-t-0 border-b border-solid border-border px-2 py-1 text-[11px] leading-[14px] text-foreground"
              role="status"
            >
              {warnings.join(" ")}
            </div>
          )}
        </div>
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
          fitViewOptions={fit}
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
          {navigation && <GraphNavigation container={navigation} />}
        </ReactFlow>
      </div>
    </>
  );
}
