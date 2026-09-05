import type { FloatImage } from "./GradingEngine";
import { checkDimensions, decodePng16, decodeTiff } from "./stillDecoder";
import { previewSize } from "./previewSize";

export interface LoadedImage {
  bitmap: ImageBitmap | FloatImage;
  name: string;
  originalWidth: number;
  originalHeight: number;
}

/** Decode locally, honoring EXIF orientation without applying embedded colour profiles. */
export async function loadImage(file: File): Promise<LoadedImage> {
  if (file.size > 50 * 1024 * 1024)
    throw new Error("Choose an image smaller than 50 MB.");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error(
      "This image could not be read. Check file access or choose a smaller image.",
    );
  }
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const tiff =
    (bytes[0] === 73 && bytes[1] === 73) ||
    (bytes[0] === 77 && bytes[1] === 77);
  const jpeg = bytes[0] === 255 && bytes[1] === 216;
  if (!png && !tiff && !jpeg)
    throw new Error(
      "This image could not be read. Choose a JPEG, PNG or TIFF image.",
    );
  try {
    if (tiff) return { ...decodeTiff(bytes), name: file.name };
    if (png) {
      const view = new DataView(bytes.buffer);
      checkDimensions(view.getUint32(16), view.getUint32(20));
      if (bytes[24] === 16) {
        if (typeof DecompressionStream === "undefined")
          throw new Error(
            "This browser cannot decode 16-bit PNG. Use a browser with DecompressionStream support or export an uncompressed TIFF.",
          );
        return { ...(await decodePng16(bytes)), name: file.name };
      }
    }
  } catch (cause) {
    throw new Error(
      `This image could not be read. ${cause instanceof RangeError ? "Truncated file or insufficient memory. Re-export or resize the image." : cause instanceof Error ? cause.message : "Re-export the image."}`,
    );
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
  } catch {
    throw new Error(
      "This image could not be read. Choose another JPEG or PNG.",
    );
  }
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const { width, height } = previewSize(originalWidth, originalHeight);
  if (width !== originalWidth || height !== originalHeight) {
    const original = bitmap;
    try {
      bitmap = await createImageBitmap(original, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
    } finally {
      original.close();
    }
  }
  return { bitmap, name: file.name, originalWidth, originalHeight };
}
