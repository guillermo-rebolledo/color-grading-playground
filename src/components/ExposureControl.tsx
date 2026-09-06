import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";

/** Exposure in stops: a typed field and a scrub, resettable by either. */
export function ExposureControl({
  value,
  disabled,
  onChange,
  onBegin,
  onEnd,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onBegin: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState(value.toFixed(2));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value.toFixed(2));
  }, [value]);
  function commit() {
    const parsed = Number(draft);
    if (draft.trim() && Number.isFinite(parsed))
      onChange(Math.max(-6, Math.min(6, parsed)));
    setDraft(
      (draft.trim() && Number.isFinite(parsed)
        ? Math.max(-6, Math.min(6, parsed))
        : value
      ).toFixed(2),
    );
  }
  return (
    <div className="exposure-control">
      <div className="parameter-row exposure-row">
        <div className="control-heading">
          <label htmlFor="exposure">Exposure</label>
        </div>
        <div
          className="numeric-control"
          onDoubleClick={() => {
            if (!disabled) {
              onChange(0);
              setDraft("0.00");
            }
          }}
        >
          <Input
            id="exposure"
            aria-label="Exposure in stops"
            type="number"
            min="-6"
            max="6"
            step="0.01"
            disabled={disabled}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              const parsed = event.target.valueAsNumber;
              if (Number.isFinite(parsed) && parsed >= -6 && parsed <= 6)
                onChange(parsed);
            }}
            onFocus={() => {
              editing.current = true;
              onBegin();
            }}
            onBlur={() => {
              editing.current = false;
              commit();
              onEnd();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commit();
                event.currentTarget.blur();
              }
            }}
          />
          <span>stops</span>
        </div>
        <input
          aria-label="Scrub exposure"
          type="range"
          min="-6"
          max="6"
          step="0.01"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onBegin();
          }}
          onPointerUp={onEnd}
          onPointerCancel={onEnd}
          onLostPointerCapture={onEnd}
          onKeyDown={(event) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(event.key)
            )
              onBegin();
          }}
          onKeyUp={onEnd}
          onBlur={onEnd}
          onDoubleClick={() => onChange(0)}
        />
      </div>
      <div className="range-labels">
        <span>−6</span>
        <span>0</span>
        <span>+6</span>
      </div>
      <p className="control-help">
        One stop doubles or halves the light.
        <br />
        Double-click a control to reset.
      </p>
    </div>
  );
}
