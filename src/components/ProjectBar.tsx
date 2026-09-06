import { offlineStatusText, type OfflineState } from "@/offline";

/** Save, share and their status messages, plus the offline storage status. */
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
  return (
    <section className="project-toolbar" aria-label="Project">
      <button disabled={!ready || saving || loading} onClick={onSave}>
        Save project
      </button>
      <button disabled={!ready || loading} onClick={onShare}>
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
  );
}
