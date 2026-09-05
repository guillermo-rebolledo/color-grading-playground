# Colour management

Every project encoding is a separately selected `transfer` / `primaries` pair.
Defaults are sRGB / Rec.709 input and output, and Linear / Rec.709 working.
`GradingGraph.colour` stores all three pairs; CST nodes store `data.from` and
`data.to`. These are required, validated metadata, included in graph snapshots
and undo/redo. The version-1 graph schema now requires colour metadata; old
in-memory drafts lacking it must be recreated with `createGraph()`.

## Pipeline and node declarations

Source converts input to working once. Exposure multiplies by `2^stops` and
preserves the input's declared encoding; it expects linear light and warns if
connected to a non-linear encoding. A CST decodes its explicit **from** transfer,
converts primaries/white in linear XYZ, and encodes its **to** transfer. Its output
carries the **to** encoding. A mismatched **from** declaration warns; the declared
conversion still runs, with no hidden repair.

Output converts the connected node's declared encoding to project output once,
then applies its clamp policy (default 0–1, or explicitly unbounded). Thus a CST
that already reaches the output encoding is not encoded twice. A CST never
changes the project defaults. Disconnected drafts are validated but do not
participate in compilation or encoding warnings. Blend encoding diagnostics will
be implemented with Blend in its own slice.

`GradingEngine.render(graph)` runs the compiled per-pixel grade into a float
target. `readPixels()` returns **output-encoded** straight RGBA, top to bottom.
The separate display pass converts that target to sRGB / Rec.709 and clips it for
the canvas. It cannot change numeric output. The canvas drawing-buffer colour
space is explicitly sRGB; the browser may then perform its normal documented
sRGB-to-monitor compositing. Display conversion belongs outside future LUT and
fidelity paths. There is no implicit tone mapping or gamut compression.

Topology keys include project pairs, reachable CST enums, connections, node types
and Output policy. Numeric exposure values are uniforms. Image data, positions,
selection, node IDs and disconnected draft enum choices do not rebuild shaders;
previously seen configurations reuse cached programs. Viewer programs are cached
separately by output encoding.

## Transfer functions and extensions

Let `L` be linear light and `E` encoded code value. These functions use normalized
**full-range** values: the nominal code container spans 0–1. Scene black and
white need not be code 0 and 1 (camera-log encodings have nonzero black). Video/legal-range samples
must be expanded before import; no range is inferred from transfer or gamut.
There are no intermediate clamps. All transfer choices are independent of gamut.

| Transfer        | Decode E → L                                                    | Encode L → E                                                 |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Linear          | E                                                               | L                                                            |
| sRGB            | E / 12.92 for E ≤ 0.04045; otherwise ((E + 0.055) / 1.055)^2.4  | 12.92 L for L ≤ 0.0031308; otherwise 1.055 L^(1/2.4) − 0.055 |
| Rec.709 OETF    | E / 4.5 for E < 0.081; otherwise ((E + 0.099) / 1.099)^(1/0.45) | 4.5 L for L < 0.018; otherwise 1.099 L^0.45 − 0.099          |
| Gamma 2.2 / 2.4 | sign(E) abs(E)^gamma                                            | sign(L) abs(L)^(1/gamma)                                     |

sRGB uses the IEC piecewise formula, not a gamma approximation. Sources:
[W3C CSS Color 4 sRGB definition](https://www.w3.org/TR/css-color-4/#predefined-sRGB)
and [ITU-R BT.709-6](https://www.itu.int/rec/R-REC-BT.709/en).
Rec.709 here means the OETF/inverse, not BT.1886 or a display gamma.
The published rounded Rec.709 constants create a small discontinuity at the toe;
the inverse switches at 0.081 and does not “smooth” those constants. Therefore
round trips immediately around the toe can differ by about 0.00025 code units.
sRGB also retains its published rounded thresholds.

For sRGB and Rec.709 we extend the linear toe through **all negative values**.
This is an explicit project extension, different from CSS's sign-reflected
negative sRGB power extension. Gamma transfers use signed powers. Above one,
the positive power branches continue without clipping. Scalar conditional GLSL
avoids evaluating fractional powers of negative bases. Preview and numeric
readback use the same functions.

ARRI LogC3 EI 800 and Sony S-Log3 use their published piecewise log/linear-toe
functions. See [camera-log workflows](camera-log.md) for pinned references,
coefficients, gamut chromaticities, precision charts, and encoding metadata.

DaVinci Intermediate and Apple Log, including direct DaVinci Wide Gamut support,
are documented in [Intermediate and Apple Log](intermediate-apple-log.md).
Apple Log retains its published quadratic toe and floor, rather than extending
a linear toe to all negative values.

## Gamuts and white adaptation

| Primaries  | Red xy       | Green xy     | Blue xy      | White xy            |
| ---------- | ------------ | ------------ | ------------ | ------------------- |
| Rec.709    | 0.640, 0.330 | 0.300, 0.600 | 0.150, 0.060 | D65: 0.3127, 0.3290 |
| Rec.2020   | 0.708, 0.292 | 0.170, 0.797 | 0.131, 0.046 | D65: 0.3127, 0.3290 |
| Display P3 | 0.680, 0.320 | 0.265, 0.690 | 0.150, 0.060 | D65: 0.3127, 0.3290 |
| DCI-P3     | 0.680, 0.320 | 0.265, 0.690 | 0.150, 0.060 | DCI: 0.3140, 0.3510 |

Sources: [CSS Color 4 conversion matrices](https://www.w3.org/TR/css-color-4/#color-conversion-code),
[ITU-R BT.2020-2](https://www.itu.int/rec/R-REC-BT.2020/en), and
[ICC registry: DCI P3 / SMPTE EG 432-1](https://registry.color.org/rgb-registry/dcip3).
P3 labels identify primaries and white only. Display P3 conventionally uses sRGB;
selecting its primaries does not change transfer. DCI-P3's conventional cinema
gamma 2.6 is not one of this slice's supported transfers; do not interpret a
DCI-P3 / gamma 2.4 pair as a standard cinema delivery encoding.

RGB/XYZ matrices and their inverses are precomputed with relative white Y=1.
DCI↔D65 adaptation uses linear Bradford: B⁻¹ diag(B Wdest / B Wsource) B,
with cone matrix rows (0.8951, 0.2664, −0.1614), (−0.7502, 1.7135, 0.0367),
(0.0389, −0.0685, 1.0296). Same-white conversions require no adaptation.
Constants are stored in `src/engine/colourMatrices.ts`. Regenerate with
`python3 scripts/colour-matrices.py`, then format that file with Prettier.
There is no matrix inversion or chromaticity solving in the browser.

## Source interpretation and precision

JPEG/PNG decode requests EXIF orientation, straight alpha and
`colorSpaceConversion: "none"`, including the resize path. Embedded profiles
are intentionally not applied or automatically interpreted: source tagging is
manual and visible. Match the input pair to the actual file; retagging cannot
restore missing highlight range. Texture upload disables WebGL colour conversion
and premultiplication. `ImageData` uploads its raw bytes, bypassing its colour
space tag. Direct callers supplying ImageBitmap must decode with these same
options: a transform already baked into a bitmap cannot be undone by tagging.
Grading does not modify alpha.

Ordinary image preview uses RGBA8 source and RGBA16F target. The public `setImage`
method also accepts `{width, height, data: Float32Array}` containing finite,
straight RGBA for numeric evaluation, using RGBA32F input and target. Both paths
use the same grade shader. Float inputs allow tests to reach exact threshold
neighborhoods, negative samples and values above one without eight-bit
quantization. Allocation/render/readback failures are explicit; float precision
never silently falls back. Preview size remains capped at 2048. This API does
not provide a 16-bit file decoder or a tiled lattice exporter; those have their
own scheduled slices.

Engine reference tests use independently tabulated transfer values and primary
conversion vectors, neutral whites and inverse checks. Float transfer checks
allow 5e−6 numerical error; ordinary image target checks allow half-float rounding.
Browser regressions cover orientation, alpha and visible settings/history.
