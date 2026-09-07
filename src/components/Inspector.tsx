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
  source: "Interpret the image’s RGB values",
  exposure: "Brighten or darken in stops",
  cst: "Colour Space Transform (CST)",
  cdl: "Shape tone and colour with CDL",
  contrast: "Contrast around a tonal pivot",
  saturation: "Saturation and selective vibrance",
  whiteBalance: "Source-relative temperature and tint",
  curves: "Master and per-channel tone curves",
  qualifier: "Select colours to create a mask",
  blend: "Mix two grades, optionally through a mask",
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
      <div className="flex h-[26px] shrink-0 items-center justify-between gap-3 border-b border-border px-3 text-[11px] text-muted-foreground">
        <h2 className="text-[13px] font-medium text-foreground">Inspector</h2>
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
          <p>
            {selected
              ? descriptions[selected.type]
              : "Select a graph node to edit its controls"}
          </p>
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
        {selected?.type === "cst" && (
          <details className="control-help">
            <summary className="cursor-pointer">About CST</summary>
            <p>
              Convert RGB values from one encoding to another. Set From to the
              incoming branch’s encoding and To to the encoding you want next.
              This converts values; changing the source input tag only changes
              how the original values are interpreted.
            </p>
          </details>
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
        <Accordion type="single" collapsible className="pipeline-section">
          <AccordionItem value="pipeline">
            <AccordionTrigger
              aria-label="Colour pipeline"
              className="h-auto min-h-10 py-2"
            >
              <span>
                Colour pipeline
                <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                  Input: {encodingLabel(graph.colour.input)}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent forceMount>
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
                Input describes how the source image’s RGB values are encoded.
                Match it to your source; changing the tag does not restore
                clipped highlights. Full-range code values are assumed; embedded
                profiles are not applied.
              </p>
              <p className="encoding-note">
                Working is the colour space used after the Source node converts
                the input. A CST can change the encoding within a branch. Output
                is the encoding produced by the Output node and the exported
                LUT.
              </p>
              <p className="encoding-note">
                Transfer describes the light-to-code curve, such as linear or
                log. Primaries / white defines the RGB gamut and white point.
              </p>
              <p className="encoding-note">
                Display preview: the viewer converts to sRGB for display. This
                does not change the selected output encoding or the LUT.
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
              Use Compare → Before / current to see the image without grading
              adjustments on the left and your current view on the right. Drag
              the divider to compare. Colour pipeline settings and output range
              still apply to Before.
            </li>
          </ol>
          <p>
            Capture A or B keeps a snapshot of the current grade settings for
            comparison on this image. Choose A / current or B / current in
            Compare. Capturing again replaces that slot; it does not save an
            image or download a file. Undo restores previous grading edits.
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
