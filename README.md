# Color Grading Playground

A client-side still-image exposure workspace. Open a JPEG or PNG, then scrub or type an exposure from −6 to +6 stops. Reset with the Reset button or a double-click on the numeric control or slider. Images stay on your device.

This implements [MEM-201](https://linear.app/memoji-inc/issue/MEM-201/upload-preview-and-adjust-exposure): the first runnable slice of the node-based grader. The Source → Exposure → Output pipeline is fixed. Editable graphs, other colour encodings, high-bit-depth import, LUT export, persistence, and offline caching are subsequent tickets.

## Run

Use Node.js 24 LTS and npm:

```sh
npm ci
npm run dev
```

Vite prints the local address. To build a static distribution, run `npm run build`; output is in `dist`. `npm run preview` serves that build locally.

## Image and colour behavior

- Inputs are ordinary JPEG/PNG stills up to 50 MB, interpreted as **sRGB with Rec.709 primaries**. Embedded colour profiles do not override this explicit interpretation; use an sRGB still. This slice does not promise precision-preserving 16-bit decoding.
- EXIF orientation is applied during local `createImageBitmap` decoding. RGB remains straight alpha with browser colour conversion disabled. The original dimensions shown in the UI are the oriented dimensions.
- The preview is reduced to at most 2048 pixels on its long edge. Only this preview is retained by the renderer; uploaded bytes are not sent to a server or persisted.
- The shader decodes piecewise sRGB, multiplies linear RGB by `2^stops`, re-encodes piecewise sRGB, and clamps at Output. Alpha is unchanged and the browser composites it once over the checkerboard.
- The shader program is compiled once per engine instance. Exposure changes bind a uniform and render the fixed graph again; there is no CPU colour evaluator.

The public `GradingEngine` accepts top-to-bottom, straight-alpha sRGB `ImageData` or `ImageBitmap`, renders an exposure, and exposes top-to-bottom RGBA float pixel readback for integrations and verification. The graded pass uses an `RGBA16F` framebuffer, then blits to the visible canvas. `dispose()` releases GPU resources.

## Compatibility

WebGL2, `EXT_color_buffer_float`, and high-precision fragment floats are required. Framebuffer completeness and allocation errors are checked; unavailable capabilities produce a visible explanation. There is no WebGL1 or inaccurate integer fallback. Context loss currently asks the user to reload; automatic restoration belongs to MEM-218.

Local tests use Chromium with ANGLE SwiftShader. This validates the actual WebGL2 path, including float rendering/readback, but is not a claim of physical-GPU or cross-browser certification. Real device coverage is part of the later release tickets.

## Checks

```sh
npx playwright install chromium
npm run typecheck
npm run test:engine
npx playwright test tests/app.spec.ts
npm run format:check
npm run build
npm test
```

Linux CI installs browser system dependencies with `npx playwright install --with-deps chromium`. Tests run at the agreed public engine and browser-workflow boundaries. They cover analytical exposure values, alpha, pixel orientation, no recompilation on parameter changes, JPEG EXIF orientation, PNG compositing, preview size, numeric entry/reset, malformed-file recovery, and unsupported-device feedback. No real user images are used as fixtures.

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
