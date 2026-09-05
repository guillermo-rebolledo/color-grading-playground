# Still-image import

MEM-207 adds local precision-preserving imports. File signatures, rather than MIME labels or extensions, select the decoder. No image bytes leave the device.

## Supported files

- JPEG and ordinary PNG continue to use `createImageBitmap` with orientation enabled, straight alpha and colour conversion disabled.
- **16-bit RGB/RGBA PNG:** explicit PNG decoding with all five scanline filters, non-interlaced and Adam7 data, CRC checks, RGB `tRNS` transparency and TIFF-style `eXIf` orientation. The default still image is read from an animated PNG; animation is not played. Sixteen-bit grayscale PNG is rejected with an RGB/RGBA export suggestion.
- **Classic TIFF 6.0:** either byte order, one image directory, RGB photometric interpretation, chunky/interleaved unsigned 8- or 16-bit samples, uncompressed strips (one or multiple), no predictor, normal fill order. RGB has three channels; RGBA has four and must declare `ExtraSamples=1` (associated alpha) or `2` (straight alpha). All eight orientations are supported.
- TIFF compression (including LZW, Deflate and JPEG), tiles, planar channels, multiple pages, BigTIFF, grayscale, palette, CMYK, signed/floating samples and unspecified alpha are rejected. Re-export as a single-page uncompressed unsigned RGB/RGBA TIFF, or 16-bit RGB/RGBA PNG.

## Colour, alpha and precision

Samples are full-range values divided by 65535 (or 255 for eight-bit TIFF). Embedded ICC, gamma, chromaticity and other colour metadata do not change samples or project tags. The visible **Input transfer** and **Input primaries** controls are authoritative; set them to match the source, including when replacing a log chart with an uploaded still. The inspector states this policy. Retagging never reconstructs missing highlight range.

Grading receives straight RGB. Associated TIFF RGB is divided by alpha before grading; alpha zero produces RGB zero because that colour is unrecoverable. Straight-alpha files retain hidden RGB, including at alpha zero. Alpha bypasses grading and colour transforms.

High-bit-depth decoders produce float RGBA directly. Upload and numeric evaluation use RGBA32F, avoiding both an eight-bit bitmap/canvas round trip and half-float quantization of adjacent sixteen-bit codes. The display framebuffer is still a display preview; engine numeric readback is the precision contract.

The preview is capped at 2048 pixels on its long edge using nearest source samples before float upload. This preserves chosen source codes but can alias fine spatial detail. Original oriented dimensions remain visible. The cap changes spatial resolution, not channel precision.

## Limits and recovery

The file-size limit is 50 MiB. PNG/TIFF dimensions are checked before pixel allocation and limited to 24 million pixels. PNG inflation is streamed into a fixed-size buffer derived from the scanlines; excess or incomplete output is rejected. TIFF directory field arrays are limited to 100,000 entries. These bounds reduce memory pressure but do not guarantee every device can allocate the maximum image. Decode errors and GPU allocation failures leave the current image and editable project available, with a re-export/resize suggestion. A browser that lacks `DecompressionStream` cannot import 16-bit PNG.

## Verification and references

`tests/import.spec.ts` exercises file acquisition through the public GPU engine and the live browser workflow. Analytical samples 32768 and 32769 must remain distinct within 5e-7 of their normalized values. Fixtures cover PNG filters and Adam7, byte order, orientation, alpha, embedded gamma policy, encoding correction, preview sizing, malformed files, bounded inflation and failed GPU replacement. Fixture encoders are independent of production decoding (`pngjs`, Node zlib, and a small TIFF directory writer). Chromium/ANGLE SwiftShader is the automated test device; physical GPU and other browser certification remain release work.

- [W3C PNG Third Edition](https://www.w3.org/TR/png-3/): scanline filtering, Adam7, CRC, transparency and EXIF.
- [TIFF 6.0, June 3, 1992](https://image-js.github.io/tiff/media/TIFF6.pdf): image directory, strips, orientation and ExtraSamples.
