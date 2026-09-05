export interface LoadedImage {
  bitmap: ImageBitmap;
  name: string;
  originalWidth: number;
  originalHeight: number;
}

/** Decode locally, honoring EXIF orientation but explicitly treating RGB as sRGB. */
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
  const scale = Math.min(1, 2048 / Math.max(originalWidth, originalHeight));
  if (scale < 1) {
    const original = bitmap;
    try {
      bitmap = await createImageBitmap(original, {
        resizeWidth: Math.max(1, Math.round(originalWidth * scale)),
        resizeHeight: Math.max(1, Math.round(originalHeight * scale)),
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
