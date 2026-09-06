# Remaining surfaces and stylesheet removal (MEM-229)

The sample gallery and provenance, LUT fidelity report, share link and privacy
note use the neutral theme and component density. The gallery uses 12px prose,
13px headings, 11px monospaced encoding labels and a 24px offline-storage
button. Provenance stays bounded to 72px and scrolls without pushing the image
out of the stage. Fidelity metrics use tabular mono and 24px table rows;
measurement caveats and the share privacy note use foreground ink. File-load
and inline capability errors use neutral surfaces and the destructive token.
Accessible names, roles, ARIA attributes and engine behaviour are unchanged.

## Completed stylesheet contract

The inspector migration from main (MEM-228, PR #27) and the scopes migration
from PR #26 (MEM-227) are integrated. The scopes use the same channel tokens as
the inspector and curve editor; their computation and sampling are unchanged.

`src/styles.css` is deleted. Its remaining shell, dock, footer and unsupported
screen layouts now live in the owning components. Dock collapse controls and
LUT actions use the shared Button primitive. The file picker uses Tailwind's
screen-reader-only utility. Unused global element rules, superseded control
selectors and duplicate fidelity-report rules are removed.

As required by ADR 1, Tailwind preflight is enabled. The temporary `[data-slot]`
border reset and the `legacy` cascade layer are gone. The active layer order is:

1. `theme`: Tailwind variables.
2. `base`: preflight, React Flow's substrate, theme border and body defaults.
3. `utilities`: component layout and density, plus the focused viewer, graph,
   inspector and scopes stylesheets.
4. `controls`: shared control states, focus indicators and motion budget.

Hidden regions retain the native `hidden` contract through preflight. The
stage still keeps the viewer above the dock, beside the fixed 328px inspector.
Open dock title strips are 26px; collapsed strips are 24px. Resizing and local
layout persistence are unchanged.

The theme remains in `src/tokens.css`. No runtime declarations or references to
`--bg`, `--panel`, `--line` or `--text` remain, and no retired palette values
remain in the application. `--muted` and `--accent` are the current neutral
shadcn tokens, not the retired palette. Historical ADR descriptions of the
migration are retained. The standalone redesign document also keeps its quoted
comparison with the old palette; those values are explanatory text, not live
styles. Engine-owned overlays and fidelity false colours are unchanged.

## Verification

Use the existing specs without edits, including the inspector and scopes
coverage supplied by their migrations. Check dock resizing/collapse, narrow
and incapable devices, native inputs, gallery provenance, fidelity and share
workflows after enabling preflight. Production offline tests cover saved
projects, stored samples and locally served fonts.

`npm run release:verify` runs formatting, typechecking/build, sample release
verification, the full browser suite and FFmpeg LUT comparisons. Manual LUT-host
certification blockers in `docs/release-verification.md` remain independent of
this completed presentation migration and must not be reported as a passing
release gate.
