import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { UnsupportedDevice } from "@/components/UnsupportedDevice";
import { FidelityOverlay } from "@/FidelityOverlay";
import { ViewerNavigation } from "@/ViewerNavigation";
import { nodeTitle } from "@/nodeTitles";
import type { ImageInfo } from "@/imageInfo";
import type {
  FidelityResult,
  GradingEngine,
  GradingGraph,
} from "@/engine/GradingEngine";

export type Comparison = "off" | "before" | "A" | "B";

/** The image and the tools for judging it: the title bar, the compare and
 * out-of-range toolbar, the preview surface with its overlays, and the image
 * bar carrying provenance.
 *
 * The region's rows are returned unwrapped: the stage wraps them in the viewer
 * region, and an extra element would change how the viewer takes its height. */
export function ViewerPanel({
  canvas,
  engine,
  image,
  graph,
  solo,
  comparison,
  onComparison,
  snapshots,
  onCapture,
  wipe,
  onWipe,
  outOfRange,
  onOutOfRange,
  loading,
  capabilityError,
  graphError,
  renderError,
  graphicsWarning,
  fidelityOverlay,
  onRetryGraphics,
  onRetryPreview,
  onChooseImage,
}: {
  canvas: RefObject<HTMLCanvasElement | null>;
  engine: () => GradingEngine | null;
  image: ImageInfo | null;
  graph: GradingGraph;
  solo: string | null;
  comparison: Comparison;
  onComparison: (comparison: Comparison) => void;
  snapshots: { A?: GradingGraph; B?: GradingGraph };
  onCapture: (slot: "A" | "B") => void;
  wipe: number;
  onWipe: (wipe: number) => void;
  outOfRange: boolean;
  onOutOfRange: (outOfRange: boolean) => void;
  loading: boolean;
  capabilityError: string;
  graphError: string | null;
  renderError: string;
  graphicsWarning: string;
  fidelityOverlay: FidelityResult | null;
  onRetryGraphics: () => void;
  onRetryPreview: () => void;
  onChooseImage: () => void;
}) {
  // Keep zoom/pan state beside its image surface while placing its controls
  // in the judging toolbar. The portal preserves their existing names and events.
  const [navigationHost, setNavigationHost] = useState<HTMLDivElement | null>(
    null,
  );
  const shown = `${comparison !== "off" ? `${comparison === "before" ? "Before" : `Snapshot ${comparison}`} ← wipe → ` : ""}${solo ? `Solo: ${nodeTitle(graph.nodes.find((node) => node.id === solo)) || solo}` : "Current grade"}`;
  return (
    <>
      <div className="flex h-[26px] shrink-0 items-center gap-4 border-0 border-b border-solid border-border bg-card px-3 text-[11px] text-muted-foreground">
        <h1 className="m-0 text-[13px] font-medium text-foreground">Viewer</h1>
        <span>
          {image
            ? "Display: sRGB · Rec.709 primaries"
            : "Start with a still image"}
        </span>
        {image && (
          <span className="font-mono tabular-nums">
            Preview {image.width} × {image.height}
          </span>
        )}
        {loading && (
          <span className="ml-auto" role="status">
            Opening image…
          </span>
        )}
      </div>
      <div className="viewer-toolbar flex min-h-7 flex-wrap py-1 shrink-0 items-center gap-1.5 border-0 border-b border-solid border-border bg-card px-3 text-[11px]">
        <label className="flex shrink-0 items-center gap-1.5">
          Compare{" "}
          <select
            className="h-5 max-w-32 px-1 text-[11px]"
            aria-label="Compare view"
            title="Compare Before or a captured grade on the left with the current view on the right. Drag the divider."
            value={comparison}
            disabled={!image}
            onChange={(event) => {
              const mode = event.target.value;
              if (
                mode === "off" ||
                mode === "before" ||
                mode === "A" ||
                mode === "B"
              )
                onComparison(mode);
            }}
          >
            <option value="off">Off</option>
            <option value="before">Before / current</option>
            <option value="A" disabled={!snapshots.A}>
              A / current
            </option>
            <option value="B" disabled={!snapshots.B}>
              B / current
            </option>
          </select>
        </label>
        {(["A", "B"] as const).map((slot) => (
          <Button
            size="toolbar"
            key={slot}
            disabled={!image || !!graphError || !!capabilityError}
            title={`Capture grade settings in snapshot ${slot}. Capturing again replaces this slot; no image file is saved.`}
            onClick={() => onCapture(slot)}
          >
            Capture {slot}
          </Button>
        ))}
        <Button
          size="toolbar"
          disabled={!image}
          aria-pressed={outOfRange}
          onClick={() => onOutOfRange(!outOfRange)}
        >
          Out-of-range
        </Button>
        <span
          className="min-w-0 flex-1 truncate text-muted-foreground"
          title={shown}
        >
          {shown}
        </span>
        <div ref={setNavigationHost} className="ml-auto shrink-0" />
      </div>
      {outOfRange && (
        <p className="m-0 shrink-0 bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
          Blue: below 0 · Orange: above 1 · Magenta: both. Any RGB channel
          before output clamping, in output encoding (solo: node encoding).
          Masks excluded.
        </p>
      )}
      <div
        className="viewer relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface-void p-4"
        aria-busy={loading}
      >
        <ViewerNavigation
          navigationHost={navigationHost}
          width={image?.width ?? 1}
          height={image?.height ?? 1}
          comparison={!!image && comparison !== "off"}
          wipe={wipe}
          onWipe={onWipe}
        >
          <canvas
            ref={canvas}
            aria-label="Graded image preview"
            className={
              image
                ? "block h-full w-full"
                : "empty-canvas invisible absolute h-0 w-0"
            }
          />
          {fidelityOverlay &&
            image &&
            !capabilityError &&
            engine()?.isFidelityCurrent(fidelityOverlay, graph) && (
              <FidelityOverlay report={fidelityOverlay} />
            )}
        </ViewerNavigation>
        {solo && (
          <span className="absolute left-4 top-3 border border-solid border-primary bg-surface-void px-1.5 py-1 text-[10px] font-medium tracking-wider">
            SOLO
          </span>
        )}
        {!image && !capabilityError && (
          <div className="relative px-4 text-center">
            <div
              className="mx-auto mb-4 grid h-10 w-12 place-items-center border border-solid border-line-strong text-xl text-muted-foreground"
              aria-hidden="true"
            >
              <span>＋</span>
            </div>
            <span className="text-[10px] tracking-[2px] text-text-faint">
              YOUR IMAGE. YOUR DEVICE.
            </span>
            <h2 className="my-3 text-lg font-medium">
              A little light changes everything.
            </h2>
            <p className="mb-4 mt-0 text-xs leading-relaxed text-muted-foreground">
              Drop a still here and find its exposure.
              <br />
              JPEG, PNG and uncompressed RGB TIFF. Your image stays in this
              browser.
            </p>
            <Button size="body" onClick={onChooseImage}>
              Choose an image <span aria-hidden="true">↗</span>
            </Button>
            <span className="mt-3 block text-[10px] text-text-faint">
              JPEG, PNG or RGB TIFF · up to 50 MB
            </span>
          </div>
        )}
        {graphicsWarning && (
          <p
            role="status"
            className="absolute bottom-3 mx-4 border border-solid border-border bg-card px-3 py-1.5 text-[11px] text-warning"
          >
            {graphicsWarning}
          </p>
        )}
        {capabilityError && (
          <UnsupportedDevice
            inline
            heading="Preview unavailable"
            detail={capabilityError}
            action={
              <Button size="toolbar" onClick={onRetryGraphics}>
                Retry graphics recovery
              </Button>
            }
          />
        )}
        {image && (graphError || renderError) && (
          <div
            className="absolute inset-0 grid content-center bg-background/95 p-6 text-center text-xs leading-relaxed text-destructive"
            role="alert"
          >
            Preview paused: {graphError || renderError}
            <br />
            {graphError ? (
              "Check the connection named above, or use Undo to restore the previous graph."
            ) : (
              <Button size="toolbar" onClick={onRetryPreview}>
                Retry preview
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="flex h-6 shrink-0 items-center gap-4 border-0 border-t border-solid border-border bg-card px-3 text-[10px] text-muted-foreground">
        <span className="mr-auto min-w-0 truncate">
          {image?.name ?? "No image loaded"}
        </span>
        <span className="shrink-0 font-mono tabular-nums">
          {image
            ? `${image.originalWidth} × ${image.originalHeight}`
            : "All processing stays on your device"}
        </span>
      </div>
    </>
  );
}
