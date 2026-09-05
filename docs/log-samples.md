# Photographic log sample assets (MEM-208)

**MEM-208 acquisition complete.** Nine redistributable photographic HDR-source
stills cover LogC3, S-Log3 and DaVinci Intermediate, including skin tones,
high-contrast exteriors, a tungsten-lit interior and a photographed neutral chart.
All files pass the inventory and release gates. This is the sample-content gate,
not a declaration that the entire application is ready for release.

## Inventory and use

The machine-readable [inventory](../public/samples/inventory.json) records every
file, SHA-256, source URL/revision/hash, license, actual encoding, source
chromaticities, code range, preparation matrix/exposure, measurements and reference
pixels. All nine files are **RGB PNG, 16-bit unsigned integer, full range**:
normalize each code by **65535**. They have no embedded ICC, sRGB or gamma chunks,
and no alpha. Import them using **Open image**, then set both Input fields to the
pair below. These are scene-linear HDR photographs converted to log, not native
ARRI/Sony/Blackmagic log captures. The log names describe the prepared files.
The skin-tone image originates from a Sony F65 camera, supplied as linear EXR.
Sample browsing and automatic tag selection belong to MEM-209. When distributing
or displaying the actor sample, retain its [title, credit and license notice](../public/samples/licenses/TearsOfSteel.txt).

| File                                                         | Scene                                                         | Transfer / primaries                      | Preparation exposure |
| ------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------- | -------------------- |
| [desk.png](../public/samples/desk.png)                       | Desk by stained-glass window; illuminant unconfirmed          | LogC3 EI 800 / ARRI Wide Gamut 3          | −3 stops             |
| [mount-tamalpais.png](../public/samples/mount-tamalpais.png) | High-contrast coastal exterior                                | LogC3 EI 800 / ARRI Wide Gamut 3          | 0 stops              |
| [tree.png](../public/samples/tree.png)                       | Sunlit foliage and sky                                        | S-Log3 / S-Gamut3.Cine                    | 0 stops              |
| [golden-gate.png](../public/samples/golden-gate.png)         | Golden Gate at dusk                                           | S-Log3 / S-Gamut3.Cine                    | −5 stops             |
| [still-life.png](../public/samples/still-life.png)           | Oil-lamp interior                                             | DaVinci Intermediate / DaVinci Wide Gamut | −3 stops             |
| [flower.png](../public/samples/flower.png)                   | Red flower exterior                                           | DaVinci Intermediate / DaVinci Wide Gamut | 0 stops              |
| [canal-actors.png](../public/samples/canal-actors.png)       | Two actors on an Amsterdam canal bridge                       | LogC3 EI 800 / ARRI Wide Gamut 3          | −1 stop              |
| [tungsten-saloon.png](../public/samples/tungsten-saloon.png) | Saloon with tungsten lighting and daylight                    | S-Log3 / S-Gamut3.Cine                    | −8 stops             |
| [neutral-chart.png](../public/samples/neutral-chart.png)     | Photographed ColorChecker Passport, including neutral patches | DaVinci Intermediate / DaVinci Wide Gamut | +4 stops             |

The original six assets and the supplied 2K saloon panorama retain their source
sizes. The actor frame (4096×2160) and chart (2359×3271) select every second pixel
on each axis, giving 2048×1080 and 1180×1636. No eight-bit resizing occurs. All
outputs fit the app's 2048-pixel preview cap. The nine PNGs total 53.49 MB
(51.01 MiB); each file is below 13 MB. Vite copies them into `dist`, and the
application does not fetch them until requested. They need no runtime external
requests. Reducing grading exposure reveals highlights that clip on an SDR display.

## Provenance and redistribution evidence

The first six sources are from the Academy Software Foundation's
[OpenEXR image collection](https://github.com/AcademySoftwareFoundation/openexr-images/tree/e38ffb0790f62f05a6f083a6fa4cac150b3b7452),
revision `e38ffb0790f62f05a6f083a6fa4cac150b3b7452`. Its
[BSD-3-Clause license](https://github.com/AcademySoftwareFoundation/openexr-images/blob/e38ffb0790f62f05a6f083a6fa4cac150b3b7452/LICENSE)
permits modified binary redistribution subject to retention of its notices and
disclaimer and no endorsement. The complete notice ships in
[public/samples/licenses/OpenEXR.txt](../public/samples/licenses/OpenEXR.txt),
alongside the assets, and must be retained when distributing them. Per-image
copyright metadata is also retained in the inventory. These are third-party
photographs; no authorship or endorsement is claimed.

The [original _Tears of Steel_ footage announcement](https://mango.blender.org/production/4-tb-original-4k-footage-available-as-cc-by/)
identifies Sony F65 capture, Sony RAW-to-ACES processing, and OpenColorIO
conversion to scene-linear Rec.709. We use original shot `01_2a`, frame `00100`,
not the composited or display-graded movie. The [sharing terms](https://mango.blender.org/sharing/)
release the material under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/),
with attribution **(CC) Blender Foundation | mango.blender.org**. The footage
announcement explicitly permits technical demos, showcases and tutorials while
retaining actors' personal-image/privacy rights. This grading sample grants no
actor-advertising or endorsement rights. The required title, credit, license and
modification notice ship in [TearsOfSteel.txt](../public/samples/licenses/TearsOfSteel.txt).

[Poly Haven's Cowboy Town Saloon](https://polyhaven.com/a/cowboy_town_saloon)
provides the 2K panorama and a colour-chart ZIP containing `merged_000.exr` and
`DSCF0132.RAF`. Photography is by Dimitrios Savva, processing by Jarod Guest.
The publisher describes the interior as having “warm tungsten glow” alongside
mixed daylight; the claim is publisher evidence, not an inferred colour temperature.
Its [asset license](https://polyhaven.com/license) explicitly permits bundled
redistribution under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
[PolyHaven.txt](../public/samples/licenses/PolyHaven.txt) records the sources and
changes. The photographed Passport includes physical neutral patches; it is not
the app's synthetic chart.

The [publisher's HDRI requirements](https://docs.polyhaven.com/en/technical-standards/hdris)
specify photographic, linear, unclipped HDRIs and a separately photographed chart
processed to HDR. The panorama page reports 19 EV capture and 4171 K white
balance. The chart is independently exposed and not assumed to share the
panorama's brightness calibration. Its maximum source channel is only 0.106607;
+4 stops makes it usable without altering ratios. Values above one alone do not
prove HDR: brightness units are arbitrary, and exposure multiplication does not
create dynamic range. The chart's HDR provenance comes from its photographic
source package/workflow, not from this exposure adjustment.

OpenEXR/Blender sources use HALF RGB; the Poly Haven sources use FLOAT RGB.
The originals and prepared files preserve high-bit-depth scene-linear information.
Measured extrema and source-derived reference pixels establish retained numeric
headroom, not calibrated sensor dynamic range or absence of clipping in capture.
Metadata not supplied by the publisher is not invented. Source/archive/member
hashes permit reacquisition. Originals are not duplicated in the repository;
the committed PNGs are ordinary files, not Git LFS pointers.

## Preparation

The offline script [prepare-log-samples.py](../scripts/prepare-log-samples.py)
uses float64 arithmetic and pinned input hashes in
[log-sample-sources.json](../scripts/log-sample-sources.json). Redistribution
notices are pinned by [log-sample-licenses.json](../scripts/log-sample-licenses.json). It does not run in
the application and is not a second production grading evaluator.

1. Verify the download hash and, for the ZIP, the exact member name/hash before
   decoding EXR RGB to float64. Verify the declared HALF/FLOAT type, finite
   channels, zero-origin data and square pixels. Validate the recorded alpha
   constant before discarding it. The chart has rounding residuals within 1e-7
   of one. The saloon panorama's publisher-normalized alpha is a constant
   9.262558937072754, not coverage: its header records multiplication of all
   channels by 9.262559393631358. Discard this channel without dividing RGB or
   undoing the publisher's radiance normalization. All other alpha is absent or
   exactly one. Select every `sampleStride` pixel on each axis, starting at (0,0),
   where recorded; use no interpolation or eight-bit intermediate.
2. Read source chromaticities. `Tree.exr` has custom RGB xy and white xy values;
   these are retained exactly as represented by its header. The other eight omit
   the attribute and use the [OpenEXR-defined Rec.709/D65 default](https://openexr.com/en/latest/TechnicalIntroduction.html#color):
   this is explicitly a format-defined interpretation, not measured camera
   colorimetry. No source is silently treated as a camera wide gamut.
3. Derive RGB→XYZ matrices from chromaticities with white Y=1. Bradford-adapt the
   source white to D65 and convert XYZ to the declared target primaries. The full
   combined matrix is recorded per asset. This includes Tree's non-D65 white.
4. Multiply by `2 ** exposureStops` using the table above. Uniform scaling keeps
   bright sources within the chosen log container without clipping, tone mapping,
   local processing or gamut compression. Documented pixel selection precedes this step. It preserves ratios
   and highlight structure; the arbitrary source exposure is not a grey-card
   calibration. Source negatives follow the publisher's linear log toe.
5. Apply the documented publisher transfer, reject any code outside [0,1], then
   round `code * 65535` to nearest integer. No legal/video-range rescaling occurs.
   These output values have 16-bit storage/quantization, not a claim of 16 bits of
   independent precision in the original source.
6. Write lossless PNG16 at the documented output resolution, without implicit colour tags.
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
and consistent release status. It prints **READY** for the complete collection. Metadata alone cannot prove capture provenance; use the source links and
reproduction check as well.

To reproduce, use Python 3.12 and an isolated environment:

```sh
python3 -m venv /tmp/log-sample-tools
/tmp/log-sample-tools/bin/pip install -r scripts/log-samples-requirements.txt
/tmp/log-sample-tools/bin/python scripts/prepare-log-samples.py --cache /tmp/log-sample-sources --check
```

Missing originals download from the pinned URLs; present originals must match
their SHA-256. `--check` regenerates and compares all nine PNGs byte-for-byte plus parsed
inventory without changing committed assets. Omit `--check` only to regenerate.
PNG byte reproduction depends on zlib's compressor version (initial preparation:
Python 3.12, zlib 1.3). Equivalent compression from a different zlib may differ
in hash even if pixel data is identical. The script's Python requirements are
only for maintainers, not browser users or routine CI.

```sh
npx playwright test tests/samples.spec.ts
npm run samples:release-check
```

The browser check loads all nine real assets through the public image importer and
grading engine, applies the declared input encoding, and compares linear Rec.709
float output to source-derived reference pixels. Tolerance is
`0.001 * max(1, abs(reference))`, covering 16-bit log rounding, gamut conversion
and GPU float arithmetic. It verifies dimensions, opaque alpha and recovered
above-one highlights. CI runs the strict content release gate and this browser test, so removing a required scene fails CI.

**The release check passes.** It checks the 6–10 count, three transfers, required
scene coverage, pinned notices and recorded blockers. Coverage is derived from
the successfully prepared inventory rather than manually flipping a readiness
flag. Acquisition and metadata were verified on 2026-09-05. No outreach or
purchases were needed.
