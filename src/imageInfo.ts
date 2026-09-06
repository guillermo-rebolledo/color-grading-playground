import type { Sample } from "./samples";

/** The opened still, as the regions around the viewer describe it. */
export type ImageInfo = {
  name: string;
  sample?: Sample;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
};
