# Release verification (MEM-220)

This is the release record for the MVP described in
[MEM-200](https://linear.app/memoji-inc/issue/MEM-200/browser-node-based-color-grader-mvp-technical-specification).
It states what was verified, on which configuration, with which tolerances, and
what is **not** verified. Untested hosts and untested hardware are recorded as
release blockers; they are never reported as successes.

**Current status: BLOCKED.** Every automated check passes and the static build
is produced, but three of the four required LUT hosts (DaVinci Resolve,
Photoshop, Lightroom) cannot be exercised from this project. Physical-GPU,
Firefox and Safari coverage is also outstanding. See
[Release blockers](#release-blockers).

## Running the verification

```sh
npm ci
npx playwright install --with-deps chromium
sudo apt-get install -y ffmpeg   # or an equivalent FFmpeg install
npm run release:verify
```

`release:verify` runs the formatter check, the static build, the sample release
gate, the full browser suite and the FFmpeg host comparison. The two release
steps can also be run alone:

- `npm run release:evidence` — the integrated acceptance pass
  (`tests/release.spec.ts`), which writes `release-evidence/`.
- `npm run release:hosts` — `scripts/verify-lut-hosts.mjs`, which applies the
  downloaded `.cube` artifacts in FFmpeg and writes
  `release-evidence/host-verification.json`. It exits non-zero when a host
  comparison exceeds tolerance; adding `--release` also fails while manual host
  blockers remain.

`release-evidence/` is generated, not committed. CI uploads it as an artifact on
every run.

| Evidence file                           | Contents                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `acceptance.json`                       | Integrated pass: sample, graph size, output encoding, both fidelity reports |
| `acceptance-grade.cube`                 | The 33³ artifact downloaded from the measured report                        |
| `capability.json`                       | Browser, GPU/driver, precision, limits, lattice route, preview timings      |
| `host-probe.png`                        | RGB16 probe codes: exact 33³ lattice coordinates and off-grid values        |
| `host-identity.cube`, `host-grade.cube` | The artifacts downloaded from the export panel                              |
| `host-*-{trilinear,tetrahedral}.png`    | Independent-applier expectations for each artifact                          |
| `host-verification.json`                | FFmpeg version, filter string, per-run maximum/P95 error, blockers          |

## Integrated acceptance

`tests/release.spec.ts` walks the whole workflow in one browser session rather
than one feature at a time: it opens a genuine bundled log sample, assembles a
graph containing **all eleven node types**, edits parameters through the real
inspector, undoes and redoes, uses the viewer diagnostics and scopes, saves and
shares the project, measures LUT fidelity, downloads the measured artifact and
reloads to confirm the restored project. Per-feature behaviour keeps its own
spec; this pass proves the parts work together.

| Specification area                   | Integrated pass                                                                                            | Focused specs                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Eleven node types in one graph       | Source, Exposure, CST, White Balance, Contrast, Curves, Saturation, two CDLs, HSL Qualifier, Blend, Output | `adjustments`, `curves`, `white-balance`, `blend`           |
| Transfers and gamuts                 | DaVinci Intermediate / DaVinci Wide Gamut in, CST to linear Rec.2020, Gamma 2.4 / Rec.2020 out             | `engine`, `log`, `intermediate-apple`                       |
| High-bit-depth import                | 1240 × 846 RGB16 sample through the precision importer                                                     | `import`, `samples`                                         |
| Genuine samples                      | Gallery selection applies the verified inventory tags                                                      | `sample-picker`, `samples`, `npm run samples:release-check` |
| Graph editing                        | Toolbar node creation, inspector edits, undo/redo                                                          | `app`, `blend`                                              |
| Persistence and sharing              | Save, share link, reload restores the grade                                                                | `projects`                                                  |
| Viewer                               | Snapshot A comparison, wipe, out-of-range, 100 % zoom, node solo                                           | `viewer`                                                    |
| Scopes                               | Histogram and parade measured on the graded output                                                         | `scopes`                                                    |
| Export and fidelity                  | 33³ measured report, downloaded artifact, 65³ remedy re-measured                                           | `lut`, `cube`, `fidelity`, `fidelity-workflow`              |
| Offline                              | Not in this pass — offline caching exists only in the production build                                     | `offline` (runs against `vite preview` on `dist-test`)      |
| GPU recovery and interactive preview | Preview timings recorded in `capability.json`                                                              | `gpu-recovery`                                              |

The integrated grade is deliberately difficult: a steep master curve and the
starter's hard value key. At 33³ it measured an overall maximum of **23.55 code
values**, the report advised 65³, and re-measuring at 65³ gave **6.69**. The
residual error is the hard key, which the report also names as a heuristic
contributor. This is the tool reporting a real approximation failure, not a
defect; see [LUT fidelity](lut-fidelity.md).

## Verified configuration

Recorded automatically in `capability.json` (2026-09-06):

- Chromium 153.0.8010.12 (headless), Linux x86_64, WebGL 2.0 / OpenGL ES 3.0.
- ANGLE (Google, Vulkan 1.3.0, SwiftShader Device (Subzero)), SwiftShader driver,
  launched with `--use-angle=swiftshader --enable-unsafe-swiftshader`.
- `EXT_color_buffer_float` present; fragment `highp` float precision 23 bits.
- Texture and renderbuffer maximum 8192; viewport 8192 × 8192; 32 fragment
  texture units.
- Probed lattice route: **RGBA32F**. No compatibility warnings.
- Full 2048 × 1080 preview render with float readback: ~480 ms; the interactive
  half-resolution preview: ~161 ms on the same frame.

SwiftShader is a deterministic WebGL2 regression configuration. It is **not** a
physical GPU, driver or performance benchmark, and the timings above are
software-rasterizer timings.

## Numerical tolerances by precision route

Tolerances are set per operation and route before assertions, not fitted to
results. Full derivations live in the linked documents.

| Check                                             | RGBA32F route                         | RGBA16F route                    | Source                          |
| ------------------------------------------------- | ------------------------------------- | -------------------------------- | ------------------------------- |
| Lattice capability probe (0–2 analytical lattice) | 1e−6 absolute                         | 1e−3 absolute                    | [LUT export](lut-export.md)     |
| Lattice points versus float image evaluation      | 1e−5 absolute                         | measured and reported separately | [LUT export](lut-export.md)     |
| Serialized LUT reproduction, off-grid probes      | 0.015 (17³), 0.005 (33³), 0.002 (65³) | as above, reported separately    | [LUT export](lut-export.md)     |
| Six-decimal serialization at lattice points       | half a unit in the sixth decimal      | same                             | [LUT export](lut-export.md)     |
| Fidelity versus the independent applier           | 0.005 code values                     | includes readback rounding       | [LUT fidelity](lut-fidelity.md) |
| Quantization-only fixture                         | 0.00005 code values                   | n/a                              | [LUT fidelity](lut-fidelity.md) |
| Sample pixels versus source-derived references    | `0.001 × max(1, abs(reference))`      | n/a                              | [Log samples](log-samples.md)   |
| FFmpeg lut3d versus the independent applier       | 0.05 maximum, 0.02 P95 code values    | n/a                              | this document                   |

Half-float reports carry lattice and error-readback rounding, and neither route
proves host-independent precision.

## Host verification

`scripts/verify-lut-hosts.mjs` applies the **exact downloaded artifacts** — the
files the export panel produced, not a regenerated lattice — to
`host-probe.png`, and compares the host output against `tests/cube-tools.ts`,
the test-only Cube parser and trilinear/tetrahedral applier that shares no code
with the production serializer.

Recorded on 2026-09-06 with **ffmpeg version 6.1.1-3ubuntu5**:

| Artifact                                      | Interpolation | Maximum | P95    |
| --------------------------------------------- | ------------- | ------- | ------ |
| Identity (linear Rec.709 in/working/out, 33³) | trilinear     | 0.0039  | 0.0000 |
| Identity                                      | tetrahedral   | 0.0039  | 0.0000 |
| Starter grade at +0.5 stops, sRGB in/out, 33³ | trilinear     | 0.0039  | 0.0039 |
| Starter grade                                 | tetrahedral   | 0.0039  | 0.0039 |

Errors are absolute RGB error × 255. 0.0039 is exactly one 16-bit code, so the
agreement is at the limit of the probe's own quantization. Because the identity
artifact reproduces the probe through a host that reads the file independently,
this also demonstrates red-fastest ordering and domain handling.

Settings recorded with the run:

- Import route: `-vf format=rgb48le,lut3d=file=<cube>:interp=<interpolation>`.
- Range: full-range RGB48 throughout. No YUV or limited-range conversion is
  involved, so no range expansion is applied to the LUT input or output.
- Interpolation: both `trilinear` and `tetrahedral` are compared against
  separate expectations, so the two methods cannot pass for each other.

The host matrix, including the routes recorded for the manual hosts, is
`scripts/release-hosts.json`.

## Sample, import and artifact evidence

- **Redistribution.** `npm run samples:release-check` re-verifies every bundled
  still: SHA-256, PNG16 structure, code extrema, inventory agreement, the pinned
  licence notices and complete scene/transfer coverage. Provenance, licences and
  the preparation transform are recorded in [Log samples](log-samples.md).
- **No silent eight-bit downgrade.** The integrated pass grades a 16-bit sample
  at its original dimensions; `tests/import.spec.ts` asserts that adjacent
  16-bit codes stay distinct after decoding and GPU upload, and
  `tests/samples.spec.ts` compares engine output with source-derived reference
  pixels. Unsupported variants fail visibly rather than degrading.
- **Reports match the artifact.** `Export .cube` downloads the serialized text
  held by the current report, so a measured report and its download are the same
  bytes. Changing the grade, image, size, interpolation, output policy or title
  discards the report and hides the overlay
  (`tests/fidelity.spec.ts`, `tests/fidelity-workflow.spec.ts`). The artifacts
  in `release-evidence/` are the downloaded files themselves.

## Specification phases

All six phases of the MEM-200 plan are complete; producing a build alone would
not satisfy this ticket.

| Phase                                                                            | Delivered by                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Upload and render spine, codegen and uniform proof                            | MEM-201                                                       |
| 2. Editable graph, topology cache, inspector, undo, Exposure and CDL             | MEM-202, MEM-204                                              |
| 3. Colour management, CST, project encodings, precision imports, genuine samples | MEM-203, MEM-205, MEM-206, MEM-207, MEM-208, MEM-209          |
| 4. Remaining node types: white balance, curves, qualifier, blend                 | MEM-210, MEM-211, MEM-212                                     |
| 5. GPU lattice export and independent host checks                                | MEM-215, and the FFmpeg check above                           |
| 6. Fidelity, overlays, scopes, viewer, persistence, offline, release validation  | MEM-213, MEM-214, MEM-216, MEM-217, MEM-218, MEM-219, MEM-220 |

## Release blockers

These are open. None of them is claimed as verified.

1. **DaVinci Resolve, Photoshop and Lightroom.** No licensed installation is
   available to this project. Each host needs a recorded session: application
   version, import route, working-space or profile settings, range and
   interpolation options, and a comparison of an applied frame. Lightroom in
   particular has no direct `.cube` import in the Develop module; the artifact
   must be wrapped as a profile, and that route must be demonstrated rather than
   assumed.
2. **Physical GPUs, drivers and other browsers.** Verification ran on
   SwiftShader only. Real desktop GPUs, Firefox and Safari, and the mobile
   compatibility warning on an actual device are untested.
3. **Half-float (RGBA16F) hardware.** The reduced-precision route is exercised
   through injected capability failures, not on a device that genuinely lacks
   RGBA32F rendering.

## Packaging

`npm run build` type-checks and writes the static distribution to `dist`,
including the generated `sw.js` service worker. There is no backend, account
system or runtime grading API; the application is static files served over
HTTPS. `npm run preview` serves the same output locally, and the offline suite
runs against a production build. Deployment is described in the
[README](../README.md#deployment).
