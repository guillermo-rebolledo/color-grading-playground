# CDL, contrast and saturation

These per-pixel nodes consume and return the current branch's RGB code values.
They do not insert colour transforms. Project working space defaults to linear
Rec.709; use explicit CST sequences to grade log or other encoded values.
CDL and Saturation use fixed Rec.709 luma weights (0.2126, 0.7152, 0.0722),
so Rec.709 primaries are recommended. These are not perceptual lightness weights
for every encoding or gamut. Contrast's pivot is in the branch's code units.

## CDL: lower-clamped, unbounded SOP + saturation

For each RGB channel, `sop = pow(max(rgb * slope + offset, 0), power)`.
Then `y = dot(sop, Rec709Weights)` and `result = y + saturation * (sop - y)`.
Neutral slope/power are [1, 1, 1], offset [0, 0, 0], saturation 1.
Neutrality excludes negative inputs, because of the specified pre-power clamp.
Positive power is required to avoid undefined zero-to-zero or negative powers.
No upper clamp follows SOP or saturation: highlights and negative saturation
results survive until the explicit Output policy. This named mode does not
claim equivalence to every ASC CDL host's clamp style.

Slope, offset and power each have a wheel and precise RGB fields. Wheels map
horizontal/vertical coordinates x/y in a unit disc to RGB deltas
`[x, -x/2 + sqrt(3)*y/2, -x/2 - sqrt(3)*y/2]`, preserving the channel mean.
The delta scale is 0.25 for offset and 0.5 for slope/power. Power wheel moves
that would cross zero are rejected. Values outside the wheel's disc remain
editable in the fields; the marker displays their direction at the rim.
Arrow keys move by 0.02 disc units. Home or double-click resets the vector.

## Contrast

`result = pivot * pow(max(rgb, 1e-6) / pivot, amount)` per channel.
Amount and pivot must be positive. Defaults: amount 1, pivot 0.18.
At amount 1, inputs at or above 1e-6 are neutral. **Near-zero exception:**
negative, zero and positive inputs below 1e-6 become 1e-6 even at amount 1.
The pivot is fixed for any amount when pivot >= 1e-6; smaller positive pivots
are permitted but fall inside this same floor exception. There is no upper clamp.

## Saturation and vibrance

This is a chosen response, not an industry-standard vibrance formula:

- `hi = max(r,g,b)`, `lo = min(r,g,b)`
- `chroma = clamp((hi-lo) / max(abs(hi),abs(lo),1e-6), 0, 1)`
- `factor = saturation * (1 + vibrance * (1-chroma))`
- `y = dot(rgb, Rec709Weights)`; `result = y + factor * (rgb-y)`

Defaults saturation 1/vibrance 0 preserve all finite RGB, including negative
and above-one values. Positive vibrance increases chroma proportionally more
for less-saturated colours; fully saturated colours receive no vibrance boost.
Greys remain grey. Negative vibrance reduces chroma with the same weighting.
Only the chroma estimate is bounded; RGB is never clamped. Absolute extrema
make the estimate defined for negative/above-one inputs; mixed-sign colours
with normalized chroma >= 1 receive no vibrance adjustment. Saturation and
vibrance can be typed beyond the suggested slider ranges, including negative
values (which can invert chroma).

## Editing, validation and precision

All numbers are uniforms, including pivot and every wheel's RGB components;
changing them never changes program topology. Parameters serialize in the
version-1 graph and participate in the existing immutable undo/redo history.
One pointer or keyboard scrub gesture is one undo step. Every numeric control
supports double-click reset and every node has a whole-node reset.

Non-finite or non-representable float32 parameters are rejected, including on
restored graphs. Positive power/amount/pivot must remain positive in float32.
Extreme finite inputs or parameters can still overflow GPU arithmetic or the
RGBA16F preview target; parameter validation is not an output-range guarantee.
Reference tests use independent worked vectors with a 0.002 absolute preview
tolerance, and 1e-7 absolute tolerance for the neutral contrast floor.
