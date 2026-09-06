import type { RefObject } from "react";
import { StatusDot } from "@/components/StatusDot";
import { Button } from "@/components/ui/button";
import { Icon } from "@/icons";
import { isLogChart, logCharts } from "@/logCharts";

/** Open image, browse samples and load precision chart, beside the standing
 * statement that nothing is uploaded.
 *
 * The region is 44px and its buttons are 24px — the body size, because the
 * topbar is where a session starts rather than a toolbar you work in. The
 * privacy guarantee sits at the end of the bar and is never conditional: it is
 * on screen whatever the application is doing. */
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
    <header className="flex h-11 flex-none items-center gap-2 border-b border-border bg-card px-3">
      <div className="mr-2 flex items-baseline gap-2">
        <span
          aria-hidden="true"
          className="font-mono text-[15px] leading-none font-medium tracking-[-1px]"
        >
          cg
        </span>
        <span className="text-[11px] leading-none font-medium tracking-[1.6px] text-muted-foreground">
          COLOR GRADING PLAYGROUND
        </span>
      </div>
      <Button disabled={disabled} onClick={() => fileInput.current?.click()}>
        <Icon.FolderOpen />
        Open image
      </Button>
      <Button aria-expanded={showSamples} onClick={onToggleSamples}>
        <Icon.Images />
        Browse samples
      </Button>
      <span className="relative inline-flex items-center">
        <Icon.Ruler className="pointer-events-none absolute left-[9px]" />
        <Icon.ChevronDown className="pointer-events-none absolute right-[7px] text-text-faint" />
        <select
          aria-label="Load precision chart"
          className="h-6 max-w-56 appearance-none pr-6 pl-[27px] text-xs"
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
      </span>
      <p className="m-0 ml-auto flex items-center gap-[7px] text-[11.5px] text-muted-foreground">
        <StatusDot tone="ok" />
        Local workspace · nothing is uploaded
      </p>
      <input
        ref={fileInput}
        className="sr-only"
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
