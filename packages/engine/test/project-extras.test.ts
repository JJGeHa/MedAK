import { describe, expect, it } from "vitest";
import { buildFile } from "../src/file.ts";
import {
  acceptedState, buildCorrection, expandReport, guessColumns, hasHeaderRow, importFile, matchErrorsToRows, mergeProjects,
  parseDelimited, parseSkatErrors, readPeople, reverseRow, SKAT_ERROR_CODES,
} from "../src/project/index.ts";
import { formatRow, type Row } from "../src/record.ts";
import { validateRows } from "../src/validate.ts";
import { GOLDEN_CASES } from "./golden/cases.ts";
import { employeeShareRow } from "./helpers.ts";

describe("parseDelimited", () => {
  it("reads tabs from an Excel paste", () => {
    expect(parseDelimited("Navn\tAktier\nAnna\t400\n")).toEqual([["Navn", "Aktier"], ["Anna", "400"]]);
  });

  it("reads semicolons, which Danish Excel uses for CSV, with decimal commas intact", () => {
    expect(parseDelimited("Anna;1.234,50\r\nBo;10")).toEqual([["Anna", "1.234,50"], ["Bo", "10"]]);
  });

  it("reads quotes, including commas and newlines inside them", () => {
    expect(parseDelimited('"Jensen, Anna",400\n"Say ""hi""",1')).toEqual([["Jensen, Anna", "400"], ['Say "hi"', "1"]]);
    expect(parseDelimited('"a\nb",2')).toEqual([["a\nb", "2"]]);
  });

  it("ignores a byte-order mark and empty rows", () => {
    expect(parseDelimited("﻿A,B\n,\n1,2\n\n")).toEqual([["A", "B"], ["1", "2"]]);
    expect(parseDelimited("   ")).toEqual([]);
  });
});

describe("guessColumns", () => {
  it("recognises Danish and English headers", () => {
    expect(guessColumns(["Navn", "CPR-nummer", "Antal aktier", "Beskattet beløb", "Betalt"])).toEqual({ name: 0, id: 1, shares: 2, taxed: 3, paid: 4 });
    expect(guessColumns(["Employee name", "National ID", "Shares", "Taxable benefit"])).toEqual({ name: 0, id: 1, shares: 2, taxed: 3 });
  });

  it("leaves out what it doesn't recognise", () => {
    expect(guessColumns(["Afdeling", "Foo"])).toEqual({});
  });
});

describe("hasHeaderRow", () => {
  it("tells headers from data", () => {
    expect(hasHeaderRow([["Navn", "CPR"]])).toBe(true);
    expect(hasHeaderRow([["Anna", "0101584455"]])).toBe(false);
  });
});

describe("readPeople", () => {
  const mapping = { name: 0, id: 1, shares: 2, taxed: 3 };

  it("converts numbers using the user's language", () => {
    const [p] = readPeople([["Anna", "010158-4455", "400", "18.400,00"]], mapping, "da", false);
    expect(p).toEqual({ rowNumber: 1, name: "Anna", danishId: "0101584455", shares: "400000000", taxed: "1840000", problems: [] });
  });

  it("restores the leading zero Excel removes from a CPR number", () => {
    const [p] = readPeople([["Anna", "101584455", "1", "0"]], mapping, "da", false);
    expect(p!.danishId).toBe("0101584455");
  });

  it("reports what it can't read, and doesn't guess", () => {
    const [p] = readPeople([["Anna", "12345", "4x", "18.400.00"]], mapping, "da", false);
    expect(p!.problems).toEqual(["id", "shares", "taxed"]);
    expect(p!.danishId).toBeUndefined();
    expect(p!.shares).toBeUndefined();
  });

  it("does not read an English decimal point in Danish as 100 times too much", () => {
    const [p] = readPeople([["Anna", "0101584455", "1", "18400.50"]], mapping, "da", false);
    expect(p!.problems).toEqual(["taxed"]);
  });

  it("skips the header row and keeps row numbers for messages", () => {
    const rows = readPeople([["Navn", "CPR", "Antal", "Skat"], ["Anna", "0101584455", "1", "0"]], mapping, "da", true);
    expect(rows.map((r) => r.rowNumber)).toEqual([2]);
  });
});

describe("corrections against what SKAT accepted", () => {
  const anna = employeeShareRow({ PNRSENR: "0101584455", FONDNOTANR: "1" });
  const bo = employeeShareRow({ PNRSENR: "0202584455", FONDNOTANR: "2" });

  it("needs nothing when nothing changed", () => {
    expect(buildCorrection([anna, bo], [anna, bo], "B")).toEqual({ changes: [], rows: [] });
  });

  it("reverses and replaces a changed line", () => {
    const fixed = { ...anna, STKANT: "160000000" };
    const { changes, rows } = buildCorrection([anna, bo], [fixed, bo], "B");
    expect(changes.map((c) => c.kind)).toEqual(["changed"]);
    expect(rows.map((r) => [r.RETTEKOD, r.STKFTG, r.STKANT])).toEqual([
      ["1", "-", anna.STKANT],
      ["1", "+", "160000000"],
    ]);
  });

  it("reverses a removed line and sends a new line as ordinary", () => {
    const carl = employeeShareRow({ PNRSENR: "0303584455", FONDNOTANR: "3" });
    const { changes, rows } = buildCorrection([anna, bo], [anna, carl], "B");
    expect(changes.map((c) => c.kind).sort()).toEqual(["added", "removed"]);
    expect(rows.map((r) => [r.PNRSENR, r.RETTEKOD, r.STKFTG])).toEqual([
      ["0303584455", "0", "+"],
      ["0202584455", "1", "-"],
    ]);
  });

  it("gives lines that pass the checks", () => {
    const { rows } = buildCorrection([anna], [{ ...anna, STKANT: "160000000" }], "B");
    expect(validateRows(rows, { scenario: "B" }).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("keeps identical transactions apart", () => {
    const fixed = { ...anna, STKANT: "160000000" };
    const { changes } = buildCorrection([anna, anna], [anna, fixed], "B");
    expect(changes.map((c) => c.kind)).toEqual(["changed"]);
  });

  it("replays accepted files, so a second correction starts from the right place", () => {
    const fixed = { ...anna, STKANT: "160000000" };
    const first = buildCorrection([anna, bo], [fixed, bo], "B");
    const held = acceptedState([[anna, bo], first.rows]);
    expect(held.map((r) => r.STKANT)).toEqual([bo.STKANT, "160000000"]);
    expect(buildCorrection(held, [fixed, bo], "B").rows).toEqual([]);
  });

  it("ignores a reversal of something SKAT doesn't hold", () => {
    expect(acceptedState([[bo], [reverseRow(anna, "B")]])).toEqual([bo]);
  });
});

describe("SKAT's error reports", () => {
  it("reads a TastSelv-style line with a line number and text", () => {
    expect(parseSkatErrors("Linje 3: Fejl i ISINkode")).toEqual([{ fileLine: 3, codes: [], text: "Fejl i ISINkode" }]);
    expect(parseSkatErrors("line 12 - error 282")[0]).toMatchObject({ fileLine: 12, codes: ["282"] });
  });

  it("ignores headers and blurb", () => {
    expect(parseSkatErrors("Valideringsrapport\nFil: test.txt\n\n")).toEqual([]);
  });

  it("does not take amounts and dates for error codes", () => {
    expect(parseSkatErrors("Beløb 1.234,500 den 12-207-2026")).toEqual([]);
    expect(parseSkatErrors("Linje 2: beløb 2.057,00")[0]!.codes).toEqual([]);
  });

  it("finds a known code on a line without a line number", () => {
    expect(parseSkatErrors("Fejlkode 057")).toEqual([{ codes: ["057"], text: "Fejlkode 057" }]);
    expect(parseSkatErrors("Kode 123")).toEqual([]);
  });

  it("reads FTPs Gateway error records", () => {
    const record = "3921".padEnd(33, " ") + "1".padEnd(17, " ") + "0101584455" + "".padEnd(1021, " ") + "207057".padEnd(75, " ") + "".padEnd(40, " ");
    const [error] = parseSkatErrors(record);
    expect(error).toEqual({ codes: ["207", "057"], identity: { id: "0101584455", note: "1" } });
    const clean = "3921".padEnd(1081, " ") + "599".padEnd(75, " ");
    expect(parseSkatErrors(clean)).toEqual([]);
  });

  it("matches errors to rows by file line, where line 1 is the start record", () => {
    const rows: Row[] = [employeeShareRow({ FONDNOTANR: "1" }), employeeShareRow({ PNRSENR: "0202584455", FONDNOTANR: "2" })];
    expect(matchErrorsToRows([{ fileLine: 2, codes: [] }, { fileLine: 3, codes: [] }, { fileLine: 1, codes: [] }, { fileLine: 9, codes: [] }], rows)).toEqual([0, 1, null, null]);
  });

  it("matches error records to rows by who and which note", () => {
    const rows: Row[] = [employeeShareRow({ FONDNOTANR: "1" }), employeeShareRow({ PNRSENR: "0202584455", FONDNOTANR: "2" })];
    expect(matchErrorsToRows([{ codes: ["057"], identity: { id: "0202584455", note: "2" } }, { codes: ["057"], identity: { id: "x", note: "" } }], rows)).toEqual([1, null]);
  });

  it("explains every code in both languages", () => {
    for (const [code, text] of Object.entries(SKAT_ERROR_CODES)) {
      expect(text.da.length, code).toBeGreaterThan(0);
      expect(text.en.length, code).toBeGreaterThan(0);
    }
    expect(Object.keys(SKAT_ERROR_CODES).length).toBeGreaterThan(60);
  });
});

describe("mergeProjects", () => {
  const importOf = (id: string) => {
    const c = GOLDEN_CASES.find((x) => x.id === id)!;
    return importFile(buildFile({ sender: c.sender, rows: c.rows, version: "2024-v1" })).project;
  };
  const lines = (p: ReturnType<typeof importOf>) =>
    p.reports.flatMap((r) => expandReport(p, r).rows.map((x) => formatRow(x.row))).sort();

  it("adds the reports and writes the same lines as before", () => {
    const a = importOf("b-basic");
    const b = importOf("b-foreign-usd");
    const merged = mergeProjects(a, b);
    expect(merged.reports).toHaveLength(2);
    expect(lines(merged)).toEqual([...lines(a), ...lines(b)].sort());
  });

  it("reuses a person and a share that already exist", () => {
    const a = importOf("b-basic");
    const merged = mergeProjects(a, a);
    expect(merged.persons).toHaveLength(a.persons.length);
    expect(merged.securities).toHaveLength(a.securities.length);
    expect(merged.reports.map((r) => r.id)).toEqual(["r1", "r2"]);
    const ids = merged.reports.flatMap((r) => r.events.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
