import { checkReport, type EmployeeShareEvent, expandReport, type Project, PROJECT_FORMAT, PROJECT_VERSION } from "@medak/engine";
import { describe, expect, it } from "vitest";
import {
  addEmployeeEvent, addImportedPeople, addParticipant, addPerson, addReport, addSecurity, personInUse, removeParticipant,
  removePerson, setOptional, updateEvent, updateParticipant,
} from "@/lib/project-ops";
import { describeRow, explainCode, personName, rowName } from "@/lib/review";

const empty: Project = {
  format: PROJECT_FORMAT,
  version: PROJECT_VERSION,
  company: { seNumber: "12345674", name: "Nordlys Software ApS", address: "Søndergade 1" },
  securities: [],
  persons: [],
  reports: [],
};

/** A report with one event for one share, as a user would build it step by step. */
function setUp() {
  const a = addReport(empty, "B", "2026");
  const s = addSecurity(a.project, { name: "Nordlys B-anparter", issuerCountry: "DK", listed: false });
  const e = addEmployeeEvent(s.project, a.reportId);
  return { project: e.project, reportId: a.reportId, eventId: e.eventId, securityId: s.securityId };
}

const eventOf = (p: Project, reportId: string, eventId: string) =>
  p.reports.find((r) => r.id === reportId)!.events.find((e) => e.id === eventId) as EmployeeShareEvent;

describe("building a report step by step", () => {
  it("preselects the only share", () => {
    const { project, reportId, eventId, securityId } = setUp();
    expect(eventOf(project, reportId, eventId).securityId).toBe(securityId);
  });

  it("ends with a report that passes the checks", () => {
    const { project: p0, reportId, eventId } = setUp();
    const { project: p1, personId } = addPerson(p0, { displayName: "Anna Jensen", danishId: "0101584455" });
    const p2 = updateEvent(p1, reportId, eventId, (e) =>
      addParticipant({ ...e, date: "2026-09-15", scheme: "lp7-uncapped", pricePerShare: "25000000" }, { personId, shares: "400000000", taxed: "1840000" }),
    );
    const report = p2.reports[0]!;
    expect(checkReport(p2, report)).toEqual([]);
    expect(expandReport(p2, report).rows[0]!.row.KOEBSALGKOD).toBe("H");
  });

  it("asks for what's missing on a new event", () => {
    const { project, reportId, eventId } = setUp();
    const { project: p, personId } = addPerson(project, { danishId: "0101584455" });
    const withPerson = updateEvent(p, reportId, eventId, (e) => addParticipant(e, { personId, shares: "1000000" }));
    expect(checkReport(withPerson, withPerson.reports[0]!).map((i) => i.rule)).toEqual(["model.schemeNotAvailable"]);
  });
});

describe("the register", () => {
  it("won't remove someone used by an event", () => {
    const { project, reportId, eventId } = setUp();
    const { project: p, personId } = addPerson(project, { danishId: "0101584455" });
    const used = updateEvent(p, reportId, eventId, (e) => addParticipant(e, { personId, shares: "1" }));
    expect(personInUse(used, personId)).toBe(true);
    expect(removePerson(used, personId).persons).toHaveLength(1);
    const unused = updateEvent(used, reportId, eventId, (e) => removeParticipant(e, personId));
    expect(removePerson(unused, personId).persons).toHaveLength(0);
  });

  it("gives every new person, share and event a unique id", () => {
    let p = empty;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const added = addPerson(p);
      p = added.project;
      ids.push(added.personId);
    }
    p = removePerson(p, ids[0]!);
    const again = addPerson(p);
    expect(new Set([...ids.slice(1), again.personId]).size).toBe(3);
  });
});

describe("participants", () => {
  it("updates and clears optional values", () => {
    const { project, reportId, eventId } = setUp();
    const { project: p, personId } = addPerson(project);
    const a = updateEvent(p, reportId, eventId, (e) => addParticipant(e, { personId, shares: "1", taxed: "5" }));
    const b = updateEvent(a, reportId, eventId, (e) => updateParticipant(e, personId, (x) => setOptional(x, "taxed", undefined)));
    expect(eventOf(b, reportId, eventId).participants[0]).toEqual({ personId, shares: "1" });
  });
});

describe("importing people", () => {
  const rows = [
    { rowNumber: 2, name: "Anna Jensen", danishId: "0101584455", shares: "400000000", taxed: "1840000", problems: [] },
    { rowNumber: 3, name: "Bo Holm", danishId: "0202584455", shares: "250000000", problems: [] },
  ];

  it("adds people to the register and the event", () => {
    const { project, reportId, eventId } = setUp();
    const p = addImportedPeople(project, reportId, eventId, rows);
    expect(p.persons.map((x) => x.displayName)).toEqual(["Anna Jensen", "Bo Holm"]);
    expect(eventOf(p, reportId, eventId).participants.map((x) => x.shares)).toEqual(["400000000", "250000000"]);
  });

  it("reuses someone already in the register and keeps their details", () => {
    const { project, reportId, eventId } = setUp();
    const { project: known } = addPerson(project, { displayName: "Anna J.", danishId: "0101584455" });
    const p = addImportedPeople(known, reportId, eventId, rows);
    expect(p.persons).toHaveLength(2);
    expect(p.persons[0]!.displayName).toBe("Anna J.");
  });

  it("updates rather than duplicates someone already in the event", () => {
    const { project, reportId, eventId } = setUp();
    const once = addImportedPeople(project, reportId, eventId, rows);
    const twice = addImportedPeople(once, reportId, eventId, [{ ...rows[0]!, shares: "500000000" }]);
    expect(eventOf(twice, reportId, eventId).participants).toHaveLength(2);
    expect(eventOf(twice, reportId, eventId).participants[0]!.shares).toBe("500000000");
  });
});

describe("review sentences", () => {
  const persons = [{ id: "a", displayName: "Anna Jensen", danishId: "0101584455" }];
  const row = {
    PNRSENR: "0101584455", STKANT: "400000000", PAPIRIDENTNVN: "Nordlys B-anparter", HANDEDTO: "20260915",
    NTOAFRBSKVALBLB: "2840000", KOEBSALGKOD: "H", PAPIRTYPEKOD: "1",
  };

  it("reads naturally in both languages", () => {
    expect(describeRow(row, persons, "da")).toBe("Anna Jensen fik 400 Nordlys B-anparter den 15. september 2026. Anskaffelsessum 28.400,00 kr. (kode H).");
    expect(describeRow(row, persons, "en")).toBe("Anna Jensen received 400 Nordlys B-anparter on 15 September 2026. Acquisition sum DKK 28,400.00 (code H).");
  });

  it("marks reversals", () => {
    expect(describeRow({ ...row, STKFTG: "-" }, persons, "en")).toMatch(/^Reversal: /);
  });

  it("describes the other report types in their own terms", () => {
    expect(describeRow({ ...row, KOEBSALGKOD: "S" }, persons, "en")).toContain("The company bought 400");
    expect(describeRow({ ...row, KOEBSALGKOD: "L" }, persons, "en")).toContain("liquidation proceeds");
    expect(describeRow({ ...row, KOEBSALGKOD: "K", PAPIRTYPEKOD: "3" }, persons, "en")).toContain("invested DKK");
    expect(describeRow({ ...row, KOEBSALGKOD: "K", PAPIRTYPEKOD: "1" }, persons, "en")).toContain("received 400");
  });

  it("never shows a full CPR number for someone not in the register", () => {
    expect(rowName({ PNRSENR: "0303584455" }, [], "da")).toBe("030358-••••");
    expect(personName({ id: "x", danishId: "0303584455" }, "en")).toBe("030358-••••");
  });

  it("uses the name in the file for people abroad, and reads a company's number", () => {
    expect(rowName({ PERSFORNVN: "Åsa", PERSEFTERNVN: "Lindström" }, [], "en")).toBe("Åsa Lindström");
    expect(rowName({ PERSFORNVN: "Svea AB", PERSEFTERNVN: "Svea AB" }, [], "en")).toBe("Svea AB");
    expect(rowName({ PNRSENR: "0087654303" }, [{ id: "c", displayName: "Holding ApS", danishId: "87654303" }], "en")).toBe("Holding ApS");
  });
});

describe("explainCode", () => {
  it("gives SKAT's meaning with the code", () => {
    expect(explainCode("207", "en")).toBe("The year of the trade date does not match the income year (code 207)");
    expect(explainCode("207", "da")).toBe("Fejl i år i handelsdato (kode 207)");
    expect(explainCode("000", "en")).toBe("Code 000");
  });
});
