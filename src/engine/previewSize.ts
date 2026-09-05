/** Shared by decoding and direct engine input so both entry points enforce the same cap. */
export function previewSize(width: number, height: number) {
  const scale = Math.min(1, 2048 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
