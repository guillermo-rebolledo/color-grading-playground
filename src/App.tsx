import { useEffect, useRef, useState } from "react";
import { GradingEngine } from "./engine/GradingEngine";
import { loadImage } from "./engine/loadImage";
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
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
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
          }}
          onBlur={() => {
            editing.current = false;
            commit();
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
  const [stops, setStops] = useState(0);
  const stopsRef = useRef(stops);
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
    stopsRef.current = stops;
    if (image && engine.current && !capabilityError) {
      const frame = requestAnimationFrame(() => {
        try {
          engine.current?.render(stops);
        } catch (cause) {
          setCapabilityError(message(cause));
        }
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [stops, image, capabilityError]);

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
        engine.current.render(stopsRef.current);
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
  const disabled = !image || !!capabilityError;
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
              {image ? "sRGB · Rec.709 primaries" : "Start with a still image"}
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
                <span className="file-hint">
                  JPEG or PNG · sRGB · up to 50 MB
                </span>
              </div>
            )}
            {capabilityError && (
              <div className="capability-error" role="alert">
                <h2>Preview unavailable</h2>
                <p>{capabilityError}</p>
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
                <h3>Exposure</h3>
                <p>Linear light adjustment</p>
              </div>
            </div>
            <ExposureControl
              value={stops}
              disabled={disabled}
              onChange={setStops}
            />
            <div className="space-info">
              <span className="eyebrow">COLOUR PIPELINE</span>
              <dl>
                <div>
                  <dt>Input</dt>
                  <dd>sRGB</dd>
                </div>
                <div>
                  <dt>Working</dt>
                  <dd>Linear Rec.709</dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd>sRGB · clamped</dd>
                </div>
              </dl>
            </div>
            <p className="encoding-note">
              This preview treats your image as sRGB. Use an sRGB still for
              accurate colour.
            </p>
          </div>
          <div className="inspector-footer">
            A simple place to start.
            <br />
            <span>One image. One adjustment.</span>
          </div>
        </aside>
      </section>

      <section className="graph-panel" aria-label="Fixed grading pipeline">
        <div className="panel-bar">
          <h2>Pipeline</h2>
          <span>Source → Exposure → Output</span>
          <span className="fixed-label">Fixed graph</span>
        </div>
        <div className="graph-canvas">
          <div className="graph-node">
            <div className="node-top">
              <span className="node-symbol">▧</span>
              <h3>Source</h3>
              <span>01</span>
            </div>
            <p>{image ? "sRGB image" : "Waiting for image"}</p>
            <i className="port output" />
          </div>
          <div className="edge" aria-hidden="true" />
          <div className="graph-node active">
            <i className="port input" />
            <div className="node-top">
              <span className="node-symbol">±</span>
              <h3>Exposure</h3>
              <span>02</span>
            </div>
            <p>
              {stops >= 0 ? "+" : ""}
              {stops.toFixed(2)} <span>stops</span>
            </p>
            <i className="port output" />
          </div>
          <div className="edge" aria-hidden="true" />
          <div className="graph-node">
            <i className="port input" />
            <div className="node-top">
              <span className="node-symbol">↗</span>
              <h3>Output</h3>
              <span>03</span>
            </div>
            <p>sRGB display</p>
          </div>
        </div>
      </section>
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
