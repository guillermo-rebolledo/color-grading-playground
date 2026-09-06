# Stage and docks

The workspace is a stage, not a page. It never scrolls: the topbar and project
bar sit above a stage that fills the rest of the window, so the image and the
node graph are on screen together at every supported window size.

- The viewer owns the top of the stage at the full width of the main column.
- The graph and the scopes share the dock beneath it, side by side.
- The inspector is a 328px rail on the right. It is fixed: it does not resize
  or reorder when a different node type is selected, and its body scrolls
  inside the rail rather than moving the panel around it.

## Dividers

Two dividers shape the stage. Both carry `role="separator"`, are in the tab
order, and expose `aria-valuenow` / `aria-valuemin` / `aria-valuemax`.

- **Resize viewer and dock** — horizontal, trades image height against dock
  height. Arrow up/down steps 16px, page up/down steps 64px, Home and End go to
  the extremes. The viewer keeps at least 240px of the main column, so a drag
  cannot squeeze the image out of the stage.
- **Resize graph and scopes** — vertical, trades graph width against scopes
  width, between 20% and 80% of the dock.

## Collapsing

Either dock panel collapses to a 24px title strip and re-expands from the
toggle on that same strip. Collapsing one panel does not change the dock's
height, so the viewer does not move: the collapsed panel becomes a strip and
the open panel takes the full dock width. Only when both are collapsed does the
dock shrink to its two strips and the viewer take almost the whole stage.

Both panels stay mounted while collapsed, so the graph keeps its viewport and
selection and the scopes keep their measurement.

## Workspace state

Dock height, the graph/scopes split and both collapse states are workspace
state, not project state. They live in `localStorage` under
`color-grading-workspace` (`src/workspaceLayout.ts`), are read synchronously at
startup so the stage never renders at the default size and then jumps, and they
never enter the project schema, a saved project or the share link. Projects
saved before the stage existed restore unchanged.

## Supported window

1280px is the minimum supported width. At exactly 1280 the inspector still
holds 328px and the scopes panel drops the parade below the histogram — the
scopes size to their dock column through a container query, not to the window.
There are no mobile reflow rules; the application cannot produce a trustworthy
preview on a narrow device and does not pretend otherwise.

Below 1280px the unsupported-device screen replaces the workspace. It is drawn
on the same neutral chrome and states what grading requires. The check is live:
widening past 1280px restores the workspace, with the open image intact, and
without a reload.

A missing capability — no WebGL2, no float rendering — gets the same
explanation from the same component, stated in the viewer rather than over the
whole window. That is deliberate, and it is a departure from the letter of
MEM-224: the graph, its history and the inspector all still work without a GPU
preview, and `tests/app.spec.ts` requires exactly that ("Graph edits stay
available while GPU preview and image loading are paused"). Replacing the
workspace would take away work the application can still do. A lost graphics
context behaves the same way, with its retry.
