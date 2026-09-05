import { useLayoutEffect, useRef } from "react";
import type { FidelityResult } from "./engine/GradingEngine";

export function FidelityOverlay({ report }: { report: FidelityResult }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext("2d");
    context?.putImageData(
      new ImageData(
        new Uint8ClampedArray(report.overlay),
        report.width,
        report.height,
      ),
      0,
      0,
    );
  }, [report]);
  return (
    <canvas
      ref={canvas}
      width={report.width}
      height={report.height}
      className="fidelity-overlay"
      aria-label="LUT error overlay"
    />
  );
}
