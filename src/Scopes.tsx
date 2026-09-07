import { useEffect, useRef, useState } from "react";
import {
  encodingLabel,
  type GradingEngine,
  type GradingGraph,
  type ScopeResult,
} from "./engine/GradingEngine";

const colours = ["#ee7777", "#7fd79a", "#7eaaff"];

function ScopePlot({
  report,
  parade,
}: {
  report: ScopeResult;
  parade: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current!;
    const context = element.getContext("2d");
    if (!context) return;
    const width = parade ? report.width * 3 : 256;
    element.width = width;
    element.height = 256;
    context.clearRect(0, 0, width, 256);
    if (parade) {
      const raster = context.createImageData(width, 256);
      for (let channel = 0; channel < 3; channel++) {
        const counts = report.parade[channel];
        let peak = 1;
        for (const count of counts) peak = Math.max(peak, count);
        const colour = Number.parseInt(colours[channel].slice(1), 16);
        const densityScale = 204 / Math.log1p(peak);
        for (let bin = 0; bin < 256; bin++)
          for (let x = 0; x < report.width; x++) {
            const count = counts[bin * report.width + x];
            if (!count) continue;
            const index =
              ((255 - bin) * width + channel * report.width + x) * 4;
            raster.data[index] = colour >> 16;
            raster.data[index + 1] = (colour >> 8) & 255;
            raster.data[index + 2] = colour & 255;
            raster.data[index + 3] = 51 + Math.log1p(count) * densityScale;
          }
      }
      context.putImageData(raster, 0, 0);
    } else {
      let peak = 1;
      for (const channel of report.histogram)
        for (const count of channel) peak = Math.max(peak, count);
      report.histogram.forEach((counts, channel) => {
        context.strokeStyle = colours[channel];
        context.beginPath();
        counts.forEach((count, bin) => {
          const y = 255 - (count / peak) * 254;
          if (bin === 0) context.moveTo(bin, y);
          else context.lineTo(bin, y);
        });
        context.stroke();
      });
    }
    context.strokeStyle = "#ffffff20";
    for (const y of [0.5, 64, 128, 192, 255.5]) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  }, [report, parade]);
  return (
    <figure className="scope-plot">
      <figcaption>{parade ? "RGB parade" : "Histogram"}</figcaption>
      <canvas
        ref={canvas}
        role="img"
        aria-label={parade ? "RGB parade" : "RGB histogram"}
      />
      <div className="scope-axis">
        {parade ? (
          <>
            <span>R · left → right</span>
            <span>G · left → right</span>
            <span>B · left → right</span>
          </>
        ) : (
          <>
            <span>0</span>
            <span>RGB · pixel count</span>
            <span>1</span>
          </>
        )}
      </div>
      {parade && (
        <p>Vertical: 0 at bottom → 1 at top · brightness shows density</p>
      )}
    </figure>
  );
}

export function Scopes({
  engine,
  graph,
  image,
  paused,
}: {
  engine: GradingEngine | null;
  graph: GradingGraph;
  image: object | null;
  paused: boolean;
}) {
  const [measurement, setMeasurement] = useState<{
    graph: GradingGraph;
    image: object;
    report?: ScopeResult;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!engine) return;
    engine.invalidateScopes();
    if (!image || paused) return;
    let active = true;
    void engine
      .measureScopes(graph)
      .then((report) => {
        if (active && report) setMeasurement({ graph, image, report });
      })
      .catch((cause: unknown) => {
        if (active)
          setMeasurement({
            graph,
            image,
            error:
              cause instanceof Error
                ? cause.message
                : "Scope measurement failed.",
          });
      });
    return () => {
      active = false;
      engine.invalidateScopes();
    };
  }, [engine, graph, image, paused]);
  const current =
    !paused && measurement?.graph === graph && measurement.image === image
      ? measurement
      : null;
  const report = current?.report;
  return (
    <>
      <p className="scope-status" aria-label="Scope status">
        {!image
          ? "Load an image to inspect scopes."
          : paused
            ? "Scopes paused — waiting for a valid image and graph."
            : (current?.error ??
              (report
                ? `${report.width} × ${report.height} · ${report.sampleCount.toLocaleString()} measured pixels · transparent pixels excluded`
                : "Updating scopes…"))}
      </p>
      <div className="scope-measurement">
        {report && (
          <>
            <div className="scope-plots">
              <ScopePlot report={report} parade={false} />
              <ScopePlot report={report} parade />
            </div>
            <p className="scope-description">
              RGB counts below 0: {report.below.join(" / ")} · above 1:{" "}
              {report.above.join(" / ")} · non-finite excluded:{" "}
              {report.nonFinite.join(" / ")}
            </p>
          </>
        )}
      </div>
      <details className="mx-4 my-2 text-[11px] text-muted-foreground">
        <summary className="cursor-pointer py-1">
          How to read these scopes
        </summary>
        <p className="scope-description">
          Measured: {encodingLabel(graph.colour.output)} · diagnostic range 0–1,
          after Output policy, before display conversion. Outside values
          accumulate at the endpoints.
        </p>
      </details>
    </>
  );
}
