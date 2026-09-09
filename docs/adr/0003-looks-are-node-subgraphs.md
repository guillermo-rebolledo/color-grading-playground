# 3. A look is a node subgraph, not a baked LUT

Date: 2026-09-07
Status: Accepted
Context: [MEM-233](https://linear.app/memoji-inc/issue/MEM-233/film-inspired-looks-a-pickable-editable-exportable-pool-of-preset),
landed by [MEM-234](https://linear.app/memoji-inc/issue/MEM-234/look-inventory-format-insertion-slot-and-provenance)
through [MEM-238](https://linear.app/memoji-inc/issue/MEM-238/look-only-lut-export-scope-adr-and-documentation)

## Context

The request was a pool of pre-made film-stock LUTs a user can pick, modify
after picking, and export, added as a module that does not disturb the main
grading workflow.

Read literally, that describes shipping `.cube` files and a node that samples
them. It is the obvious reading, it is what most tools do, and it is the one
future work will keep proposing. It is worth writing down why this repository
did something else, because the reasons are specific to this application rather
than general taste.

The application has no LUT import path at all. `src/engine/cube.ts` only
serializes; the only parser is `tests/cube-tools.ts`, kept deliberately
independent so it can check the serializer without sharing its code. A LUT node
would need a parser, a 3D texture sampler in the fragment program, a new
`NodeType`, and a schema extension carrying either lattice payloads or asset
references. A 33³ file is about 700 KB, and the service worker precaches the
whole application shell at install.

The deeper problem is what "modify after selecting" would mean. A baked LUT is
opaque. Modifying it means stacking grading nodes in front of or behind a block
you cannot see into. The application's entire thesis is the opposite: the grade
is a visible graph and the LUT is what you export from it.

And the pool could not have been anyone else's LUTs regardless. Real stock
names are live trademarks, most freely available film LUTs forbid
redistribution, and nothing here is measured against real film — so a
`.cube` labelled with a stock name would assert a fidelity this repository
would refuse to assert about anything else.

## Decision

A look is a subgraph of the node types that already exist.
`public/looks/inventory.json` holds ordered node recipes with no IDs and no
positions; `src/looks.ts` inserts them.

Insertion is always on the single edge feeding `Output` — a slot that is never
ambiguous, because `Output` has exactly one RGB input, and that matches where
a film emulation belongs in practice: after the primary grade, before the
output transform. The shape is

```
upstream ──┬───────────────────────────────────────────┬── Blend(A) ── Output
           └─ CST(working→look) ── nodes ── CST(back) ──┘   Blend(B)
```

**The CST sandwich is not optional plumbing.** `defaultColour.working` is
linear Rec.709, and a tone curve authored for a log signal does something quite
different applied to linear light — quietly, and wrongly. Every look therefore
ships the transforms that get it into DaVinci Intermediate / DaVinci Wide Gamut
and back. They are ordinary visible CST nodes, which is what lets this honour
"no transform is inserted implicitly" rather than route around it.

**Intensity is the Blend node's `amount`.** Both branches arrive at Blend in
working encoding, so the existing encoding check passes without a warning and
the mix happens in linear light. The control every film-look user reaches for
first cost no engine code at all.

**Provenance is two optional string fields**, `look` and `lookHash`. They are
descriptive and never structural. `lookState()` re-derives everything from the
graph on each read, so a dismantled cluster degrades to `Custom look (from …)`
with reset withheld, rather than breaking. Nothing about a look is locked, and
losing the tag never changes a pixel.

### Rejected

- **Baked `.cube` assets with a LUT node** — the costs above, for a worse
  answer to the actual request.
- **A parametric Film Look node** — compact on canvas, but it duplicates the
  curve machinery, adds a `NodeType`, and limits "modify" to whatever
  parameters get exposed, which defeats the reason for preferring graphs.
- **Replacing the whole graph from a template** — trivial, and it destroys the
  user's work, so it is only honest as a starting point.
- **A looks pipeline outside the graph** — maximum isolation, but it breaks
  one-compiled-program-per-topology, which `renderLattice` and therefore the
  entire LUT export rests on.
- **A first-class group container in the schema** — the best answer to canvas
  clutter, and a project on its own: box select, drag, copy/paste, edge
  routing, undo and the inspector all have to agree about something that is one
  node visually and seven structurally.

## Consequences

**No grain, no halation, no bloom, and the docs say why.** Grain is
`f(colour, position, seed)` and fits the single-pass architecture fine; what it
cannot do is appear in a `.cube`, because a 3D LUT is a pure function of
colour. Halation genuinely reads neighbouring pixels. Both are scale-dependent
and the renderer only holds a preview capped at 2048 px. Decisively, the only
file this application produces is a `.cube` — so grain and halation could only
ever be pixels on a screen, never something that reaches the footage being
graded. The Tungsten Night family loses the halation that is Cinestill 800T's
entire signature, and `docs/film-looks.md` says so rather than glossing it.

**Colour lives in the per-channel curves, not in CDL slope.** This was learned
the hard way. CDL slope multiplies the _log_ signal: slope 1.06 shifts mid grey
by about 0.02 in DaVinci Intermediate, which is a 22% exposure change on that
channel, not 6%. The first pass at the thirteen looks used slope for colour
balance and produced casts roughly four times too strong — a mean red/blue
separation of 80 code values where a dozen was wanted. Where a flat per-channel
gain is what is meant, the CDL **offset** expresses it exactly, because an
offset in a log container is a gain: `0.07329248 * log2(gain)`. Curves are also
the better home for colour on their own merits, since the cast can then vary
with tone — cyan shadows under warm mids, which is what film actually does.

**Adding a look is a data change.** A new family is an entry in one JSON file
plus a rendered preview. No component, no schema and no test needs to know
about it.

**Monochrome collapses with Rec.709 luma weights in a wide-gamut container.**
The `saturation` node's weights are fixed at Rec.709 while the look space is
DaVinci Wide Gamut. The result is a monotonic, sensible grey rendering, and the
channel weighting that gives each monochrome family its character is applied
deliberately in front of it — but the collapse itself is not colorimetrically
principled for that gamut. It is a characteristic of these looks, recorded
rather than hidden.

**True channel crosstalk stays out of reach.** No node performs an arbitrary
3×3 mix, and abusing CST primaries to fake one would trip the encoding
advisories. The colour-negative and slide families approximate tonal and
saturation behaviour, not dye-layer interaction. If crosstalk is ever wanted,
the answer is one small channel-mixer node — not a LUT sampler.
