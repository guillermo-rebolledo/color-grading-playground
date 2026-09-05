import { useRef, useState } from "react";
import type { GradingNode } from "./engine/GradingEngine";
import {
  bakeCurve,
  curveChannels,
  identityCurves,
  type CurveChannel,
  type CurvePoint,
} from "./engine/curves";
import { useGraph } from "./graphStore";

function Coordinate({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min="0"
        max="1"
        step="0.001"
        disabled={disabled}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) onCommit(draft.trim() ? Number(draft) : NaN);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
          }
        }}
      />
    </label>
  );
}

export function CurveControls({ node }: { node: GradingNode }) {
  const [channel, setChannel] = useState<CurveChannel>("master");
  const drag = useRef<number | null>(null);
  const { updateParameters, begin, end } = useGraph();
  const curves = node.data.curves!;
  const points = curves[channel];
  const samples = bakeCurve(points).samples;
  const update = (next: CurvePoint[]) =>
    updateParameters(node.id, { curves: { ...curves, [channel]: next } });
  const change = (index: number, point: CurvePoint) =>
    update(points.map((p, i) => (i === index ? point : p)));
  const reset = () => update(identityCurves()[channel]);
  return (
    <div className="adjustment-controls curve-controls">
      <button
        onClick={() => updateParameters(node.id, { curves: identityCurves() })}
      >
        Reset Curves
      </button>
      <p className="encoding-note">
        Master then R/G/B, in current branch RGB code values. Drag points or use
        arrow keys. Double-click a point to reset its output to its input.
        Inputs must increase uniquely; endpoints stay at 0 and 1. Linear
        endpoint extrapolation preserves out-of-range identity values.
      </p>
      <label>
        Curve channel
        <select
          aria-label="Curve channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as CurveChannel)}
        >
          {curveChannels.map((c) => (
            <option key={c} value={c}>
              {c === "master" ? "Master" : c.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <svg
        className={`curve-plot curve-${channel}`}
        viewBox="-8 -8 272 272"
        role="group"
        aria-label={`${channel} curve editor`}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const box = e.currentTarget.getBoundingClientRect();
          const index = drag.current;
          const clamp = (v: number) => Math.max(0, Math.min(1, v));
          change(index, {
            x:
              index === 0 || index === points.length - 1
                ? points[index].x
                : clamp((((e.clientX - box.left) / box.width) * 272 - 8) / 256),
            y: clamp(
              1 - (((e.clientY - box.top) / box.height) * 272 - 8) / 256,
            ),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
          end();
        }}
        onPointerCancel={() => {
          drag.current = null;
          end();
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          end();
        }}
      >
        <path
          className="curve-grid"
          d="M0 0H256V256H0Z M64 0V256 M128 0V256 M192 0V256 M0 64H256 M0 128H256 M0 192H256 M0 256L256 0"
        />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={Array.from(
            samples,
            (y, i) => `${(i / 1023) * 256},${(1 - y) * 256}`,
          ).join(" ")}
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x * 256}
            cy={(1 - p.y) * 256}
            r="5"
            tabIndex={0}
            role="button"
            aria-label={`Point ${i + 1}: input ${p.x}, output ${p.y}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = i;
              begin();
            }}
            onDoubleClick={() => change(i, { ...p, y: p.x })}
            onKeyDown={(e) => {
              if (
                ![
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                ].includes(e.key)
              )
                return;
              e.preventDefault();
              begin();
              change(i, {
                x:
                  i === 0 || i === points.length - 1
                    ? p.x
                    : p.x +
                      (e.key === "ArrowLeft"
                        ? -0.01
                        : e.key === "ArrowRight"
                          ? 0.01
                          : 0),
                y:
                  e.key === "Home"
                    ? p.x
                    : p.y +
                      (e.key === "ArrowUp"
                        ? 0.01
                        : e.key === "ArrowDown"
                          ? -0.01
                          : 0),
              });
            }}
            onKeyUp={end}
            onBlur={end}
          />
        ))}
      </svg>
      <div className="curve-actions">
        <button
          onClick={() => {
            let index = 0;
            for (let i = 1; i < points.length - 1; i++)
              if (
                points[i + 1].x - points[i].x >
                points[index + 1].x - points[index].x
              )
                index = i;
            const x = (points[index].x + points[index + 1].x) / 2;
            update([
              ...points.slice(0, index + 1),
              { x, y: (points[index].y + points[index + 1].y) / 2 },
              ...points.slice(index + 1),
            ]);
          }}
          disabled={points.length >= 256}
        >
          Add point
        </button>
        <button onClick={reset}>Reset channel</button>
      </div>
      {points.map((p, i) => (
        <fieldset key={`${channel}-${i}`}>
          <legend>Point {i + 1}</legend>
          <Coordinate
            label={`Point ${i + 1} input`}
            value={p.x}
            disabled={i === 0 || i === points.length - 1}
            onCommit={(x) => change(i, { ...p, x })}
          />
          <Coordinate
            label={`Point ${i + 1} output`}
            value={p.y}
            onCommit={(y) => change(i, { ...p, y })}
          />
          {i > 0 && i < points.length - 1 && (
            <button onClick={() => update(points.filter((_, j) => j !== i))}>
              Delete point {i + 1}
            </button>
          )}
        </fieldset>
      ))}
    </div>
  );
}
