import { test, expect, type Page } from "@playwright/test";
import { openLutExport } from "./fixtures";

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
  expect(full).not.toBe(base);
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

/** The picker and the inspector Look section, through their real UI. */
async function openApp(page: Page) {
  await page.goto("/");
  // The app restores any saved project on startup; wait for that to settle
  // before driving the store, or the restore lands on top of the test.
  await expect(page.getByLabel("Inspector")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Browse looks" }),
  ).toBeEnabled();
}

async function applyFirstLook(page: Page, name = "Warm Portrait Negative") {
  await openApp(page);
  await page.getByRole("button", { name: "Browse looks" }).click();
  await page.getByRole("button", { name: `Apply ${name}` }).click();
}

test("the picker applies a look and the topbar regains focus", async ({
  page,
}) => {
  await applyFirstLook(page);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Browse looks" }),
  ).toBeFocused();
  const inspector = page.getByLabel("Inspector");
  await expect(
    inspector.getByRole("heading", { name: "Warm Portrait Negative" }),
  ).toBeVisible();
  await expect(
    inspector.getByRole("spinbutton", { name: "Look intensity" }),
  ).toHaveValue("1");
});

test("the Look section rides above the selected node's own controls", async ({
  page,
}) => {
  await applyFirstLook(page);
  const inspector = page.getByLabel("Inspector");
  // Blend is selected after insertion, so both sections are on screen at once.
  const look = inspector.getByRole("region", { name: "Look" });
  await expect(look).toBeVisible();
  await expect(
    inspector.getByRole("spinbutton", { name: "Blend amount" }),
  ).toBeVisible();
  const lookBox = await look.boundingBox();
  const blendBox = await inspector
    .getByRole("spinbutton", { name: "Blend amount" })
    .boundingBox();
  expect(lookBox!.y).toBeLessThan(blendBox!.y);
});

test("intensity is one history step and undo restores it", async ({ page }) => {
  await applyFirstLook(page);
  const intensity = page.getByRole("spinbutton", { name: "Look intensity" });
  await intensity.fill("0.4");
  await intensity.blur();
  await expect(intensity).toHaveValue("0.4");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(intensity).toHaveValue("1");
});

test("remove look takes the graph back to where it started", async ({
  page,
}) => {
  await openApp(page);
  const nodes = page.locator(".graph-node");
  const before = await nodes.count();
  await page.getByRole("button", { name: "Browse looks" }).click();
  await page.getByRole("button", { name: "Apply Saturated Slide" }).click();
  await expect(page.locator(".look-node")).toHaveCount(6);
  expect(await nodes.count()).toBe(before + 6);
  await page.getByRole("button", { name: "Remove look" }).click();
  await expect(page.locator(".look-node")).toHaveCount(0);
  expect(await nodes.count()).toBe(before);
});

test("swapping an edited look asks first; an untouched one does not", async ({
  page,
}) => {
  await applyFirstLook(page);
  // Untouched: the swap goes straight through.
  await page.getByRole("button", { name: "Swap look" }).click();
  await page.getByRole("button", { name: "Apply Vivid Negative" }).click();
  await expect(
    page.getByRole("heading", { name: "Vivid Negative" }),
  ).toBeVisible();

  // Edit one of the look's own nodes on the canvas, through the inspector.
  await page.locator(".look-node").filter({ hasText: "CDL" }).click();
  const slope = page.getByRole("spinbutton", { name: "Slope R", exact: true });
  await slope.fill("1.4");
  await slope.blur();
  await expect(
    page.getByRole("heading", { name: "Vivid Negative (modified)" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Swap look" }).click();
  await page.getByRole("button", { name: "Apply Neutral Slide" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Replace edited look",
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Replace look" }).click();
  await expect(
    page.getByRole("heading", { name: "Neutral Slide" }),
  ).toBeVisible();
});

test("reset look is offered for a shipped look and withheld for a broken one", async ({
  page,
}) => {
  await applyFirstLook(page);
  await expect(page.getByRole("button", { name: "Reset look" })).toBeEnabled();
  // Delete one of the look's nodes: the cluster is no longer a shipped look.
  await page.locator(".look-node").filter({ hasText: "CDL" }).click();
  await page.getByRole("button", { name: "Delete selection" }).click();
  await page.locator(".look-node").first().click();
  await expect(
    page.getByRole("heading", { name: /^Custom look \(from/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset look" })).toBeDisabled();
});

test("the picker refuses a graph with no Output to apply a look to", async ({
  page,
}) => {
  await openApp(page);
  await page.locator(".graph-node").filter({ hasText: "Output" }).click();
  await page.getByRole("button", { name: "Delete selection" }).click();
  await page.getByRole("button", { name: "Browse looks" }).click();
  await expect(page.getByText(/Add an Output node/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply Vivid Negative" }),
  ).toBeDisabled();
});

test("the stage still does not scroll with a look applied", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await applyFirstLook(page);
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    client: document.documentElement.clientHeight,
    rail: document.querySelector(".inspector")?.getBoundingClientRect().width,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
  expect(overflow.rail).toBe(328);
});

test("every look changes the image, and no two looks agree", async ({
  page,
}) => {
  const { identity, lattices } = await evaluateLooks<{
    identity: string;
    lattices: Record<string, string>;
  }>(
    page,
    `(() => {
      const canvas = document.createElement("canvas");
      const gpu = new engine.GradingEngine(canvas);
      try {
        const neutral = engine.createGraph();
        const lattice = (graph) =>
          Array.from(gpu.renderLattice(graph, 17)).map((v) => v.toFixed(4)).join(",");
        const lattices = {};
        for (const look of looks.looks)
          lattices[look.id] = lattice(looks.withLook(neutral, look));
        return { identity: lattice(neutral), lattices };
      } finally {
        gpu.dispose();
      }
    })()`,
  );
  const seen = new Map<string, string>();
  for (const [id, samples] of Object.entries(lattices)) {
    expect(samples, `${id} is an identity transform`).not.toBe(identity);
    const twin = seen.get(samples);
    expect(twin, `${id} is indistinguishable from ${twin}`).toBeUndefined();
    seen.set(samples, id);
  }
});

test("a graded project with a look still fits a share link", async ({
  page,
}) => {
  const length = await evaluateLooks<number>(
    page,
    `(async () => {
      const shared = await import("/src/sharedProject.ts");
      const graph = looks.withLook(engine.createStarterGraph(), looks.looks[5]);
      return shared.createShareLink({ version: 1, graph, source: null }).length;
    })()`,
  );
  // The fragment limit is 16 KiB; a look must not eat the user's budget.
  expect(length).toBeLessThan(8 * 1024);
});

test("look-only export matches the whole grade when there is no grade", async ({
  page,
}) => {
  const [whole, only, graded, gradedOnly] = await evaluateLooks<string[]>(
    page,
    `(() => {
      const canvas = document.createElement("canvas");
      const gpu = new engine.GradingEngine(canvas);
      try {
        const lattice = (graph) =>
          Array.from(gpu.renderLattice(graph, 17)).map((v) => v.toFixed(4)).join(",");
        // Source -> Exposure(0 stops) -> Output is a no-op primary grade.
        const neutral = looks.withLook(engine.createGraph(), looks.looks[0]);
        // The same graph with a real primary grade in front of the look.
        const exposure = neutral.nodes.find((n) => n.type === "exposure");
        const graded = { ...neutral, nodes: neutral.nodes.map((n) =>
          n.id === exposure.id ? { ...n, data: { ...n.data, stops: 1.5 } } : n) };
        return [
          lattice(neutral),
          lattice(looks.lookOnlyGraph(neutral)),
          lattice(graded),
          lattice(looks.lookOnlyGraph(graded)),
        ];
      } finally {
        gpu.dispose();
      }
    })()`,
  );
  expect(only).toBe(whole);
  // With a primary grade present the two scopes must part company, and the
  // look-only file must be the one that ignores it.
  expect(gradedOnly).not.toBe(graded);
  expect(gradedOnly).toBe(whole);
});

test("look-only export carries the user's edits, not the shipped look", async ({
  page,
}) => {
  const [shipped, edited] = await evaluateLooks<[string, string]>(
    page,
    `(() => {
      const canvas = document.createElement("canvas");
      const gpu = new engine.GradingEngine(canvas);
      try {
        const lattice = (graph) =>
          Array.from(gpu.renderLattice(graph, 17)).map((v) => v.toFixed(4)).join(",");
        const applied = looks.withLook(engine.createGraph(), looks.looks[6]);
        const inner = looks.lookState(applied).innerIds[2];
        const changed = { ...applied, nodes: applied.nodes.map((n) =>
          n.id === inner ? { ...n, data: { ...n.data, saturation: 0.3 } } : n) };
        return [
          lattice(looks.lookOnlyGraph(applied)),
          lattice(looks.lookOnlyGraph(changed)),
        ];
      } finally {
        gpu.dispose();
      }
    })()`,
  );
  expect(edited).not.toBe(shipped);
});

test("look-only export keeps the project's Input and Output tags", async ({
  page,
}) => {
  const colour = await evaluateLooks<{
    input: string;
    output: string;
    clamp: string;
  }>(
    page,
    `(() => {
      const applied = looks.withLook(engine.createGraph(), looks.looks[0]);
      applied.colour.input = { transfer: "logc3", primaries: "arri-wide-gamut3" };
      applied.colour.output = { transfer: "gamma24", primaries: "rec2020" };
      const output = applied.nodes.find((n) => n.type === "output");
      output.data.clamp = "unbounded";
      const only = looks.lookOnlyGraph(applied);
      return {
        input: only.colour.input.transfer + "/" + only.colour.input.primaries,
        output: only.colour.output.transfer + "/" + only.colour.output.primaries,
        clamp: only.nodes.find((n) => n.type === "output").data.clamp,
      };
    })()`,
  );
  expect(colour.input).toBe("logc3/arri-wide-gamut3");
  expect(colour.output).toBe("gamma24/rec2020");
  expect(colour.clamp).toBe("unbounded");
});

test("the export scope control waits for a look", async ({ page }) => {
  await openApp(page);
  await openLutExport(page);
  const scope = page.getByLabel("LUT scope");
  await expect(scope).toBeDisabled();
  await expect(scope).toHaveValue("grade");

  await page.getByRole("button", { name: "Browse looks" }).click();
  await page.getByRole("button", { name: "Apply Vivid Negative" }).click();
  await openLutExport(page);
  await expect(scope).toBeEnabled();
  await scope.selectOption("look");
  await expect(page.getByLabel("LUT title")).toHaveValue("Vivid Negative");
  await expect(
    page.getByText(/the look alone, without your primary grade/),
  ).toBeVisible();

  // Removing the look must not leave the panel exporting something gone.
  await page.getByRole("button", { name: "Remove look" }).click();
  await openLutExport(page);
  await expect(scope).toHaveValue("grade");
  await expect(scope).toBeDisabled();
});
