import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/icons";
import { cn } from "@/lib/utils";
import { offlineStatusText, type OfflineState } from "@/offline";

/** Save, share and their status messages, plus the offline storage status.
 *
 * The region is 30px and its buttons are 22px, one step down from the topbar:
 * project state is chrome about the session, not part of grading. The bar
 * grows a second row rather than clipping when a share link is on screen — a
 * link you cannot read is a link you cannot copy. */
export function ProjectBar({
  ready,
  saving,
  loading,
  shareLink,
  projectStatus,
  projectError,
  offline,
  onSave,
  onShare,
}: {
  ready: boolean;
  saving: boolean;
  loading: boolean;
  shareLink: string;
  projectStatus: string;
  projectError: string;
  offline: OfflineState & { applyUpdate(): void };
  onSave: () => void;
  onShare: () => void;
}) {
  // Colour carries the one thing the sentence takes a while to say: whether
  // the application will still work without a network.
  const stored = offline.support === "ready" && !offline.updateReady;
  return (
    <section
      aria-label="Project"
      className="flex min-h-[30px] flex-none flex-wrap items-center gap-2.5 border-b border-border bg-card px-3 py-1 text-[11.5px]"
    >
      <Button
        size="bar"
        disabled={!ready || saving || loading}
        onClick={onSave}
      >
        <Icon.Save />
        Save project
      </Button>
      <Button size="bar" disabled={!ready || loading} onClick={onShare}>
        <Icon.Link2 />
        Share grade
      </Button>
      <span aria-hidden="true" className="text-text-faint">
        |
      </span>
      {shareLink && (
        <label className="flex items-center gap-2 text-muted-foreground">
          Share link
          <Input
            field="text"
            aria-label="Share link"
            readOnly
            value={shareLink}
            className="w-[min(360px,32vw)]"
            onFocus={(event) => event.target.select()}
          />
          <span>Copy this link. Image bytes stay on your device.</span>
        </label>
      )}
      <span aria-label="Project status" className="text-muted-foreground">
        {projectStatus}
      </span>
      {projectError && (
        <span role="alert" className="text-warning">
          {projectError}
        </span>
      )}
      <span
        aria-label="Offline status"
        className="ml-auto flex items-center gap-[7px] text-muted-foreground"
      >
        {offline.online ? (
          <span
            aria-hidden="true"
            className={cn(
              "size-[5px] flex-none rounded-full",
              stored ? "bg-ok" : "bg-warning",
            )}
          />
        ) : (
          <Icon.WifiOff className={stored ? "text-ok" : "text-warning"} />
        )}
        {offlineStatusText(offline)}
        {offline.updateReady && (
          <Button size="bar" onClick={offline.applyUpdate}>
            <Icon.RefreshCw />
            Reload to update
          </Button>
        )}
      </span>
    </section>
  );
}
