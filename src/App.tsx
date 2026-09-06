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
import { sampleLoadError, useOffline } from "./offline";
import { useEffect, useRef, useState } from "react";
import type { FidelityResult } from "./engine/GradingEngine";
import { GradingEngine } from "./engine/GradingEngine";
import { loadImage } from "./engine/loadImage";
import { createLogChart, isLogChart, logCharts } from "./logCharts";
import { useGraph } from "./graphStore";
import { GraphEditor } from "./GraphEditor";
import type { LatticeSupport } from "./LutExport";
import type { GradingGraph } from "./engine/GradingEngine";
import type { ImageInfo } from "./imageInfo";
import { Topbar } from "@/components/Topbar";
import { ProjectBar } from "@/components/ProjectBar";
import { ViewerPanel, type Comparison } from "@/components/ViewerPanel";
import { Inspector } from "@/components/Inspector";
import { AppFooter } from "@/components/AppFooter";
import { WorkspaceStage } from "@/components/WorkspaceStage";
import { UnsupportedDevice } from "@/components/UnsupportedDevice";
import { useSupportedWidth } from "@/viewportSupport";

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
  const [comparison, setComparison] = useState<Comparison>("off");
  const [snapshots, setSnapshots] = useState<{
    A?: GradingGraph;
    B?: GradingGraph;
  }>({});
  const [wipe, setWipe] = useState(0.5);
  const [outOfRange, setOutOfRange] = useState(false);
  useEffect(() => {
    if (graphState.solo && !solo) useGraph.setState({ solo: null });
  }, [graphState.solo, solo]);
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
  const supportedWidth = useSupportedWidth();
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
  function retryGraphics() {
    try {
      if (engine.current) engine.current.recover();
      else engine.current = new GradingEngine(canvas.current!);
      refreshGraphics();
    } catch (cause) {
      setCapabilityError(message(cause));
    }
  }
  const disabled = !!capabilityError;
  // The workspace is replaced only when none of it would work: too narrow a
  // window. A capability failure leaves the graph editable, so it is explained
  // in the viewer instead.
  const unsupported = supportedWidth
    ? null
    : {
        heading: "This window is too narrow to grade in",
        detail:
          "The workspace needs the image, the graph and the inspector on screen at once. This window is not wide enough to show them, and a narrower layout would not be a grading surface worth trusting. Widen the window to carry on.",
      };
  return (
    <>
      <main
        className="app-shell"
        hidden={!!unsupported}
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
        <Topbar
          fileInput={fileInput}
          disabled={disabled}
          showSamples={showSamples}
          onToggleSamples={() => setShowSamples(!showSamples)}
          onOpenFile={(file) => void openFile(file)}
          onOpenChart={(profile) => openChart(profile)}
        />

        <ProjectBar
          ready={ready}
          saving={saving}
          loading={loading}
          shareLink={shareLink}
          projectStatus={projectStatus}
          projectError={projectError}
          offline={offline}
          onSave={() => void save()}
          onShare={share}
        />
        {showSamples && (
          <SamplePicker
            selected={image?.sample?.id}
            disabled={disabled}
            offlineReady={offline.support === "ready" && offline.online}
            onSelect={(sample) => void openFile(undefined, sample)}
          />
        )}
        <WorkspaceStage
          viewer={
            <>
              <ViewerPanel
                canvas={canvas}
                engine={() => engine.current}
                image={image}
                graph={graph}
                solo={solo}
                comparison={comparison}
                onComparison={setComparison}
                snapshots={snapshots}
                onCapture={(slot) =>
                  setSnapshots((previous) => ({
                    ...previous,
                    [slot]: structuredClone(graph),
                  }))
                }
                wipe={wipe}
                onWipe={setWipe}
                outOfRange={outOfRange}
                onOutOfRange={setOutOfRange}
                loading={loading}
                capabilityError={capabilityError}
                graphError={graphError}
                renderError={renderError}
                graphicsWarning={graphicsWarning}
                fidelityOverlay={fidelityOverlay}
                onRetryGraphics={retryGraphics}
                onRetryPreview={() =>
                  setGraphicsRevision((revision) => revision + 1)
                }
                onChooseImage={() => fileInput.current?.click()}
              />
              {image?.sample && <SampleProvenance sample={image.sample} />}
              {error && (
                <div className="file-error" role="alert">
                  {error}
                  <button
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    ×
                  </button>
                </div>
              )}
            </>
          }
          graph={<GraphEditor />}
          scopes={
            <Scopes
              engine={engine.current}
              graph={graph}
              image={image}
              paused={
                loading || !!capabilityError || !!graphError || !!renderError
              }
            />
          }
          inspector={
            <Inspector
              hasImage={!!image}
              engine={() => engine.current}
              capabilityError={capabilityError}
              latticeSupport={latticeSupport}
              onOverlay={setFidelityOverlay}
            />
          }
        />
        <AppFooter />
        {dragging && !capabilityError && (
          <div className="drop-overlay">
            <span>Drop your image to open</span>
          </div>
        )}
      </main>
      {unsupported && <UnsupportedDevice {...unsupported} />}
    </>
  );
}

function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Something went wrong while opening the image.";
}
