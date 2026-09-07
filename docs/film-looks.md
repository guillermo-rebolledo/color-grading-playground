# Film-inspired looks

**Browse looks** in the topbar opens a pool of preset grades. Picking one
inserts it into your graph as ordinary nodes you can edit, swap, reset, remove
and export. There is no new node type and no new schema version: a look is a
subgraph, not a baked LUT. See
[ADR 3](adr/0003-looks-are-node-subgraphs.md) for why, and for what was
rejected.

## What a look is not

**Colour response only. No grain, no halation, no bloom.** This is a
consequence of what the application delivers, not an omission.

- Grain is a function of colour, pixel position and a seed. It fits the
  single-pass architecture; what it cannot do is appear in a `.cube`, because
  a 3D LUT is a pure function of colour.
- Halation reads neighbouring pixels — highlight extraction, a downsample blur
  chain, a tinted add-back — which breaks one compiled program per topology.
- Both are scale-dependent, and the renderer only ever holds a preview capped
  at 2048 px on its long edge.
- The only file this application writes is a `.cube`. Grain and halation could
  therefore only ever be pixels on your screen; they could never reach the
  footage you are grading.

The practical cost is concentrated in one family: **Tungsten Night** references
Cinestill 800T, which is Vision3 500T with the remjet removed, and halation is
the entire point of that stock. What ships is its tungsten palette and lifted
shadows, and nothing else.

## The families

Names are families, not stocks. Nothing here is measured against real film, so
naming a look after a trademark would claim a fidelity that cannot be backed —
the same standard this repository applies to
[unverified LUT hosts](release-verification.md). Reference stocks appear on the
tile and in its tooltip.

Families deliberately collapse stocks that differ mainly in **grain or speed**,
because a colour-only look cannot distinguish them. Shipping Kentmere 100 and
Kentmere 400 as two identical files would be a difference a user notices is not
there.

| Family                   | Group           | Reference stocks                      |
| ------------------------ | --------------- | ------------------------------------- |
| Warm Portrait Negative   | Colour negative | Portra 160 / 400 / 800                |
| Consumer Warm Negative   | Colour negative | Gold 200, ColorPlus 200, UltraMax 400 |
| Vivid Negative           | Colour negative | Ektar 100                             |
| Cool Consumer Negative   | Colour negative | Fujicolor C200, Fujifilm 400          |
| Tungsten Night           | Colour negative | Cinestill 800T                        |
| Saturated Slide          | Slide           | Velvia 50, Velvia 100                 |
| Neutral Slide            | Slide           | Provia 100F, Ektachrome E100          |
| Classic Panchromatic B&W | Black and white | HP5 Plus 400, Tri-X 400, FP4 Plus 125 |
| Modern Tabular B&W       | Black and white | T-Max 100, T-Max P3200, Delta 3200    |
| Budget B&W               | Black and white | Kentmere 100/400, Fomapan 100/200/400 |
| Chromogenic B&W          | Black and white | XP2 Super                             |
| Daylight Motion Picture  | Motion picture  | Vision3 50D (5203), 250D (5207)       |
| Tungsten Motion Picture  | Motion picture  | Vision3 200T (5213), 500T (5219)      |

## Shape

A look is inserted on the single edge feeding `Output` — the slot is never
ambiguous, because `Output` has exactly one RGB input, and it is where a film
emulation belongs: after the primary grade, before the output transform.

```
upstream ──┬───────────────────────────────────────────┬── Blend(A) ── Output
           └─ CST(working→look) ── nodes ── CST(back) ──┘   Blend(B)
```

- **The CST sandwich** converts into the look space and back. It exists because
  the default working encoding is linear and a tone curve authored for a log
  signal does something quite different on linear light. These are ordinary
  visible CST nodes; nothing is inserted implicitly.
- **Blend `amount` is intensity.** Both branches arrive in working encoding, so
  the encoding check passes and the mix happens in linear light. 0 is a
  no-op, 1 is the full look.
- Five to eight nodes. Everything downstream of the branch slides right by
  exactly the width the look reserves, so the cluster never lands on your own
  nodes, and removing it gives the width back.

## Look space

**DaVinci Intermediate / DaVinci Wide Gamut.** In that container mid grey
(linear 0.18) sits at **0.336** and diffuse white (linear 1.0) at **0.514**, so
every look does its shaping below about 0.55 and stays near identity above it —
a log source's highlight headroom is not reshaped by a look meant for the mid
range.

Colour is carried by the **per-channel curves**, not by CDL slope. Two reasons:

1. It is more film-like. A curve's cast varies with tone, so a family can have
   cyan shadows under warm mids.
2. CDL slope multiplies the log signal. Slope 1.06 shifts mid grey by about
   0.02 in DaVinci Intermediate, which is a **22% exposure change** on that
   channel, not 6%. A first pass using slope for colour balance produced casts
   about four times too strong.

Where a flat per-channel gain is what is meant — the monochrome "filter"
weighting — the CDL **offset** expresses it exactly, because an offset in a log
container is a gain:

```
offset = 0.07329248 * log2(gain)     # +10% -> +0.0101,  -22% -> -0.0263
```

Two known characteristics, recorded rather than hidden:

- **Monochrome collapses with Rec.709 luma weights** while the look space is
  DaVinci Wide Gamut. The result is a monotonic, sensible grey scale, and each
  family's character comes from the channel weighting applied in front of it,
  but the collapse itself is not colorimetrically principled for that gamut.
- **True channel crosstalk is not reachable.** No node performs an arbitrary
  3×3 mix. The colour families approximate tonal and saturation behaviour, not
  dye-layer interaction.

## Provenance and state

Each inserted node carries an optional `look` id and a `lookHash` of the
definition it came from. **The nodes are always the truth**: reopening a saved
project never changes a pixel, even if the shipped definition has moved on.
State is re-derived from the graph on every read.

| Inspector reads          | Meaning                                          | Reset    |
| ------------------------ | ------------------------------------------------ | -------- |
| `Warm Portrait Negative` | Intact and unedited                              | offered  |
| `… (modified)`           | An inner node's parameters differ from shipped   | offered  |
| `… (older version)`      | Applied from an earlier definition of this look  | offered  |
| `Custom look (from …)`   | Rewired or partly deleted; still grades normally | withheld |
| `Custom look`            | The id is no longer in the inventory             | withheld |

Intensity is **not** counted as a modification: it is a first-class control
with its own affordance, so changing it should not put a confirmation in your
way. **Reset look** restores the shipped parameters in place, re-points the
CSTs at the current working encoding, and returns intensity to 1.

One look at a time. Swapping replaces silently unless you have edited the look,
in which case it confirms first. Insert, swap, reset and remove are each one
undo step. Nothing is ever locked: a look's nodes can be edited, moved, copied
or deleted like any others.

If nothing is connected to `Output`, the picker is disabled and says so, the
same way a missing endpoint already pauses the preview.

## Export

The LUT export panel takes a **Scope**:

- **Whole grade** — the default, and exactly the behaviour that existed before
  looks.
- **Look only** — enabled when a look is present. Exports `Source → CST → look
nodes → CST → Blend → Output` with your primary grade absent, through the
  same `renderLattice` path. It exports the look **as you edited it**, not the
  shipped definition.

Both scopes use one rule, the one already in
[LUT export](lut-export.md): rows map **input-encoded** code values 0–1 to
**output-encoded** values, using the project's Input and Output tags. Look-only
also inherits the Output node's clamp policy, so the shared range control still
governs it. The title defaults to the family name in look-only scope, and
**Measure LUT fidelity** measures whichever scope is selected.

## Inventory and verification

`public/looks/inventory.json` holds, per look: `id`, `name`, `group`,
`description`, `referenceStocks`, an ordered `nodes` list of `{ type, data }`
recipes with **no IDs and no positions**, and its rendered `preview`. A node's
`data` is merged over that node type's defaults, so a definition states only
what it changes. The inserter mints stable IDs and places nodes at multiples of
the editor's 16-unit grid.

A definition's content hash is computed (`src/engine/lookHash.ts`), never
stored beside the definition, so the two cannot drift apart.

Previews are rendered through the **real grading engine** over one reference
frame — `canal-actors`, chosen for skin tones and a wide range of values, and
recorded with its licence in the inventory — using headless Chromium with
SwiftShader:

```sh
npm run dev            # in another terminal
npm run looks:previews
npm run looks:verify
```

`npm run looks:verify` checks structure, curve legality, preview checksums and,
critically, that each preview's recorded definition hash still matches the
definition beside it — so editing a look without re-rendering fails the build.
`npm run looks:release-check` additionally requires all thirteen families and
all four groups, and runs as part of `npm run release:verify`.

Whether a look validates through the engine, compiles, differs from identity
and differs from every other look needs a real WebGL2 context, so those live in
`tests/looks.spec.ts` rather than in the script.

The look inventory and its previews are precached at service worker install
(932 KiB), which means **editing any look invalidates the application cache**.
See [offline use](offline.md).
