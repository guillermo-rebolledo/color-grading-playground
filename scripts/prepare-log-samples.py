"""Reproduce the MEM-208 photographic assets from checksum-pinned EXR sources.

Offline preparation only; not an application grading evaluator. See
docs/log-samples.md for provenance, colour references and release blockers.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import urllib.request
import zipfile
import zlib

import numpy as np
import OpenEXR

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/samples"
REC709 = [0.64, 0.33, 0.30, 0.60, 0.15, 0.06, 0.3127, 0.3290]
GAMUTS = {
    "arri-wide-gamut3": [0.684, 0.313, 0.221, 0.848, 0.0861, -0.102, 0.3127, 0.3290],
    "sgamut3-cine": [0.766, 0.275, 0.225, 0.8, 0.089, -0.087, 0.3127, 0.3290],
    "davinci-wide-gamut": [0.8, 0.313, 0.1682, 0.9877, 0.079, -0.1155, 0.3127, 0.3290],
}
BRADFORD = np.array([[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]])


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def xyz(xy):
    x, y = xy
    return np.array([x / y, 1, (1 - x - y) / y])


def rgb_to_xyz(chromaticities):
    basis = np.array([xyz(chromaticities[i:i + 2]) for i in (0, 2, 4)]).T
    return basis @ np.diag(np.linalg.solve(basis, xyz(chromaticities[6:8])))


def conversion(source, target):
    adaptation = np.linalg.inv(BRADFORD) @ np.diag(
        (BRADFORD @ xyz(target[6:8])) / (BRADFORD @ xyz(source[6:8]))
    ) @ BRADFORD
    return np.linalg.solve(rgb_to_xyz(target), adaptation @ rgb_to_xyz(source))


def encode(linear, transfer):
    # Publisher equations pinned in docs/camera-log.md and intermediate-apple-log.md.
    result = np.empty_like(linear)
    if transfer == "logc3":
        high = linear > 0.010591
        result[high] = 0.247190 * np.log10(5.555556 * linear[high] + 0.052272) + 0.385537
        result[~high] = 5.367655 * linear[~high] + 0.092809
    elif transfer == "slog3":
        high = linear >= 0.01125
        result[high] = (420 + 261.5 * np.log10((linear[high] + 0.01) / 0.19)) / 1023
        result[~high] = (linear[~high] * (171.2102946929 - 95) / 0.01125 + 95) / 1023
    elif transfer == "davinci-intermediate":
        high = linear > 0.00262409
        result[high] = (np.log2(linear[high] + 0.0075) + 7) * 0.07329248
        result[~high] = linear[~high] * 10.44426855
    else:
        raise ValueError(f"Unsupported transfer: {transfer}")
    if not np.isfinite(result).all() or result.min() < 0 or result.max() > 1:
        raise ValueError("Encoding would clip: revise the documented preparation transform")
    return result


def png16(samples):
    height, width, _ = samples.shape

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    # Filter 0, big-endian uint16 RGB, no gamma/ICC/sRGB tag or alpha.
    rows = b"".join(b"\0" + row.astype(">u2").tobytes() for row in samples)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 16, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def prepare(spec, cache, licenses):
    path = cache / Path(spec["sourcePath"]).name
    if not path.exists():
        urllib.request.urlretrieve(spec["sourceUrl"], path)
    if sha256(path.read_bytes()) != spec["sourceSha256"]:
        raise ValueError(f"Source checksum mismatch: {path}")
    if "archiveMember" in spec:
        with zipfile.ZipFile(path) as archive:
            data = archive.read(spec["archiveMember"])
        if sha256(data) != spec["archiveMemberSha256"]:
            raise ValueError("Archived EXR checksum mismatch")
        path = cache / f'{spec["id"]}-source.exr'
        path.write_bytes(data)
    with OpenEXR.File(str(path), separate_channels=True) as source:
        header, channels = source.header(), source.channels()
        rgb = np.stack([channels[c].pixels for c in "RGB"], axis=-1).astype(np.float64)
        if not np.isfinite(rgb).all():
            raise ValueError("Non-finite source pixels")
        if "A" in channels and not np.allclose(
            channels["A"].pixels, spec.get("sourceAlphaValue", 1),
            atol=spec.get("sourceAlphaTolerance", 0), rtol=0,
        ):
            raise ValueError("Source alpha differs from the documented constant; refusing to discard")
        channel_type = spec.get("sourceChannelType", "HALF")
        dtype = {"HALF": np.float16, "FLOAT": np.float32}[channel_type]
        if any(channels[c].pixels.dtype != dtype for c in "RGB"):
            raise ValueError(f"Expected {channel_type} source channels")
        if not np.array_equal(header["dataWindow"][0], [0, 0]) or header["pixelAspectRatio"] != 1:
            raise ValueError("Unexpected image origin or pixel aspect")
        chromaticities = list(header.get("chromaticities", REC709))
        source_height, source_width, _ = rgb.shape
        source_min, source_max = float(rgb.min()), float(rgb.max())
        stride = spec.get("sampleStride", 1)
        if not isinstance(stride, int) or stride < 1:
            raise ValueError("Sample stride must be a positive integer")
        rgb = rgb[::stride, ::stride]
        if max(rgb.shape[:2]) > 2048:
            raise ValueError("Choose a documented sample stride to meet the preview limit")
        target = GAMUTS[spec["encoding"]["primaries"]]
        matrix = conversion(chromaticities, target)
        exposure = 2.0 ** spec["exposureStops"]
        linear = (rgb @ matrix.T) * exposure
        rec709 = (rgb @ conversion(chromaticities, REC709).T) * exposure
        codes = encode(linear, spec["encoding"]["transfer"])
        samples = np.floor(codes * 65535 + 0.5).astype(np.uint16)
        data = png16(samples)
        height, width, _ = rgb.shape
        # Source-derived references: regular grid plus each channel's extrema.
        locations = {(int(x), int(y)) for x in np.linspace(0, width - 1, 5)
                     for y in np.linspace(0, height - 1, 5)}
        for c in range(3):
            for index in (np.argmin(rec709[:, :, c]), np.argmax(rec709[:, :, c])):
                y, x = np.unravel_index(index, (height, width))
                locations.add((int(x), int(y)))
        probes = [{"x": x, "y": y, "linearRec709": rec709[y, x].tolist()}
                  for x, y in sorted(locations)]
        asset = {
            **spec,
            "file": f'{spec["id"]}.png', "sha256": sha256(data), "bytes": len(data),
            "width": width, "height": height, "bitDepth": 16,
            "codeRange": "full", "codeNormalization": "uint16 / 65535",
            "alpha": "opaque",
            "licenseFile": licenses[spec["license"]]["file"],
            "licenseUrl": licenses[spec["license"]]["url"],
            "sourceMetadata": {
                "transfer": "scene-linear", "bitDepth": "16-bit HALF" if channel_type == "HALF" else "32-bit FLOAT",
                "width": source_width, "height": source_height,
                "range": "unbounded floating point",
                "chromaticities": chromaticities,
                "primariesEvidence": "EXR chromaticities attribute" if "chromaticities" in header
                    else "OpenEXR specified Rec.709/D65 default for absent chromaticities",
                "owner": header.get("owner", spec.get("attribution", "See collection copyright in licenses/OpenEXR.txt")),
                "captureDate": header.get("capDate"),
            },
            "preparation": {
                "sourceToTargetLinearMatrix": matrix.tolist(),
                "whiteAdaptation": "Bradford source white to D65",
                "exposureStops": spec["exposureStops"],
                "sampleStride": stride,
                "alphaHandling": spec.get("sourceAlphaNote", "Absent alpha or exact A=1; RGB unchanged"),
                "steps": [f"Decode EXR {channel_type} RGB to float64; validate documented constant alpha before discarding",
                          f"Select source pixel (x*{stride}, y*{stride}) for each output pixel; no interpolation",
                          "Apply source-to-target linear matrix and uniform exposure factor",
                          "Apply publisher log transfer, preserving negative toe values",
                          "Reject out-of-container codes; round to nearest uint16, no clipping",
                          "Write RGB PNG16 without ICC/gamma tags; no tone map"],
            },
            "measurements": {
                "sourceRgbMin": source_min, "sourceRgbMax": source_max,
                "preparedLinearMin": float(linear.min()), "preparedLinearMax": float(linear.max()),
                "linearChannelsAboveOne": int(np.count_nonzero(linear > 1)),
                "codeMin": int(samples.min()), "codeMax": int(samples.max()),
                "distinctCodes": int(np.unique(samples).size),
                "clippedChannels": 0,
            },
            "probes": probes,
        }
        return asset, data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True, help="EXR download/cache directory")
    parser.add_argument("--check", action="store_true", help="Compare regenerated assets and inventory without writing")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    specs = json.loads((ROOT / "scripts/log-sample-sources.json").read_text())
    licenses = json.loads((ROOT / "scripts/log-sample-licenses.json").read_text())
    for license in licenses.values():
        if sha256((OUTPUT / license["file"]).read_bytes()) != license["sha256"]:
            raise ValueError("Redistribution notice checksum mismatch")
    assets = []
    for spec in specs:
        asset, data = prepare(spec, args.cache, licenses)
        destination = OUTPUT / asset["file"]
        if args.check:
            if destination.read_bytes() != data:
                raise ValueError(f"Reproduction mismatch: {destination}")
        else:
            destination.write_bytes(data)
        assets.append(asset)
        print(f'{asset["id"]}: {asset["width"]}x{asset["height"]}, {len(data)} bytes', flush=True)
    blockers = []
    if not 6 <= len(assets) <= 10:
        blockers.append("Collection must contain 6–10 assets")
    for scene in ["skin-tones", "high-contrast-exterior", "tungsten-interior", "neutral-chart"]:
        if not any(asset["scene"] == scene for asset in assets):
            blockers.append(f"Acquire {scene} coverage")
    for transfer in ["logc3", "slog3", "davinci-intermediate"]:
        if not any(asset["encoding"]["transfer"] == transfer for asset in assets):
            blockers.append(f"Acquire {transfer} coverage")
    inventory = {
        "schemaVersion": 1, "issue": "MEM-208", "releaseReady": not blockers,
        "releaseBlockers": blockers,
        "assets": assets,
    }
    serialized = json.dumps(inventory, indent=2) + "\n"
    destination = OUTPUT / "inventory.json"
    if args.check:
        if json.loads(destination.read_text()) != inventory:
            raise ValueError("Inventory reproduction mismatch")
    else:
        destination.write_text(serialized)


if __name__ == "__main__":
    main()
