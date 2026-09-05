import { AdjustmentControls } from "./AdjustmentControls";
import { EncodingControl } from "./EncodingControl";
import { useEffect, useRef, useState } from "react";
import { GradingEngine, encodingLabel } from "./engine/GradingEngine";
import { loadImage } from "./engine/loadImage";
import { createLogChart, isLogChart, logCharts } from "./logCharts";
import { useGraph } from "./graphStore";
import { GraphEditor } from "./GraphEditor";
import "./styles.css";

type ImageInfo = {
  name: string;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
};

function ExposureControl({
  value,
  disabled,
  onChange,
  onBegin,
  onEnd,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onBegin: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState(value.toFixed(2));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value.toFixed(2));
  }, [value]);
  function commit() {
    const parsed = Number(draft);
    if (draft.trim() && Number.isFinite(parsed))
      onChange(Math.max(-6, Math.min(6, parsed)));
    setDraft(
      (draft.trim() && Number.isFinite(parsed)
        ? Math.max(-6, Math.min(6, parsed))
        : value
      ).toFixed(2),
    );
  }
  return (
    <div className="exposure-control">
      <div className="control-heading">
        <label htmlFor="exposure">Exposure</label>
        <button
          className="text-button"
          disabled={disabled}
          onClick={() => onChange(0)}
          aria-label="Reset exposure"
        >
          Reset ↺
        </button>
      </div>
      <div
        className="numeric-control"
        onDoubleClick={() => {
          if (!disabled) {
            onChange(0);
            setDraft("0.00");
          }
        }}
      >
        <input
          id="exposure"
          aria-label="Exposure in stops"
          type="number"
          min="-6"
          max="6"
          step="0.01"
          disabled={disabled}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = event.target.valueAsNumber;
            if (Number.isFinite(parsed) && parsed >= -6 && parsed <= 6)
              onChange(parsed);
          }}
          onFocus={() => {
            editing.current = true;
            onBegin();
          }}
          onBlur={() => {
            editing.current = false;
            commit();
            onEnd();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit();
              event.currentTarget.blur();
            }
          }}
        />
        <span>stops</span>
      </div>
      <input
        aria-label="Scrub exposure"
        type="range"
        min="-6"
        max="6"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onBegin();
        }}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onLostPointerCapture={onEnd}
        onKeyDown={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            onBegin();
        }}
        onKeyUp={onEnd}
        onBlur={onEnd}
        onDoubleClick={() => onChange(0)}
      />
      <div className="range-labels">
        <span>−6</span>
        <span>0</span>
        <span>+6</span>
      </div>
      <p className="control-help">
        One stop doubles or halves the light.
        <br />
        Double-click a control to reset.
      </p>
    </div>
  );
}

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GradingEngine | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [image, setImage] = useState<ImageInfo | null>(null);
  const graphState = useGraph();
  const { graph } = graphState;
  const selected = graph.nodes.find((n) => n.selected);
  const graphError = GradingEngine.validate(graph);
  const [renderError, setRenderError] = useState("");
  const [error, setError] = useState("");
  const [capabilityError, setCapabilityError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const element = canvas.current!;
    try {
      engine.current = new GradingEngine(element);
    } catch (cause) {
      setCapabilityError(message(cause));
    }
    const lost = (event: Event) => {
      event.preventDefault();
      setCapabilityError(
        "The graphics connection was lost. Reload this page to continue.",
      );
    };
    element.addEventListener("webglcontextlost", lost);
    return () => {
      request.current++;
      engine.current?.dispose();
      engine.current = null;
      element.removeEventListener("webglcontextlost", lost);
    };
  }, []);

  useEffect(() => {
    if (image && engine.current && !capabilityError && !graphError) {
      const frame = requestAnimationFrame(() => {
        try {
          engine.current?.render(graph);
          setRenderError("");
        } catch (cause) {
          setRenderError(message(cause));
        }
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [graph, graphError, image, capabilityError]);

  async function openFile(file: File | undefined) {
    if (!file || !engine.current || capabilityError) return;
    const current = ++request.current;
    setError("");
    setLoading(true);
    try {
      const loaded = await loadImage(file);
      try {
        if (current !== request.current || !engine.current) return;
        engine.current.setImage(loaded.bitmap);
        const currentGraph = useGraph.getState().graph;
        if (!GradingEngine.validate(currentGraph))
          engine.current.render(currentGraph);

        setImage({
          name: loaded.name,
          originalWidth: loaded.originalWidth,
          originalHeight: loaded.originalHeight,
          width: loaded.bitmap.width,
          height: loaded.bitmap.height,
        });
      } finally {
        loaded.bitmap.close();
      }
    } catch (cause) {
      if (current === request.current) setError(message(cause));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  function openChart(profile: keyof typeof logCharts) {
    if (!engine.current || capabilityError) return;
    ++request.current;
    setLoading(false);
    setError("");
    try {
      const chart = createLogChart(profile);
      engine.current.setImage(chart);
      const state = useGraph.getState();
      state.updateColour({
        ...state.graph.colour,
        input: { ...logCharts[profile].encoding },
      });
      setImage({
        name: `${logCharts[profile].name} · synthetic precision chart`,
        originalWidth: chart.width,
        originalHeight: chart.height,
        width: chart.width,
        height: chart.height,
      });
    } catch (cause) {
      setError(message(cause));
    }
  }
  const disabled = !!capabilityError;
  return (
    <main
      className="app-shell"
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void openFile(event.dataTransfer.files[0]);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            c<span>g</span>
          </span>
          <div>
            Color Grading<span className="brand-subtitle">PLAYGROUND</span>
          </div>
        </div>
        <div className="local-label">
          <span className="status-dot" />
          Local workspace
        </div>
        <button
          className="upload-button"
          disabled={!!capabilityError}
          onClick={() => fileInput.current?.click()}
        >
          <span aria-hidden="true">＋</span> Open image
        </button>
        <select
          aria-label="Load precision chart"
          className="chart-select"
          value=""
          disabled={disabled}
          onChange={(event) => {
            const profile = event.target.value;
            if (isLogChart(profile)) openChart(profile);
          }}
        >
          <option value="" disabled>
            Load precision chart
          </option>
          {Object.entries(logCharts).map(([key, chart]) => (
            <option key={key} value={key}>
              {chart.name}
            </option>
          ))}
        </select>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Choose image"
          onChange={(event) => {
            void openFile(event.target.files?.[0]);
            event.target.value = "";
          }}
          disabled={!!capabilityError}
        />
      </header>

      <section className="workspace">
        <div className="viewer-column">
          <div className="panel-bar">
            <h1>Viewer</h1>
            <span>
              {image
                ? "Display: sRGB · Rec.709 primaries"
                : "Start with a still image"}
            </span>
            <span className="view-mode">Fit</span>
          </div>
          <div
            className={`viewer ${image ? "has-image" : ""}`}
            aria-busy={loading}
          >
            <div className="image-frame">
              <canvas
                ref={canvas}
                aria-label="Graded image preview"
                className={image ? "" : "empty-canvas"}
              />
            </div>
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
                  Your image stays in this browser.
                </p>
                <button
                  className="primary-button"
                  onClick={() => fileInput.current?.click()}
                >
                  Choose an image <span aria-hidden="true">↗</span>
                </button>
                <span className="file-hint">JPEG or PNG · up to 50 MB</span>
              </div>
            )}
            {capabilityError && (
              <div className="capability-error" role="alert">
                <h2>Preview unavailable</h2>
                <p>{capabilityError}</p>
              </div>
            )}
            {image && (graphError || renderError) && (
              <div className="preview-paused" role="alert">
                Preview paused: {graphError || renderError}
                <br />
                Connect a valid graph to resume.
              </div>
            )}
            {loading && (
              <div className="loading-indicator" role="status">
                Opening image…
              </div>
            )}
          </div>
          <div className="image-bar">
            <span className="image-name">
              {image?.name ?? "No image loaded"}
            </span>
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
          {error && (
            <div className="file-error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
        </div>

        <aside className="inspector">
          <div className="panel-bar">
            <h2>Inspector</h2>
            <span>02</span>
          </div>
          <div className="inspector-body">
            <div className="selected-node">
              <span className="node-symbol">±</span>
              <div>
                <h3>
                  {selected
                    ? selected.type === "cdl"
                      ? "CDL"
                      : selected.type === "cst"
                        ? "Colour Space Transform"
                        : selected.type[0].toUpperCase() +
                          selected.type.slice(1)
                    : "Select a node"}
                </h3>
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
                disabled={disabled}
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
                <select
                  aria-label="Output range"
                  value={selected.data.clamp ?? "clamp"}
                  onChange={(event) =>
                    graphState.updateParameters(selected.id, {
                      clamp:
                        event.target.value === "unbounded"
                          ? "unbounded"
                          : "clamp",
                    })
                  }
                >
                  <option value="clamp">Clamp to 0–1</option>
                  <option value="unbounded">Allow out-of-range</option>
                </select>
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
              values; embedded profiles are not applied. Correct the input tag
              to match your source. Retagging does not restore highlight range.
              <br />
              Viewer conversion is sRGB only; output pixels keep the chosen
              output encoding.
            </p>
          </div>
          <div className="inspector-footer">
            Build a grade, one connection at a time.
            <br />
            <span>Your edits are reversible.</span>
          </div>
        </aside>
      </section>

      <GraphEditor />
      <footer className="footer">
        <span>Colour, one pixel at a time.</span>
        <p>
          Every adjustment depends only on a pixel’s colour—the kind of change a
          3D LUT can represent.
        </p>
        <span>JPEG / PNG</span>
      </footer>
      {dragging && !capabilityError && (
        <div className="drop-overlay">
          <span>Drop your image to open</span>
        </div>
      )}
    </main>
  );
}

function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Something went wrong while opening the image.";
}
