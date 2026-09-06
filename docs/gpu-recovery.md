# GPU recovery and interactive preview

The public `GradingEngine` owns context-loss listeners. Loss invalidates scope work,
fidelity reports and GPU handles. Restoration reacquires extensions and precision
checks, rebuilds programs and the retained source/preview targets, and lazily rebuilds
curve textures and topology programs when the current graph is rendered. The app
keeps its graph/history editable, reprobes export support and redraws the latest
edit. Allocation failures display a retry action; `recover()` retries reconstruction
without requiring a page reload. Disposal removes the listeners and retained image.

Source uploads retain an owned CPU copy. Float inputs stay Float32; bitmap uploads
are read directly from their RGBA8 source texture, preserving straight RGB even at
very low alpha after callers close their ImageBitmap. This adds one source-image
copy in memory and one byte readback per bitmap upload, never per edit.

`renderViewer(graph, { interactive: true })` halves both capped preview dimensions
(rounding down, minimum one pixel). Source textures and grading programs are reused;
only the preview target changes size. The app uses the existing edit transaction to
enter interactive mode and returns to full resolution on release/cancel/blur or
80 ms without an edit. Typing, wheel and curve transactions receive the same
optimization. The long-edge cap remains 2048. `render()` and fidelity measurements
use the full capped image; export lattice dimensions never depend on preview size.

Allocation is transactional: an unsuccessful image/preview replacement leaves the
previous resources available. Curve allocation failures discard the failed handle
so a later render can retry. Texture-unit and texture/renderbuffer/viewport limits
produce actionable errors. Lattice output rejects non-finite samples. RGBA32F and
RGBA16F rendering/readback are probed independently against a 0–2 analytical
lattice, at absolute tolerances 1e-6 and 1e-3 respectively; neither support nor
precision is inferred from mobile status. Both routes are disclosed in the export
panel. Coarse-pointer or limited-capability devices receive a desktop/performance
warning, independently of export precision.

## Verification record — 2026-09-06

Tested locally using Playwright Chromium **153.0.8010.12**, Linux x86_64,
WebGL 2.0 / OpenGL ES 3.0 Chromium:

- Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)
  (0x0000C0DE)), SwiftShader driver).
- Launch flags: `--use-angle=swiftshader --enable-unsafe-swiftshader`.
- Fragment highp precision: 23 bits.
- Texture/renderbuffer maximum: 8192; viewport maximum: 8192 × 8192;
  fragment texture units: 32.
- Native export route: RGBA32F. Reduced-precision, unavailable/corrupted
  readback, resource limits/allocation failures and coarse-pointer status are
  injected at the browser WebGL/media boundary. These are controlled regression
  cases, not claims of testing separate physical GPUs or mobile browsers.

`tests/gpu-recovery.spec.ts` exercises real WEBGL_lose_context restoration,
closed/reused source inputs, recovery retry with edits retained, preview sizing,
capability limits, resource failures, precision corruption and finite artifacts.
Existing engine/curves performance tests instrument shader compilation/linking and
check observable pixels and cached-topology reuse. `tests/lut.spec.ts` covers
independent float routes, tiling, serialization, 17³/33³/65³ ordering, export
warnings and unavailable-export feedback.

Physical desktop/mobile GPU drivers, Firefox and Safari remain release-device
verification work; SwiftShader is a correctness regression configuration, not a
hardware performance benchmark.
