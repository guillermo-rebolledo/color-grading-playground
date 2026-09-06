import type { RefObject } from "react";
import { isLogChart, logCharts } from "@/logCharts";

/** Open image, browse samples and load precision chart, beside the standing
 * statement that nothing is uploaded. */
export function Topbar({
  fileInput,
  disabled,
  showSamples,
  onToggleSamples,
  onOpenFile,
  onOpenChart,
}: {
  fileInput: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  showSamples: boolean;
  onToggleSamples: () => void;
  onOpenFile: (file: File | undefined) => void;
  onOpenChart: (profile: keyof typeof logCharts) => void;
}) {
  return (
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
        disabled={disabled}
        onClick={() => fileInput.current?.click()}
      >
        <span aria-hidden="true">＋</span> Open image
      </button>
      <button
        className="upload-button"
        aria-expanded={showSamples}
        onClick={onToggleSamples}
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
          if (isLogChart(profile)) onOpenChart(profile);
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
          onOpenFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        disabled={disabled}
      />
    </header>
  );
}
