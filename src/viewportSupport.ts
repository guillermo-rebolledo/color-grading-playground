import { useSyncExternalStore } from "react";

/** The narrowest window the workspace is supported in. Below it the
 * application shows the unsupported-device screen rather than reflowing into a
 * grading surface it cannot deliver honestly. */
export const MINIMUM_WIDTH = 1280;

const query = `(min-width: ${MINIMUM_WIDTH}px)`;

/** Live: widening the window past the minimum restores the workspace without a
 * reload. */
export function useSupportedWidth() {
  return useSyncExternalStore(
    (notify) => {
      const media = matchMedia(query);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => matchMedia(query).matches,
    () => true,
  );
}
