import { create } from "zustand";

/** How the stage is divided: dock height, the graph/scopes split, and which
 * dock panels are collapsed.
 *
 * This is workspace state, not project state. It describes the shape of one
 * browser window, so it is kept in local storage on its own key and never
 * enters the project schema or the share link. */
export type WorkspaceLayout = {
  dockHeight: number;
  /** The graph's share of the dock width, 0–1. */
  dockSplit: number;
  graphCollapsed: boolean;
  scopesCollapsed: boolean;
};

/** A collapsed dock panel keeps only its title strip. */
export const STRIP_HEIGHT = 24;
export const MINIMUM_DOCK_HEIGHT = 140;
export const MINIMUM_SPLIT = 0.2;
export const MAXIMUM_SPLIT = 0.8;
/** The viewer keeps at least this much of the main column while dragging. */
export const MINIMUM_VIEWER_HEIGHT = 240;

const defaults: WorkspaceLayout = {
  dockHeight: 320,
  dockSplit: 0.58,
  graphCollapsed: false,
  scopesCollapsed: false,
};

const key = "color-grading-workspace";

export const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Layout is read synchronously at startup so the stage never renders at the
 * default size and then jumps to the stored one. */
function stored(): WorkspaceLayout {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;
    const value = JSON.parse(raw) as Partial<WorkspaceLayout>;
    return {
      dockHeight: Math.max(
        MINIMUM_DOCK_HEIGHT,
        number(value.dockHeight, defaults.dockHeight),
      ),
      dockSplit: clamp(
        number(value.dockSplit, defaults.dockSplit),
        MINIMUM_SPLIT,
        MAXIMUM_SPLIT,
      ),
      graphCollapsed: value.graphCollapsed === true,
      scopesCollapsed: value.scopesCollapsed === true,
    };
  } catch {
    // A browser that refuses storage still gets a working workspace.
    return defaults;
  }
}

export const useWorkspaceLayout = create<
  WorkspaceLayout & {
    setDockHeight: (height: number) => void;
    setDockSplit: (split: number) => void;
    toggleGraph: () => void;
    toggleScopes: () => void;
  }
>((set, get) => {
  const remember = (patch: Partial<WorkspaceLayout>) => {
    const next = { ...get(), ...patch };
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          dockHeight: next.dockHeight,
          dockSplit: next.dockSplit,
          graphCollapsed: next.graphCollapsed,
          scopesCollapsed: next.scopesCollapsed,
        }),
      );
    } catch {
      // Storage is a convenience here; losing it must not break resizing.
    }
    set(patch);
  };
  return {
    ...stored(),
    setDockHeight: (height) =>
      remember({
        dockHeight: Math.max(MINIMUM_DOCK_HEIGHT, Math.round(height)),
      }),
    setDockSplit: (split) =>
      remember({ dockSplit: clamp(split, MINIMUM_SPLIT, MAXIMUM_SPLIT) }),
    toggleGraph: () => remember({ graphCollapsed: !get().graphCollapsed }),
    toggleScopes: () => remember({ scopesCollapsed: !get().scopesCollapsed }),
  };
});
