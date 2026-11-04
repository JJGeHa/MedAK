import { describe, expect, it } from "vitest";
import { decodeWindows1252, EncodingError, encodeWindows1252, unencodableCharacters } from "../src/encoding.ts";
import { buildFile, formatEndRecord, formatStartRecord, parseFile, SenderError } from "../src/file.ts";
import { employeeShareRow } from "./helpers.ts";

const sender = { seNumber: "24256790", name: "Eksempel A/S", address: "Vej 1, 2100 København Ø" };

describe("start and end records", () => {
  it("writes the start record like the template", () => {
    const line = formatStartRecord(sender);
    expect(line).toHaveLength(1112);
    expect(line.slice(0, 84)).toBe(
      "0001" + "24256790" + "0301451" + "278" + "Eksempel A/S".padEnd(27) + "Vej 1, 2100 København Ø".padEnd(35),
    );
    expect(line.slice(84).trim()).toBe("");
  });

  it("zero-pads a short sender number", () => {
    expect(formatStartRecord({ ...sender, seNumber: "1234" }).slice(4, 12)).toBe("00001234");
  });

  it("refuses a sender name that would be cut off", () => {
    expect(() => formatStartRecord({ ...sender, name: "x".repeat(28) })).toThrow(SenderError);
  });

  it("writes the end record with line count and version", () => {
    const line = formatEndRecord("24256790", 42, "2024-v1");
    expect(line).toHaveLength(1112);
    expect(line.slice(0, 26)).toBe("9998" + "24256790" + "0000042" + "2024-v1");
  });
});

describe("buildFile / parseFile", () => {
  const rows = [employeeShareRow(), employeeShareRow({ PNRSENR: "0202584455", STKANT: "10000000" })];
  const text = buildFile({ sender, rows, version: "2024-v1" });

  it("ends every line with CRLF and counts start and end records", () => {
    const lines = text.split("\r\n");
    expect(lines).toHaveLength(5); // 4 lines + empty string after the final CRLF
    expect(lines.at(-1)).toBe("");
    expect(lines[3]!.slice(12, 19)).toBe("0000004");
  });

  it("reads back what it wrote", () => {
    const parsed = parseFile(text);
    expect(parsed.problems).toEqual([]);
    expect(parsed.sender).toEqual(sender);
    expect(parsed.end).toEqual({ seNumber: "24256790", lineCount: 4, version: "2024-v1" });
    expect(parsed.rows.map((r) => r.line)).toEqual([2, 3]);
    expect(buildFile({ sender: parsed.sender!, rows: parsed.rows.map((r) => r.row), version: "2024-v1" })).toBe(text);
  });

  it("accepts LF line endings", () => {
    expect(parseFile(text.replaceAll("\r\n", "\n")).problems).toEqual([]);
  });

  it("reports damaged files instead of throwing", () => {
    const lines = text.split("\r\n");
    const damaged = [lines[1], "1234 something", lines[3]].join("\n");
    const { problems, rows: parsedRows } = parseFile(damaged);
    expect(parsedRows).toHaveLength(1);
    expect(problems).toEqual(
      expect.arrayContaining([
        { kind: "missingStartRecord" },
        { kind: "unknownRecordType", line: 2, recordType: "1234" },
        { kind: "lineCountMismatch", expected: 4, actual: 2 },
      ]),
    );
  });
});

describe("Windows-1252", () => {
  it("encodes Danish letters as single bytes", () => {
    expect([...encodeWindows1252("æøåÆØÅ")]).toEqual([0xe6, 0xf8, 0xe5, 0xc6, 0xd8, 0xc5]);
    expect([...encodeWindows1252("€")]).toEqual([0x80]);
  });

  it("refuses characters it cannot represent", () => {
    expect(unencodableCharacters("Łódź 🙂")).toEqual(["Ł", "ź", "🙂"]);
    expect(() => encodeWindows1252("Ł")).toThrow(EncodingError);
  });

  it("round-trips a whole file", () => {
    const text = buildFile({ sender, rows: [employeeShareRow()], version: "2024-v1" });
    expect(decodeWindows1252(encodeWindows1252(text))).toBe(text);
  });
});
