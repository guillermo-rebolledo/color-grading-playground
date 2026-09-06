import { AdjustmentControls } from "@/AdjustmentControls";
import { EncodingControl } from "@/EncodingControl";
import { ExposureControl } from "@/components/ExposureControl";
import { LutExport, OutputRangeSelect, type LatticeSupport } from "@/LutExport";
import { encodingLabel } from "@/engine/GradingEngine";
import type { FidelityResult, GradingEngine } from "@/engine/GradingEngine";
import { useGraph } from "@/graphStore";
import { nodeTitle } from "@/nodeTitles";

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
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="panel-bar">
        <h2>Inspector</h2>
        <span>02</span>
      </div>
      <div className="inspector-body">
        <div className="selected-node">
          <span className="node-symbol">±</span>
          <div>
            <h3>{nodeTitle(selected) || "Select a node"}</h3>
            <p>
              {selected?.type === "exposure"
                ? "Linear light adjustment"
                : "RGB grading graph"}
            </p>
          </div>
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
        <div className="space-info">
          <span className="eyebrow">COLOUR PIPELINE</span>
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
        </div>
        <p className="encoding-note">
          Source tag: {encodingLabel(graph.colour.input)}. Full-range code
          values; embedded profiles are not applied. Correct the input tag to
          match your source. Retagging does not restore highlight range.
          <br />
          Viewer conversion is sRGB only; output pixels keep the chosen output
          encoding.
        </p>
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
