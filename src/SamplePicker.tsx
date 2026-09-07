import { useEffect, useState } from "react";
import { encodingLabel } from "./engine/GradingEngine";
import { storeAllSamples, storedSamples } from "./offline";
import { samples, type Sample } from "./samples";

const sampleMiB = Math.ceil(
  samples.reduce((total, sample) => total + sample.bytes, 0) / 2 ** 20,
);

export function SamplePicker({
  selected,
  disabled,
  offlineReady,
  onSelect,
}: {
  selected?: string;
  disabled: boolean;
  /** Service worker active and online, so samples can be stored. */
  offlineReady: boolean;
  onSelect: (sample: Sample) => void;
}) {
  const [stored, setStored] = useState<Set<string>>(new Set());
  const [storing, setStoring] = useState(false);
  const [storeStatus, setStoreStatus] = useState("");
  useEffect(() => {
    let active = true;
    void storedSamples().then((ids) => active && setStored(ids));
    return () => {
      active = false;
    };
  }, [selected, storing]);
  async function storeAll() {
    setStoring(true);
    setStoreStatus("");
    try {
      await storeAllSamples((done, total) =>
        setStoreStatus(`Storing samples offline: ${done} of ${total}…`),
      );
      setStoreStatus(`All ${samples.length} samples are stored offline.`);
    } catch (cause) {
      setStoreStatus(
        cause instanceof Error ? cause.message : "Samples were not stored.",
      );
    } finally {
      setStoring(false);
    }
  }
  // The offline controls sit beside the gallery region so its buttons remain
  // exactly the sample choices.
  return (
    <div className="sample-gallery space-y-4 text-xs [&_p]:leading-relaxed [&_a]:text-primary">
      <section aria-label="Bundled log samples">
        <h2 className="sr-only">Bundled log samples</h2>
        <p>
          HDR photographs prepared as log. Choose a scene to apply its verified
          input tags and keep your grade.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {samples.map((sample) => (
            <button
              className="overflow-hidden rounded-sm border border-solid border-border bg-background p-0 pb-3 text-left text-foreground [&_strong]:mx-3 [&_strong]:mt-2 [&_strong]:block [&_span]:mx-3 [&_span]:mt-2 [&_span]:block [&_span]:text-muted-foreground [&_em]:mx-3 [&_em]:mt-2 [&_em]:block [&_em]:text-ok [&_em]:not-italic"
              key={sample.id}
              disabled={disabled}
              aria-label={sample.title}
              aria-pressed={selected === sample.id}
              onClick={() => onSelect(sample)}
            >
              <img
                className="h-28 w-full bg-surface-void object-contain"
                src={`/samples/previews/${sample.id}.png`}
                alt=""
                width="240"
                height="150"
                loading="lazy"
              />
              <strong>{sample.title}</strong>
              <span>{encodingLabel(sample.encoding)}</span>
              {stored.has(sample.id) && <em>Stored offline</em>}
            </button>
          ))}
        </div>
        <p>
          Tears of Steel · (CC) Blender Foundation | mango.blender.org ·{" "}
          <a href="/samples/licenses/TearsOfSteel.txt">
            CC BY 3.0, source and modifications
          </a>
          . Previews are resized sRGB renditions; grading loads the original
          PNG16 files.
        </p>
      </section>
      <div
        className="sample-offline flex flex-wrap items-center gap-2 border-0 border-t border-solid border-border pt-3 text-muted-foreground"
        role="group"
        aria-label="Offline samples"
      >
        Opening a sample stores it on this device for offline use.{" "}
        <button
          disabled={!offlineReady || storing || stored.size === samples.length}
          onClick={() => void storeAll()}
        >
          Store all samples offline ({sampleMiB} MiB)
        </button>
        {storeStatus && <span role="status">{storeStatus}</span>}
      </div>
    </div>
  );
}

export function SampleProvenance({ sample }: { sample: Sample }) {
  return (
    <details
      className="sample-provenance shrink-0 overflow-y-auto border-0 border-t border-solid border-border px-3 py-1 text-[11px] leading-relaxed text-muted-foreground open:max-h-40 [&_a]:text-primary"
      aria-label="Sample provenance"
    >
      <summary className="cursor-pointer py-1">
        Source and preparation · {sample.title}
      </summary>
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
