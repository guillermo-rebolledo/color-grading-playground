import inventory from "../public/samples/inventory.json";
import { encodingLabel, type Encoding } from "./engine/GradingEngine";

export const samples = inventory.assets.map((asset) => ({
  ...asset,
  encoding: asset.encoding as Encoding,
}));
export type Sample = (typeof samples)[number];

export function SamplePicker({
  selected,
  disabled,
  onSelect,
}: {
  selected?: string;
  disabled: boolean;
  onSelect: (sample: Sample) => void;
}) {
  return (
    <section className="sample-gallery" aria-label="Bundled log samples">
      <h2>Bundled log samples</h2>
      <p>
        HDR photographs prepared as log. Choose a scene to apply its verified
        input tags and keep your grade.
      </p>
      <div className="sample-grid">
        {samples.map((sample) => (
          <button
            key={sample.id}
            disabled={disabled}
            aria-label={sample.title}
            aria-pressed={selected === sample.id}
            onClick={() => onSelect(sample)}
          >
            <img
              src={`/samples/previews/${sample.id}.png`}
              alt=""
              width="240"
              height="150"
              loading="lazy"
            />
            <strong>{sample.title}</strong>
            <span>{encodingLabel(sample.encoding)}</span>
          </button>
        ))}
      </div>
      <p>
        Tears of Steel · (CC) Blender Foundation | mango.blender.org ·{" "}
        <a href="/samples/licenses/TearsOfSteel.txt">
          CC BY 3.0, source and modifications
        </a>
        . Previews are resized sRGB renditions; grading loads the original PNG16
        files.
      </p>
    </section>
  );
}

export function SampleProvenance({ sample }: { sample: Sample }) {
  return (
    <details className="sample-provenance" aria-label="Sample provenance" open>
      <summary>Source and preparation · {sample.title}</summary>
      <p>
        {encodingLabel(sample.encoding)} · {sample.bitDepth}-bit ·{" "}
        {sample.codeRange} range ({sample.codeNormalization}).
      </p>
      <p>
        {sample.id === "canal-actors"
          ? "Tears of Steel · (CC) Blender Foundation | mango.blender.org"
          : sample.sourceMetadata.owner}
      </p>
      <p>
        <a href={sample.sourceUrl}>Original source</a> ·{" "}
        <a href={`/samples/${sample.licenseFile}`}>
          {sample.license} — credit and modifications
        </a>{" "}
        · <a href="/samples/inventory.json">Verified inventory</a>
      </p>
      <p>
        Scene-linear HDR source converted to {encodingLabel(sample.encoding)},
        with {sample.preparation.exposureStops} stops of preparation exposure
        and pixel stride {sample.preparation.sampleStride}. Rounded to PNG16
        without clipping or tone mapping. These are prepared log photographs,
        not native camera-log captures.
      </p>
      <p>
        An sRGB JPEG has already lost highlight detail through clipping or tone
        mapping and eight-bit quantization. Retagging it as log changes how
        existing values are interpreted; it cannot recreate missing highlight
        range.
      </p>
    </details>
  );
}
