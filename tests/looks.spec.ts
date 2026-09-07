import { test, expect, type Page } from "@playwright/test";

/** Run an expression against the looks module and the engine, in the page. */
async function evaluateLooks<T>(page: Page, body: string): Promise<T> {
  await page.goto("/");
  return page.evaluate(async (body) => {
    const looks = await import(/* @vite-ignore */ "/src/looks.ts" as string);
    const engine = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    return new Function("looks", "engine", `return (${body})`)(looks, engine);
  }, body);
}

/** History equality in the store ignores selection, so structural comparisons
 * here do the same. Everything else — ids, order, positions — must match. */
const withoutSelection = `((graph) => JSON.stringify({
  ...graph,
  nodes: graph.nodes.map(({ selected, ...n }) => n),
  edges: graph.edges.map(({ selected, ...e }) => e),
}))`;

test("every shipped look validates and compiles", async ({ page }) => {
  const results = await evaluateLooks<
    { id: string; error: string | null; nodes: number }[]
  >(
    page,
    `looks.looks.map((look) => {
      const graph = looks.withLook(engine.createGraph(), look);
      return {
        id: look.id,
        error: engine.GradingEngine.validate(graph),
        nodes: graph.nodes.filter((n) => n.data.look === look.id).length,
      };
    })`,
  );
  expect(results.length).toBe(13);
  for (const result of results) {
    expect(result.error, `${result.id} failed validation`).toBeNull();
    // Two CSTs, the authored nodes and one Blend: within the stated 5-8.
    expect(result.nodes, result.id).toBeGreaterThanOrEqual(5);
    expect(result.nodes, result.id).toBeLessThanOrEqual(8);
  }
});

test("a look carries provenance on every node it inserts", async ({ page }) => {
  const state = await evaluateLooks<{
    label: string;
    intact: boolean;
    modified: boolean;
    outdated: boolean;
    tagged: number;
    hashes: number;
  }>(
    page,
    `(() => {
      const look = looks.looks[0];
      const graph = looks.withLook(engine.createGraph(), look);
      const state = looks.lookState(graph);
      return {
        label: state.label,
        intact: state.intact,
        modified: state.modified,
        outdated: state.outdated,
        tagged: state.nodeIds.length,
        hashes: new Set(
          graph.nodes.filter((n) => n.data.look).map((n) => n.data.lookHash),
        ).size,
      };
    })()`,
  );
  expect(state.label).toBe("Warm Portrait Negative");
  expect(state.intact).toBe(true);
  expect(state.modified).toBe(false);
  expect(state.outdated).toBe(false);
  expect(state.hashes).toBe(1);
});

test("insert then remove restores the graph exactly", async ({ page }) => {
  const [before, after] = await evaluateLooks<[string, string]>(
    page,
    `(() => {
      const strip = ${withoutSelection};
      const base = engine.createStarterGraph();
      const applied = looks.withLook(base, looks.looks[3]);
      return [strip(base), strip(looks.withoutLook(applied))];
    })()`,
  );
  expect(after).toBe(before);
});

test("insert, swap, reset and remove restores the graph exactly", async ({
  page,
}) => {
  const [before, after] = await evaluateLooks<[string, string]>(
    page,
    `(() => {
      const strip = ${withoutSelection};
      const base = engine.createStarterGraph();
      let graph = looks.withLook(base, looks.looks[0]);
      graph = looks.withLook(graph, looks.looks[5]);
      // Edit the look, then reset it back to what was shipped.
      const inner = looks.lookState(graph).innerIds[1];
      graph = { ...graph, nodes: graph.nodes.map((n) =>
        n.id === inner ? { ...n, data: { ...n.data, saturation: 0.42 } } : n) };
      graph = looks.withLookReset(graph);
      return [strip(base), strip(looks.withoutLook(graph))];
    })()`,
  );
  expect(after).toBe(before);
});

test("an edited look reads as modified, and reset clears it", async ({
  page,
}) => {
  const labels = await evaluateLooks<string[]>(
    page,
    `(() => {
      let graph = looks.withLook(engine.createGraph(), looks.looks[2]);
      const first = looks.lookState(graph).label;
      const inner = looks.lookState(graph).innerIds[1];
      graph = { ...graph, nodes: graph.nodes.map((n) =>
        n.id === inner ? { ...n, data: { ...n.data, slope: [1.4, 1, 0.8] } } : n) };
      const edited = looks.lookState(graph).label;
      return [first, edited, looks.lookState(looks.withLookReset(graph)).label];
    })()`,
  );
  expect(labels).toEqual([
    "Vivid Negative",
    "Vivid Negative (modified)",
    "Vivid Negative",
  ]);
});

test("intensity is the Blend amount, and zero is a no-op", async ({ page }) => {
  const [base, full, none] = await evaluateLooks<[string, string, string]>(
    page,
    `(() => {
      const canvas = document.createElement("canvas");
      const gpu = new engine.GradingEngine(canvas);
      try {
        const neutral = engine.createGraph();
        const applied = looks.withLook(neutral, looks.looks[5]);
        const blend = looks.lookState(applied).blendId;
        const silent = { ...applied, nodes: applied.nodes.map((n) =>
          n.id === blend ? { ...n, data: { ...n.data, amount: 0 } } : n) };
        const lattice = (graph) =>
          Array.from(gpu.renderLattice(graph, 17)).map((v) => v.toFixed(4)).join(",");
        return [lattice(neutral), lattice(applied), lattice(silent)];
      } finally {
        gpu.dispose();
      }
    })()`,
  );
  expect(none).toBe(base);
  // The placeholder definitions are still identity, so this only asserts that
  // the sandwich itself is transparent. MEM-236 makes the looks differ.
  expect(full.length).toBeGreaterThan(0);
});

test("a dismantled cluster degrades to a custom look", async ({ page }) => {
  const labels = await evaluateLooks<string[]>(
    page,
    `(() => {
      const applied = looks.withLook(engine.createGraph(), looks.looks[6]);
      const state = looks.lookState(applied);
      // Delete one node from the middle of the chain.
      const victim = state.innerIds[0];
      const broken = {
        ...applied,
        nodes: applied.nodes.filter((n) => n.id !== victim),
        edges: applied.edges.filter((e) => e.source !== victim && e.target !== victim),
      };
      // A tag whose id the inventory no longer knows.
      const unknown = { ...applied, nodes: applied.nodes.map((n) =>
        n.data.look ? { ...n, data: { ...n.data, look: "retired-look" } } : n) };
      return [looks.lookState(broken).label, looks.lookState(unknown).label];
    })()`,
  );
  expect(labels).toEqual(["Custom look (from Neutral Slide)", "Custom look"]);
});

test("a stale hash reads as an older version", async ({ page }) => {
  const label = await evaluateLooks<string>(
    page,
    `(() => {
      const applied = looks.withLook(engine.createGraph(), looks.looks[1]);
      const stale = { ...applied, nodes: applied.nodes.map((n) =>
        n.data.look ? { ...n, data: { ...n.data, lookHash: "00000000" } } : n) };
      return looks.lookState(stale).label;
    })()`,
  );
  expect(label).toBe("Consumer Warm Negative (older version)");
});

test("removing a dismantled look still leaves a valid graph", async ({
  page,
}) => {
  const result = await evaluateLooks<{ error: string | null; tagged: number }>(
    page,
    `(() => {
      const applied = looks.withLook(engine.createStarterGraph(), looks.looks[8]);
      const victim = looks.lookState(applied).innerIds[0];
      const broken = {
        ...applied,
        nodes: applied.nodes.filter((n) => n.id !== victim),
        edges: applied.edges.filter((e) => e.source !== victim && e.target !== victim),
      };
      const cleared = looks.withoutLook(broken);
      return {
        error: engine.GradingEngine.validate(cleared, true),
        tagged: cleared.nodes.filter((n) => n.data.look).length,
      };
    })()`,
  );
  expect(result.tagged).toBe(0);
  expect(result.error).toBeNull();
});

test("the look slot requires a node feeding Output", async ({ page }) => {
  const reasons = await evaluateLooks<[string | null, string | null]>(
    page,
    `(() => {
      const graph = engine.createGraph();
      const output = graph.nodes.find((n) => n.type === "output");
      const detached = {
        ...graph,
        edges: graph.edges.filter((e) => e.target !== output.id),
      };
      return [looks.lookSlotError(graph), looks.lookSlotError(detached)];
    })()`,
  );
  expect(reasons[0]).toBeNull();
  expect(reasons[1]).toContain("Connect a node to Output");
});

test("look provenance survives a validated round trip through the schema", async ({
  page,
}) => {
  const result = await evaluateLooks<{ error: string | null; label: string }>(
    page,
    `(() => {
      const applied = looks.withLook(engine.createGraph(), looks.looks[12]);
      const roundTrip = JSON.parse(JSON.stringify(applied));
      return {
        error: engine.GradingEngine.validate(roundTrip),
        label: looks.lookState(roundTrip).label,
      };
    })()`,
  );
  expect(result.error).toBeNull();
  expect(result.label).toBe("Tungsten Motion Picture");
});

test("look provenance must be text", async ({ page }) => {
  const error = await evaluateLooks<string | null>(
    page,
    `(() => {
      const applied = looks.withLook(engine.createGraph(), looks.looks[0]);
      const broken = { ...applied, nodes: applied.nodes.map((n) =>
        n.data.look ? { ...n, data: { ...n.data, look: 7 } } : n) };
      return engine.GradingEngine.validate(broken);
    })()`,
  );
  expect(error).toContain("Look provenance must be text");
});
