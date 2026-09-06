import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { useGraph } from "@/graphStore";
import {
  GradingEngine,
  cubeFileBytes,
  cubeSizes,
  cubeTitleLength,
  defaultCubeSize,
  encodingLabel,
  isCubeSize,
  sanitizeCubeTitle,
  serializeCube,
  type CubeSize,
  type GradingNode,
  type LatticeFormat,
  type FidelityResult,
  type LutInterpolation,
} from "@/engine/GradingEngine";

/** The Output node's clamp policy; the inspector and LUT export edit the same value. */
export function OutputRangeSelect({
  output,
  label,
}: {
  output: GradingNode | undefined;
  label: string;
}) {
  const updateParameters = useGraph((s) => s.updateParameters);
  return (
    <select
      aria-label={label}
      value={output?.data.clamp ?? "clamp"}
      disabled={!output}
      onChange={(event) =>
        output &&
        updateParameters(output.id, {
          clamp: event.target.value === "unbounded" ? "unbounded" : "clamp",
        })
      }
    >
      <option value="clamp">Clamp to 0–1</option>
      <option value="unbounded">Allow out-of-range</option>
    </select>
  );
}

/** Result of the one-time float lattice probe; a reason disables export. */
export type LatticeSupport = { format: LatticeFormat } | { reason: string };

export function LutExport({
  engine,
  support,
  hasImage,
  onOverlay,
}: {
  engine: () => GradingEngine | null;
  support: LatticeSupport | null;
  hasImage: boolean;
  onOverlay: (report: FidelityResult | null) => void;
}) {
  const graphState = useGraph();
  const { graph } = graphState;
  const [title, setTitle] = useState("Grade");
  const [size, setSize] = useState<CubeSize>(defaultCubeSize);
  const [status, setStatus] = useState<{
    kind: "error" | "done";
    text: string;
  } | null>(null);
  const [interpolation, setInterpolation] =
    useState<LutInterpolation>("trilinear");
  const [report, setReport] = useState<FidelityResult | null>(null);
  const [measured, setMeasured] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const validReport =
    report &&
    hasImage &&
    support &&
    "format" in support &&
    engine()?.isFidelityCurrent(report, graph, { size, interpolation })
      ? report
      : null;
  useEffect(() => {
    if (report && !validReport) setReport(null);
    onOverlay(showOverlay ? validReport : null);
  }, [report, validReport, showOverlay, onOverlay]);
  const output = graph.nodes.find((n) => n.type === "output");
  const clamp = output?.data.clamp ?? "clamp";
  const graphError = GradingEngine.validate(graph);
  const reason =
    support && "reason" in support
      ? support.reason
      : graphError
        ? `Connect a valid graph to export. ${graphError}`
        : null;
  const megabytes = cubeFileBytes(size) / 1e6;

  function exportLut() {
    const current = engine();
    if (!current) return;
    try {
      const text =
        validReport?.cube ??
        serializeCube({
          title,
          size,
          samples: current.renderLattice(graph, size),
        });
      const file = `${sanitizeCubeTitle(title).replace(/[^A-Za-z0-9._-]+/g, "-")}.cube`;
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({
        kind: "done",
        text: `Saved ${file}: ${size}³ rows, ${(text.length / 1e6).toFixed(1)} MB.`,
      });
    } catch (cause) {
      setStatus({
        kind: "error",
        text:
          cause instanceof Error ? cause.message : "Could not export the LUT.",
      });
    }
  }

  function measure() {
    const current = engine();
    if (!current) return;
    setReport(null);
    setStatus(null);
    try {
      setReport(current.measureFidelity(graph, { title, size, interpolation }));
      setMeasured(true);
    } catch (cause) {
      setStatus({
        kind: "error",
        text:
          cause instanceof Error
            ? cause.message
            : "Could not measure LUT fidelity.",
      });
    }
  }

  return (
    <section className="lut-export" aria-labelledby="lut-heading">
      <Accordion type="single" collapsible>
        <AccordionItem value="export">
          <AccordionTrigger>
            <span id="lut-heading">LUT EXPORT</span>
            <span className="lut-settings">
              {size}³ ·{" "}
              {interpolation === "trilinear" ? "Trilinear" : "Tetrahedral"}
            </span>
          </AccordionTrigger>
          <AccordionContent className="lut-content">
            <label>
              Title
              <Input
                field="text"
                aria-label="LUT title"
                value={title}
                maxLength={cubeTitleLength}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setReport(null);
                }}
              />
            </label>
            <label>
              Size
              <select
                aria-label="LUT size"
                value={size}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (isCubeSize(value)) setSize(value);
                }}
              >
                {cubeSizes.map((option) => (
                  <option key={option} value={option}>
                    {option}³ · {option ** 3} rows
                  </option>
                ))}
              </select>
            </label>
            <label>
              Output range
              <OutputRangeSelect output={output} label="LUT output range" />
            </label>
            <p className="lut-summary">
              Maps {encodingLabel(graph.colour.input)} codes 0–1 to{" "}
              {encodingLabel(graph.colour.output)}, using the preview's grading
              program. Range is shared with the Output node:{" "}
              {clamp === "unbounded"
                ? "out-of-range values are preserved."
                : "values clamp to 0–1."}
              {support && "format" in support
                ? support.format === "RGBA16F"
                  ? " This device reads back half-float samples, about three decimal digits."
                  : " This device reads back 32-bit float samples (RGBA32F)."
                : ""}
            </p>
            {size === 65 && (
              <p className="lut-warning" role="status">
                65³ writes about {Math.round(megabytes)} MB. 33³ is enough for
                most grades.
              </p>
            )}
            <button
              className="primary-button"
              disabled={!support || !!reason}
              onClick={exportLut}
            >
              Export .cube
            </button>
            <label>
              Interpolation
              <select
                aria-label="LUT interpolation"
                value={interpolation}
                onChange={(event) =>
                  setInterpolation(
                    event.target.value === "tetrahedral"
                      ? "tetrahedral"
                      : "trilinear",
                  )
                }
              >
                <option value="trilinear">Trilinear</option>
                <option value="tetrahedral">Tetrahedral</option>
              </select>
            </label>
            <button
              className="primary-button"
              disabled={!hasImage || !support || !!reason}
              onClick={measure}
            >
              Measure LUT fidelity
            </button>
            {!hasImage && (
              <p className="lut-summary">
                Load an image to measure LUT fidelity.
              </p>
            )}
            {measured && !validReport && (
              <p role="status">Settings changed. Measure again.</p>
            )}
            {validReport && (
              <section
                className="grid gap-2 border-t border-border pt-3 text-xs text-foreground [&_p]:m-0 [&_p]:leading-normal"
                aria-label="LUT fidelity report"
              >
                <p>
                  <strong className="font-medium">
                    Overall maximum:{" "}
                    <span className="font-mono text-[11px] tabular-nums">
                      {validReport.maximum.toFixed(3)}
                    </span>
                  </strong>{" "}
                  code values
                </p>
                <table className="w-full border-collapse text-[11px] [&_th]:h-6 [&_th]:border-b [&_th]:border-border [&_th]:px-1 [&_th]:py-1 [&_th]:text-right [&_th]:font-medium [&_th:first-child]:text-left [&_td]:h-6 [&_td]:border-b [&_td]:border-border [&_td]:px-1 [&_td]:py-1 [&_td]:text-right [&_td]:font-mono [&_td]:tabular-nums">
                  <caption className="mb-2 text-left text-xs text-foreground">
                    Absolute RGB error × 255, before display conversion
                  </caption>
                  <thead className="bg-secondary">
                    <tr>
                      <th scope="col">Channel</th>
                      <th scope="col">Maximum</th>
                      <th scope="col">P95</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validReport.channels.map((channel, i) => (
                      <tr key={i}>
                        <th
                          className={["text-ch-r", "text-ch-g", "text-ch-b"][i]}
                          scope="row"
                        >
                          {["R", "G", "B"][i]}
                        </th>
                        <td>{channel.maximum.toFixed(3)}</td>
                        <td>{channel.p95.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="font-mono text-[11px] tabular-nums">
                  {validReport.sampleCount.toLocaleString()} in-domain samples ·{" "}
                  {validReport.width} × {validReport.height} full capped
                  preview. {validReport.transparentCount.toLocaleString()}{" "}
                  transparent pixels excluded.
                </p>
                <p
                  className={`font-mono text-[11px] tabular-nums ${validReport.outOfDomainCount ? "text-warning" : "text-foreground"}`}
                >
                  {validReport.outOfDomainCount.toLocaleString()} inputs outside
                  the LUT domain (0–1), excluded from metrics and overlay.
                </p>
                {validReport.sampleCount === 0 && (
                  <p className="text-warning">
                    No eligible samples. Zero metrics do not indicate fidelity.
                  </p>
                )}
                <p className="font-mono text-[11px] tabular-nums">
                  {validReport.size}³ ·{" "}
                  {validReport.interpolation === "trilinear"
                    ? "Trilinear"
                    : "Tetrahedral"}{" "}
                  · {validReport.precision} precision · six-decimal LUT. P95
                  uses nearest rank.
                </p>
                <p>
                  Export .cube downloads this measured artifact. Image-based
                  measurement is not a global error bound for all possible
                  colours.
                </p>
                {validReport.advice.map((text) => (
                  <p key={text} className="text-warning">
                    {text}
                  </p>
                ))}
                <label className="flex h-6 items-center gap-2 text-[11px]">
                  <input
                    className="m-0 h-3 w-3 p-0 accent-primary"
                    type="checkbox"
                    checked={showOverlay}
                    onChange={(e) => setShowOverlay(e.target.checked)}
                  />
                  Show LUT error overlay
                </label>
                {showOverlay && (
                  <p>
                    Largest channel error per pixel: blue = 0, yellow = 2, red ≥
                    4 code values. Excluded pixels are clear. Measures the
                    current full grade, regardless of solo or comparison.
                  </p>
                )}
              </section>
            )}
            {reason && <p className="lut-reason">{reason}</p>}
            {status && (
              <p
                className={
                  status.kind === "error" ? "lut-reason" : "lut-summary"
                }
                role={status.kind === "error" ? "alert" : "status"}
              >
                {status.text}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
