import { describe, expect, it } from "vitest";
import { birthDateFromCpr } from "../src/checks.ts";
import { TEMPLATE_VERSION } from "../src/codes.ts";
import { buildFile } from "../src/file.ts";
import { formatIssue } from "../src/messages.ts";
import {
  buildReportBytes, buildReportFile, checkReport, correctionPair, employeeShareCode, expandReport, importFile,
  parseProject, ProjectFileError, reportFileName, reportTotals, reverseRow, schemeOptions, senderOf, serializeProject,
} from "../src/project/index.ts";
import type { EmployeeShareEvent, ForeignOwner, Person, Project, Report, Security } from "../src/project/types.ts";
import { formatRow, type Row } from "../src/record.ts";
import { validateRows } from "../src/validate.ts";
import { GOLDEN_CASES } from "./golden/cases.ts";

const nordlysShares: Security = { id: "s1", name: "Nordlys Software ApS B-anparter", issuerCountry: "DK", listed: false };
const aurora: Security = { id: "s2", name: "Aurora Holdings Inc. Common Stock", isin: "US05432A1076", issuerCountry: "US", listed: true };

const swede: ForeignOwner = {
  identification: { type: "tin", tin: "19850312-1234" },
  names: { kind: "person", first: "Åsa", last: "Lindström" },
  street: "Storgatan", houseNumber: "12", floor: "3 tr", postcode: "211 42", town: "Malmö", countryName: "Sverige", country: "SE",
};

const persons: Person[] = [
  { id: "anna", displayName: "Anna Jensen", danishId: "0101584455" },
  { id: "mikkel", displayName: "Mikkel Sørensen", danishId: "0202584455" },
  { id: "dane3", danishId: "0303584455" },
  { id: "asa", abroad: swede },
];

const project = (reports: Report[], extra: Partial<Project> = {}): Project => ({
  format: "medak-project",
  version: 1,
  company: { seNumber: "12345674", name: "Nordlys Software ApS", address: "Søndergade 1, 8000 Aarhus C" },
  securities: [nordlysShares, aurora],
  persons,
  reports,
  ...extra,
});

const grant = (overrides: Partial<EmployeeShareEvent> = {}): EmployeeShareEvent => ({
  kind: "employeeShares", id: "e1", what: "pay", scheme: "lp7-uncapped", date: "2026-09-15",
  securityId: "s1", tradeCurrency: "DKK", pricePerShare: "25000000",
  participants: [
    { personId: "anna", shares: "400000000", taxed: "1840000", noteNumber: "1" },
    { personId: "mikkel", shares: "250000000", taxed: "1150000", noteNumber: "2" },
  ],
  ...overrides,
});

const reportB = (...events: EmployeeShareEvent[]): Report => ({ id: "r1", scenario: "B", incomeYear: "2026", events });

const lines = (rows: readonly Row[]) => rows.map(formatRow);
const goldenCase = (id: string) => GOLDEN_CASES.find((c) => c.id === id)!;
const errorsOf = (p: Project, r: Report) => checkReport(p, r).filter((i) => i.severity === "error");

describe("answers to codes", () => {
  it("chooses G or H from the date", () => {
    expect(employeeShareCode("pay", "lp7-uncapped", "2026-06-30")).toBe("G");
    expect(employeeShareCode("pay", "lp7-uncapped", "2026-07-01")).toBe("H");
  });

  it("maps the other schemes", () => {
    expect(employeeShareCode("pay", "lp7-10", "2026-01-01")).toBe("E");
    expect(employeeShareCode("pay", "lp7-20", "2026-01-01")).toBe("F");
    expect(employeeShareCode("pay", "ll16", "2026-01-01")).toBe("M");
    expect(employeeShareCode("options", "ll28", "2026-01-01")).toBe("B");
    expect(employeeShareCode("matching", undefined, "2026-01-01")).toBe("K");
  });

  it("rejects answers that do not fit together", () => {
    expect(employeeShareCode("pay", "ll28", "2026-01-01")).toBeNull();
    expect(employeeShareCode("pay", undefined, "2026-01-01")).toBeNull();
  });

  it("offers only the schemes that apply", () => {
    expect(schemeOptions("pay", "2026-09-15").map((o) => o.code)).toEqual(["E", "F", "H", "M"]);
    expect(schemeOptions("options", "2026-03-01").map((o) => o.code)).toEqual(["E", "F", "G", "M", "B"]);
    expect(schemeOptions("matching", "2026-03-01")).toEqual([]);
  });
});

describe("expanding events into rows", () => {
  it("writes the same lines as the b-basic golden case", () => {
    const p = project([]);
    const { rows, problems } = expandReport(p, reportB(grant()));
    expect(problems).toEqual([]);
    expect(lines(rows.map((r) => r.row))).toEqual(lines(goldenCase("b-basic").rows));
  });

  it("calculates the acquisition sum as paid plus taxed", () => {
    const { rows } = expandReport(project([]), reportB(grant()));
    const anna = rows[0]!.row;
    // 400 × 25,00 = 10.000,00 paid + 18.400,00 taxed
    for (const key of ["KURVAEOMSVALBLB", "NTOAFROMSVALBLB", "NTOAFRAFRVALBLB", "KURVAEBSKVALBLB", "NTOAFRBSKVALBLB"] as const) {
      expect(anna[key]).toBe("2840000");
    }
    expect(anna.OMKOMSVALBLB).toBe("0");
    expect(anna.VALKURSPCT).toBe("100000000");
    expect(anna.HANDEDTO).toBe("20260915");
    expect(anna.VALOEDTO).toBe("20260915");
    expect(anna.INDKAAR).toBe("2026");
    expect(anna.KOEBSALGKOD).toBe("H");
    expect(anna.HANDETID).toBe("120000");
    expect(anna.ASIDNR).toBe("00000");
    expect(anna.DEPOTTYPEKOD).toBe("0");
    expect(rows.map((r) => [r.eventId, r.personId])).toEqual([["e1", "anna"], ["e1", "mikkel"]]);
  });

  it("writes the same lines as the b-foreign-usd golden case", () => {
    const usd = grant({
      securityId: "s2", tradeCurrency: "USD", exchangeRate: "685250000", what: "pay", scheme: "ll16",
      date: "2026-03-01", time: "153000", pricePerShare: "150000000",
      participants: [
        { personId: "dane3", shares: "10000000", noteNumber: "RSU-2026-0001" },
        { personId: "asa", shares: "5000000", noteNumber: "RSU-2026-0002" },
      ],
    });
    const { rows, problems } = expandReport(project([]), reportB(usd));
    expect(problems).toEqual([]);
    expect(lines(rows.map((r) => r.row))).toEqual(lines(goldenCase("b-foreign-usd").rows));
  });

  it("adds tax paid in DKK to a purchase in foreign currency", () => {
    const usd = grant({
      securityId: "s2", tradeCurrency: "USD", exchangeRate: "685250000", scheme: "ll16", pricePerShare: "150000000",
      participants: [{ personId: "anna", shares: "10000000", taxed: "1027875", noteNumber: "1" }],
    });
    const [row] = expandReport(project([]), reportB(usd)).rows;
    // 1.500,00 USD = 10.278,75 DKK paid, + 10.278,75 DKK taxed = 20.557,50 DKK = 3.000,00 USD
    expect(row!.row.KURVAEBSKVALBLB).toBe("2055750");
    expect(row!.row.KURVAEOMSVALBLB).toBe("300000");
    expect(errorsOf(project([]), reportB(usd))).toEqual([]);
  });

  it("adds costs to the net settlement of an acquisition", () => {
    const e = grant({ participants: [{ personId: "anna", shares: "40000000", costs: "2500", noteNumber: "1" }] });
    const { row } = expandReport(project([]), reportB(e)).rows[0]!;
    expect([row.KURVAEOMSVALBLB, row.OMKOMSVALBLB, row.NTOAFROMSVALBLB, row.KURVAEBSKVALBLB, row.OMKBSKVALBLB, row.NTOAFRBSKVALBLB]).toEqual([
      "100000", "2500", "102500", "100000", "2500", "102500",
    ]);
  });

  it("derives the AS-ident from the listing, unless one is given", () => {
    const listedDk: Security = { id: "s3", name: "Nordlys Holding A/S", isin: "DK0012345675", issuerCountry: "DK", listed: true };
    const registered: Security = { ...listedDk, id: "s4", asIdent: "12345" };
    const p = project([], { securities: [nordlysShares, aurora, listedDk, registered] });
    const asIdent = (securityId: string) => expandReport(p, reportB(grant({ securityId }))).rows[0]!.row.ASIDNR;
    expect(asIdent("s1")).toBe("00000");
    expect(asIdent("s2")).toBe("00000");
    expect(asIdent("s3")).toBe("88888");
    expect(asIdent("s4")).toBe("12345");
  });

  it("lets an event override the security's listing", () => {
    const { row } = expandReport(project([]), reportB(grant({ listed: true }))).rows[0]!;
    expect(row.OPTAGHANDEKOD).toBe("1");
  });
});

describe("contract note number", () => {
  const note = (person: Person, noteNumber?: string) => {
    const e = grant({ participants: [{ personId: person.id, shares: "1000000", ...(noteNumber ? { noteNumber } : {}) }] });
    return expandReport(project([], { persons: [person] }), reportB(e)).rows[0]!.row.FONDNOTANR;
  };

  it("prefers the note, then the share register, then birth date or CVR", () => {
    const anna: Person = { id: "a", danishId: "0101584455" };
    expect(note(anna, "N-1")).toBe("N-1");
    expect(note({ ...anna, shareRegisterNo: "14" })).toBe("14");
    expect(note(anna)).toBe("01011958");
    expect(note({ id: "c", danishId: "87654303" })).toBe("87654303");
  });

  it("uses a foreign person's birth date", () => {
    const abroad: ForeignOwner = { ...swede, identification: { type: "birth", birthDate: "1985-03-12", birthCountry: "SE" } };
    expect(note({ id: "x", abroad })).toBe("12031985");
  });

  it("leaves it empty when nothing is known, so the check asks for it", () => {
    const noId: Person = { id: "x", abroad: swede };
    const e = grant({ participants: [{ personId: "x", shares: "1000000" }] });
    const p = project([], { persons: [noId] });
    expect(expandReport(p, reportB(e)).rows[0]!.row.FONDNOTANR).toBeUndefined();
    expect(errorsOf(p, reportB(e)).map((i) => [i.rule, i.field])).toContainEqual(["required", "FONDNOTANR"]);
  });
});

describe("birthDateFromCpr", () => {
  it.each([
    ["0101584455", "01011958"], // 7th digit 4, year 58 → 19xx
    ["0101104455", "01012010"], // 7th digit 4, year 10 → 20xx
    ["0101990123", "01011999"], // 7th digit 0 → 19xx
    ["0101105123", "01012010"], // 7th digit 5, year 10 → 20xx
    ["0101895123", "01011889"], // 7th digit 5, year 89 → 18xx
    ["0101909123", "01011990"], // 7th digit 9, year 90 → 19xx
    ["6101584455", "01011958"], // substitute number: day + 60
  ])("%s → %s", (cpr, expected) => {
    expect(birthDateFromCpr(cpr)).toBe(expected);
  });

  it("returns null for a 29 February that never happened", () => {
    expect(birthDateFromCpr("2902011234")).toBeNull();
  });
});

describe("foreign owners", () => {
  const row = (abroad: ForeignOwner) => {
    const e = grant({ participants: [{ personId: "x", shares: "1000000", noteNumber: "1" }] });
    return expandReport(project([], { persons: [{ id: "x", abroad }] }), reportB(e)).rows[0]!.row;
  };

  it("derives owner status and writes the block", () => {
    const r = row(swede);
    expect([r.EJERSTATUKOD, r.TINNRTYPEKOD, r.TINNR, r.PERSFORNVN, r.PERSEFTERNVN, r.LANDKOD]).toEqual([
      "1", "1", "19850312-1234", "Åsa", "Lindström", "SE",
    ]);
  });

  it("writes birth details, with the country code when the place is not known", () => {
    const r = row({ ...swede, identification: { type: "birth", birthDate: "1985-03-12", birthCountry: "SE" } });
    expect([r.TINNRTYPEKOD, r.TINNR, r.FOEDESTEDNVN, r.FOEDELANDKOD]).toEqual(["2", "12031985", "SE", "SE"]);
    const named = row({ ...swede, identification: { type: "birth", birthDate: "1985-03-12", birthCountry: "SE", birthPlace: "Lund" } });
    expect(named.FOEDESTEDNVN).toBe("Lund");
  });

  it("writes a company's name in both name fields", () => {
    const r = row({ ...swede, names: { kind: "company", name: "Svea AB" } });
    expect([r.PERSFORNVN, r.PERSEFTERNVN]).toEqual(["Svea AB", "Svea AB"]);
  });

  it("marks missing identification as type 3", () => {
    const r = row({ ...swede, identification: { type: "missing" } });
    expect([r.TINNRTYPEKOD, r.TINNR]).toEqual(["3", undefined]);
  });
});

describe("the other report types", () => {
  it("A: writes the sale price less costs", () => {
    const report: Report = {
      id: "r", scenario: "A", incomeYear: "2026",
      events: [{
        kind: "buyback", id: "e", date: "2026-04-02", securityId: "s1", tradeCurrency: "DKK", pricePerShare: "120500000",
        participants: [
          { personId: "dane5", shares: "1000000000", noteNumber: "Aktiebog 14" },
          { personId: "co", shares: "500000000", costs: "50000" },
        ],
      }],
    };
    const p = project([], { persons: [{ id: "dane5", danishId: "0505584455" }, { id: "co", danishId: "87654311" }] });
    const { rows, problems } = expandReport(p, report);
    expect(problems).toEqual([]);
    expect(lines(rows.map((r) => r.row))).toEqual(lines(goldenCase("a-buyback").rows));
    expect(errorsOf(p, report)).toEqual([]);
  });

  it("A: refuses costs above the value", () => {
    const report: Report = {
      id: "r", scenario: "A", incomeYear: "2026",
      events: [{
        kind: "buyback", id: "e", date: "2026-04-02", securityId: "s1", tradeCurrency: "DKK", pricePerShare: "1000000",
        participants: [{ personId: "anna", shares: "1000000", costs: "999999" }],
      }],
    };
    expect(errorsOf(project([]), report).map((i) => i.rule)).toEqual(["model.costsExceedValue"]);
  });

  it("C: derives type, code and ownership from the role", () => {
    const report: Report = {
      id: "r", scenario: "C", incomeYear: "2026",
      events: [{
        kind: "investment", id: "e", date: "2026-06-01", securityId: "startup", role: "targetCompany",
        participants: [
          { personId: "i1", shares: "5000000000", nominalValue: "5000000000", acquisitionSum: "25000000", priorOwnership: "none" },
          { personId: "i2", shares: "2000000000", nominalValue: "2000000000", acquisitionSum: "10000000", costs: "125000", via: "fund", priorOwnership: "owned" },
        ],
      }],
    };
    const p = project([], {
      company: { seNumber: "87654338", name: "Startup Hub ApS", address: "Vestergade 5, 1456 København K" },
      securities: [{ id: "startup", name: "Startup Hub ApS", issuerCountry: "DK", listed: false }],
      persons: [{ id: "i1", danishId: "0505584455" }, { id: "i2", danishId: "0606584455" }],
    });
    const { rows, problems } = expandReport(p, report);
    expect(problems).toEqual([]);
    expect(lines(rows.map((r) => r.row))).toEqual(lines(goldenCase("c-investor").rows));
    expect(errorsOf(p, report)).toEqual([]);
  });

  it("C: asks for prior ownership from a target company, and writes none for a fund", () => {
    const event = (role: "targetCompany" | "fund") => ({
      kind: "investment" as const, id: "e", date: "2026-06-01", securityId: "s1", role,
      participants: [{ personId: "anna", shares: "1000000", nominalValue: "1000000", acquisitionSum: "100000", priorOwnership: "owned" as const }],
    });
    const report = (role: "targetCompany" | "fund"): Report => ({ id: "r", scenario: "C", incomeYear: "2026", events: [event(role)] });
    const fund = expandReport(project([]), report("fund")).rows[0]!.row;
    expect([fund.PAPIRTYPEKOD, fund.KOEBSALGKOD, fund.INVESTOREJERSKAB]).toEqual(["4", "K", undefined]);
    const target = expandReport(project([]), report("targetCompany")).rows[0]!.row;
    expect([target.PAPIRTYPEKOD, target.KOEBSALGKOD, target.INVESTOREJERSKAB]).toEqual(["3", "K", "1"]);
  });

  it("D: writes only what a liquidation needs, and sends cooperative certificates as type 5", () => {
    const report: Report = {
      id: "r", scenario: "D", incomeYear: "2026",
      events: [{
        kind: "liquidation", id: "e", date: "2026-11-20", securityId: "old",
        participants: [
          { personId: "p7", shares: "1000000", proceeds: "2500000" },
          { personId: "co", shares: "3000000", proceeds: "7500000" },
        ],
      }],
    };
    const old: Security = { id: "old", name: "Gammel Handel ApS", issuerCountry: "DK", listed: false };
    const p = project([], {
      company: { seNumber: "87654311", name: "Gammel Handel ApS", address: "Torvet 3, 5000 Odense C" },
      securities: [old],
      persons: [{ id: "p7", danishId: "0707584455" }, { id: "co", danishId: "87654303" }],
    });
    const { rows, problems } = expandReport(p, report);
    expect(problems).toEqual([]);
    expect(lines(rows.map((r) => r.row))).toEqual(lines(goldenCase("d-liquidation").rows));
    expect(errorsOf(p, report)).toEqual([]);

    const coop = project([], { ...p, securities: [{ ...old, kind: "cooperativeCertificates" }] });
    expect(expandReport(coop, report).rows[0]!.row.PAPIRTYPEKOD).toBe("5");
  });
});

describe("checkReport", () => {
  it("is empty for a good report", () => {
    expect(checkReport(project([]), reportB(grant()))).toEqual([]);
  });

  it("ties issues to the event and the person", () => {
    const e = grant({ participants: [{ personId: "anna", shares: "1000000", noteNumber: "x".repeat(18) }] });
    const issues = checkReport(project([]), reportB(e));
    expect(issues).toContainEqual(expect.objectContaining({ rule: "format.tooLong", field: "FONDNOTANR", eventId: "e1", personId: "anna" }));
  });

  it("flags a date outside the income year", () => {
    const report: Report = { ...reportB(grant()), incomeYear: "2025" };
    expect(errorsOf(project([]), report).map((i) => i.rule)).toContain("year.tradeDateMismatch");
  });

  it("explains a missing exchange rate once, not once per field", () => {
    const issues = checkReport(project([]), reportB(grant({ tradeCurrency: "USD" })));
    expect(issues.map((i) => i.rule)).toEqual(["model.rateRequired"]);
    expect(formatIssue(issues[0]!, "en")).toBe("Enter the exchange rate for USD: DKK per 100 on the date.");
  });

  it("names unknown people and shares", () => {
    const p = project([]);
    const missingPerson = grant({ participants: [{ personId: "ghost", shares: "1000000" }] });
    expect(checkReport(p, reportB(missingPerson)).map((i) => [i.rule, i.personId])).toEqual([["model.unknownPerson", "ghost"]]);
    expect(checkReport(p, reportB(grant({ securityId: "nope" }))).map((i) => i.rule)).toEqual(["model.unknownSecurity"]);
  });

  it("asks for a scheme, and refuses § 28 for shares as pay", () => {
    const { scheme: _unused, ...noScheme } = grant();
    expect(checkReport(project([]), reportB(noScheme as EmployeeShareEvent)).map((i) => i.rule)).toEqual(["model.schemeNotAvailable"]);
    expect(checkReport(project([]), reportB(grant({ scheme: "ll28" }))).map((i) => i.rule)).toEqual(["model.schemeNotAvailable"]);
  });

  it("reports bad numbers on the person, without stopping the others", () => {
    const e = grant({
      participants: [
        { personId: "anna", shares: "15,5", noteNumber: "1" },
        { personId: "mikkel", shares: "1000000", noteNumber: "2" },
      ],
    });
    const p = project([]);
    expect(expandReport(p, reportB(e)).rows).toHaveLength(1);
    expect(checkReport(p, reportB(e))).toContainEqual(expect.objectContaining({ rule: "model.invalidNumber", personId: "anna" }));
  });

  it("warns about an event with nobody in it", () => {
    const issues = checkReport(project([]), reportB(grant({ participants: [] })));
    expect(issues).toEqual([expect.objectContaining({ rule: "model.noParticipants", severity: "warning", eventId: "e1" })]);
  });

  it("refuses an event of the wrong report type", () => {
    const report: Report = { id: "r", scenario: "A", incomeYear: "2026", events: [grant()] };
    expect(checkReport(project([]), report).map((i) => i.rule)).toEqual(["model.wrongEventKind"]);
  });

  it("flags a sender that would not fit, instead of cutting it off", () => {
    const longName = project([], { company: { seNumber: "12345674", name: "Et meget langt selskabsnavn ApS", address: "Vej 1" } });
    expect(checkReport(longName, reportB(grant())).map((i) => i.rule)).toEqual(["sender.nameTooLong"]);
    const withAdvisor = project([], {
      company: { seNumber: "12345674", name: "Et meget langt selskabsnavn ApS", address: "Vej 1" },
      sender: { seNumber: "87654303", name: "Revisor ApS", address: "Vej 2" },
    });
    expect(checkReport(withAdvisor, reportB(grant()))).toEqual([]);
    expect(senderOf(withAdvisor).name).toBe("Revisor ApS");
  });
});

describe("building the file", () => {
  it("matches the file built from the golden rows", () => {
    const c = goldenCase("b-basic");
    const expected = buildFile({ sender: c.sender, rows: c.rows, version: TEMPLATE_VERSION.B });
    expect(buildReportFile(project([]), reportB(grant()))).toBe(expected);
  });

  it("gives bytes in Windows-1252", () => {
    const bytes = buildReportBytes(project([]), reportB(grant()));
    expect(bytes).toContain(0xf8); // ø in "Søndergade"
    expect(bytes.length).toBe(4 * 1114);
  });

  it("names the file and totals the report", () => {
    const report = reportB(grant());
    expect(reportFileName(project([]), report)).toBe("MedAK_2278_B_2026_12345674.txt");
    expect(reportTotals(project([]), report)).toEqual({ records: 2, totalDkkOre: 4615000n });
  });

  it("subtracts reversals in the totals", () => {
    const p = project([]);
    const { rows } = expandReport(p, reportB(grant()));
    const [reversal, corrected] = correctionPair(rows[0]!.row, { ...rows[0]!.row, NTOAFRBSKVALBLB: "3000000" }, "B");
    const report: Report = { ...reportB(), events: [{ kind: "imported", id: "x", rows: [reversal, corrected] }] };
    expect(reportTotals(p, report)).toEqual({ records: 2, totalDkkOre: 160000n });
  });
});

describe("corrections", () => {
  const [row] = expandReport(project([]), reportB(grant())).rows.map((r) => r.row);

  it("reverses with minus signs and correction code 1, keeping the amounts positive", () => {
    const r = reverseRow(row!, "B");
    expect(r.RETTEKOD).toBe("1");
    expect(r.STKFTG).toBe("-");
    expect(r.NTOAFRBSKVALFTG).toBe("-");
    expect(r.NTOAFRBSKVALBLB).toBe(row!.NTOAFRBSKVALBLB);
  });

  it("makes a pair that passes the checks", () => {
    const corrected = { ...row!, STKANT: "500000000" };
    const [a, b] = correctionPair(row!, corrected, "B");
    expect([a.RETTEKOD, b.RETTEKOD, a.STKFTG, b.STKFTG]).toEqual(["1", "1", "-", "+"]);
    expect(validateRows([a, b], { scenario: "B" }).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("keeps the signs that liquidation reports lock to plus", () => {
    const d: Row = { STKFTG: "+", KURVAEOMSVALFTG: "+", NTOAFRBSKVALFTG: "+" };
    const r = reverseRow(d, "D");
    expect([r.STKFTG, r.NTOAFRBSKVALFTG, r.KURVAEOMSVALFTG]).toEqual(["-", "-", "+"]);
  });
});

describe("importing a file", () => {
  const fileOf = (id: string) => {
    const c = goldenCase(id);
    return buildFile({ sender: c.sender, rows: c.rows, version: TEMPLATE_VERSION[c.scenario] });
  };
  /** All data lines the imported project would write, sorted, since grouping may reorder them. */
  const reimported = (text: string) => {
    const { project: p } = importFile(text);
    return p.reports.flatMap((r) => expandReport(p, r).rows.map((x) => formatRow(x.row))).sort();
  };

  it.each(GOLDEN_CASES.map((c) => c.id))("%s comes back unchanged", (id) => {
    expect(reimported(fileOf(id))).toEqual(lines(goldenCase(id).rows).slice().sort());
  });

  it("groups rows into one event with the people in it", () => {
    const { project: p, structured, keptVerbatim, problems } = importFile(fileOf("b-basic"));
    expect([structured, keptVerbatim, problems]).toEqual([2, 0, []]);
    expect(p.company).toEqual({ seNumber: "12345674", name: "Nordlys Software ApS", address: "Søndergade 1, 8000 Aarhus C" });
    expect(p.sender).toBeUndefined();
    expect(p.securities).toHaveLength(1);
    expect(p.persons.map((x) => x.danishId)).toEqual(["0101584455", "0202584455"]);
    expect(p.reports).toHaveLength(1);
    const report = p.reports[0]!;
    expect([report.scenario, report.incomeYear]).toEqual(["B", "2026"]);
    expect(report.events).toHaveLength(1);
    const event = report.events[0] as EmployeeShareEvent;
    expect([event.what, event.scheme, event.date, event.pricePerShare]).toEqual(["pay", "lp7-uncapped", "2026-09-15", "25000000"]);
    expect(event.participants.map((x) => x.taxed)).toEqual(["1840000", "1150000"]);
  });

  it("understands foreign owners and currencies", () => {
    const { project: p, keptVerbatim } = importFile(fileOf("b-foreign-usd"));
    expect(keptVerbatim).toBe(0);
    const foreign = p.persons.find((x) => x.abroad)!;
    expect(foreign.displayName).toBe("Åsa Lindström");
    expect(foreign.abroad!.identification).toEqual({ type: "tin", tin: "19850312-1234" });
    const event = p.reports[0]!.events[0] as EmployeeShareEvent;
    expect([event.tradeCurrency, event.exchangeRate, event.scheme]).toEqual(["USD", "685250000", "ll16"]);
    expect(event.participants).toHaveLength(2);
  });

  it.each(["a-buyback", "c-investor", "d-liquidation", "b-edge"])("%s is fully understood as events", (id) => {
    const { structured, keptVerbatim } = importFile(fileOf(id));
    expect([structured, keptVerbatim]).toEqual([goldenCase(id).rows.length, 0]);
  });

  it("keeps corrections verbatim", () => {
    const { project: p, structured, keptVerbatim } = importFile(fileOf("b-correction"));
    expect([structured, keptVerbatim]).toEqual([0, 2]);
    expect(p.reports[0]!.events.map((e) => e.kind)).toEqual(["imported"]);
  });

  it("keeps rows it cannot reproduce, such as amounts that don't add up", () => {
    const c = goldenCase("b-basic");
    const odd = { ...c.rows[0]!, NTOAFRBSKVALBLB: "1" };
    const text = buildFile({ sender: c.sender, rows: [odd, c.rows[1]!], version: "2024-v1" });
    const result = importFile(text);
    expect([result.structured, result.keptVerbatim]).toEqual([1, 1]);
    expect(reimported(text)).toEqual(lines([odd, c.rows[1]!]).slice().sort());
  });

  it("keeps rows with letters in a number field instead of crashing", () => {
    const c = goldenCase("b-basic");
    const good = buildFile({ sender: c.sender, rows: c.rows, version: "2024-v1" });
    const start = 234; // KURVAEBSKVALBLB of the first data line, 0-based position
    const damaged = good.split("\r\n").map((l, i) => (i === 1 ? l.slice(0, start) + "ABC" + l.slice(start + 3) : l)).join("\r\n");
    const result = importFile(damaged);
    expect(result.keptVerbatim).toBe(1);
    expect(result.structured).toBe(1);
  });

  it("keeps an advisor as the sender", () => {
    const c = goldenCase("b-basic");
    const advisor = { seNumber: "87654303", name: "Revisor ApS", address: "Vej 2" };
    const { project: p } = importFile(buildFile({ sender: advisor, rows: c.rows, version: "2024-v1" }));
    expect(p.sender).toEqual(advisor);
    expect(p.company.seNumber).toBe("12345674");
    expect(p.company.name).toBe("");
  });

  it("makes one report per report type and year", () => {
    const b = goldenCase("b-basic");
    const a = goldenCase("a-buyback");
    const { project: p } = importFile(buildFile({ sender: b.sender, rows: [...b.rows, ...a.rows], version: "2024-v1" }));
    expect(p.reports.map((r) => r.scenario)).toEqual(["B", "A"]);
  });

  it("reports file problems", () => {
    expect(importFile("nonsense").problems).toContainEqual({ kind: "missingStartRecord" });
  });

  it("gives a project that passes the checks", () => {
    for (const c of GOLDEN_CASES) {
      const { project: p } = importFile(fileOf(c.id));
      for (const report of p.reports) {
        const errors = errorsOf(p, report).map((i) => formatIssue(i, "en"));
        expect(errors, c.id).toEqual([]);
      }
    }
  });
});

describe("project file", () => {
  it("round-trips", () => {
    const p = project([reportB(grant())]);
    expect(parseProject(serializeProject(p))).toEqual(p);
  });

  it.each([
    ["not json", "notJson"],
    ["{}", "notAProject"],
    ['{"format":"something"}', "notAProject"],
    ['{"format":"medak-project","version":99,"company":{},"securities":[],"persons":[],"reports":[]}', "newerVersion"],
  ])("rejects %s", (text, problem) => {
    try {
      parseProject(text);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectFileError);
      expect((e as ProjectFileError).problem).toBe(problem);
    }
  });
});
