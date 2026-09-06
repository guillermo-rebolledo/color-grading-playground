import type { RefObject } from "react";
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
  return (
    <>
      <div className="panel-bar">
        <h1>Viewer</h1>
        <span>
          {image
            ? "Display: sRGB · Rec.709 primaries"
            : "Start with a still image"}
        </span>
      </div>
      <div className="viewer-toolbar">
        <label>
          Compare{" "}
          <select
            aria-label="Compare view"
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
          <button
            key={slot}
            disabled={!image || !!graphError || !!capabilityError}
            onClick={() => onCapture(slot)}
          >
            Capture {slot}
          </button>
        ))}
        <button
          disabled={!image}
          aria-pressed={outOfRange}
          onClick={() => onOutOfRange(!outOfRange)}
        >
          Out-of-range
        </button>
        <span>
          {comparison !== "off"
            ? `${comparison === "before" ? "Before" : `Snapshot ${comparison}`} ← wipe → `
            : ""}
          {solo
            ? `Solo: ${nodeTitle(graph.nodes.find((n) => n.id === solo)) || solo}`
            : "Current grade"}
        </span>
      </div>
      {outOfRange && (
        <p className="viewer-legend">
          Blue: below 0 · Orange: above 1 · Magenta: both. Any RGB channel
          before output clamping, in output encoding (solo: node encoding).
          Masks excluded.
        </p>
      )}
      <div className={`viewer ${image ? "has-image" : ""}`} aria-busy={loading}>
        <ViewerNavigation
          width={image?.width ?? 1}
          height={image?.height ?? 1}
          comparison={!!image && comparison !== "off"}
          wipe={wipe}
          onWipe={onWipe}
        >
          <canvas
            ref={canvas}
            aria-label="Graded image preview"
            className={image ? "" : "empty-canvas"}
          />
          {fidelityOverlay &&
            image &&
            !capabilityError &&
            engine()?.isFidelityCurrent(fidelityOverlay, graph) && (
              <FidelityOverlay report={fidelityOverlay} />
            )}
        </ViewerNavigation>
        {!image && !capabilityError && (
          <div className="empty-state">
            <div className="empty-frame" aria-hidden="true">
              <span>＋</span>
            </div>
            <span className="eyebrow">YOUR IMAGE. YOUR DEVICE.</span>
            <h2>A little light changes everything.</h2>
            <p>
              Drop a still here and find its exposure.
              <br />
              JPEG, PNG and uncompressed RGB TIFF. Your image stays in this
              browser.
            </p>
            <button className="primary-button" onClick={onChooseImage}>
              Choose an image <span aria-hidden="true">↗</span>
            </button>
            <span className="file-hint">JPEG or PNG · up to 50 MB</span>
          </div>
        )}
        {graphicsWarning && (
          <p role="status" className="encoding-note">
            {graphicsWarning}
          </p>
        )}
        {capabilityError && (
          <UnsupportedDevice
            inline
            heading="Preview unavailable"
            detail={capabilityError}
            action={
              <button onClick={onRetryGraphics}>Retry graphics recovery</button>
            }
          />
        )}
        {image && (graphError || renderError) && (
          <div className="preview-paused" role="alert">
            Preview paused: {graphError || renderError}
            <br />
            {graphError ? (
              "Connect a valid graph to resume."
            ) : (
              <button onClick={onRetryPreview}>Retry preview</button>
            )}
          </div>
        )}
        {loading && (
          <div className="loading-indicator" role="status">
            Opening image…
          </div>
        )}
      </div>
      <div className="image-bar">
        <span className="image-name">{image?.name ?? "No image loaded"}</span>
        <span>
          {image
            ? `${image.originalWidth} × ${image.originalHeight}`
            : "All processing stays on your device"}
        </span>
        {image && (
          <span>
            Preview {image.width} × {image.height}
          </span>
        )}
      </div>
    </>
  );
}
