import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { encodingLabel } from "@/engine/GradingEngine";
import { storeAllSamples, storedSamples } from "@/offline";
import { samples, type Sample } from "@/samples";

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
    <div className="max-h-[22vh] shrink-0 overflow-y-auto border-b border-border bg-card px-4 py-3 text-xs leading-normal text-foreground [&_a]:text-primary [&_a]:underline [&_p]:my-2">
      <section aria-label="Bundled log samples">
        <h2 className="m-0 text-[13px] font-medium">Bundled log samples</h2>
        <p>
          HDR photographs prepared as log. Choose a scene to apply its verified
          input tags and keep your grade.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
          {samples.map((sample) => (
            <button
              className="overflow-hidden p-0 pb-2 text-left text-xs"
              key={sample.id}
              disabled={disabled}
              aria-label={sample.title}
              aria-pressed={selected === sample.id}
              onClick={() => onSelect(sample)}
            >
              <img
                className="block h-[110px] w-full bg-surface-void object-contain"
                src={`/samples/previews/${sample.id}.png`}
                alt=""
                width="240"
                height="150"
                loading="lazy"
              />
              <strong className="mx-2 mt-2 block font-medium">
                {sample.title}
              </strong>
              <span className="mx-2 mt-1 block font-mono text-[11px] tabular-nums">
                {encodingLabel(sample.encoding)}
              </span>
              {stored.has(sample.id) && (
                <em className="mx-2 mt-1.5 block text-[11px] not-italic text-ok">
                  Stored offline
                </em>
              )}
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
        className="flex flex-wrap items-center gap-2 border-t border-border pt-2"
        role="group"
        aria-label="Offline samples"
      >
        Opening a sample stores it on this device for offline use.{" "}
        <Button
          disabled={!offlineReady || storing || stored.size === samples.length}
          onClick={() => void storeAll()}
        >
          Store all samples offline (
          <span className="font-mono text-[11px] tabular-nums">
            {sampleMiB} MiB
          </span>
          )
        </Button>
        {storeStatus && (
          <span className="font-mono text-[11px] tabular-nums" role="status">
            {storeStatus}
          </span>
        )}
      </div>
    </div>
  );
}

export function SampleProvenance({ sample }: { sample: Sample }) {
  return (
    <details
      className="max-h-[72px] shrink-0 overflow-y-auto border-t border-border bg-card px-4 py-2 text-xs leading-normal text-foreground [&_a]:text-primary [&_a]:underline [&_p]:my-1"
      aria-label="Sample provenance"
      open
    >
      <summary className="cursor-pointer text-[11px] font-medium">
        Source and preparation · {sample.title}
      </summary>
      <p className="font-mono text-[11px] tabular-nums">
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
        with{" "}
        <span className="font-mono text-[11px] tabular-nums">
          {sample.preparation.exposureStops}
        </span>{" "}
        stops of preparation exposure and pixel stride{" "}
        <span className="font-mono text-[11px] tabular-nums">
          {sample.preparation.sampleStride}
        </span>
        . Rounded to PNG16 without clipping or tone mapping. These are prepared
        log photographs, not native camera-log captures.
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
