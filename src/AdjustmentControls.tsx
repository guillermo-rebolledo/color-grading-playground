import { Input } from "@/components/ui/input";
import { CurveControls } from "@/CurveControls";
import { useEffect, useRef, useState } from "react";
import type { GradingNode } from "@/engine/GradingEngine";
import { useGraph } from "@/graphStore";

import { adjustmentDefaults } from "@/adjustmentDefaults";

export function NumericControl({
  label,
  value,
  neutral,
  min,
  max,
  onChange,
  step = 0.01,
}: {
  step?: number;
  label: string;
  value: number;
  neutral: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const { begin, end } = useGraph();
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);
  const reset = () => {
    onChange(neutral);
    setDraft(String(neutral));
  };
  return (
    <div
      className="adjustment-number"
      data-channel={label.match(/ ([RGB])$/)?.[1].toLowerCase()}
    >
      <label>
        <span>{label}</span>
        <Input
          type="number"
          aria-label={label}
          step={step}
          value={draft}
          onFocus={() => {
            editing.current = true;
            begin();
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            if (Number.isFinite(event.target.valueAsNumber))
              onChange(event.target.valueAsNumber);
          }}
          onBlur={() => {
            editing.current = false;
            setDraft(String(value));
            end();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onDoubleClick={reset}
        />
      </label>
      <input
        type="range"
        data-slot="native-slider"
        aria-label={`Scrub ${label}`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          begin();
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
            ].includes(event.key)
          )
            begin();
        }}
        onKeyUp={end}
        onBlur={end}
        onDoubleClick={reset}
      />
    </div>
  );
}

function ColourWheel({
  parameter,
  label,
  value,
  neutral,
  onChange,
}: {
  parameter: "slope" | "offset" | "power";
  label: string;
  value: [number, number, number];
  neutral: number;
  onChange: (value: [number, number, number]) => void;
}) {
  const { begin, end } = useGraph();
  const mean = (value[0] + value[1] + value[2]) / 3;
  const scale = parameter === "offset" ? 0.25 : 0.5;
  const x = (value[0] - mean) / scale;
  const y = (value[1] - value[2]) / (Math.sqrt(3) * scale);
  function update(x: number, y: number) {
    const radius = Math.max(1, Math.hypot(x, y));
    x = (x / radius) * scale;
    y = (y / radius) * scale;
    const next: [number, number, number] = [
      mean + x,
      mean - x / 2 + (Math.sqrt(3) * y) / 2,
      mean - x / 2 - (Math.sqrt(3) * y) / 2,
    ];
    if (parameter === "power" && next.some((v) => v <= 0)) return;
    onChange(next);
  }
  return (
    <div className="wheel-control">
      <div
        className="colour-wheel"
        role="group"
        aria-label={`${label} colour wheel`}
        aria-describedby="wheel-help"
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          begin();
          const box = event.currentTarget.getBoundingClientRect();
          update(
            ((event.clientX - box.left) / box.width) * 2 - 1,
            1 - ((event.clientY - box.top) / box.height) * 2,
          );
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const box = event.currentTarget.getBoundingClientRect();
          update(
            ((event.clientX - box.left) / box.width) * 2 - 1,
            1 - ((event.clientY - box.top) / box.height) * 2,
          );
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onBlur={end}
        onKeyDown={(event) => {
          if (
            ![
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
            ].includes(event.key)
          )
            return;
          event.preventDefault();
          begin();
          if (event.key === "Home") onChange([neutral, neutral, neutral]);
          else
            update(
              x +
                (event.key === "ArrowRight"
                  ? 0.02
                  : event.key === "ArrowLeft"
                    ? -0.02
                    : 0),
              y +
                (event.key === "ArrowUp"
                  ? 0.02
                  : event.key === "ArrowDown"
                    ? -0.02
                    : 0),
            );
        }}
        onKeyUp={end}
        onDoubleClick={() => onChange([neutral, neutral, neutral])}
      >
        <span
          style={{
            left: `${50 + (45 * x) / Math.max(1, Math.hypot(x, y))}%`,
            top: `${50 - (45 * y) / Math.max(1, Math.hypot(x, y))}%`,
          }}
        />
      </div>
    </div>
  );
}

export function AdjustmentControls({ node }: { node: GradingNode }) {
  const { updateParameters } = useGraph();
  if (node.type === "blend" || node.type === "qualifier")
    return (
      <div className="adjustment-controls">
        {node.type === "blend" ? (
          <>
            <details className="control-help">
              <summary className="cursor-pointer">About Blend</summary>
              <p className="encoding-note">
                Amount 0 keeps A; 1 uses B. With a mask, black keeps A and white
                applies the full amount of B; gray mixes them. Without a mask,
                amount applies everywhere (mask = 1). Match branch encodings
                with CST nodes before blending.
              </p>
            </details>
            <NumericControl
              label="Blend amount"
              value={node.data.amount!}
              neutral={1}
              min={0}
              max={1}
              onChange={(amount) => updateParameters(node.id, { amount })}
            />
          </>
        ) : (
          <>
            <details className="control-help">
              <summary className="cursor-pointer">About the qualifier</summary>
              <p className="encoding-note">
                Select by hue, saturation and value (HSV). Connect this mask to
                Blend to limit where B applies; Solo mask previews the
                selection. Qualification alone clamps current RGB code values to
                0–1. Hue wraps; gray requires the full 0–360° hue range.
                Softness extends outside each inclusive band; zero gives hard
                edges. The three selections multiply.
              </p>
            </details>
            <button
              onClick={() =>
                useGraph.setState((s) => ({
                  solo: s.solo === node.id ? null : node.id,
                }))
              }
            >
              {useGraph.getState().solo === node.id
                ? "Exit mask solo"
                : "Solo mask"}
            </button>
            {(["hue", "sat", "value"] as const).map((key) => (
              <fieldset key={key}>
                <legend>
                  {key === "hue"
                    ? "Hue"
                    : key === "sat"
                      ? "Saturation"
                      : "Value"}
                </legend>
                {(["min", "max", "softness"] as const).map((part, i) => (
                  <NumericControl
                    key={part}
                    label={`${key === "hue" ? "Hue" : key === "sat" ? "Saturation" : "Value"} ${part}`}
                    value={node.data[key]![i]}
                    neutral={adjustmentDefaults.qualifier[key][i]}
                    min={0}
                    max={key === "hue" ? 360 : 1}
                    step={key === "hue" ? 1 : 0.01}
                    onChange={(value) => {
                      const band: [number, number, number] = [
                        ...node.data[key]!,
                      ];
                      band[i] = value;
                      updateParameters(node.id, { [key]: band });
                    }}
                  />
                ))}
              </fieldset>
            ))}
          </>
        )}
      </div>
    );
  if (node.type === "curves")
    return <CurveControls key={node.id} node={node} />;
  if (
    node.type !== "cdl" &&
    node.type !== "contrast" &&
    node.type !== "saturation" &&
    node.type !== "whiteBalance"
  )
    return null;
  const scalar = (
    key:
      "contrast" | "pivot" | "saturation" | "vibrance" | "temperature" | "tint",
    label: string,
    neutral: number,
    min: number,
    max: number,
  ) => (
    <NumericControl
      key={key}
      label={label}
      value={node.data[key]!}
      neutral={neutral}
      min={min}
      max={max}
      step={key === "temperature" ? 1 : 0.01}
      onChange={(value) => updateParameters(node.id, { [key]: value })}
    />
  );
  return (
    <div className="adjustment-controls">
      {node.type === "cdl" ? (
        <details className="control-help">
          <summary className="cursor-pointer">About CDL</summary>
          <p>
            CDL (Colour Decision List): slope multiplies RGB, offset adds to it,
            power shapes tone, then saturation adjusts colour intensity. SOP is
            unbounded above; values clamp at zero before power. Saturation uses
            Rec.709 luma. Uses the current branch’s RGB code values; Rec.709
            primaries are recommended for saturation. Insert CST nodes for a
            deliberate log or linear response.
          </p>
          <p id="wheel-help">
            Drag wheels or use arrow keys (0.02 disc units per press); Home or
            double-click resets the vector. Values outside the disc stay
            editable in the RGB fields; the marker shows their direction at the
            rim.
          </p>
        </details>
      ) : node.type === "whiteBalance" ? (
        <p className="encoding-note">
          Linear-light CAT02 · 6500 K / zero tint preserves the declared branch
          white. Source-relative temperature: lower is warmer, higher is cooler
          (1667–25000 K). Tint shifts CIE 1960 v by 0.0001 per unit (−100 to
          +100). Insert a CST first if the branch is encoded.
        </p>
      ) : (
        <p className="encoding-note">
          {node.type === "contrast"
            ? "Pivot-scaled power · positive amount and pivot. Inputs below 0.000001 are floored, even at amount 1."
            : "Rec.709 luma saturation. Vibrance preferentially boosts less-saturated colours using normalized RGB chroma."}{" "}
          Uses the current branch’s RGB code values; Rec.709 primaries
          recommended for saturation. Insert CST nodes for a deliberate log or
          linear response.
        </p>
      )}{" "}
      {node.type === "cdl" && (
        <>
          <div className="cdl-wheels">
            {(["slope", "offset", "power"] as const).map((parameter) => (
              <div key={parameter}>
                <span>{parameter[0].toUpperCase() + parameter.slice(1)}</span>
                <ColourWheel
                  parameter={parameter}
                  label={parameter[0].toUpperCase() + parameter.slice(1)}
                  value={node.data[parameter]!}
                  neutral={parameter === "offset" ? 0 : 1}
                  onChange={(value) =>
                    updateParameters(node.id, { [parameter]: value })
                  }
                />
              </div>
            ))}
          </div>
          {(["slope", "offset", "power"] as const).map((key) => {
            const label = key[0].toUpperCase() + key.slice(1),
              neutral = key === "offset" ? 0 : 1;
            const update = (value: [number, number, number]) =>
              updateParameters(node.id, { [key]: value });
            return (
              <fieldset key={key}>
                <legend>{label}</legend>
                {(["R", "G", "B"] as const).map((channel, i) => (
                  <NumericControl
                    key={channel}
                    label={`${label} ${channel}`}
                    value={node.data[key]![i]}
                    neutral={neutral}
                    min={key === "offset" ? -1 : 0.01}
                    max={key === "offset" ? 1 : 3}
                    onChange={(value) => {
                      const next: [number, number, number] = [
                        ...node.data[key]!,
                      ];
                      next[i] = value;
                      update(next);
                    }}
                  />
                ))}
              </fieldset>
            );
          })}
        </>
      )}
      {node.type === "whiteBalance" ? (
        <>
          {scalar("temperature", "Temperature (K)", 6500, 1667, 25000)}
          {scalar("tint", "Tint", 0, -100, 100)}
        </>
      ) : node.type === "contrast" ? (
        <>
          {scalar("contrast", "Contrast amount", 1, 0.01, 3)}
          {scalar("pivot", "Pivot", 0.18, 0.01, 1)}
        </>
      ) : (
        scalar("saturation", "Saturation", 1, 0, 3)
      )}
      {node.type === "saturation" && scalar("vibrance", "Vibrance", 0, -1, 1)}
    </div>
  );
}
