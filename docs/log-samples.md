# Photographic log sample assets (MEM-208)

**Release blocked.** Six redistributable HDR photographs are bundled and verified,
but the collection still lacks skin tones, a photographed neutral chart, and an
interior with confirmed tungsten illumination. MEM-208 is not complete. The
oil-lamp scene is not evidence of tungsten lighting. No synthetic chart or
re-encoded sRGB JPEG is counted toward these missing requirements.

## Inventory and use

The machine-readable [inventory](../public/samples/inventory.json) records every
file, SHA-256, source URL/revision/hash, license, actual encoding, source
chromaticities, code range, preparation matrix/exposure, measurements and reference
pixels. All six files are **RGB PNG, 16-bit unsigned integer, full range**:
normalize each code by **65535**. They have no embedded ICC, sRGB or gamma chunks,
and no alpha. Import them using **Open image**, then set both Input fields to the
pair below. These are scene-linear HDR photographs converted to log, not native
ARRI/Sony/Blackmagic camera captures. The log names describe the prepared files.
Sample browsing and automatic tag selection belong to MEM-209.

| File                                                         | Scene                                                | Transfer / primaries                      | Preparation exposure |
| ------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------- | -------------------- |
| [desk.png](../public/samples/desk.png)                       | Desk by stained-glass window; illuminant unconfirmed | LogC3 EI 800 / ARRI Wide Gamut 3          | −3 stops             |
| [mount-tamalpais.png](../public/samples/mount-tamalpais.png) | High-contrast coastal exterior                       | LogC3 EI 800 / ARRI Wide Gamut 3          | 0 stops              |
| [tree.png](../public/samples/tree.png)                       | Sunlit foliage and sky                               | S-Log3 / S-Gamut3.Cine                    | 0 stops              |
| [golden-gate.png](../public/samples/golden-gate.png)         | Golden Gate at dusk                                  | S-Log3 / S-Gamut3.Cine                    | −5 stops             |
| [still-life.png](../public/samples/still-life.png)           | Oil-lamp interior                                    | DaVinci Intermediate / DaVinci Wide Gamut | −3 stops             |
| [flower.png](../public/samples/flower.png)                   | Red flower exterior                                  | DaVinci Intermediate / DaVinci Wide Gamut | 0 stops              |

Files retain original dimensions, all below the app's 2048-pixel preview cap.
Together they occupy approximately 23 MB (22.1 MiB); Vite copies them into `dist`.
They need no runtime external requests. A managed display may clip bright
highlights; reducing grading exposure reveals the preserved scene information.

## Provenance and redistribution evidence

Sources are from the Academy Software Foundation's
[OpenEXR image collection](https://github.com/AcademySoftwareFoundation/openexr-images/tree/e38ffb0790f62f05a6f083a6fa4cac150b3b7452),
revision `e38ffb0790f62f05a6f083a6fa4cac150b3b7452`. Its
[BSD-3-Clause license](https://github.com/AcademySoftwareFoundation/openexr-images/blob/e38ffb0790f62f05a6f083a6fa4cac150b3b7452/LICENSE)
permits modified binary redistribution subject to retention of its notices and
disclaimer and no endorsement. The complete notice ships in
[public/samples/licenses/OpenEXR.txt](../public/samples/licenses/OpenEXR.txt),
alongside the assets, and must be retained when distributing them. Per-image
copyright metadata is also retained in the inventory. These are third-party
photographs; no authorship or endorsement is claimed.

The original EXRs use HALF floating-point RGB. Their measured peak channels range
from 4.879 to 685.5, and the prepared files retain scene-linear values above one.
These measurements establish retained numeric headroom, not calibrated sensor
dynamic range or an absence of clipping in the original capture. Capture bracketing,
camera models and illuminants are not asserted when absent from the source.
The source hashes allow the originals to be independently reacquired. Originals
are not duplicated in this repository; the PNGs are committed, not Git LFS pointers.

## Preparation

The offline script [prepare-log-samples.py](../scripts/prepare-log-samples.py)
uses float64 arithmetic and pinned input hashes in
[log-sample-sources.json](../scripts/log-sample-sources.json). It does not run in
the application and is not a second production grading evaluator.

1. Decode the EXR directly to floating-point RGB. Verify finite HALF channels,
   zero-origin image data, square pixels and fully opaque alpha before dropping it.
2. Read source chromaticities. `Tree.exr` has custom RGB xy and white xy values;
   these are retained exactly as represented by its header. The other five omit
   the attribute and use the [OpenEXR-defined Rec.709/D65 default](https://openexr.com/en/latest/TechnicalIntroduction.html#color):
   this is explicitly a format-defined interpretation, not measured camera
   colorimetry. No source is silently treated as a camera wide gamut.
3. Derive RGB→XYZ matrices from chromaticities with white Y=1. Bradford-adapt the
   source white to D65 and convert XYZ to the declared target primaries. The full
   combined matrix is recorded per asset. This includes Tree's non-D65 white.
4. Multiply by `2 ** exposureStops` using the table above. Uniform scaling keeps
   bright sources within the chosen log container without clipping, tone mapping,
   local processing, gamut compression or spatial resampling. It preserves ratios
   and highlight structure; the arbitrary source exposure is not a grey-card
   calibration. Source negatives follow the publisher's linear log toe.
5. Apply the documented publisher transfer, reject any code outside [0,1], then
   round `code * 65535` to nearest integer. No legal/video-range rescaling occurs.
   These output values have 16-bit storage/quantization, not a claim of 16 bits of
   independent precision in the original HALF capture.
6. Write lossless PNG16 at full source resolution, without implicit colour tags.
   Record SHA-256, dimensions, code extrema, distinct codes and zero preparation
   clipping. Record reference pixels from the source-derived linear Rec.709
   values **before** log encoding and PNG quantization: a 5×5 grid plus channel
   extrema, including highlight and negative values where present.

Transfer constants and target chromaticities follow the pinned publisher
references in [camera-log.md](camera-log.md) and
[intermediate-apple-log.md](intermediate-apple-log.md). DaVinci Intermediate assets
are explicitly DaVinci Wide Gamut; the app already supports that gamut.

## Reproduction and checks

Normal verification is offline and independent of the application:

```sh
npm ci
npm run samples:verify
```

It decodes every PNG using pngjs, verifies CRCs, SHA-256, dimensions, RGB16 data,
opaque alpha, code extrema, precision, inventory/source agreement, file coverage
and consistent release status. It prints **BLOCKED** even when file verification
passes. Metadata alone cannot prove capture provenance; use the source links and
reproduction check as well.

To reproduce, use Python 3.12 and an isolated environment:

```sh
python3 -m venv /tmp/log-sample-tools
/tmp/log-sample-tools/bin/pip install -r scripts/log-samples-requirements.txt
/tmp/log-sample-tools/bin/python scripts/prepare-log-samples.py --cache /tmp/log-sample-sources --check
```

Missing originals download from the pinned URLs; present originals must match
their SHA-256. `--check` regenerates and compares every PNG byte plus parsed
inventory without changing committed assets. Omit `--check` only to regenerate.
PNG byte reproduction depends on zlib's compressor version (initial preparation:
Python 3.12, zlib 1.3). Equivalent compression from a different zlib may differ
in hash even if pixel data is identical. The script's Python requirements are
only for maintainers, not browser users or routine CI.

```sh
npx playwright test tests/samples.spec.ts
npm run samples:release-check
```

The browser check loads all six real assets through the public image importer and
grading engine, applies the declared input encoding, and compares linear Rec.709
float output to source-derived reference pixels. Tolerance is
`0.001 * max(1, abs(reference))`, covering 16-bit log rounding, gamut conversion
and GPU float arithmetic. It verifies dimensions, opaque alpha and recovered
above-one highlights. CI runs both file verification and this browser test.

**The release check deliberately exits 1 today.** It independently checks the
6–10 count, three transfers, required scene coverage and recorded blockers. Keep
it as an explicit release gate; routine CI checks the valid acquired subset.

## Outstanding acquisition

As of 2026-09-05, skin tones, a photographed neutral chart, and confirmed tungsten
lighting remain unacquired. Do not relabel these scenes or the app's synthetic
precision charts to make the inventory appear complete. Add or replace assets
within the 6–10 total after obtaining permission evidence and high-bit-depth
source/encoding metadata, then update the inventory and release gate together.

The [ARRI sample/reference page](https://www.arri.com/en/learn-help/learn-help-camera-system/camera-sample-footage-reference-image)
offers genuine LogC3 reference material with people, but the page describes
workflow evaluation; it did not establish permissive bundled redistribution.
No ARRI material was copied into this distribution. The
[ACES reference-image page](https://acescentral.com/knowledge-base-2/using-aces-reference-images/)
identifies a synthetic chart, which does not resolve photographic chart coverage.
These are acquisition leads, not approved assets. No outreach or purchases were
performed. Keep MEM-208 open and the release blocked until the gaps are resolved.
