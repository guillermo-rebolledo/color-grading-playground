# LUT export

**LUT export** in the inspector downloads the current grade as an Adobe Cube
3D LUT evaluated by the GPU. The lattice runs through the same compiled
grading program as the preview; there is no CPU colour evaluator. Any node the
engine can preview is therefore exportable, and future nodes reuse this path.

## What the file contains

- `TITLE` is the sanitized title: printable ASCII only, no quotes, collapsed
  whitespace, at most 240 characters, defaulting to `Grade`. The download name
  is the sanitized title with other characters replaced by `-`, plus `.cube`.
- `LUT_3D_SIZE` is 17, 33 (default) or 65. `DOMAIN_MIN`/`DOMAIN_MAX` are
  0 and 1. Exactly N³ rows follow, each three finite values at six decimals,
  with the red index changing fastest, then green, then blue.
- Rows map **input-encoded** code values 0–1 to **output-encoded** values,
  through the project's Input, Working and Output encodings and every
  reachable node. Legal-range or out-of-domain sources are not expanded or
  extrapolated; the LUT covers the same full-range 0–1 container as the
  Source tag.
- The range control edits the Output node's clamp policy; the inspector and
  the export panel share one control and one undo step. The default clamps
  rows to 0–1; **Allow out-of-range** keeps negative and above-one values in
  the file. Non-finite values abort the export with an explanation instead of
  writing a partial file.
- 65³ files are about 7 MB; the panel warns before writing one. 33³ is
  sufficient for most grades.

## Scope

**Scope** selects what the file contains. **Whole grade** is the default and
is unchanged. **Look only** is enabled when a
[film-inspired look](film-looks.md) is applied: it evaluates
`Source → CST → look nodes → CST → Blend → Output` with the primary grade
absent, through this same lattice path, and exports the look **as edited**
rather than as shipped.

Both scopes obey the one rule above — rows map input-encoded 0–1 to
output-encoded values, using the project's Input and Output tags — so there is
one export semantic rather than two. Look-only copies the Output node's clamp
policy, so the shared range control still governs it, and the title defaults to
the look's family name. Measured fidelity applies to whichever scope is
selected. A look-only export compiles one additional program.

## GPU evaluation

The grading fragment shader has a `lattice` uniform. When it is zero the
program samples the image; when it is N the program synthesizes the identity
lattice from the fragment coordinate: red along x, one green step per row and
one blue step every N rows. The program, its cache key and all parameter
uniforms are otherwise unchanged, so exporting never recompiles a shader that
the preview already uses.

The nominal target is N wide by N² rows. When the device texture, renderbuffer
or viewport limit is smaller, the export renders consecutive row ranges into a
shorter target and concatenates the readbacks. Framebuffer rows are bottom-up
in both rendering and readback, so tiles concatenate in lattice order without
reordering. `GradingEngine.renderLattice(graph, size, tileRows?)` exposes the
tile height as a verification hook; forced tiling yields identical samples.

## Capability and precision

`GradingEngine.latticeSupport()` probes once per engine and caches the result:

1. Render a 4³ identity lattice through a linear graph at +1 stop with an
   unbounded Output, so samples span 0–2, into an RGBA32F target and read it
   back as floats. Every sample must be within 1e−6 of its exact value.
2. If that fails, repeat with an RGBA16F target. Half-float is accepted only
   when its own framebuffer check passes and every sample is within 1e−3 of
   its exact value. The panel then notes the reduced precision.
3. Otherwise export is disabled, and the reason from each attempt is shown.

The preview target and `readPixels()` are unaffected by lattice rendering.

## Verification

`tests/cube-tools.ts` is an independent Cube parser and trilinear applier that
shares no code with the serializer. Tests cover a 2³ channel-swapping corner
fixture, all three sizes, header and row formatting, title sanitization,
negative zero, red-fastest ordering, tiling, clamped and unbounded ranges,
the half-float fallback and the disabled state.

Reproduction tolerance is trilinear interpolation error, measured for the
reference look (sRGB in/out, +0.5 stops, a CDL with power and saturation, and
contrast about an 0.18 pivot) at asymmetric off-grid probes and the domain
endpoints:

| Size | Absolute tolerance |
| ---- | ------------------ |
| 17³  | 0.015              |
| 33³  | 0.005              |
| 65³  | 0.002              |

Lattice points and endpoints match the engine's float image evaluation to
1e−5. Looks with sharp discontinuities, such as hard-edged qualifiers, will
interpolate less accurately between lattice points; that is a property of any
3D LUT, not of this export.

## References

- Adobe, [Cube LUT Specification 1.0](https://web.archive.org/web/20220121191449/https://wwwimages2.adobe.com/content/dam/acom/en/products/speedgrade/cc/pdfs/cube-lut-specification-1.0.pdf):
  keywords, ordering, domain and comment syntax.
