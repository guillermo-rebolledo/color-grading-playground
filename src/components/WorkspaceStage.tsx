import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DockPanel } from "@/components/DockPanel";
import { StageDivider } from "@/components/StageDivider";
import {
  MINIMUM_DOCK_HEIGHT,
  MINIMUM_SPLIT,
  MINIMUM_VIEWER_HEIGHT,
  MAXIMUM_SPLIT,
  STRIP_HEIGHT,
  clamp,
  useWorkspaceLayout,
} from "@/workspaceLayout";

/** The stage: the viewer above a dock holding the graph and the scopes, with
 * the inspector as a fixed rail on the right.
 *
 * Two dividers shape it. The horizontal one trades image height against dock
 * height; the vertical one trades graph width against scopes width. Collapsing
 * a single panel leaves the dock the height it already had, so the viewer does
 * not move; the viewer only grows when both panels are down to their strips. */
export function WorkspaceStage({
  viewer,
  graph,
  scopes,
  inspector,
}: {
  viewer: ReactNode;
  graph: ReactNode;
  scopes: ReactNode;
  inspector: ReactNode;
}) {
  const main = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const layout = useWorkspaceLayout();
  const collapsed = {
    graph: layout.graphCollapsed,
    scopes: layout.scopesCollapsed,
  };
  const stacked = collapsed.graph || collapsed.scopes;
  const bothCollapsed = collapsed.graph && collapsed.scopes;

  useLayoutEffect(() => {
    // Measured before the first paint, so the dock is never laid out against an
    // unknown column and then corrected: the image would jump.
    setAvailable(main.current!.getBoundingClientRect().height);
    const observer = new ResizeObserver(([entry]) =>
      setAvailable(entry.contentRect.height),
    );
    observer.observe(main.current!);
    return () => observer.disconnect();
  }, []);

  const maximumDock = available
    ? Math.max(MINIMUM_DOCK_HEIGHT, available - MINIMUM_VIEWER_HEIGHT)
    : layout.dockHeight;
  const height = bothCollapsed
    ? STRIP_HEIGHT * 2
    : clamp(layout.dockHeight, MINIMUM_DOCK_HEIGHT, maximumDock);
  const rows = stacked
    ? `${collapsed.graph ? `${STRIP_HEIGHT}px` : "minmax(0, 1fr)"} ${
        collapsed.scopes ? `${STRIP_HEIGHT}px` : "minmax(0, 1fr)"
      }`
    : "minmax(0, 1fr)";
  return (
    <section className="stage">
      <div className="stage-main" ref={main}>
        <section className="viewer-region" aria-label="Viewer">
          {viewer}
        </section>
        {!bothCollapsed && (
          <StageDivider
            label="Resize viewer and dock"
            orientation="horizontal"
            value={height}
            minimum={MINIMUM_DOCK_HEIGHT}
            maximum={maximumDock}
            step={16}
            onChange={layout.setDockHeight}
            positionFrom={(event) =>
              main.current!.getBoundingClientRect().bottom - event.clientY
            }
          />
        )}
        <div
          className={`dock ${stacked ? "dock-stacked" : "dock-split"}`}
          ref={dock}
          style={{
            height,
            ["--strip-height" as string]: `${STRIP_HEIGHT}px`,
            gridTemplateRows: rows,
            gridTemplateColumns: stacked
              ? "minmax(0, 1fr)"
              : `minmax(0, ${layout.dockSplit}fr) auto minmax(0, ${
                  1 - layout.dockSplit
                }fr)`,
          }}
        >
          <DockPanel
            id="dock-graph"
            className="graph-panel"
            title="Graph"
            label="Grading graph"
            collapsed={collapsed.graph}
            onToggle={layout.toggleGraph}
          >
            {graph}
          </DockPanel>
          {!stacked && (
            <StageDivider
              label="Resize graph and scopes"
              orientation="vertical"
              value={Math.round(layout.dockSplit * 100)}
              minimum={Math.round(MINIMUM_SPLIT * 100)}
              maximum={Math.round(MAXIMUM_SPLIT * 100)}
              step={4}
              onChange={(share) => layout.setDockSplit(share / 100)}
              positionFrom={(event) => {
                const bounds = dock.current!.getBoundingClientRect();
                return ((event.clientX - bounds.left) / bounds.width) * 100;
              }}
            />
          )}
          <DockPanel
            id="dock-scopes"
            className="scopes"
            title="Scopes"
            label="Image scopes"
            meta={<span>Graded output</span>}
            collapsed={collapsed.scopes}
            onToggle={layout.toggleScopes}
          >
            {scopes}
          </DockPanel>
        </div>
      </div>
      {inspector}
    </section>
  );
}
