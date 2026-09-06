import { MINIMUM_WIDTH } from "@/viewportSupport";
import type { ReactNode } from "react";

/** The honest answer when the workspace cannot be delivered: too narrow a
 * window, or a browser that cannot render a grade. One screen with two
 * explanations, on the same neutral chrome as the application.
 *
 * The capability failure is stated inside the viewer rather than over the
 * whole window, because the graph stays editable while the preview cannot be
 * produced — the workspace is only replaced when nothing in it would work. */
export function UnsupportedDevice({
  heading,
  detail,
  action,
  inline,
}: {
  heading: string;
  detail: string;
  action?: ReactNode;
  inline?: boolean;
}) {
  const body = (
    <>
      {inline ? <h2>{heading}</h2> : <h1>{heading}</h1>}
      <p>{detail}</p>
      <p className="unsupported-requirements">
        {inline
          ? "Grading needs WebGL2 with 32-bit float rendering."
          : `Grading needs a window at least ${MINIMUM_WIDTH} pixels wide, and WebGL2 with 32-bit float rendering.`}{" "}
        Everything happens on your device; nothing is uploaded.
      </p>
      {action}
    </>
  );
  return inline ? (
    <div className="capability-error" role="alert">
      {body}
    </div>
  ) : (
    <main className="unsupported-device">
      <div className="unsupported-card">
        <span className="eyebrow">COLOUR GRADING PLAYGROUND</span>
        {body}
      </div>
    </main>
  );
}
