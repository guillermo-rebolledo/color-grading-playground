# Color Grading Playground

A client-side still-image grading workspace with an editable node graph. Open a JPEG, PNG or supported TIFF, then scrub or type an exposure from −6 to +6 stops. Reset with the Reset button or a double-click on the numeric control or slider. Images stay on your device.

This implements [MEM-201](https://linear.app/memoji-inc/issue/MEM-201/upload-preview-and-adjust-exposure), [MEM-202](https://linear.app/memoji-inc/issue/MEM-202/build-and-edit-grading-graphs), [MEM-203](https://linear.app/memoji-inc/issue/MEM-203/configure-colour-management-and-cst-nodes), [MEM-204](https://linear.app/memoji-inc/issue/MEM-204/grade-with-cdl-contrast-and-saturation), and [MEM-205](https://linear.app/memoji-inc/issue/MEM-205/support-arri-and-sony-log-workflows). Start with Source → Exposure → Output, then add Exposure, Colour Space Transform (CST), CDL, Contrast, and Saturation nodes. See [grading adjustment modes and domains](docs/grading-adjustments.md) for wheel controls, contrast pivot behavior, and the vibrance response. [MEM-207](https://linear.app/memoji-inc/issue/MEM-207/import-high-bit-depth-png-and-tiff-images) adds precision-preserving 16-bit PNG and TIFF import; see [supported variants and limits](docs/image-import.md). LUT export, persistence, and offline caching are subsequent tickets.

## Run

Use Node.js 24 LTS and npm:

```sh
npm ci
npm run dev
```

Vite prints the local address. To build a static distribution, run `npm run build`; output is in `dist`. `npm run preview` serves that build locally.

## Image and colour behavior

- Inputs are JPEG, PNG and supported RGB/RGBA TIFF stills up to 50 MiB, tagged by default as **sRGB with Rec.709 primaries**. Input, working and output controls select transfer and primaries independently. Embedded profiles are not applied; correct the source tag to match the image. Sixteen-bit RGB/RGBA PNG and supported TIFF use explicit decoders and float GPU upload, preserving adjacent 16-bit codes.
- EXIF/TIFF orientation is applied during local decoding. RGB remains straight alpha with browser colour conversion disabled; associated TIFF alpha is unpremultiplied. The original dimensions shown in the UI are the oriented dimensions.
- The preview is reduced to at most 2048 pixels on its long edge. Only this preview is retained by the renderer; uploaded bytes are not sent to a server or persisted.
- Source converts input to working encoding. Exposure multiplies by `2^stops` and expects linear light; CST converts its explicit from/to pairs. Output converts the connected encoding to the project output and applies its clamp policy. Alpha is unchanged and the browser composites it once over the checkerboard.
- Each reachable topology compiles to one shader program. Exposure changes bind uniforms; previously seen topologies reuse their cached program. Cache keys include node types, typed connections, CST and project encoding pairs, and Output clamp policy, and exclude numeric parameters, IDs, positions, selection, and image data. There is no CPU colour evaluator.

The public `GradingEngine` accepts top-to-bottom, straight-alpha `ImageData`, explicitly decoded `ImageBitmap`, or `{width, height, data: Float32Array}` with encoding declared in `graph.colour.input`. It renders a versioned `GradingGraph` (or a single exposure value with default encodings) and exposes top-to-bottom, **output-encoded** RGBA float pixel readback. Ordinary preview uses RGBA16F; float numeric input uses RGBA32F. A separate display pass converts output to sRGB for the canvas. `dispose()` releases GPU resources.

See [colour management](docs/colour-management.md) for transfer equations, supported gamuts and white points, negative/toe extensions, source range, metadata propagation, precision, and references.

Use **Load precision chart** to try ARRI LogC3 EI 800 / ARRI Wide Gamut 3 or Sony S-Log3 / S-Gamut3.Cine with synthetic Float32 charts. Both log pairs are available in project and CST controls. See [camera-log workflows](docs/camera-log.md) for publisher references, range conventions, and chart instructions.

## Editing graphs

- Add Source, Exposure, CST, or Output from the graph toolbar. Source and Output are unique; delete an existing endpoint before replacing it. New nodes are selected in the inspector. Graph editing works before an image is loaded.
- Drag nodes to move them on the 16-unit grid. Shift-drag empty canvas to box select, or Shift-click nodes to add to a selection. Use the canvas controls to zoom and fit.
- Drag an RGB output port to an RGB input. An input accepts one connection. Select an edge and press Delete/Backspace (or use Delete selection) before replacing it. Invalid ports, occupied inputs, and cycles produce feedback. Mask connections are rejected because these node types only have RGB ports.
- CST exposes separate from/to transfer and primaries controls. Project Input, Working and Output controls live in the inspector. Non-linear Exposure input and mismatched CST declarations show warnings without inserting hidden transforms.
- Exposure supports typing, keyboard arrows, slider scrubbing, and double-click reset. Output selects clamping or unbounded values; the browser display still clips values outside its display range.
- Copy/Paste or Ctrl/Cmd+C/V copies selected nodes and their internal edges using an in-memory graph clipboard. New IDs remain stable through undo/redo. Pasting a duplicate Source/Output is rejected as a whole; copy adjustments alone, or remove the original endpoints first. Text inputs retain native clipboard and undo behavior.
- Undo/Redo or Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (also Ctrl+Y) restores graph structure, positions, parameters, and project encodings. One scrub, numeric editing session, or drag is one step. History keeps the latest 100 immutable graph snapshots and supports future node data without node-specific undo commands. Graph selection and the uploaded image are outside edit history.
- An incomplete disconnected adjustment is a draft and does not affect active output. Missing active inputs or endpoints pause the preview with an explanation until repaired; the app does not display stale pixels as the current grade. Invalid parameter values, IDs, schemas, typed edges, or cycles are rejected by the engine before evaluation.

`createGraph()` and `GradingEngine.validate(graph, draft?)` are public entry points for graph creation and validation. Schema version 1 stores stable node/edge IDs, parameters, explicit project/CST encoding pairs, Output's compile-time clamp policy, and canvas positions. Zustand owns the editable graph and history. This slice keeps all work in memory; reloading starts a fresh project.

## Compatibility

WebGL2, `EXT_color_buffer_float`, and high-precision fragment floats are required. Framebuffer completeness and allocation errors are checked; unavailable capabilities produce a visible explanation. There is no WebGL1 or inaccurate integer fallback. Context loss currently asks the user to reload; automatic restoration belongs to MEM-218.

Local tests use Chromium with ANGLE SwiftShader. This validates the actual WebGL2 path, including float rendering/readback, but is not a claim of physical-GPU or cross-browser certification. Real device coverage is part of the later release tickets.

## Checks

Six licensed photographic HDR log stills, their encoding/provenance inventory,
and reproducible preparation instructions are in [Log sample assets](docs/log-samples.md).
**MEM-208 remains release-blocked:** skin tones, a photographed neutral chart,
and confirmed tungsten lighting still need acquisition. `npm run samples:verify`
checks the bundled subset; `npm run samples:release-check` intentionally fails
until the complete collection is available.

```sh
npx playwright install chromium
npm run typecheck
npm run test:engine
npx playwright test tests/app.spec.ts
npm run format:check
npm run build
npm test
```

Linux CI installs browser system dependencies with `npx playwright install --with-deps chromium`. Tests run at the agreed public engine and browser-workflow boundaries. They cover analytical exposure values, alpha, pixel orientation, no recompilation on parameter changes, JPEG EXIF orientation, PNG compositing, preview size, numeric entry/reset, malformed-file recovery, and unsupported-device feedback. Graph tests additionally cover topology and enum cache reuse, serial exposure highlight recovery, validation failures, typed connections, internal-edge copy/paste, stable IDs, keyboard history, box selection, snapping, and scrub coalescing. Colour tests cover transfer toes, inverse pairs, gamut primaries, adapted whites, signed/highlight values, CST/output boundary composition, viewer separation, and reversible encoding controls. No real user images are used as fixtures.

## References

- [Khronos float framebuffer extension](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/) for required renderability.
- [WHATWG image bitmap options](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html) for orientation, alpha, and explicit decoding behavior.
- [W3C sRGB transfer functions](https://www.w3.org/TR/css-color-4/#color-conversion-code) for the piecewise encoding/decoding equations.

## Deployment

The GitHub repository is connected to the `color-grading-playground` Vercel project in `guillermo-ortizs-projects`.

- Every push or merge to `main` triggers a production deployment through Vercel's Git integration.
- Other branches and pull requests receive preview deployments.
- `vercel.json` records the Vite preset, `npm ci` installation, `npm run build` command, `dist` output, and enabled Git deployments. Node.js 24 is pinned in `package.json` and the Vercel project settings.
- No application environment variables or GitHub Actions deployment secrets are required. The existing Checks workflow runs independently; it does not gate Vercel deployment.
- The local CLI project link is kept in the ignored `.vercel` directory. For a new checkout, run `vercel link --yes --project color-grading-playground --scope guillermo-ortizs-projects` after logging in.

Manage deployments and the production-branch setting in the [Vercel project dashboard](https://vercel.com/guillermo-ortizs-projects/color-grading-playground).
