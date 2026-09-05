# White Balance

White Balance applies full CAT02 chromatic adaptation to linear RGB through XYZ.
It uses the connected branch's declared primaries, following any CST, or the
project working primaries at Source. It preserves straight alpha and does not
clamp RGB; the Output node owns the clamp policy. An encoded branch produces
an actionable warning to insert a CST; no implicit decoding is added.

## Temperature and tint convention

Temperature is a **source-relative control**, 1667–25000 K, neutral at 6500 K.
It is not a measurement of the photographed illuminant or an inverse camera-WB
correction. Lower values warm the target white and higher values cool it.

The source white is the current gamut's RGB [1,1,1] transformed by its fixed
RGB-to-XYZ matrix: D65 for all supported gamuts except DCI-P3's DCI white.
The 6500 K control position means that exact white even for DCI-P3; it does not
claim DCI white has a physical CCT of 6500 K. No image-content estimate is used.

The Planckian locus uses the piecewise cubic xy approximation of Kang et al.
(2002), with x split at 4000 K and y split at 2222 and 4000 K, as recorded in
[Colour's reference implementation](https://colour.readthedocs.io/en/master/_modules/colour/temperature/kang2002.html).
We restrict the control to its supported 1667–25000 K domain.

Convert locus xy to CIE 1960 UCS (not 1976 u′v′):
`u = 4x / (-2x + 12y + 3)`, `v = 6y / (-2x + 12y + 3)`.
The target is `uv(source) + uv(locus(T)) - uv(locus(6500)) + [0, tint*0.0001]`.
Anchoring avoids the error of treating a daylight or DCI white as a blackbody.
Tint spans −100 to +100; positive tint increases v at fixed u. This vertical
coordinate shift is not perpendicular-locus Duv and does not imply a universal
camera tint scale. The target XYZ is normalized to Y=1:
`[1.5*u/v, 1, (4-u-10*v)/(2*v)]`.

## Adaptation and editing

Using the [CAT02 matrix](https://colour.readthedocs.io/en/master/generated/colour.adaptation.CAT_CAT02.html)
M, the adaptation is `A = inverse(M) * diag((M*target)/(M*source)) * M`.
The engine computes A on the CPU when preparing the current parameters, and
binds its nine column-major values through the existing scalar-uniform binder.
The shader evaluates `XYZ-to-RGB * A * RGB-to-XYZ * rgb`. Fixed gamut matrices
remain precomputed literals; numeric temperature/tint edits never change the
shader topology or compile/link programs. Neutral parameters bind an exact
identity adaptation matrix without changing shader code.

Both controls support scrubbing, typing and double-click reset; whole-node
reset restores 6500 K / zero tint. Parameters serialize in the version-1 graph
and use the existing grouped undo/redo history. Non-finite, missing and
out-of-range parameters are rejected, including restored graphs.

## Verification

`tests/white-balance.spec.ts` tests the public grading-engine boundary and
inspector workflow. Reference whites and saturated red/blue were generated
independently with Colour 0.4.7's `CCT_to_xy_Kang2002` and
`matrix_chromatic_adaptation_VonKries(..., transform="CAT02")`, using its
ITU-R BT.709 matrices and the anchored target convention above. For example,
3200 K / zero tint maps [1,1,1] to [1.6353624, 0.88193501, 0.29817399].
Absolute preview tolerance is 0.002 for RGBA16F quantization. Tests cover all
seven gamuts, source neutrality, saturated/negative/HDR pixels, temperature
piece boundaries, tint endpoints, CST propagation, serialization, validation
and no shader compilation during numeric edits. Finite-output checks use
representative HDR inputs; arbitrary extreme pixel values can still overflow
the RGBA16F preview target, as with other unbounded grading nodes.
