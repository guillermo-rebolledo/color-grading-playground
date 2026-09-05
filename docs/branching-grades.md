# Branching grades and HSV qualification

The app starts with Exposure feeding cool and warm CDL branches and an HSL
Qualifier. Blend mixes the cool A branch toward the warm B branch using the
qualifier's value selection. `createStarterGraph()` exposes this template;
`createGraph()` remains the neutral Source → Exposure → Output configuration.

Blend requires RGB inputs A and B and accepts an optional scalar mask. Its
result is `mix(A, B, amount * clamp(mask, 0, 1))`; amount must be in 0–1 and
an unconnected mask is one. RGB is not clamped by Blend. Declared branch
encodings must match for a meaningful blend; incompatible encodings produce
a warning and must be corrected with explicit CST nodes. No transform is
inserted implicitly. The downstream declaration follows A.

HSL Qualifier retains the requested node name but uses **HSV**, with
Hue/Saturation/Value controls. Qualification evaluates current branch code
values. RGB is clamped to 0–1 only for the HSV calculation, leaving the RGB
branches untouched. Value is the maximum component; saturation is chroma
relative to that maximum (zero at black).

Each component has an inclusive min/max band and outward softness. Membership
is one inside the band and falls to zero over the softness distance using a
smoothstep ramp. Zero softness selects inclusive hard edges without calling
smoothstep with equal edges. The three memberships multiply. Saturation and
value ranges/softness are normalized to 0–1, and min must not exceed max.
Hue uses 0–360 degrees and permits min greater than max to cross red at zero.
The full 0–360 range ignores hue; equal endpoints select a single hue. Outside
a hue band, membership uses the nearest circular boundary. Achromatic colors
have no hue and are excluded unless the full hue range is enabled.

RGB ports are round with solid green edges; mask ports are square with dashed
purple edges. Blend's input ports are A, B, and Mask from top to bottom.
Double-click an HSL Qualifier or use **Solo mask** to inspect it in grayscale.
**Exit mask solo** restores Output. Solo bypasses output and display encoding
transforms so mask coverage is displayed directly; it is a viewer diagnostic,
not a graph operation. RGB and mask connections cannot be interchanged.

Parameters and typed edges serialize in the version-1 graph and use existing
undo/redo snapshots. Numeric scrubs update uniforms without recompilation.
The public `GradingEngine.render(graph, qualifierId)` preview option reads mask
coverage via `readPixels()`; calling `render(graph)` restores the grade.
All grading and qualification depend only on the current pixel's RGB.
