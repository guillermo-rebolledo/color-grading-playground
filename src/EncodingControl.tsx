import { transfers, primaries, type Encoding } from "@/engine/GradingEngine";

export function EncodingControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Encoding;
  onChange: (value: Encoding) => void;
}) {
  return (
    <fieldset className="encoding-control">
      <legend>{label}</legend>
      <label>
        Transfer
        <select
          aria-label={`${label} transfer`}
          value={value.transfer}
          onChange={(event) =>
            onChange({
              ...value,
              transfer: event.target.value as Encoding["transfer"],
            })
          }
        >
          {Object.entries(transfers).map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Primaries / white
        <select
          aria-label={`${label} primaries`}
          value={value.primaries}
          onChange={(event) =>
            onChange({
              ...value,
              primaries: event.target.value as Encoding["primaries"],
            })
          }
        >
          {Object.entries(primaries).map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
