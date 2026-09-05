import { previewSize } from "./previewSize";

export interface LoadedImage {
  bitmap: ImageBitmap;
  name: string;
  originalWidth: number;
  originalHeight: number;
}

/** Decode locally, honoring EXIF orientation without applying embedded colour profiles. */
export async function loadImage(file: File): Promise<LoadedImage> {
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw new Error("Choose a JPEG or PNG image.");
  if (file.size > 50 * 1024 * 1024)
    throw new Error("Choose an image smaller than 50 MB.");
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
