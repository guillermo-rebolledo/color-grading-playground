import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { openNeutralGraph } from "./fixtures";

test("save and reload restores the private still, colour settings and evaluated grade", async ({
  page,
}) => {
  await openNeutralGraph(page);
  const source = new PNG({ width: 40, height: 40 });
  for (let i = 0; i < source.data.length; i += 4)
    source.data.set([100, 60, 30, 255], i);
  await page.getByLabel("Choose image").setInputFiles({
    name: "private.png",
    mimeType: "image/png",
    buffer: PNG.sync.write(source),
  });
  const exposure = page.getByRole("spinbutton", { name: "Exposure in stops" });
  await exposure.fill("1.25");
  await exposure.press("Enter");
  await page
    .getByLabel("Output transfer", { exact: true })
    .selectOption("gamma24");
  const preview = page.getByLabel("Graded image preview");
  await expect(preview).toHaveAttribute("width", "40");
  const before = await preview.screenshot();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByLabel("Project status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.getByText("private.png", { exact: true })).toBeVisible();
  await page.locator('.react-flow__node[data-id="exposure"]').click();
  await expect(exposure).toHaveValue("1.25");
  await expect(page.getByLabel("Output transfer", { exact: true })).toHaveValue(
    "gamma24",
  );
  expect(await preview.screenshot()).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});

test("share links round trip without image bytes or uploads and preserve recipient source tags", async ({
  page,
  context,
}) => {
  await openNeutralGraph(page);
  const uploads: string[] = [];
  context.on("request", (request) => {
    if (request.method() !== "GET") uploads.push(request.url());
  });
  const source = new PNG({ width: 40, height: 40 });
  source.data.fill(128);
  const bytes = PNG.sync.write(source);
  await page.getByLabel("Choose image").setInputFiles({
    name: "private.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await page
    .getByLabel("Input transfer", { exact: true })
    .selectOption("logc3");
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  const link = await page
    .getByLabel("Share link", { exact: true })
    .inputValue();
  expect(new URL(link).hash).toMatch(/^#project=/);
  const { default: LZString } = await import("lz-string");
  const payload = LZString.decompressFromEncodedURIComponent(
    new URL(link).hash.slice(9),
  );
  expect(payload).not.toContain(bytes.toString("base64"));
  const project = JSON.parse(payload);
  expect(Object.keys(project)).toEqual(["version", "graph", "source"]);
  expect(Object.keys(project.source).sort()).toEqual([
    "encoding",
    "id",
    "kind",
    "name",
  ]);
  expect(project.source.kind).toBe("upload");
  expect(project.source.encoding.transfer).toBe("logc3");
  const recipient = await context.newPage();
  const requests: string[] = [];
  recipient.on("request", (request) => requests.push(request.url()));
  await recipient.goto(link);
  await expect(recipient.getByRole("alert")).toContainText(
    "Upload your own image",
  );
  await expect(
    recipient.getByLabel("Input transfer", { exact: true }),
  ).toHaveValue("logc3");
  await expect(recipient.getByLabel("Graded image preview")).not.toBeVisible();
  await recipient
    .getByLabel("Choose image")
    .setInputFiles({ name: "own.png", mimeType: "image/png", buffer: bytes });
  await expect(recipient.getByLabel("Graded image preview")).toBeVisible();
  await expect(
    recipient.getByLabel("Input transfer", { exact: true }),
  ).toHaveValue("logc3");
  expect(uploads).toEqual([]);
  expect(
    requests.every(
      (url) => !url.includes("project=") && !url.includes("private.png"),
    ),
  ).toBe(true);
});

test("an unavailable restored source can be replaced without leaving stale warnings", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  const link = await page
    .getByLabel("Share link", { exact: true })
    .inputValue();
  const { default: LZString } = await import("lz-string");
  const project = JSON.parse(
    LZString.decompressFromEncodedURIComponent(new URL(link).hash.slice(9)),
  );
  project.source = {
    kind: "upload",
    id: "missing",
    name: "lost.png",
    encoding: project.graph.colour.input,
  };
  await page.goto(
    `/#project=${LZString.compressToEncodedURIComponent(JSON.stringify(project))}`,
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Upload your own image");
  await page.getByLabel("Load precision chart").selectOption("logc3");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

async function sharedFixture(page: import("@playwright/test").Page) {
  await openNeutralGraph(page);
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  const link = await page
    .getByLabel("Share link", { exact: true })
    .inputValue();
  const { default: LZString } = await import("lz-string");
  return JSON.parse(
    LZString.decompressFromEncodedURIComponent(new URL(link).hash.slice(9)),
  );
}

async function openShared(
  page: import("@playwright/test").Page,
  project: unknown,
) {
  const { default: LZString } = await import("lz-string");
  await page.goto("about:blank");
  await page.goto(
    `/#project=${LZString.compressToEncodedURIComponent(JSON.stringify(project))}`,
  );
}

for (const [name, mutate, expected] of [
  [
    "unsupported schema",
    (p: any) => {
      p.version = 99;
    },
    "Unsupported project schema",
  ],
  [
    "corrupt graph",
    (p: any) => {
      p.graph.nodes = [null];
    },
    "Invalid project node",
  ],
  [
    "unknown node",
    (p: any) => {
      p.graph.nodes[1].type = "arbitrary";
    },
    "Unsupported node type",
  ],
  [
    "invalid parameter",
    (p: any) => {
      p.graph.nodes[1].data.stops = 100;
    },
    "Exposure must be",
  ],
  [
    "cyclic graph",
    (p: any) => {
      p.graph.edges[0].source = "exposure";
    },
    "cycle",
  ],
  [
    "oversized graph",
    (p: any) => {
      p.graph.nodes = Array(129).fill(p.graph.nodes[0]);
    },
    "maximum 128 nodes",
  ],
  [
    "missing sample",
    (p: any) => {
      p.source = {
        kind: "sample",
        id: "https://attacker.test/image.png",
        name: "Missing sample",
        encoding: p.graph.colour.input,
      };
    },
    "Upload your own image",
  ],
] as const) {
  test(`shared ${name} is explained visibly without fetching arbitrary sources`, async ({
    page,
  }) => {
    const project = await sharedFixture(page);
    mutate(project);
    const remote: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("attacker.test")) remote.push(request.url());
    });
    await openShared(page, project);
    await expect(page.getByRole("alert")).toContainText(expected);
    await expect(
      page.getByRole("button", { name: "Share grade", exact: true }),
    ).toBeEnabled();
    expect(remote).toEqual([]);
  });
}

for (const [name, payload, expected] of [
  ["corrupt compression", "!!!", "Corrupt share link"],
  ["oversized fragment", "A".repeat(17000), "Share link is too large"],
  ["truncated compression", "N4Ig", "truncated share link"],
] as const) {
  test(`rejects ${name}`, async ({ page }) => {
    await page.goto(`/#project=${payload}`);
    await expect(page.getByRole("alert")).toContainText(expected);
  });
}

test("rejects compressed expansion before accepting oversized decoded data", async ({
  page,
}) => {
  const project = await sharedFixture(page);
  project.graph.nodes[1].data.label = "a".repeat(300000);
  await openShared(page, project);
  await expect(page.getByRole("alert")).toContainText(
    "maximum 256 KiB decoded",
  );
});

async function seedLocal(
  page: import("@playwright/test").Page,
  saved: unknown,
) {
  // Fault injection at the browser storage boundary; assertions remain user-visible.
  await page.evaluate(async (saved) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("color-grading-projects", 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("projects", "readwrite");
        tx.objectStore("projects").put(saved, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  }, saved);
  await page.reload();
}

for (const fault of ["corrupt", "schema", "missing image"] as const) {
  test(`local ${fault} remains recoverable`, async ({ page }) => {
    const project = await sharedFixture(page);
    if (fault === "schema") project.version = 2;
    if (fault === "missing image")
      project.source = {
        kind: "upload",
        id: "lost",
        name: "lost.png",
        encoding: project.graph.colour.input,
      };
    await seedLocal(
      page,
      fault === "corrupt" ? "corrupt" : { project, image: null },
    );
    await expect(page.getByRole("alert")).toContainText(
      fault === "corrupt"
        ? "Corrupt saved project"
        : fault === "schema"
          ? "Unsupported project schema"
          : "Upload your own image",
    );
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeEnabled();
  });
}

test("blocked storage is visible and does not prevent sharing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Local storage is unavailable",
  );
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  await expect(page.getByLabel("Share link", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Local storage is unavailable",
  );
});

test("quota failure leaves the previous saved project intact", async ({
  page,
}) => {
  await openNeutralGraph(page);
  await page.getByLabel("Load precision chart").selectOption("logc3");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByLabel("Project status")).toContainText(
    "Saved on this device",
  );
  await page
    .getByLabel("Input transfer", { exact: true })
    .selectOption("linear");
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Local storage is full");
  await expect(page.getByLabel("Input transfer", { exact: true })).toHaveValue(
    "linear",
  );
  await page.reload();
  await expect(page.getByLabel("Input transfer", { exact: true })).toHaveValue(
    "logc3",
  );
  await expect(page.getByLabel("Graded image preview")).toBeVisible();
});

test("all registered node data and explicit chart tags survive a share and save round trip", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Load precision chart").selectOption("slog3");
  for (const name of [
    "Add CST",
    "Add CDL",
    "Add Contrast",
    "Add Saturation",
    "Add Curves",
    "Add White Balance",
  ])
    await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByLabel("Input transfer", { exact: true })
    .selectOption("gamma22");
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  const before = await page
    .getByLabel("Share link", { exact: true })
    .inputValue();
  const { default: LZString } = await import("lz-string");
  const project = JSON.parse(
    LZString.decompressFromEncodedURIComponent(new URL(before).hash.slice(9)),
  );
  await openShared(page, project);
  await expect(page.getByLabel("Input transfer", { exact: true })).toHaveValue(
    "gamma22",
  );
  await expect(page.getByLabel("Graded image preview")).toBeVisible();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByLabel("Project status")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  expect(
    await page.getByLabel("Share link", { exact: true }).inputValue(),
  ).toBe(before);
});

test("opening a link in an existing tab replaces its image and grade", async ({
  page,
}) => {
  const project = await sharedFixture(page);
  project.source = {
    kind: "upload",
    id: "another-device",
    name: "recipient-needed.png",
    encoding: project.graph.colour.input,
  };
  project.graph.nodes[1].data.stops = 2;
  await page.getByLabel("Load precision chart").selectOption("logc3");
  const { default: LZString } = await import("lz-string");
  await page.goto(
    `/#project=${LZString.compressToEncodedURIComponent(JSON.stringify(project))}`,
  );
  await expect(page.getByRole("alert")).toContainText("Upload your own image");
  await expect(page.getByLabel("Graded image preview")).not.toBeVisible();
  await page.locator('.react-flow__node[data-id="exposure"]').click();
  await expect(
    page.getByRole("spinbutton", { name: "Exposure in stops" }),
  ).toHaveValue("2.00");
});

test("bundled sample links restore provenance and corrected input tags", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Browse samples", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Bundled log samples" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByLabel("Graded image preview")).toBeVisible();
  await page
    .getByLabel("Input transfer", { exact: true })
    .selectOption("gamma22");
  const provenance = await page.getByLabel("Sample provenance").innerText();
  await page.getByRole("button", { name: "Share grade", exact: true }).click();
  const link = await page
    .getByLabel("Share link", { exact: true })
    .inputValue();
  await page.goto("about:blank");
  await page.goto(link);
  await expect(page.getByLabel("Graded image preview")).toBeVisible();
  await expect(page.getByLabel("Sample provenance")).toHaveText(provenance, {
    useInnerText: true,
  });
  await expect(page.getByLabel("Input transfer", { exact: true })).toHaveValue(
    "gamma22",
  );
});
