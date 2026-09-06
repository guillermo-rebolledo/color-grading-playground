# Remaining surfaces (MEM-229)

The sample gallery and provenance, LUT fidelity report, share link and privacy
note use the neutral theme and component density. The gallery uses 12px prose,
13px headings, 11px monospaced encoding labels and a 24px offline-storage
button. Provenance stays bounded to 72px and scrolls without pushing the image
out of the stage. Fidelity metrics use 11px tabular mono and 24px table rows;
measurement caveats and the share privacy note use foreground ink. File-load
and inline capability errors also use the neutral surfaces and destructive
token. Accessible names, roles, ARIA attributes and engine behaviour are
unchanged.

## Contract audit against main at e6225b8

The final stylesheet removal is **blocked**. Keep this PR in draft until the
prerequisites land and the remaining rules can be converted safely.

- **MEM-227 (scopes), PR #26:** `src/Scopes.tsx` still owns literal canvas
  colours. `.scopes`, `.scope-*` and the scopes container queries in
  `src/styles.css` still supply its layout. The pending scopes PR replaces
  these; do not delete them ahead of it.
- **MEM-228 (inspector):** `.inspector*`, `.selected-node`, `.node-symbol`,
  parameter, encoding, colour-wheel, curve and LUT-export rules still supply
  the inspector. The colour wheel retains its old literal colours, and the
  curve focus marker still uses a literal white stroke. The ticket must
  migrate these controls and their density before these rules can disappear.
- **MEM-224 (shell), final cleanup in MEM-229:** `.app-shell`, `.stage*`,
  `.viewer-region`, `.dock*`, `.panel-bar`, `.footer` and `.unsupported-*`
  remain in the legacy layer. Their palette is already token-based; their
  geometry must move to the owning components. Global body and native-control
  defaults and `.visually-hidden` must also be replaced as part of the reset.
- **MEM-223 (controls), final cleanup in MEM-229:** remove obsolete legacy
  selectors and comments from `src/controls.css` once their last callers are
  converted. The duplicate `.primary-button:hover` rule in `src/styles.css`
  is superseded by the controls layer and should go with the inspector's
  remaining primary buttons.

The gallery, provenance, fidelity report, file-error and inline capability
rules have been deleted from `src/styles.css`. No runtime declarations or
references to `--bg`, `--panel`, `--line` or `--text` remain. `--muted` and
`--accent` in `src/tokens.css` are the current neutral shadcn tokens, not the
retired palette. Historical ADR descriptions of the migration are retained.

After the dependencies land, finish the shell cleanup, delete `src/styles.css`
and its import/layer, enable Tailwind preflight as required by ADR 1, and
remove the temporary `[data-slot]` border reset. Check native controls, hidden
regions, default text margins and React Flow geometry after enabling preflight.
Search application source for retired palette values and variables again;
engine-owned overlays and fidelity false colours remain untouched.

Run the existing specs without edits, including production offline coverage,
then `npm run release:verify`. The manual LUT-host release blockers documented
in `docs/release-verification.md` are separate from this stylesheet dependency
and must remain reported as blockers.
