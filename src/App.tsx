import { Scopes } from "./Scopes";
import { createShareLink, readSharedProject } from "./sharedProject";
import {
  parseProject,
  restoreProject,
  saveProject,
  type ProjectSource,
} from "./projects";
import { SamplePicker, SampleProvenance } from "./SamplePicker";
import { samples, type Sample } from "./samples";
import { offlineStatusText, sampleLoadError, useOffline } from "./offline";
import { AdjustmentControls } from "./AdjustmentControls";
import { EncodingControl } from "./EncodingControl";
import { useEffect, useRef, useState } from "react";
import { FidelityOverlay } from "./FidelityOverlay";
import type { FidelityResult } from "./engine/GradingEngine";
import { GradingEngine, encodingLabel } from "./engine/GradingEngine";
import { loadImage } from "./engine/loadImage";
import { createLogChart, isLogChart, logCharts } from "./logCharts";
import { useGraph } from "./graphStore";
import { GraphEditor } from "./GraphEditor";
import { nodeTitle } from "./nodeTitles";
import { ViewerNavigation } from "./ViewerNavigation";
import { LutExport, OutputRangeSelect, type LatticeSupport } from "./LutExport";
import type { GradingGraph } from "./engine/GradingEngine";
import "./styles.css";

type ImageInfo = {
  name: string;
  sample?: Sample;
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
  const [fidelityOverlay, setFidelityOverlay] = useState<FidelityResult | null>(
    null,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const imageFile = useRef<File | null>(null);
  const [source, setSource] = useState<ProjectSource | null>(null);
  const [ready, setReady] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [projectStatus, setProjectStatus] = useState(
    "Opening local workspace…",
  );
  const [projectError, setProjectError] = useState("");
  const [image, setImage] = useState<ImageInfo | null>(null);
  const graphState = useGraph();
  const { graph } = graphState;
  const solo = graph.nodes.some((n) => n.id === graphState.solo)
    ? graphState.solo
    : null;
  const [comparison, setComparison] = useState<"off" | "before" | "A" | "B">(
    "off",
  );
  const [snapshots, setSnapshots] = useState<{
    A?: GradingGraph;
    B?: GradingGraph;
  }>({});
  const [wipe, setWipe] = useState(0.5);
  const [outOfRange, setOutOfRange] = useState(false);
  useEffect(() => {
    if (graphState.solo && !solo) useGraph.setState({ solo: null });
  }, [graphState.solo, solo]);
  const selected = graph.nodes.find((n) => n.selected);
  const graphError = GradingEngine.validate(graph);
  const [renderError, setRenderError] = useState("");
  const [graphicsRevision, setGraphicsRevision] = useState(0);
  const [graphicsWarning, setGraphicsWarning] = useState("");
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    setInteractive(!!graphState.transaction);
    if (!graphState.transaction) return;
    const idle = window.setTimeout(() => setInteractive(false), 80);
    return () => window.clearTimeout(idle);
  }, [graph, graphState.transaction]);
  const [error, setError] = useState("");
  const [capabilityError, setCapabilityError] = useState("");
  const [latticeSupport, setLatticeSupport] = useState<LatticeSupport | null>(
    null,
  );
  const [showSamples, setShowSamples] = useState(false);
  const offline = useOffline();
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  function refreshGraphics() {
    try {
      setGraphicsWarning(engine.current!.compatibilityWarnings().join(" "));
      setCapabilityError("");
      setRenderError("");
      setFidelityOverlay(null);
      setGraphicsRevision((revision) => revision + 1);
      try {
        setLatticeSupport(engine.current!.latticeSupport());
      } catch (cause) {
        setLatticeSupport({ reason: message(cause) });
      }
    } catch (cause) {
      setCapabilityError(message(cause));
    }
  }

  useEffect(() => {
    const element = canvas.current!;
    try {
      engine.current = new GradingEngine(element);
      refreshGraphics();
    } catch (cause) {
      setCapabilityError(message(cause));
    }
    const lost = (event: Event) => {
      event.preventDefault();
      setFidelityOverlay(null);
      setLatticeSupport(null);
      setCapabilityError(
        "The graphics connection was lost. Waiting for automatic restoration; your editable graph is safe.",
      );
    };
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    // Native event dispatch may run microtasks between listeners. A later task
    // lets engine restoration finish even when the engine was created by Retry.
    const restored = () => {
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(refreshGraphics, 0);
    };
    element.addEventListener("webglcontextlost", lost);
    element.addEventListener("webglcontextrestored", restored);
    return () => {
      request.current++;
      engine.current?.dispose();
      engine.current = null;
      element.removeEventListener("webglcontextlost", lost);
      element.removeEventListener("webglcontextrestored", restored);
      clearTimeout(recoveryTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let generation = 0;
    async function restore() {
      const current = ++generation;
      const isCurrent = () => active && current === generation;
      setReady(false);
      try {
        const shared = location.hash.startsWith("#project=");
        const saved = shared
          ? { project: readSharedProject(location.hash), image: null }
          : await restoreProject();
        // Keep initialization asynchronous even for links so StrictMode cleanup runs first.
        await Promise.resolve();
        if (!isCurrent()) return;
        if (saved) {
          ++request.current;
          setImage(null);
          imageFile.current = null;
          setComparison("off");
          setSnapshots({});
          setError("");
          setProjectError("");
          if (shared)
            history.replaceState(null, "", location.pathname + location.search);
          useGraph.getState().restore(saved.project.graph);
          setSource(saved.project.source);
          const source = saved.project.source;
          let loaded = true;
          if (source?.kind === "upload")
            loaded =
              !!saved.image && (await openFile(saved.image, undefined, true));
          if (source?.kind === "sample") {
            const sample = samples.find((sample) => sample.id === source.id);
            loaded = !!sample && (await openFile(undefined, sample, true));
          }
          if (source?.kind === "chart") {
            loaded = isLogChart(source.id);
            if (loaded && isLogChart(source.id)) openChart(source.id, true);
          }
          if (!isCurrent()) return;
          if (!loaded)
            setProjectError(
              source?.kind === "sample" && !navigator.onLine
                ? `Source “${source.name}” is not stored on this device. Reconnect to load it, or choose a stored sample; the restored grade and source tags are preserved.`
                : `Source “${source?.name}” is unavailable. Upload your own image or choose a sample; the restored grade and source tags are preserved.`,
            );
          setProjectStatus(
            shared
              ? "Shared grade opened. Save to keep it on this device."
              : "Restored from this device",
          );
        } else setProjectStatus("Save your project to resume on this device.");
      } catch (cause) {
        if (isCurrent()) {
          setProjectError(message(cause));
          setProjectStatus("Project was not restored.");
        }
      } finally {
        if (isCurrent()) setReady(true);
      }
    }
    void restore();
    const followLink = () => {
      if (location.hash.startsWith("#project=")) void restore();
    };
    window.addEventListener("hashchange", followLink);
    return () => {
      active = false;
      window.removeEventListener("hashchange", followLink);
    };
  }, []);

  function currentProject() {
    const graph = useGraph.getState().graph;
    return parseProject({
      version: 1,
      graph,
      source: source ? { ...source, encoding: graph.colour.input } : null,
    });
  }

  function share() {
    try {
      setShareLink(createShareLink(currentProject()));
      setProjectError("");
    } catch (cause) {
      setProjectError(message(cause));
    }
  }

  useEffect(() => {
    setShareLink("");
  }, [graph, source]);

  async function save() {
    setSaving(true);
    setProjectError("");
    try {
      await saveProject(currentProject(), imageFile.current);
      setProjectStatus("Saved on this device. Save again after editing.");
    } catch (cause) {
      setProjectError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (image && engine.current && !capabilityError && !graphError) {
      const frame = requestAnimationFrame(() => {
        try {
          engine.current?.renderViewer(graph, {
            interactive,
            solo: solo ?? undefined,
            before: comparison === "before",
            snapshot:
              comparison === "A"
                ? snapshots.A
                : comparison === "B"
                  ? snapshots.B
                  : undefined,
            wipe,
            outOfRange,
          });
          setRenderError("");
        } catch (cause) {
          setRenderError(message(cause));
        }
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [
    interactive,
    graphicsRevision,
    graph,
    graphError,
    image,
    capabilityError,
    solo,
    comparison,
    snapshots,
    wipe,
    outOfRange,
  ]);

  async function openFile(
    file: File | undefined,
    sample?: Sample,
    restoring = false,
  ): Promise<boolean> {
    if ((!file && !sample) || !engine.current || capabilityError) return false;
    const current = ++request.current;
    setError("");
    setLoading(true);
    try {
      if (sample) {
        let response: Response | null = null;
        try {
          response = await fetch(`/samples/${sample.file}`);
        } catch {
          // Without a service worker an offline fetch rejects instead of 503.
        }
        if (!response?.ok)
          throw new Error(sampleLoadError(sample.title, response));
        file = new File([await response.blob()], sample.file);
      }
      const loaded = await loadImage(file!);
      try {
        if (current !== request.current || !engine.current) return false;
        engine.current.setImage(loaded.bitmap);
        const state = useGraph.getState();
        if (sample && !restoring)
          state.updateColour({ ...state.graph.colour, input: sample.encoding });

        if (!restoring) setProjectError("");
        imageFile.current = sample ? null : file!;
        if (!restoring)
          setSource({
            kind: sample ? "sample" : "upload",
            id: sample?.id ?? crypto.randomUUID(),
            name: sample?.title ?? loaded.name,
            encoding: structuredClone(
              sample?.encoding ?? state.graph.colour.input,
            ),
          });
        setImage({
          name: sample?.title ?? loaded.name,
          sample,
          originalWidth: loaded.originalWidth,
          originalHeight: loaded.originalHeight,
          width: loaded.bitmap.width,
          height: loaded.bitmap.height,
        });
        return true;
      } finally {
        if ("close" in loaded.bitmap) loaded.bitmap.close();
      }
    } catch (cause) {
      if (current === request.current) setError(message(cause));
      return false;
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  function openChart(profile: keyof typeof logCharts, restoring = false) {
    if (!engine.current || capabilityError) return;
    ++request.current;
    setLoading(false);
    setError("");
    try {
      const chart = createLogChart(profile);
      engine.current.setImage(chart);
      const state = useGraph.getState();
      if (!restoring)
        state.updateColour({
          ...state.graph.colour,
          input: { ...logCharts[profile].encoding },
        });
      if (!restoring) setProjectError("");
      imageFile.current = null;
      if (!restoring)
        setSource({
          kind: "chart",
          id: profile,
          name: logCharts[profile].name,
          encoding: { ...logCharts[profile].encoding },
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
      inert={!ready}
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
        <button
          className="upload-button"
          aria-expanded={showSamples}
          onClick={() => setShowSamples(!showSamples)}
        >
          Browse samples
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
          accept="image/jpeg,image/png,image/tiff,.tif,.tiff"
          aria-label="Choose image"
          onChange={(event) => {
            void openFile(event.target.files?.[0]);
            event.target.value = "";
          }}
          disabled={!!capabilityError}
        />
      </header>

      <section className="project-toolbar" aria-label="Project">
        <button
          disabled={!ready || saving || loading}
          onClick={() => void save()}
        >
          Save project
        </button>
        <button disabled={!ready || loading} onClick={share}>
          Share grade
        </button>
        {shareLink && (
          <label className="share-link">
            Share link{" "}
            <input
              aria-label="Share link"
              readOnly
              value={shareLink}
              onFocus={(event) => event.target.select()}
            />{" "}
            <span>Copy this link. Image bytes stay on your device.</span>
          </label>
        )}
        <span aria-label="Project status">{projectStatus}</span>
        {projectError && <span role="alert">{projectError}</span>}
        <span className="offline-status" aria-label="Offline status">
          {offlineStatusText(offline)}
          {offline.updateReady && (
            <button onClick={offline.applyUpdate}>Reload to update</button>
          )}
        </span>
      </section>
      {showSamples && (
        <SamplePicker
          selected={image?.sample?.id}
          disabled={disabled}
          offlineReady={offline.support === "ready" && offline.online}
          onSelect={(sample) => void openFile(undefined, sample)}
        />
      )}
      <section className="workspace">
        <div className="viewer-column">
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
                    setComparison(mode);
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
                onClick={() =>
                  setSnapshots((previous) => ({
                    ...previous,
                    [slot]: structuredClone(graph),
                  }))
                }
              >
                Capture {slot}
              </button>
            ))}
            <button
              disabled={!image}
              aria-pressed={outOfRange}
              onClick={() => setOutOfRange(!outOfRange)}
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
          <div
            className={`viewer ${image ? "has-image" : ""}`}
            aria-busy={loading}
          >
            <ViewerNavigation
              width={image?.width ?? 1}
              height={image?.height ?? 1}
              comparison={!!image && comparison !== "off"}
              wipe={wipe}
              onWipe={setWipe}
            >
              <canvas
                ref={canvas}
                aria-label="Graded image preview"
                className={image ? "" : "empty-canvas"}
              />
              {fidelityOverlay &&
                image &&
                !capabilityError &&
                engine.current?.isFidelityCurrent(fidelityOverlay, graph) && (
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
                <button
                  className="primary-button"
                  onClick={() => fileInput.current?.click()}
                >
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
              <div className="capability-error" role="alert">
                <h2>Preview unavailable</h2>
                <p>{capabilityError}</p>
                <button
                  onClick={() => {
                    try {
                      if (engine.current) engine.current.recover();
                      else engine.current = new GradingEngine(canvas.current!);
                      refreshGraphics();
                    } catch (cause) {
                      setCapabilityError(message(cause));
                    }
                  }}
                >
                  Retry graphics recovery
                </button>
              </div>
            )}
            {image && (graphError || renderError) && (
              <div className="preview-paused" role="alert">
                Preview paused: {graphError || renderError}
                <br />
                {graphError ? (
                  "Connect a valid graph to resume."
                ) : (
                  <button
                    onClick={() =>
                      setGraphicsRevision((revision) => revision + 1)
                    }
                  >
                    Retry preview
                  </button>
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
          <Scopes
            engine={engine.current}
            graph={graph}
            image={image}
            paused={
              loading || !!capabilityError || !!graphError || !!renderError
            }
          />
          {image?.sample && <SampleProvenance sample={image.sample} />}
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
              values; embedded profiles are not applied. Correct the input tag
              to match your source. Retagging does not restore highlight range.
              <br />
              Viewer conversion is sRGB only; output pixels keep the chosen
              output encoding.
            </p>
            <LutExport
              hasImage={!!image}
              onOverlay={setFidelityOverlay}
              engine={() => engine.current}
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
