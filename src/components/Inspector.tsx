import { EncodingAdvisories } from "@/components/EncodingAdvisories";
import { encodingFlow } from "@/engine/graph";
import { AdjustmentControls } from "@/AdjustmentControls";
import { EncodingControl } from "@/EncodingControl";
import { ExposureControl } from "@/components/ExposureControl";
import { LutExport, OutputRangeSelect, type LatticeSupport } from "@/LutExport";
import { encodingLabel } from "@/engine/GradingEngine";
import {
  GradingEngine,
  type FidelityResult,
  type NodeType,
} from "@/engine/GradingEngine";
import { useGraph } from "@/graphStore";
import { nodeTypeTitle, nodeTitle } from "@/nodeTitles";

import { adjustmentDefaults } from "@/adjustmentDefaults";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Icon } from "@/icons";

const descriptions: Record<NodeType, string> = {
  source: "Declared source encoding",
  exposure: "Linear light adjustment",
  cst: "Explicit encoding conversion",
  cdl: "Slope, offset, power and saturation",
  contrast: "Contrast around a tonal pivot",
  saturation: "Saturation and selective vibrance",
  whiteBalance: "Source-relative temperature and tint",
  curves: "Master and per-channel tone curves",
  qualifier: "HSV bands produce a mask",
  blend: "Mix two branches by amount and mask",
  output: "Final encoding and output range",
};

/** The controls for the selected node, the project-wide colour pipeline and
 * LUT export. Fixed on the right, and the same shape for every node type. */
export function Inspector({
  hasImage,
  engine,
  capabilityError,
  latticeSupport,
  onOverlay,
}: {
  hasImage: boolean;
  engine: () => GradingEngine | null;
  capabilityError: string;
  latticeSupport: LatticeSupport | null;
  onOverlay: (report: FidelityResult | null) => void;
}) {
  const graphState = useGraph();
  const { graph } = graphState;
  const selected = graph.nodes.find((n) => n.selected);
  const flow = GradingEngine.validate(graph) ? null : encodingFlow(graph);
  function resetSelected() {
    if (!selected || selected.type === "source") return;
    graphState.end();
    if (selected.type === "cst") {
      const encoding = flow?.inputs.get(selected.id) ?? graph.colour.working;
      graphState.updateParameters(selected.id, {
        from: { ...encoding },
        to: { ...encoding },
      });
    } else if (selected.type === "output") {
      graphState.updateParameters(selected.id, { clamp: "clamp" });
    } else {
      graphState.updateParameters(
        selected.id,
        selected.type === "exposure"
          ? { stops: 0 }
          : structuredClone(adjustmentDefaults[selected.type]),
      );
    }
  }
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="panel-bar">
        <h2>Inspector</h2>
        <span className="inspector-count">
          {graph.nodes.filter((node) => node.selected).length} /{" "}
          {graph.nodes.length} selected
        </span>
      </div>
      <div className="inspector-body">
        <div className="selected-node">
          <div className="selected-node-heading">
            {selected && (
              <span className="node-type-badge">
                {nodeTypeTitle(selected.type, true)}
              </span>
            )}
            {selected && (
              <Button
                size="toolbar"
                aria-label={
                  selected.type === "exposure" ? "Reset exposure" : undefined
                }
                disabled={selected.type === "source"}
                title={
                  selected.type === "source"
                    ? "Source has no node parameters to reset"
                    : undefined
                }
                onClick={resetSelected}
              >
                <Icon.RefreshCw />
                {selected.type === "exposure"
                  ? "Reset"
                  : `Reset ${nodeTypeTitle(selected.type)}`}
              </Button>
            )}
          </div>
          <h3>{nodeTitle(selected) || "Select a node"}</h3>
          <p>{selected ? descriptions[selected.type] : "RGB grading graph"}</p>
        </div>
        {selected?.type === "exposure" && (
          <ExposureControl
            key={selected.id}
            value={selected.data.stops!}
            disabled={false}
            onChange={(value) =>
              graphState.updateParameters(selected.id, { stops: value })
            }
            onBegin={graphState.begin}
            onEnd={graphState.end}
          />
        )}
        {selected && (
          <AdjustmentControls
            key={`adjustment-${selected.id}`}
            node={selected}
          />
        )}
        {selected?.type === "cst" &&
          (["from", "to"] as const).map((direction) => (
            <EncodingControl
              key={`${selected.id}-${direction}`}
              label={`CST ${direction}`}
              value={selected.data[direction]!}
              onChange={(value) =>
                graphState.updateParameters(selected.id, {
                  [direction]: value,
                })
              }
            />
          ))}
        {selected?.type === "output" && (
          <label className="output-policy">
            Output range
            <OutputRangeSelect output={selected} label="Output range" />
          </label>
        )}
        <EncodingAdvisories graph={graph} flow={flow} />
        <Accordion
          type="single"
          collapsible
          defaultValue="pipeline"
          className="pipeline-section"
        >
          <AccordionItem value="pipeline">
            <AccordionTrigger>Colour pipeline</AccordionTrigger>
            <AccordionContent>
              {(["input", "working", "output"] as const).map((boundary) => (
                <EncodingControl
                  key={boundary}
                  label={boundary[0].toUpperCase() + boundary.slice(1)}
                  value={graph.colour[boundary]}
                  onChange={(value) =>
                    graphState.updateColour({
                      ...graph.colour,
                      [boundary]: value,
                    })
                  }
                />
              ))}
              <p className="encoding-note">
                Source tag: {encodingLabel(graph.colour.input)}. Full-range code
                values; embedded profiles are not applied. Correct the input tag
                to match your source. Retagging does not restore highlight
                range.
                <br />
                Viewer conversion is sRGB only; output pixels keep the chosen
                output encoding.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <LutExport
          hasImage={hasImage}
          onOverlay={onOverlay}
          engine={engine}
          support={
            capabilityError ? { reason: capabilityError } : latticeSupport
          }
        />
      </div>
      <div className="inspector-footer">
        Build a grade, one connection at a time.
        <br />
        <span>Your edits are reversible.</span>
      </div>
    </aside>
  );
}
