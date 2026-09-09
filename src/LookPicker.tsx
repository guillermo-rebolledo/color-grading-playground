import { useGraph } from "@/graphStore";
import { looks, lookSlotError, lookState, type LookDefinition } from "@/looks";
import { Button } from "@/components/ui/button";

const groups = [
  "Colour negative",
  "Slide",
  "Black and white",
  "Motion picture",
];

/** The pool of film-inspired looks. Names are families rather than stock
 * names: a look approximates a family's colour response, and nothing here is
 * measured against real film, so claiming a stock by name would overstate it. */
export function LookPicker({
  onSelect,
}: {
  onSelect: (look: LookDefinition) => void;
}) {
  const graph = useGraph((s) => s.graph);
  const applied = lookState(graph);
  const blocked = lookSlotError(graph);
  return (
    <div className="look-gallery space-y-4 bg-card text-xs leading-normal text-foreground [&_p]:my-2">
      <section aria-label="Film-inspired looks">
        <h2 className="sr-only">Film-inspired looks</h2>
        <p>
          A look is inserted at the end of your chain as ordinary nodes you can
          edit. Colour response only — no grain and no halation, because a 3D
          LUT is a pure function of colour.
        </p>
        {blocked && (
          <p role="status" className="text-warning">
            {blocked}
          </p>
        )}
        {groups.map((group) => (
          <section key={group} aria-label={group} className="mt-4">
            <h3 className="m-0 mb-2 text-[11px] font-medium tracking-[1.6px] text-muted-foreground uppercase">
              {group}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
              {looks
                .filter((look) => look.group === group)
                .map((look) => (
                  <button
                    key={look.id}
                    type="button"
                    aria-label={`Apply ${look.name}`}
                    aria-pressed={applied?.id === look.id}
                    title={`In the family of ${look.referenceStocks.join(", ")}`}
                    disabled={!!blocked}
                    className={`look-tile flex flex-col items-stretch gap-1 border border-solid p-2 text-left ${
                      applied?.id === look.id
                        ? "border-primary bg-input"
                        : "border-line-strong bg-secondary"
                    }`}
                    onClick={() => onSelect(look)}
                  >
                    <img
                      className="aspect-[8/5] w-full border border-solid border-border object-cover"
                      src={`looks/previews/${look.id}.png`}
                      alt=""
                      width={240}
                      height={150}
                      loading="lazy"
                    />
                    <span className="text-xs font-medium">{look.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {look.description}
                    </span>
                    <span className="font-mono text-[10px] text-text-faint">
                      {look.referenceStocks.join(" · ")}
                    </span>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}

/** Confirmation shown when swapping away from a look the user has edited. */
export function LookSwapConfirm({
  pending,
  current,
  onCancel,
  onConfirm,
}: {
  pending: LookDefinition;
  current: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Replace edited look"
      className="mt-3 border border-solid border-warning p-3 text-xs"
    >
      <p className="m-0 mb-2">
        {current} has edits. Applying {pending.name} replaces them. Undo brings
        them back.
      </p>
      <div className="flex gap-2">
        <Button accent onClick={onConfirm}>
          Replace look
        </Button>
        <Button onClick={onCancel}>Keep editing</Button>
      </div>
    </div>
  );
}
