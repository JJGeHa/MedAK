import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATE_VERSION } from "../../src/codes.ts";
import { decodeWindows1252, encodeWindows1252 } from "../../src/encoding.ts";
import { FIELDS } from "../../src/fields.ts";
import { buildFile, parseFile } from "../../src/file.ts";
import { formatIssue } from "../../src/messages.ts";
import { validateRows } from "../../src/validate.ts";
import { GOLDEN_CASES, type GoldenCase } from "./cases.ts";
import { harnessFileName, makeHarness, TEMPLATES } from "./harness.ts";

const here = import.meta.dirname;
const expectedPath = (c: GoldenCase) => join(here, "expected", `${c.id}.txt`);
/** Set REQUIRE_GOLDEN=1 to fail instead of skip when an expected file is missing. */
const requireGolden = process.env.REQUIRE_GOLDEN === "1";

const engineBytes = (c: GoldenCase) =>
  encodeWindows1252(buildFile({ sender: c.sender, rows: c.rows, version: TEMPLATE_VERSION[c.scenario] }));

/** Where two files first differ, named by line, position and field, for a readable failure. */
function firstDifference(actual: Uint8Array, expected: Uint8Array): string | null {
  const a = decodeWindows1252(actual).split("\r\n");
  const e = decodeWindows1252(expected).split("\r\n");
  for (let i = 0; i < Math.max(a.length, e.length); i++) {
    const al = a[i] ?? "<missing line>";
    const el = e[i] ?? "<missing line>";
    if (al === el) continue;
    let p = 0;
    while (p < al.length && al[p] === el[p]) p++;
    const field = el.startsWith("2278") ? FIELDS.find((f) => p + 1 >= f.start && p + 1 < f.start + f.length) : undefined;
    const where = field ? ` in ${field.key} (felt ${field.felt}, positions ${field.start}–${field.start + field.length - 1})` : "";
    return [
      `line ${i + 1}, position ${p + 1}${where}`,
      `  engine: ${JSON.stringify(al.slice(Math.max(0, p - 10), p + 30))}`,
      `  Excel:  ${JSON.stringify(el.slice(Math.max(0, p - 10), p + 30))}`,
    ].join("\n");
  }
  return actual.length === expected.length ? null : `same lines but ${actual.length} vs ${expected.length} bytes (line endings?)`;
}

describe("golden cases", () => {
  for (const c of GOLDEN_CASES) {
    it(`${c.id} is a valid report`, () => {
      const errors = validateRows(c.rows, { scenario: c.scenario })
        .filter((i) => i.severity === "error")
        .map((i) => `row ${i.row}: ${formatIssue(i, "en")}`);
      expect(errors).toEqual([]);
    });

    const file = expectedPath(c);
    const present = existsSync(file);
    const run = present || requireGolden ? it : it.skip;

    run(`${c.id} matches the file made by SKAT's Excel template`, () => {
      expect(present, `missing ${file}; see docs/testing.md`).toBe(true);
      const expected = new Uint8Array(readFileSync(file));
      const diff = firstDifference(engineBytes(c), expected);
      expect(diff, diff ?? "").toBeNull();
    });

    run(`${c.id}: reading the Excel file and writing it again gives the same bytes`, () => {
      const expected = new Uint8Array(readFileSync(file));
      const parsed = parseFile(decodeWindows1252(expected));
      expect(parsed.problems).toEqual([]);
      const rebuilt = encodeWindows1252(
        buildFile({ sender: parsed.sender!, rows: parsed.rows.map((r) => r.row), version: parsed.end!.version }),
      );
      expect(firstDifference(rebuilt, expected)).toBeNull();
    });
  }
});

describe("Excel harness", () => {
  it.each(TEMPLATES)("harness-%s.bas is up to date (run: node scripts/golden/make-harness.ts)", (template) => {
    const committed = new Uint8Array(readFileSync(join(here, "harness", harnessFileName(template))));
    expect(Buffer.from(committed).equals(Buffer.from(makeHarness(template)))).toBe(true);
  });

  it("gives every case a unique id", () => {
    const ids = GOLDEN_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
