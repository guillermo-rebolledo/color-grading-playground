# Curves

Curves consumes the current branch's RGB code values, applying Master to each
component and then the corresponding R, G or B curve. It inserts no colour
conversion and preserves straight alpha. Use explicit CST nodes to choose an
encoded or linear response.

Each channel starts at identity with points (0,0), (1,1). Edit by dragging or
arrow keys, or type precise coordinates. Add point splits the widest input gap
at its midpoint; delete removes an interior point. Double-click a plotted point
or press Home to reset its output to its input. Reset channel and Reset Curves
restore identity. One drag or held-arrow gesture is one undo step; numeric entry
commits on blur or Enter. Escape discards the numeric draft. Edits, deletion and
resets participate in graph history and the version-1 JSON representation.

## Validation and interpolation

Each curve has 2–256 finite points with input and output in [0,1]. Endpoints have
fixed input 0 and 1, with editable output. Inputs must be strictly increasing,
including after float32 conversion; duplicates and crossing points are rejected
with feedback, preserving the last valid graph. Points are never silently sorted
or merged. Adjacent secants must be representable in float32.

The CPU uses cubic Hermite interpolation with Fritsch–Carlson limiting: endpoint
secants initialize endpoint tangents; interior tangents average adjacent secants,
with zero at sign changes and plateaus. For each nonflat interval the tangent/
secant ratios are scaled into the radius-three circle when necessary. This
preserves each local increasing or decreasing segment, including around extrema.
Reference: Fritsch and Carlson, _Monotone Piecewise Cubic Interpolation_, SIAM
Journal on Numerical Analysis 17(2), 238–246 (1980),
[doi:10.1137/0717021](https://doi.org/10.1137/0717021).

## GPU representation and range

Each channel is baked into a 1024-by-1 R32F texture at x=i/1023. The GPU always
uses two explicit texelFetch reads and linear interpolation with NEAREST texture
filtering, so optional float linear filtering is unnecessary. Endpoints address
the first/last texels exactly. Narrow features between samples may be smoothed
or missed; the displayed polyline shows this baked response. The table introduces
sampling error, even though the underlying cubic preserves local monotonicity.

Below zero, y=y(0)+x*m(0); above one, y=y(1)+(x−1)*m(1), using the limited cubic
endpoint tangents. Thus identity preserves negative and above-one values. This
extension applies independently to master and channel curves; only Output's
explicit policy clamps the grade. Extreme HDR values/steep endpoint slopes can
still overflow floating-point rendering.

Point count and coordinates are absent from shader cache keys. Edits upload new
texture data and endpoint tangent uniforms without compiling/linking programs.
Textures are reused, removed with unused curve slots and freed on engine disposal.
Each reachable Curves node needs four fragment texture units plus the graph's
source unit; excessive graphs fail with an actionable device-limit message.

## Verification

The public engine tests exercise identity, channel order, negative/HDR extension,
alpha, a worked Hermite value, local increasing/decreasing/flat segments, narrow
point spacing, JSON round trips, invalid points and compile/link counts. Browser
workflows cover editing, duplicate feedback, channel switching, pointer/keyboard
history, deletion and resets. Float input uses the existing RGBA32F numeric target:
identity/linear fixtures use five decimal places, bounds and ordering use 1e-6,
and the sampled curved reference allows 0.005 for its off-grid probe.
