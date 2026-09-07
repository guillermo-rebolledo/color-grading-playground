import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { clamp } from "@/workspaceLayout";

/** A draggable boundary between two regions of the stage.
 *
 * The pointer and the keyboard move the same value: `positionFrom` turns a
 * pointer position into it, and the arrow keys step it. `aria-orientation`
 * describes the divider itself — horizontal for the one the pointer drags up
 * and down, vertical for the one it drags left and right. */
export function StageDivider({
  label,
  orientation,
  value,
  minimum,
  maximum,
  step,
  onChange,
  positionFrom,
}: {
  label: string;
  orientation: "horizontal" | "vertical";
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
  positionFrom: (event: ReactPointerEvent<HTMLDivElement>) => number;
}) {
  const dragging = useRef(false);
  const set = (next: number) => onChange(clamp(next, minimum, maximum));
  const [less, more] =
    orientation === "horizontal"
      ? ["ArrowDown", "ArrowUp"]
      : ["ArrowLeft", "ArrowRight"];
  return (
    <div
      className={`stage-divider shrink-0 border-border bg-background ${orientation === "horizontal" ? "h-1.5 cursor-row-resize border-y" : "w-1.5 cursor-col-resize border-x"}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(minimum)}
      aria-valuemax={Math.round(maximum)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
      }}
      onPointerMove={(event) => {
        if (dragging.current) set(positionFrom(event));
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onLostPointerCapture={() => {
        dragging.current = false;
      }}
      onKeyDown={(event) => {
        const move: Record<string, number> = {
          [less]: -step,
          [more]: step,
          PageDown: -step * 4,
          PageUp: step * 4,
        };
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          set(event.key === "Home" ? minimum : maximum);
          return;
        }
        if (!(event.key in move)) return;
        event.preventDefault();
        set(value + move[event.key]);
      }}
    />
  );
}
