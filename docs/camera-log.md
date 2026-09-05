# Camera-log workflows

Select **ARRI LogC3 EI 800 / ARRI Wide Gamut 3** or **Sony S-Log3 /
S-Gamut3.Cine** in Input to tag a source. Transfer and primaries remain independent
in project Input/Working/Output and CST from/to controls. Grade in Linear working
space for exposure; choose either log pair in Output for log-encoded numeric
pixels. The viewer separately converts output to sRGB / Rec.709. No look LUT,
tone mapping, or gamut compression is applied; display highlights can clip.

## Pinned references

- ARRI, [ALEXA Log C Curve — Usage in VFX, revision 9 March 2017](https://www.arri.com/resource/blob/31918/66f56e6abb6e5b6553929edf9aa7483e/2017-03-alexa-logc-curve-in-vfx-data.pdf):
  pp. 4 and 9, **SUP 3.x EI 800 exposure-value** coefficients; pp. 7 and 10,
  linear gamut matrix and virtual primaries. This is LogC3, not LogC4, and uses
  scene exposure, not sensor signal or a sensor black offset.
- Sony, [Technical Summary for S-Gamut3.Cine/S-Log3 and S-Gamut3/S-Log3, V1.0](https://download.pro.sony/FNGP/protein/1237494271390/1237494271406.pdf):
  2014 release, appendix pp. 6–7 (formulas, code values, chromaticities).
  Publisher asset `1237494271406.pdf`, SHA-256
  `d9c8a042e7e9e8ee248df97633b645681b5370099a508b6cee97d8bad880d5d3`.
  The inverse toe's printed `out +` is interpreted as assignment to the
  algebraic inverse of the forward toe.

## Normalization and domain

`E` is the full-range normalized code: a 10-bit code is divided by **1023**,
not 1024 and not expanded from 64–940. Full range describes the code container;
it does not put scene black at code zero or scene white at code one. Legal-range
material must be explicitly expanded before import. No profile name triggers
range scaling. `L` is scene-linear exposure/reflection (18% grey = 0.18).

LogC3 EI 800 uses `cut=0.010591`, `a=5.555556`, `b=0.052272`, `c=0.247190`,
`d=0.385537`, `e=5.367655`, `f=0.092809`:

- Encode: `c log10(a L + b) + d` when `L > cut`; otherwise `e L + f`.
- Decode: `(10^((E-d)/c) - b)/a` when `E > e cut + f`; otherwise `(E-f)/e`.

The decoder computes `e cut + f = 0.149657834105`, rather than using the table's
rounded 0.149658. Published rounded coefficients leave a tiny discontinuity;
we retain it. Scene black encodes to 0.092809 and 18% grey to 0.391006832034
(400 when rounded to a 10-bit code).

S-Log3 uses `cut=0.01125`, `k=171.2102946929`:

- Encode: `(420 + 261.5 log10((L+0.01)/0.19))/1023` when `L >= cut`;
  otherwise `(L (k-95)/cut + 95)/1023`.
- Decode: `0.19 * 10^((1023 E-420)/261.5) - 0.01` when `E >= k/1023`;
  otherwise `(1023 E-95) cut/(k-95)`.

Black, 18% grey, and 90% white round to Sony's published 10-bit codes 95, 420,
and 598. White's unrounded normalized value is 0.584452842075.

Both linear toes continue below zero, preserving negative scene values. Positive
log branches continue above scene white and code one without clipping. Scalar
branches avoid logarithms of invalid bases. Output's explicit clamp policy is
the only pipeline boundary clamp; display clipping is separate. Preview and
numeric evaluation use the same GLSL functions.

## Gamuts

Both spaces use D65 `(0.3127, 0.3290)` and relative white Y=1:

| Primaries         | Red xy         | Green xy       | Blue xy         |
| ----------------- | -------------- | -------------- | --------------- |
| ARRI Wide Gamut 3 | 0.6840, 0.3130 | 0.2210, 0.8480 | 0.0861, −0.1020 |
| S-Gamut3.Cine     | 0.7660, 0.2750 | 0.2250, 0.8000 | 0.0890, −0.0870 |

The existing matrix generator computes fixed RGB/XYZ matrices and inverses from
these publisher chromaticities, including negative virtual-primary coordinates.
ARRI tests use its **linear** Rec.709 matrix on p. 7; the tone-map-compensating
matrix on p. 6 and vendor look LUTs describe different operations.

## Precision charts and verification

The **Load precision chart** menu opens an original synthetic Float32 chart in
either log encoding and sets its Input tag. It keeps the current grade and output
settings. Top row, left to right: scene-linear neutral patches 0, 0.01, 0.18,
0.9, 4, 16. Bottom: red, green, blue, cyan, magenta, yellow, each with high channel
0.9 and low channel 0 in the selected camera gamut. Codes are tabulated from the
publisher equations; the app only expands those constants into pixels. There is
no CPU grading evaluator, browser image decoder, or eight-bit source round trip.
These charts are precision fixtures, not photographed camera samples.

Try +1 stop on the 18% patch (sRGB display code approximately 118 → 162).
Try −4 stops to reveal the bright neutral patches. Choose the chart's log pair
in Output: numeric output changes encoding while the display remains managed.
A CST can explicitly target either pair; Output does not encode it a second time.

The public-engine tests use Float32 input/readback, independently tabulated
publisher-formula vectors, primary vectors, both sides of each toe, black/grey,
negative and highlight values, alpha, forward/inverse behavior, and a JSON graph
round trip with CST. Tolerances: 5e−6 absolute for transfer/primary vectors;
3e−5 for inverse tests extending to scene-linear 16; displayed 8-bit grey ±1 CV.
Browser workflows exercise chart loading, exposure, output selection, CST enums,
and undo/redo.

Schema version 1 stores `logc3` / `slog3` transfer enums and `arri-wide-gamut3` /
`sgamut3-cine` primaries in `graph.colour` and CST `data.from` / `data.to`.
These survive JSON serialization and existing history snapshots. The schema
always means normalized full range; no implicit range inference is added.
On-disk project persistence, precision-preserving file decoders, and licensed
camera sample acquisition remain separate tickets.
