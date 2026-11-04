import { describe, expect, it } from "vitest";
import type { Row } from "../src/record.ts";
import { applyScenario } from "../src/scenarios.ts";
import { formatIssue, MESSAGES } from "../src/messages.ts";
import { isReady, type Issue, type ValidateOptions, validateRow, validateRows } from "../src/validate.ts";
import { employeeShareRow, FOREIGN_OWNER, without } from "./helpers.ts";

const B: ValidateOptions = { scenario: "B" };
const rules = (issues: Issue[]) => issues.map((i) => i.rule);
const errors = (row: Row, opts: ValidateOptions = B) =>
  validateRow(row, opts).filter((i) => i.severity === "error").map((i) => `${i.rule}:${i.field ?? ""}`);

describe("a valid employee-share row", () => {
  it("has no issues", () => {
    expect(validateRow(employeeShareRow(), B)).toEqual([]);
  });
});

describe("field rules", () => {
  it("requires mandatory fields", () => {
    expect(errors(without(employeeShareRow(), "PAPIRIDENTNVN", "FONDNOTANR"))).toEqual(
      expect.arrayContaining(["required:PAPIRIDENTNVN", "required:FONDNOTANR"]),
    );
  });

  it("rejects values outside the scenario's list", () => {
    expect(errors(employeeShareRow({ KOEBSALGKOD: "S" }))).toContain("rule.notInList:KOEBSALGKOD");
  });

  it("rejects a value in a fixed field", () => {
    expect(errors(employeeShareRow({ PAPIRTYPEKOD: "3" }))).toContain("rule.fixed:PAPIRTYPEKOD");
  });

  it("treats fixed numeric values by meaning, not by spelling", () => {
    expect(errors(employeeShareRow({ DEPOTTYPEKOD: "0" }))).toEqual([]);
  });

  it("rejects values that would not fit", () => {
    expect(errors(employeeShareRow({ PAPIRIDENTNVN: "x".repeat(51) }))).toContain("format.tooLong:PAPIRIDENTNVN");
  });

  it("rejects characters the file encoding cannot hold", () => {
    expect(errors(employeeShareRow({ PAPIRIDENTNVN: "Łódź A/S" }))).toContain("format.encoding:PAPIRIDENTNVN");
  });
});

describe("identity", () => {
  it("rejects a CPR with a hyphen", () => {
    expect(errors(employeeShareRow({ PNRSENR: "010158-4455" }))).toContain("format.tooLong:PNRSENR");
    expect(errors(employeeShareRow({ PNRSENR: "0101-58445" }))).toContain("id.invalid:PNRSENR");
  });

  it("rejects a CPR that does not start with a date", () => {
    expect(errors(employeeShareRow({ PNRSENR: "3213584455" }))).toContain("id.invalid:PNRSENR");
  });

  it("warns when an employee is reported on a CVR number", () => {
    expect(rules(validateRow(employeeShareRow({ PNRSENR: "24256790" }), B))).toContain("id.employeeNeedsCpr");
  });

  it("requires field 11 for residents but not for foreigners without a Danish number", () => {
    expect(errors(without(employeeShareRow(), "PNRSENR"))).toContain("id.missing:PNRSENR");
    expect(errors(employeeShareRow(FOREIGN_OWNER))).toEqual([]);
  });

  it("warns about a mistyped company CVR", () => {
    expect(rules(validateRow(employeeShareRow({ OPSENR: "24256791" }), B))).toContain("opsenr.checksum");
  });
});

describe("foreign owners", () => {
  it("forbids foreign data for a resident", () => {
    expect(errors(employeeShareRow({ LANDKOD: "US" }))).toContain("owner.domesticHasForeignData:LANDKOD");
  });

  it("requires country, TIN, name and address", () => {
    const row = employeeShareRow({ EJERSTATUKOD: "1" });
    expect(errors(row)).toEqual(
      expect.arrayContaining([
        "owner.foreignNeedsCountry:LANDKOD", "owner.tinTypeMissing:TINNRTYPEKOD",
        "owner.nameMissing:PERSFORNVN", "owner.nameMissing:PERSEFTERNVN",
        "owner.addressMissing:VEJNVN", "owner.townMissing:POSTDISTRADR",
        "owner.countryNameMissing:LANDENVN",
      ]),
    );
  });

  it("rejects Denmark as a foreigner's country", () => {
    // DK is not in the foreign-country list either.
    expect(errors(employeeShareRow({ ...FOREIGN_OWNER, LANDKOD: "DK" }))).toEqual(
      expect.arrayContaining(["owner.foreignCountryIsDk:LANDKOD", "rule.notInList:LANDKOD"]),
    );
  });

  it("requires a valid birth date, place and country with TIN type 2", () => {
    const row = employeeShareRow({ ...FOREIGN_OWNER, TINNRTYPEKOD: "2", TINNR: "19801231" });
    expect(errors(row)).toEqual([
      "owner.tinBirthDateInvalid:TINNR", "owner.birthPlaceMissing:FOEDESTEDNVN", "owner.birthCountryMissing:FOEDELANDKOD",
    ]);
    expect(errors({ ...row, TINNR: "31121980", FOEDESTEDNVN: "Boston", FOEDELANDKOD: "US" })).toEqual([]);
  });
});

describe("signs and corrections", () => {
  it("forbids minus in an ordinary report", () => {
    expect(errors(employeeShareRow({ STKFTG: "-" }))).toContain("sign.minusNeedsCorrection:STKFTG");
  });

  it("allows an all-minus reversal with correction code 1", () => {
    const signs = Object.fromEntries(
      ["STKFTG", "KURVAEOMSVALFTG", "OMKOMSVALFTG", "NTOAFROMSVALFTG", "NTOAFRAFRVALFTG", "KURVAEBSKVALFTG", "OMKBSKVALFTG", "NTOAFRBSKVALFTG"].map((k) => [k, "-"]),
    );
    expect(validateRow(employeeShareRow({ ...signs, RETTEKOD: "1" }), B)).toEqual([]);
  });

  it("warns about mixed signs", () => {
    expect(rules(validateRow(employeeShareRow({ RETTEKOD: "1", STKFTG: "-" }), B))).toContain("sign.mixed");
  });
});

describe("dates and codes", () => {
  it("requires the trade date to be in the income year", () => {
    expect(errors(employeeShareRow({ INDKAAR: "2025" }))).toEqual(
      expect.arrayContaining(["year.tradeDateMismatch:HANDEDTO", "year.valueDateMismatch:VALOEDTO"]),
    );
  });

  it("checks the row against the report's chosen year", () => {
    expect(errors(employeeShareRow(), { scenario: "B", incomeYear: "2027" })).toContain("year.differsFromReport:INDKAAR");
  });

  it("rejects invalid dates and times", () => {
    expect(errors(employeeShareRow({ HANDEDTO: "20260931" }))).toContain("date.invalid:HANDEDTO");
    expect(errors(employeeShareRow({ HANDETID: "126000" }))).toContain("time.invalid:HANDETID");
  });

  it("only allows code H from 1 July 2026 and code G until 30 June 2026", () => {
    const early = { HANDEDTO: "20260630", VALOEDTO: "20260630" };
    expect(errors(employeeShareRow(early))).toContain("code.notValidOnDate:KOEBSALGKOD");
    expect(errors(employeeShareRow({ ...early, KOEBSALGKOD: "G" }))).toEqual([]);
    expect(errors(employeeShareRow({ KOEBSALGKOD: "G" }))).toContain("code.notValidOnDate:KOEBSALGKOD");
  });

  it("requires an ISIN for listed shares and checks its check digit", () => {
    expect(errors(employeeShareRow({ OPTAGHANDEKOD: "1" }))).toContain("isin.requiredWhenListed:ISINKOD");
    expect(errors(employeeShareRow({ ISINKOD: "US0378331006" }))).toContain("isin.invalid:ISINKOD");
  });
});

describe("amounts", () => {
  it("warns when DKK amount fields differ although there are no costs", () => {
    expect(rules(validateRow(employeeShareRow({ NTOAFRBSKVALBLB: "188625" }), B))).toContain("amount.dkkFieldsDiffer");
  });

  it("requires rate 100 for DKK", () => {
    expect(errors(employeeShareRow({ VALKURSPCT: "700000000" }))).toContain("amount.dkkRateNot100:VALKURSPCT");
  });

  it("checks the DKK conversion for foreign currencies", () => {
    const usd = {
      OMSVALKOD: "USD", AFRVALKOD: "USD", VALKURSPCT: "685250000",
      KURVAEOMSVALBLB: "1000000", NTOAFROMSVALBLB: "1000000", NTOAFRAFRVALBLB: "1000000",
    };
    expect(rules(validateRow(employeeShareRow({ ...usd, KURVAEBSKVALBLB: "6852500", NTOAFRBSKVALBLB: "6852500" }), B))).toEqual([]);
    expect(rules(validateRow(employeeShareRow({ ...usd, KURVAEBSKVALBLB: "1000000", NTOAFRBSKVALBLB: "1000000" }), B))).toContain("amount.dkkConversionMismatch");
  });
});

describe("scenario A: buyback", () => {
  it("checks market value against quantity × price", () => {
    const row = applyScenario(employeeShareRow({ KOEBSALGKOD: "", KURVAEOMSVALBLB: "100" }), "A");
    expect(row.KOEBSALGKOD).toBe("S");
    expect(rules(validateRow(row, { scenario: "A" }))).toContain("amount.marketValueMismatch");
  });
});

describe("scenario C: investorfradrag", () => {
  const cRow = (overrides: Row = {}) =>
    applyScenario(
      {
        ...employeeShareRow(),
        ISINKOD: "", PAPIRTYPEKOD: "3", PAPIRLANDKOD: "DK", KOEBSALGKOD: "K", INVESTOREJERSKAB: "2",
        KURVAEBSKVALBLB: "5000000", OMKBSKVALBLB: "0", NTOAFRBSKVALBLB: "5000000",
        ...overrides,
      },
      "C",
    );

  it("fills the locked fields", () => {
    const row = cRow();
    expect([row.OMSVALKOD, row.KURVAEOMSVALBLB, row.VALKURSPCT, row.ASIDNR, row.OPTAGHANDEKOD, row.HANDETID]).toEqual([
      "DKK", "0", "100000000", "00000", "2", "120000",
    ]);
  });

  it("accepts a target company's report", () => {
    expect(errors(cRow(), { scenario: "C" })).toEqual([]);
  });

  it("requires prior-ownership code from a target company and forbids it for a fund", () => {
    expect(errors(cRow({ INVESTOREJERSKAB: "" }), { scenario: "C" })).toContain("investorOwnership.required:INVESTOREJERSKAB");
    expect(errors(cRow({ PAPIRTYPEKOD: "4" }), { scenario: "C" })).toContain("investorOwnership.notForFund:INVESTOREJERSKAB");
  });

  it("requires net = acquisition sum + costs", () => {
    expect(errors(cRow({ OMKBSKVALBLB: "10000" }), { scenario: "C" })).toContain("amount.netMismatch:NTOAFRBSKVALBLB");
  });

  it("only allows TIN types 1 and 2", () => {
    expect(errors(cRow({ ...FOREIGN_OWNER, TINNRTYPEKOD: "3" }), { scenario: "C" })).toContain("rule.notInList:TINNRTYPEKOD");
  });
});

describe("scenario D: liquidation proceeds", () => {
  const dRow = (overrides: Row = {}) =>
    applyScenario(
      {
        OPSENR: "24256790", PNRSENR: "0101584455", EJERSTATUKOD: "0", PAPIRIDENTNVN: "Eksempel ApS",
        PAPIRTYPEKOD: "1", STKFTG: "+", NTOAFRBSKVALFTG: "+", STKANT: "1000000",
        NTOAFRBSKVALBLB: "25000000", HANDEDTO: "20261120", INDKAAR: "2026", OPTAGHANDEKOD: "2",
        ...overrides,
      },
      "D",
    );

  it("needs only identity, shares, proceeds and dates", () => {
    expect(validateRow(dRow(), { scenario: "D" })).toEqual([]);
    expect(dRow().VALOEDTO).toBe("00000000");
    expect(dRow().ASIDNR).toBe("00000");
  });

  it("requires proceeds above zero", () => {
    expect(errors(dRow({ NTOAFRBSKVALBLB: "0" }), { scenario: "D" })).toContain("amount.proceedsMissing:NTOAFRBSKVALBLB");
  });
});

describe("validateRows", () => {
  it("tags issues with their row and checks for mixed years", () => {
    const issues = validateRows(
      [employeeShareRow(), employeeShareRow({ INDKAAR: "2025", HANDEDTO: "20250915", VALOEDTO: "20250915", KOEBSALGKOD: "G" })],
      B,
    );
    expect(issues).toEqual([expect.objectContaining({ rule: "file.mixedYears", params: { years: "2025, 2026" } })]);
    expect(isReady(issues)).toBe(false);
  });

  it("flags an empty report", () => {
    expect(rules(validateRows([], B))).toEqual(["file.empty"]);
  });
});

describe("messages", () => {
  it("has non-empty Danish and English text for every rule", () => {
    for (const [rule, text] of Object.entries(MESSAGES)) {
      expect(text.da.length, rule).toBeGreaterThan(0);
      expect(text.en.length, rule).toBeGreaterThan(0);
    }
  });

  it("fills in the field label and parameters", () => {
    const [issue] = validateRow(employeeShareRow({ HANDEDTO: "20260931" }), B);
    expect(formatIssue(issue!, "da")).toBe('Handelsdato "20260931" er ikke en gyldig dato.');
    expect(formatIssue(issue!, "en")).toBe('Trade date "20260931" is not a valid date.');
  });
});
