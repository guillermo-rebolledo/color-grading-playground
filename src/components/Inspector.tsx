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
    <aside
      className="inspector flex min-h-0 flex-col border-0 border-l border-solid border-border bg-card [contain:size]"
      aria-label="Inspector"
    >
      <div className="flex h-9 shrink-0 items-center border-0 border-b border-solid border-border px-4">
        <h2 className="m-0 text-[13px] font-medium">Inspector</h2>
      </div>
      <div className="inspector-body min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-6">
          <div>
            <h3 className="m-0 text-base font-medium">
              {nodeTitle(selected) || "Select a node"}
            </h3>
            <p className="mt-1 mb-0 text-xs text-muted-foreground">
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
        <details className="mt-6 border-0 border-t border-solid border-border pt-3">
          <summary className="cursor-pointer py-2 text-[13px] font-medium">
            Colour pipeline
            <span className="mt-1 block truncate text-[11px] font-normal text-muted-foreground">
              Input: {encodingLabel(graph.colour.input)}
            </span>
          </summary>
          <div className="space-y-3">
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
        </details>
        <details className="mt-3 border-0 border-t border-solid border-border pt-3">
          <summary className="cursor-pointer py-2 text-[13px] font-medium">
            Export LUT
            <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
              Save your grade as a .cube file
            </span>
          </summary>
          <LutExport
            hasImage={hasImage}
            onOverlay={onOverlay}
            engine={engine}
            support={
              capabilityError ? { reason: capabilityError } : latticeSupport
            }
          />
        </details>
        <details className="mt-3 border-0 border-t border-solid border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          <summary className="cursor-pointer py-2 text-[13px] text-foreground">
            Getting started
          </summary>
          <ol className="space-y-3 pl-4">
            <li>
              Open an image or choose a sample. Samples set the input colour
              settings for you.
            </li>
            <li>
              Select a node in the graph and adjust its controls here. Start
              with Exposure.
            </li>
            <li>
              Use Compare in the viewer to judge your changes. Undo brings back
              the previous adjustment.
            </li>
          </ol>
          <p>
            Build a grade, one connection at a time. Your edits are reversible.
          </p>
          <p>
            Every adjustment depends only on a pixel’s colour—the kind of change
            a 3D LUT can represent.
          </p>
        </details>
      </div>
    </aside>
  );
}
