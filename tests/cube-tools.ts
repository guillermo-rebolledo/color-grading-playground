// Independent Adobe Cube reader and trilinear applier used only to verify exports.
// It shares no code with src/engine/cube.ts on purpose.
export type Cube = {
  title: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  /** N³ RGB triples, red index fastest, then green, then blue. */
  table: number[];
};

export function parseCube(text: string): Cube {
  const cube: Cube = {
    title: "",
    size: 0,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    table: [],
  };
  const lines = text.split("\n");
  if (lines.pop() !== "") throw new Error("Cube must end with a newline.");
  for (const line of lines) {
    if (line === "" || line.startsWith("#")) continue;
    if (/\r|\t|^\s|\s$/.test(line))
      throw new Error(`Unexpected whitespace: ${JSON.stringify(line)}`);
    const tokens = line.split(" ");
    if (tokens[0] === "TITLE") {
      const match = /^TITLE "([^"]*)"$/.exec(line);
      if (!match) throw new Error(`Bad title line: ${line}`);
      cube.title = match[1];
    } else if (tokens[0] === "LUT_3D_SIZE") {
      cube.size = Number(tokens[1]);
      if (tokens.length !== 2 || !Number.isInteger(cube.size) || cube.size < 2)
        throw new Error(`Bad size line: ${line}`);
    } else if (tokens[0] === "DOMAIN_MIN" || tokens[0] === "DOMAIN_MAX") {
      const values = tokens.slice(1).map(Number);
      if (values.length !== 3 || !values.every(Number.isFinite))
        throw new Error(`Bad domain line: ${line}`);
      cube[tokens[0] === "DOMAIN_MIN" ? "domainMin" : "domainMax"] = values as [
        number,
        number,
        number,
      ];
    } else {
      if (tokens.length !== 3 || !tokens.every((t) => /^-?\d+\.\d{6}$/.test(t)))
        throw new Error(`Bad data row: ${line}`);
      cube.table.push(...tokens.map(Number));
    }
  }
  if (!cube.size) throw new Error("Missing LUT_3D_SIZE.");
  if (cube.table.length !== cube.size ** 3 * 3)
    throw new Error(
      `Expected ${cube.size ** 3} rows, found ${cube.table.length / 3}.`,
    );
  return cube;
}

/** Trilinear lookup; inputs are clamped to the declared domain. */
export function applyCube(
  cube: Cube,
  rgb: readonly [number, number, number],
): [number, number, number] {
  const n = cube.size;
  const coordinates = rgb.map((value, i) => {
    const t =
      (value - cube.domainMin[i]) / (cube.domainMax[i] - cube.domainMin[i]);
    return Math.min(1, Math.max(0, t)) * (n - 1);
  });
  const low = coordinates.map((c) => Math.min(n - 2, Math.floor(c)));
  const weight = coordinates.map((c, i) => c - low[i]);
  const sample = (r: number, g: number, b: number, channel: number) =>
    cube.table[(r + g * n + b * n * n) * 3 + channel];
  const result = [0, 0, 0];
  for (let corner = 0; corner < 8; corner++) {
    const offsets = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
    const w = offsets.reduce(
      (product, bit, axis) => product * (bit ? weight[axis] : 1 - weight[axis]),
      1,
    );
    for (let channel = 0; channel < 3; channel++)
      result[channel] +=
        w *
        sample(
          low[0] + offsets[0],
          low[1] + offsets[1],
          low[2] + offsets[2],
          channel,
        );
  }
  return result as [number, number, number];
}
