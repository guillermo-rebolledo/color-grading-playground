import { test, expect } from "@playwright/test";

test("curves preserve identity including negative, HDR, endpoints and alpha", async ({
  page,
}) => {
  await page.goto("/");
  const pixels = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    graph.nodes[1].type = "curves";
    graph.nodes[1].data = {
      curves: Object.fromEntries(
        ["master", "r", "g", "b"].map((k) => [
          k,
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        ]),
      ),
    };
    graph.nodes[2].data.clamp = "unbounded";
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage({
      width: 2,
      height: 1,
      data: new Float32Array([-0.25, 0, 4, 0.5, 1, 0.123, 0.999, 1]),
    });
    try {
      engine.render(JSON.parse(JSON.stringify(graph)));
      return Array.from(engine.readPixels()) as number[];
    } finally {
      engine.dispose();
    }
  });
  [-0.25, 0, 4, 0.5, 1, 0.123, 0.999, 1].forEach((v, i) =>
    expect(pixels[i]).toBeCloseTo(v, 5),
  );
});

test("curve inspector edits channels, rejects duplicate inputs and restores history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Curves", exact: true }).click();
  await page.getByRole("button", { name: "Add point", exact: true }).click();
  const output = page.getByRole("spinbutton", {
    name: "Point 2 output",
    exact: true,
  });
  await output.fill("0.75");
  await output.press("Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(output).toHaveValue("0.5");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(output).toHaveValue("0.75");
  const input = page.getByRole("spinbutton", {
    name: "Point 2 input",
    exact: true,
  });
  await input.fill("0");
  await input.press("Enter");
  await expect(
    page.getByText("use 2–256 points", { exact: false }),
  ).toBeVisible();
  await expect(input).toHaveValue("0.5");
  await page
    .getByRole("combobox", { name: "Curve channel", exact: true })
    .selectOption("r");
  await expect(
    page.getByRole("spinbutton", { name: "Point 2 output", exact: true }),
  ).toHaveValue("1");
  await page
    .getByRole("combobox", { name: "Curve channel", exact: true })
    .selectOption("master");
  await expect(output).toHaveValue("0.75");
  await page.getByRole("button", { name: "Reset Curves", exact: true }).click();
  await expect(output).toHaveValue("1");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(output).toHaveValue("0.75");
});

test("curves apply master before channels, extrapolate endpoint tangents and update without compilation", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    const identity = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    graph.nodes[1].type = "curves";
    graph.nodes[1].data = {
      curves: { master: identity, r: identity, g: identity, b: identity },
    };
    graph.nodes[2].data.clamp = "unbounded";
    const engine = new GradingEngine(document.createElement("canvas"));
    engine.setImage({
      width: 2,
      height: 1,
      data: new Float32Array([0.5, 0.5, 0.5, 0.25, -1, 2, 1, 1]),
    });
    engine.render(graph);
    const original = WebGL2RenderingContext.prototype.compileShader;
    const link = WebGL2RenderingContext.prototype.linkProgram;
    let compiles = 0;
    WebGL2RenderingContext.prototype.compileShader = function (s) {
      compiles++;
      original.call(this, s);
    };
    WebGL2RenderingContext.prototype.linkProgram = function (p) {
      compiles++;
      link.call(this, p);
    };
    try {
      graph.nodes[1].data.curves = {
        master: [
          { x: 0, y: 0 },
          { x: 1, y: 0.5 },
        ],
        r: [
          { x: 0, y: 0.25 },
          { x: 1, y: 0.75 },
        ],
        g: identity,
        b: [
          { x: 0, y: 1 },
          { x: 1, y: 0 },
        ],
      };
      engine.render(JSON.parse(JSON.stringify(graph)));
      const pixels = Array.from(engine.readPixels());
      graph.nodes[1].data.curves.master = [
        { x: 0, y: 0 },
        { x: 0.25, y: 0.1 },
        { x: 0.8, y: 0.9 },
        { x: 1, y: 1 },
      ];
      engine.render(graph);
      return { pixels, compiles };
    } finally {
      engine.dispose();
      WebGL2RenderingContext.prototype.compileShader = original;
      WebGL2RenderingContext.prototype.linkProgram = link;
    }
  });
  [0.375, 0.25, 0.75, 0.25, 0, 1, 0.5, 1].forEach((v, i) =>
    expect(result.pixels[i]).toBeCloseTo(v, 5),
  );
  expect(result.compiles).toBe(0);
});

test("curve ramps preserve local monotonic segments, flat spans and close-point bounds", async ({
  page,
}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    for (const key of ["input", "working", "output"])
      graph.colour[key] = { transfer: "linear", primaries: "rec709" };
    const identity = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    graph.nodes[1].type = "curves";
    graph.nodes[2].data.clamp = "unbounded";
    const engine = new GradingEngine(document.createElement("canvas"));
    const data = new Float32Array(1024 * 4);
    for (let i = 0; i < 1024; i++)
      data.set([i / 1023, i / 1023, i / 1023, 1], i * 4);
    engine.setImage({ width: 1024, height: 1, data });
    try {
      return [
        [
          { x: 0, y: 0 },
          { x: 0.25, y: 0.8 },
          { x: 0.5, y: 0.2 },
          { x: 0.75, y: 0.2 },
          { x: 1, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.01 },
          { x: 0.500001, y: 0.99 },
          { x: 1, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: 0.5, y: 1 },
          { x: 1, y: 0 },
        ],
      ].map((master) => {
        graph.nodes[1].data = {
          curves: { master, r: identity, g: identity, b: identity },
        };
        engine.render(graph);
        return Array.from(engine.readPixels()).filter(
          (_, i) => i % 4 === 0,
        ) as number[];
      });
    } finally {
      engine.dispose();
    }
  });
  for (const ramp of results) {
    expect(
      ramp.every((v) => Number.isFinite(v) && v >= -1e-6 && v <= 1 + 1e-6),
    ).toBe(true);
  }
  for (let i = 1; i < 1024; i++) {
    if (i < 255 || i > 769)
      expect(results[0][i]).toBeGreaterThanOrEqual(results[0][i - 1] - 1e-6);
    if (i > 257 && i < 511)
      expect(results[0][i]).toBeLessThanOrEqual(results[0][i - 1] + 1e-6);
    if (i > 514 && i < 766) expect(results[0][i]).toBeCloseTo(0.2, 5);
    expect(results[1][i]).toBeGreaterThanOrEqual(results[1][i - 1] - 1e-6);
  }
  // Hermite with endpoint secants ±2 and zero tangent at the peak gives 0.625 at x=.25.
  expect(results[2][256]).toBeCloseTo(0.625, 2);
});

test("curve validation rejects missing, invalid, unordered and float32 duplicate points", async ({
  page,
}) => {
  await page.goto("/");
  const errors = await page.evaluate(async () => {
    const { GradingEngine, createGraph } = await import(
      /* @vite-ignore */ "/src/engine/GradingEngine.ts" as string
    );
    const graph = createGraph();
    graph.nodes[1].type = "curves";
    const identity = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    return [
      [
        { x: 0, y: 0 },
        { x: 1e-40, y: 0.5 },
        { x: 1, y: 1 },
      ],
      undefined,
      [],
      [{ x: 0, y: 0 }],
      [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ],
      [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      [
        { x: 0.1, y: 0 },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: NaN },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: Infinity },
      ],
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.2 },
        { x: 0.5000000001, y: 0.8 },
        { x: 1, y: 1 },
      ],
    ].map((master) => {
      graph.nodes[1].data = {
        curves: { master, r: identity, g: identity, b: identity },
      };
      return GradingEngine.validate(graph);
    });
  });
  expect(errors.every((e) => e?.includes("Curves master"))).toBe(true);
});

test("point dragging and keyboard repeats each form one undo step; deletion and reset are reversible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Curves", exact: true }).click();
  await page.getByRole("button", { name: "Add point", exact: true }).click();
  const point = page.getByRole("button", { name: /^Point 2: input/ });
  const output = page.getByRole("spinbutton", {
    name: "Point 2 output",
    exact: true,
  });
  await point.focus();
  await page.keyboard.down("ArrowUp");
  await page.keyboard.down("ArrowUp");
  await page.keyboard.up("ArrowUp");
  await expect(output).toHaveValue("0.52");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(output).toHaveValue("0.5");
  await point.scrollIntoViewIfNeeded();
  const box = await point.boundingBox();
  if (!box) throw new Error("Point not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 8 });
  await page.mouse.up();
  expect(Number(await output.inputValue())).toBeGreaterThan(0.5);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(output).toHaveValue("0.5");
  await page
    .getByRole("button", { name: "Delete point 2", exact: true })
    .click();
  await expect(output).toHaveValue("1");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(output).toHaveValue("0.5");
  await page
    .getByRole("button", { name: "Reset channel", exact: true })
    .click();
  await expect(output).toHaveValue("1");
});
