import { useState } from "react";
import { useGraph } from "./graphStore";
import {
  GradingEngine,
  cubeFileBytes,
  cubeSizes,
  defaultCubeSize,
  encodingLabel,
  isCubeSize,
  sanitizeCubeTitle,
  serializeCube,
  type CubeSize,
  type LatticeFormat,
} from "./engine/GradingEngine";

/** Result of the one-time float lattice probe; a reason disables export. */
export type LatticeSupport = { format: LatticeFormat } | { reason: string };

export function LutExport({
  engine,
  support,
}: {
  engine: () => GradingEngine | null;
  support: LatticeSupport | null;
}) {
  const graphState = useGraph();
  const { graph } = graphState;
  const [title, setTitle] = useState("Grade");
  const [size, setSize] = useState<CubeSize>(defaultCubeSize);
  const [status, setStatus] = useState<{
    kind: "error" | "done";
    text: string;
  } | null>(null);
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
      const text = serializeCube({
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

  return (
    <section className="lut-export" aria-labelledby="lut-heading">
      <span className="eyebrow" id="lut-heading">
        LUT EXPORT
      </span>
      <label>
        Title
        <input
          aria-label="LUT title"
          value={title}
          maxLength={240}
          onChange={(event) => setTitle(event.target.value)}
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
        <select
          aria-label="LUT output range"
          value={clamp}
          disabled={!output}
          onChange={(event) =>
            output &&
            graphState.updateParameters(output.id, {
              clamp: event.target.value === "unbounded" ? "unbounded" : "clamp",
            })
          }
        >
          <option value="clamp">Clamp to 0–1</option>
          <option value="unbounded">Allow out-of-range</option>
        </select>
      </label>
      <p className="lut-summary">
        Maps {encodingLabel(graph.colour.input)} codes 0–1 to{" "}
        {encodingLabel(graph.colour.output)}, using the preview's grading
        program. Range is shared with the Output node:{" "}
        {clamp === "unbounded"
          ? "out-of-range values are preserved."
          : "values clamp to 0–1."}
        {support && "format" in support && support.format === "RGBA16F"
          ? " This device reads back half-float samples, about three decimal digits."
          : ""}
      </p>
      {size === 65 && (
        <p className="lut-warning" role="status">
          65³ writes about {Math.round(megabytes)} MB. 33³ is enough for most
          grades.
        </p>
      )}
      <button
        className="primary-button"
        disabled={!support || !!reason}
        onClick={exportLut}
      >
        Export .cube
      </button>
      {reason && <p className="lut-reason">{reason}</p>}
      {status && (
        <p
          className={status.kind === "error" ? "lut-reason" : "lut-summary"}
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.text}
        </p>
      )}
    </section>
  );
}
