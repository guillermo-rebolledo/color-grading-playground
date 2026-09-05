import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** One image surface keeps both wipe sides aligned through every navigation gesture. */
export function ViewerNavigation({
  width,
  height,
  comparison,
  wipe,
  onWipe,
  children,
}: {
  width: number;
  height: number;
  comparison: boolean;
  wipe: number;
  onWipe: (value: number) => void;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const gesture = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setBounds(entry.contentRect),
    );
    observer.observe(frame.current!);
    return () => observer.disconnect();
  }, []);
  const scale =
    zoom === "fit"
      ? Math.min(bounds.width / width, bounds.height / height, 1)
      : zoom;
  function navigate(value: number | "fit") {
    setZoom(value);
    setPan({ x: 0, y: 0 });
  }
  return (
    <>
      <div className="viewer-navigation" aria-label="Viewer navigation">
        <button aria-pressed={zoom === "fit"} onClick={() => navigate("fit")}>
          Fit
        </button>
        <button aria-pressed={zoom === 1} onClick={() => navigate(1)}>
          100%
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => navigate(Math.max(0.1, scale / 1.25))}
        >
          −
        </button>
        <output aria-label="Viewer zoom">{Math.round(scale * 100)}%</output>
        <button
          aria-label="Zoom in"
          onClick={() => navigate(Math.min(8, scale * 1.25))}
        >
          ＋
        </button>
        <span>Drag image to pan</span>
      </div>
      <div
        className="image-frame navigable-frame"
        ref={frame}
        tabIndex={0}
        aria-label="Pan image with arrow keys"
        onKeyDown={(event) => {
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [32, 0],
            ArrowRight: [-32, 0],
            ArrowUp: [0, 32],
            ArrowDown: [0, -32],
          };
          if (event.target !== event.currentTarget || !delta[event.key]) return;
          event.preventDefault();
          const [x, y] = delta[event.key];
          setPan((p) => ({ x: p.x + x, y: p.y + y }));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = {
            x: event.clientX,
            y: event.clientY,
            panX: pan.x,
            panY: pan.y,
          };
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (start)
            setPan({
              x: start.panX + event.clientX - start.x,
              y: start.panY + event.clientY - start.y,
            });
        }}
        onPointerUp={() => {
          gesture.current = null;
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onLostPointerCapture={() => {
          gesture.current = null;
        }}
      >
        <div
          className="viewer-surface"
          style={{
            width: width * scale,
            height: height * scale,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          {children}
          {comparison && (
            <input
              className="wipe-handle"
              aria-label="Comparison wipe"
              type="range"
              min={0}
              max={100}
              value={wipe * 100}
              onChange={(event) => onWipe(Number(event.target.value) / 100)}
              onPointerDown={(event) => event.stopPropagation()}
              style={{ "--wipe": `${wipe * 100}%` } as React.CSSProperties}
            />
          )}
        </div>
      </div>
    </>
  );
}
