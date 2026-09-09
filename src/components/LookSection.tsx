import { NumericControl } from "@/AdjustmentControls";
import { Button } from "@/components/ui/button";
import { Icon } from "@/icons";
import { useGraph } from "@/graphStore";
import { lookState } from "@/looks";

/** Look-level controls, shown above the selected node's own parameters
 * whenever that node belongs to a look.
 *
 * The inspector otherwise keeps the same shape for every node type. This is a
 * deliberate exception, recorded in docs/workspace-shell.md: it is additive
 * only — a section above — and never reflows the parameters below it. */
export function LookSection({ onSwap }: { onSwap: () => void }) {
  const graphState = useGraph();
  const { graph } = graphState;
  const selected = graph.nodes.find((n) => n.selected);
  const state = lookState(graph);
  if (!state || !selected?.data.look) return null;
  const resettable = !!state.definition && state.intact;
  return (
    <section className="look-section" aria-label="Look">
      <div className="selected-node-heading">
        <span className="node-type-badge">LOOK</span>
      </div>
      <h3 className="m-0 text-[13px] font-medium">{state.label}</h3>
      {state.definition && (
        <p className="m-0 mt-1 text-[11px] leading-normal text-muted-foreground">
          {state.definition.description}
        </p>
      )}
      {!state.intact && (
        <p className="m-0 mt-1 text-[11px] leading-normal text-warning">
          These nodes no longer form a complete look. They still grade normally;
          reset is unavailable.
        </p>
      )}
      {state.outdated && (
        <p className="m-0 mt-1 text-[11px] leading-normal text-muted-foreground">
          This look was applied from an earlier definition. Your grade is
          unchanged; reset adopts the current one.
        </p>
      )}
      {state.blendId && (
        <NumericControl
          label="Look intensity"
          value={state.intensity}
          neutral={1}
          min={0}
          max={1}
          onChange={(amount) =>
            graphState.updateParameters(state.blendId!, { amount })
          }
        />
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="toolbar" onClick={onSwap}>
          <Icon.Images />
          Swap look
        </Button>
        <Button
          size="toolbar"
          disabled={!resettable}
          title={
            resettable ? undefined : "This look no longer matches a shipped one"
          }
          onClick={graphState.resetLook}
        >
          <Icon.RefreshCw />
          Reset look
        </Button>
        <Button size="toolbar" onClick={graphState.removeLook}>
          <Icon.Trash2 />
          Remove look
        </Button>
      </div>
    </section>
  );
}
