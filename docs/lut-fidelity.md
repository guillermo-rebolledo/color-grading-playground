# LUT fidelity

In **LUT export**, choose the size and interpolation, then **Measure LUT
fidelity**. An image is required. **Export .cube** downloads the exact artifact
used by a current report; without a current report it generates the current
grade as usual.

The report measures the full preview (long edge capped at 2,048), not the scopes
thumbnail. Each original input pixel goes through the generated GPU grading
code and, separately, the serialized LUT. Both paths represent the selected
output encoding and Output range policy, before display conversion. Solo,
wipe, snapshots and out-of-range viewer warnings do not change this measurement.

Fully transparent pixels are excluded. Non-transparent inputs with any RGB
channel outside 0–1 are counted separately and excluded from the metrics and
overlay. A report with no eligible samples explicitly says so; its zero metrics
are not evidence of fidelity.

## Reading the report

- Per-channel maximum and P95 are absolute RGB errors multiplied by 255,
  including when the output is log or unbounded. These are code-value units,
  not perceptual colour differences or clipped eight-bit pixel values.
- P95 uses nearest rank: sort each channel's N errors and select the
  `ceil(0.95 × N)`th value, counting from one.
- Overall maximum is the largest error across the three channels.
- The false-colour overlay uses each pixel's largest channel error: blue at
  zero, yellow at two, red at four and above, with linear transitions. It is
  composited at 210/255 opacity; excluded pixels remain clear. It follows image
  fit, zoom and pan. It always describes the full current grade, even over a
  solo or comparison view.
- Above two code values, try 65³ for a 17³/33³ result. At 65³, soften curves or
  keys and measure again. Named contributors are explicitly **heuristics**:
  curve control-point secant slopes greater than four, or zero-softness
  qualifier bands that select less than the full component range. These are investigation hints, not causal attribution.

Image-based fidelity is **not a global error bound** for all possible colours.
Changing the image may reveal errors absent from the previous image. Increasing
size may help, but does not guarantee a bound for discontinuities.

## Engine boundary and precision

`GradingEngine.measureFidelity(graph, { size, interpolation, title? })` returns
the serialized Cube text, top-down errors and overlay pixels, metrics, counts,
precision, advice and report identity. The identity records a graph revision
(including parameters, topology, encodings and output policy), an engine-local
image revision, LUT size and interpolation. `isFidelityCurrent` checks these.
Layout and selection alone do not change the grade. The panel discards reports
and hides overlays when relevant settings change; changing the title also
clears the report to keep the downloaded artifact's title current.

Verification uploads the decimal values parsed from the actual six-decimal
serialization to an RGBA32F 3D texture. GLSL implements trilinear and all six
tetrahedral cases using `texelFetch`; optional float linear filtering is not
required. Endpoints use the final cell with a fractional weight of one. The
fidelity shader appends LUT comparison to the same generated grading body;
there is no separate production CPU grading evaluator. Numeric parameters
remain uniforms and curve values remain texture data.

The error target uses the independently probed lattice precision route,
RGBA32F or RGBA16F, which the report displays. Half-float reports include
lattice and error readback rounding; neither route proves host-independent
precision. Texture-unit, 3D texture allocation and readback failures surface as
errors. Measurement runs on demand and reads/sorts the full image, so a large
preview can briefly pause editing.

## Verification

`tests/fidelity.spec.ts` uses the public grading engine in a real WebGL2 browser.
An independent test-only Cube parser/applier checks both interpolation methods,
all six tetrahedral orderings, ties, endpoints, RGB metrics, nearest-rank P95 and
top-down overlay positions. Difficult curve and qualifier fixtures exceed two
code values and exercise both remedy sizes. Quantization, output policy,
transparent/out-of-domain exclusions, full-cap coverage and report identity
are covered separately. The browser workflow covers measurement, overlay,
download and invalidation.

The RGBA32F independent-applier checks allow 0.005 code values for GPU arithmetic
and separate-pass rounding. The constant-output serialization fixture uses
0.00005 code values to detect the six-decimal quantization itself. These are
fixture tolerances, not product guarantees.
