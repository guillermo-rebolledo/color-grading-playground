import { test, expect } from "@playwright/test";
import {
  cubeSizes,
  cubeFileBytes,
  sanitizeCubeTitle,
  serializeCube,
} from "../src/engine/cube";
import { applyCube, parseCube } from "./cube-tools";

// Channel-swapping 2³ corner fixture: output = (g, b, r). Rows are red-fastest.
const corners = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];
const swapped = new Float32Array(corners.flatMap(([r, g, b]) => [g, b, r, 1]));

test("serializes Adobe Cube headers and exactly N³ six-decimal rows in red-fastest order", () => {
  const text = serializeCube({ title: "Swap", size: 2, samples: swapped });
  expect(text).toBe(
    [
      'TITLE "Swap"',
      "LUT_3D_SIZE 2",
      "DOMAIN_MIN 0.000000 0.000000 0.000000",
      "DOMAIN_MAX 1.000000 1.000000 1.000000",
      "0.000000 0.000000 0.000000",
      "0.000000 0.000000 1.000000",
      "1.000000 0.000000 0.000000",
      "1.000000 0.000000 1.000000",
      "0.000000 1.000000 0.000000",
      "0.000000 1.000000 1.000000",
      "1.000000 1.000000 0.000000",
      "1.000000 1.000000 1.000000",
      "",
    ].join("\n"),
  );
  const cube = parseCube(text);
  expect(cube.title).toBe("Swap");
  for (const [r, g, b] of corners)
    expect(applyCube(cube, [r, g, b])).toEqual([g, b, r]);
  // Off-grid asymmetric probe interpolates each swapped axis independently.
  const [x, y, z] = applyCube(cube, [0.25, 0.6, 0.9]);
  expect(x).toBeCloseTo(0.6, 6);
  expect(y).toBeCloseTo(0.9, 6);
  expect(z).toBeCloseTo(0.25, 6);
  // Inputs beyond the domain clamp to the endpoints.
  expect(applyCube(cube, [-1, 2, 0.5])).toEqual([1, 0.5, 0]);
});

test("offers 17³, 33³ and 65³, rounds to six decimals, and refuses non-finite rows", () => {
  expect(cubeSizes).toEqual([17, 33, 65]);
  for (const size of cubeSizes) {
    const samples = new Float32Array(size ** 3 * 4);
    for (let i = 0; i < size ** 3; i++) {
      samples[i * 4] = 0.1234567;
      samples[i * 4 + 1] = 0.23456789;
      samples[i * 4 + 2] = 1;
      samples[i * 4 + 3] = 1;
    }
    const text = serializeCube({ title: "a".repeat(240), size, samples });
    const cube = parseCube(text);
    expect(cube.size).toBe(size);
    expect(cube.table.length).toBe(size ** 3 * 3);
    expect(cube.table.slice(0, 3)).toEqual([0.123457, 0.234568, 1]);
    // The size estimate bounds any 0–1 lattice with the longest title.
    expect(text.length).toBeLessThanOrEqual(cubeFileBytes(size));
    expect(text.length).toBeGreaterThan(cubeFileBytes(size) * 0.9);
  }
  const signed = serializeCube({
    title: "Signed",
    size: 2,
    samples: new Float32Array(32).map((_, i) =>
      i % 4 === 0 ? -1.2345678 : 12.3456789,
    ),
  });
  expect(parseCube(signed).table.slice(0, 3)).toEqual([
    -1.234568, 12.345679, 12.345679,
  ]);
  expect(() =>
    serializeCube({ title: "x", size: 2, samples: new Float32Array(31) }),
  ).toThrow(/2³/);
  const nan = new Float32Array(32).fill(1);
  nan[5] = Number.NaN;
  expect(() => serializeCube({ title: "x", size: 2, samples: nan })).toThrow(
    /finite/,
  );
  expect(() => serializeCube({ title: "x", size: 3, samples: nan })).toThrow(
    /3³/,
  );
});

test("sanitizes titles and negative zero", () => {
  expect(sanitizeCubeTitle('  My "Look"\nline\t2 é ')).toBe("My Look line 2");
  expect(sanitizeCubeTitle("   ")).toBe("Grade");
  expect(sanitizeCubeTitle("a".repeat(300))).toHaveLength(240);
  const text = serializeCube({
    title: 'Quote"d',
    size: 2,
    samples: new Float32Array(32).fill(-0),
  });
  expect(parseCube(text).title).toBe("Quoted");
  expect(text).not.toContain("-0.000000");
});
