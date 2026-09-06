import { encodingLabel, type GradingGraph } from "@/engine/GradingEngine";
import { encodingFlow } from "@/engine/graph";
import { sameEncoding } from "@/engine/colour";
import { nodeTitle } from "@/nodeTitles";

/** Uses the engine's declarations only; this presentation never repairs a graph. */
export function EncodingAdvisories({
  graph,
  flow,
}: {
  graph: GradingGraph;
  flow: ReturnType<typeof encodingFlow> | null;
}) {
  if (!flow || !flow.warnings.length) return null;
  return (
    <div className="encoding-advisory">
      <strong>Encoding advisory</strong>
      {graph.nodes.map((node) => {
        const input = flow.inputs.get(node.id);
        if (!input) return null;
        if (node.type === "blend") {
          const edge = graph.edges.find(
            (edge) => edge.target === node.id && edge.targetHandle === "b",
          );
          const branch = edge && flow.encodings.get(edge.source);
          if (!branch || sameEncoding(input, branch)) return null;
          return (
            <div key={node.id}>
              <p>{nodeTitle(node)} · incompatible branch encodings</p>
              <p className="declared-encoding">
                Branch A: {encodingLabel(input)}
              </p>
              <p className="declared-encoding">
                Branch B: {encodingLabel(branch)}
              </p>
            </div>
          );
        }
        if (node.type === "cst" && !sameEncoding(input, node.data.from!))
          return (
            <div key={node.id}>
              <p>{nodeTitle(node)} · declaration mismatch</p>
              <p className="declared-encoding">
                Connected input: {encodingLabel(input)}
              </p>
              <p className="declared-encoding">
                Declared from: {encodingLabel(node.data.from!)}
              </p>
            </div>
          );
        if (
          (node.type === "exposure" || node.type === "whiteBalance") &&
          input.transfer !== "linear"
        )
          return (
            <p key={node.id}>
              {nodeTitle(node)} expects linear light; connected input:{" "}
              <span className="declared-encoding">{encodingLabel(input)}</span>.
            </p>
          );
        return null;
      })}
      <p>
        Nothing is inserted implicitly. This is advisory; resolving the
        declarations with explicit CST nodes is the colourist’s call.
      </p>
    </div>
  );
}
