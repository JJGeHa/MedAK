import { describe, expect, it } from "vitest";
import { FIELD_BY_KEY, LINE_LENGTH } from "../src/fields.ts";
import { FormatError, formatField, formatRow, parseRow } from "../src/record.ts";
import { employeeShareRow } from "./helpers.ts";

const slice = (line: string, key: keyof typeof FIELD_BY_KEY) => {
  const f = FIELD_BY_KEY[key];
  return line.slice(f.start - 1, f.start - 1 + f.length);
};

describe("formatField", () => {
  it("left-justifies text with spaces", () => {
    expect(formatField(FIELD_BY_KEY.OMSVALKOD, "DKK")).toBe("DKK");
    expect(formatField(FIELD_BY_KEY.DEPOTNR, "123")).toBe("123" + " ".repeat(14));
  });

  it("zero-pads numbers on the left", () => {
    expect(formatField(FIELD_BY_KEY.STKANT, "15000000")).toBe("000000000015000000");
  });

  it("leaves a blank number blank, like the template's Format()", () => {
    expect(formatField(FIELD_BY_KEY.BANKRGISTNR, "")).toBe("    ");
  });

  it("writes an 8-digit CVR/SE as 00 + number and a CPR as is", () => {
    expect(formatField(FIELD_BY_KEY.PNRSENR, "24256790")).toBe("0024256790");
    expect(formatField(FIELD_BY_KEY.PNRSENR, "0101584455")).toBe("0101584455");
  });

  it("trims surrounding spaces, like the template", () => {
    expect(formatField(FIELD_BY_KEY.KOEBSALGKOD, " H ")).toBe("H");
  });

  it("reports values that are too long instead of truncating them", () => {
    expect(formatField(FIELD_BY_KEY.KURVAEOMSVALBLB, "123456789012345678")).toMatchObject({ reason: "tooLong" });
    expect(formatField(FIELD_BY_KEY.PERSFORNVN, "x".repeat(71))).toMatchObject({ reason: "tooLong" });
  });

  it("rejects non-digits in numeric fields", () => {
    expect(formatField(FIELD_BY_KEY.STKANT, "15,5")).toMatchObject({ reason: "notDigits" });
  });

  it("rejects line breaks", () => {
    expect(formatField(FIELD_BY_KEY.VEJNVN, "a\nb")).toMatchObject({ reason: "controlCharacter" });
  });
});

describe("formatRow", () => {
  const line = formatRow(employeeShareRow());

  it("writes exactly 1,112 characters", () => {
    expect(line).toHaveLength(LINE_LENGTH);
  });

  it("puts values in the right places", () => {
    expect(line.slice(0, 4)).toBe("2278");
    expect(slice(line, "OPSENR")).toBe("24256790");
    expect(slice(line, "PNRSENR")).toBe("0101584455");
    expect(slice(line, "STKANT")).toBe("000000000150000000");
    expect(slice(line, "AKTIPAPIRKURSPCT")).toBe("0000000125750000");
    expect(slice(line, "NTOAFRBSKVALBLB")).toBe("00000000001886250");
    expect(slice(line, "KOEBSALGKOD")).toBe("H");
    expect(slice(line, "HANDETID")).toBe("120000");
    expect(line.slice(1096)).toBe(" ".repeat(16));
  });

  it("always writes 2278 as the record type", () => {
    expect(formatRow({ ...employeeShareRow(), INDVNR: "9999" }).slice(0, 4)).toBe("2278");
  });

  it("throws a FormatError listing every problem", () => {
    try {
      formatRow(employeeShareRow({ STKANT: "1,5", PERSFORNVN: "x".repeat(80) }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(FormatError);
      expect((e as FormatError).problems.map((p) => p.field)).toEqual(["STKANT", "PERSFORNVN"]);
    }
  });
});

describe("parseRow", () => {
  it("round-trips a formatted row", () => {
    const line = formatRow(employeeShareRow());
    expect(formatRow(parseRow(line))).toBe(line);
  });

  it("keeps leading zeros in numeric values and omits blanks", () => {
    const row = parseRow(formatRow(employeeShareRow()));
    expect(row.STKANT).toBe("000000000150000000");
    expect(row.DEPOTNR).toBeUndefined();
  });

  it("accepts a line whose trailing spaces were stripped", () => {
    const line = formatRow(employeeShareRow());
    expect(parseRow(line.trimEnd())).toEqual(parseRow(line));
  });
});
