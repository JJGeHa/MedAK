/**
 * Reads a 2278 file (e.g. made with SKAT's Excel template) back into the project model, so
 * users can continue from what they already have.
 *
 * Lossless by construction: a row only becomes part of an event if expanding that event
 * gives back the identical line. Everything else (corrections, unusual amounts, another
 * company's rows) is kept verbatim as an "imported" event. Rows may change order, because
 * they are grouped by event, but none is ever altered or lost.
 */
import { classifyId } from "../checks.ts";
import type { Scenario } from "../codes.ts";
import { SIGN_FIELDS } from "../fields.ts";
import { parseFile, type ParseProblem } from "../file.ts";
import { formatRow, type Row } from "../record.ts";
import { convertToDkk, marketValueOre } from "../units.ts";
import { expandReport } from "./expand.ts";
import {
  type Company, type EmployeeShareScheme, type EmployeeShareWhat, type ForeignOwner, type Identification,
  type Person, type PriorOwnership, PROJECT_FORMAT, PROJECT_VERSION, type Project, type Report, type ReportEvent,
  type Security,
} from "./types.ts";

const strip = (digits: string) => digits.replace(/^0+(?=\d)/, "");
const isoDate = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const isoFromDmy = (dmy: string) => `${dmy.slice(4, 8)}-${dmy.slice(2, 4)}-${dmy.slice(0, 2)}`;

/** Which report type a row belongs to, from its transaction code and security type. */
function scenarioOf(row: Row): Scenario | null {
  switch (row.KOEBSALGKOD) {
    case "S": return "A";
    case "E": case "F": case "G": case "H": case "B": case "M": return "B";
    case "K": return row.PAPIRTYPEKOD === "3" || row.PAPIRTYPEKOD === "4" ? "C" : "B";
    case "R": return "C";
    case "L": return "D";
    default: return null;
  }
}

const B_SCHEME: Readonly<Record<string, { what: EmployeeShareWhat; scheme?: EmployeeShareScheme }>> = {
  E: { what: "pay", scheme: "lp7-10" },
  F: { what: "pay", scheme: "lp7-20" },
  G: { what: "pay", scheme: "lp7-uncapped" },
  H: { what: "pay", scheme: "lp7-uncapped" },
  M: { what: "pay", scheme: "ll16" },
  B: { what: "options", scheme: "ll28" },
  K: { what: "matching" },
};

const OWNERSHIP: Readonly<Record<string, PriorOwnership>> = { "1": "owned", "2": "none", "3": "followOn" };

function securityFromRow(row: Row): Omit<Security, "id"> {
  return {
    name: row.PAPIRIDENTNVN ?? "",
    ...(row.ISINKOD ? { isin: row.ISINKOD } : {}),
    issuerCountry: row.PAPIRLANDKOD ?? "DK",
    listed: row.OPTAGHANDEKOD === "1",
    ...(row.PAPIRTYPEKOD === "5" ? { kind: "cooperativeCertificates" as const } : {}),
    ...(row.ASIDNR ? { asIdent: row.ASIDNR } : {}),
  };
}

function foreignOwnerFromRow(row: Row): ForeignOwner {
  let identification: Identification;
  if (row.TINNRTYPEKOD === "2") {
    identification = {
      type: "birth",
      birthDate: isoFromDmy(row.TINNR ?? ""),
      birthCountry: row.FOEDELANDKOD ?? "",
      ...(row.FOEDESTEDNVN ? { birthPlace: row.FOEDESTEDNVN } : {}),
    };
  } else if (row.TINNRTYPEKOD === "1") {
    identification = { type: "tin", tin: row.TINNR ?? "" };
  } else {
    identification = { type: "missing" };
  }
  const first = row.PERSFORNVN ?? "";
  const last = row.PERSEFTERNVN ?? "";
  const optional = (key: keyof ForeignOwner, value: string | undefined) => (value ? { [key]: value } : {});
  return {
    identification,
    names: first !== "" && first === last ? { kind: "company", name: first } : { kind: "person", first, last },
    ...optional("careOf", row.CONVN),
    ...optional("street", row.VEJNVN),
    ...optional("houseNumber", row.HUSNR),
    ...optional("floor", row.ETAGENR),
    ...optional("door", row.SIDEDOERNR),
    ...optional("poBox", row.POSTBOXADR),
    ...optional("village", row.LANDBYNVN),
    ...optional("postcode", row.POSTNR),
    town: row.POSTDISTRADR ?? "",
    ...optional("houseName", row.HUSNVN),
    ...optional("apartment", row.LJLIHVAERSNR),
    ...optional("region", row.EGNLANDELSTANVN),
    countryName: row.LANDENVN ?? "",
    country: row.LANDKOD ?? "",
  };
}

function personFromRow(row: Row): Omit<Person, "id"> {
  const danishId = row.PNRSENR ? classifyId(row.PNRSENR).normalized : undefined;
  const abroad = row.EJERSTATUKOD === "1" ? foreignOwnerFromRow(row) : undefined;
  const displayName = abroad
    ? abroad.names.kind === "company" ? abroad.names.name : `${abroad.names.first} ${abroad.names.last}`.trim()
    : undefined;
  return {
    ...(displayName ? { displayName } : {}),
    ...(danishId ? { danishId } : {}),
    ...(abroad ? { abroad } : {}),
  };
}

/** What varies per person in a row; the rest of the row describes the event. */
const noteAndDepot = (row: Row) => ({
  ...(row.FONDNOTANR ? { noteNumber: row.FONDNOTANR } : {}),
  ...(row.DEPOTNR ? { depot: row.DEPOTNR } : {}),
});

const whenFromRow = (row: Row) => ({
  date: isoDate(row.HANDEDTO ?? ""),
  ...(row.HANDETID ? { time: row.HANDETID } : {}),
});

const currenciesFromRow = (row: Row) => {
  const trade = row.OMSVALKOD ?? "";
  const settlement = row.AFRVALKOD ?? "";
  return {
    tradeCurrency: trade,
    ...(settlement !== trade ? { settlementCurrency: settlement } : {}),
    ...(trade !== "DKK" ? { exchangeRate: strip(row.VALKURSPCT ?? "") } : {}),
  };
};

/**
 * Describe one row as an event with one participant. Returns null when the row does not fit
 * the model at all; the caller still verifies every result by expanding it again.
 */
function eventFromRow(row: Row, scenario: Scenario, securityId: string, personId: string): ReportEvent | null {
  if (row.RETTEKOD !== "0") return null;
  if (SIGN_FIELDS.some((k) => row[k] !== "+")) return null;
  const shares = strip(row.STKANT ?? "");
  if (!/^\d+$/.test(shares)) return null;
  const when = whenFromRow(row);
  const base = { id: "", securityId, ...when };
  const participant = { personId, shares, ...noteAndDepot(row) };

  switch (scenario) {
    case "B": {
      const plan = B_SCHEME[row.KOEBSALGKOD ?? ""];
      if (!plan) return null;
      const price = strip(row.AKTIPAPIRKURSPCT ?? "");
      const currencies = currenciesFromRow(row);
      if (!/^\d+$/.test(price)) return null;
      const paid = marketValueOre(BigInt(shares), BigInt(price));
      const dkk = currencies.tradeCurrency === "DKK";
      const rate = dkk ? 100_000_000n : BigInt(currencies.exchangeRate || "0");
      if (rate === 0n) return null;
      const taxed = BigInt(row.KURVAEBSKVALBLB ?? "0") - (dkk ? paid : convertToDkk(paid, rate));
      if (taxed < 0n) return null;
      const costs = strip(row.OMKOMSVALBLB ?? "0");
      return {
        kind: "employeeShares", ...base, ...currencies, ...plan, pricePerShare: price,
        participants: [{ ...participant, ...(taxed > 0n ? { taxed: taxed.toString() } : {}), ...(costs !== "0" ? { costs } : {}) }],
      };
    }
    case "A": {
      const price = strip(row.AKTIPAPIRKURSPCT ?? "");
      const costs = strip(row.OMKOMSVALBLB ?? "0");
      return {
        kind: "buyback", ...base, ...currenciesFromRow(row),
        participants: [{ ...participant, pricePerShare: price, ...(costs !== "0" ? { costs } : {}) }],
      };
    }
    case "C": {
      const type = row.PAPIRTYPEKOD;
      const code = row.KOEBSALGKOD;
      const fund = code === "K" && type === "4";
      const ownership = OWNERSHIP[row.INVESTOREJERSKAB ?? ""];
      const costs = strip(row.OMKBSKVALBLB ?? "0");
      return {
        kind: "investment", ...base, role: fund ? "fund" : "targetCompany",
        participants: [{
          ...participant,
          nominalValue: strip(row.AKTIPAPIRKURSPCT ?? ""),
          acquisitionSum: strip(row.KURVAEBSKVALBLB ?? ""),
          ...(costs !== "0" ? { costs } : {}),
          ...(code === "R" ? { via: "fund" as const } : {}),
          ...(ownership ? { priorOwnership: ownership } : {}),
        }],
      };
    }
    case "D":
      return {
        kind: "liquidation", ...base,
        participants: [{ ...participant, proceeds: strip(row.NTOAFRBSKVALBLB ?? "") }],
      };
  }
}

/**
 * Add an imported project's shares, people and reports to a saved one. The same share or person
 * is reused rather than duplicated, so one employee stays one entry in the register.
 */
export function mergeProjects(into: Project, imported: Project): Project {
  const withoutId = <T extends { id: string }>({ id: _id, ...rest }: T) => JSON.stringify(rest);
  const securities = [...into.securities];
  const persons = [...into.persons];
  const securityIds = new Map<string, string>();
  const personIds = new Map<string, string>();

  for (const security of imported.securities) {
    const existing = securities.find((s) => withoutId(s) === withoutId(security) || (s.name === security.name && (s.isin ?? "") === (security.isin ?? "")));
    if (existing) {
      securityIds.set(security.id, existing.id);
    } else {
      const id = freshId("s", securities);
      securities.push({ ...security, id });
      securityIds.set(security.id, id);
    }
  }
  for (const person of imported.persons) {
    const existing = persons.find((p) => (person.danishId ? p.danishId === person.danishId : withoutId(p) === withoutId(person)));
    if (existing) {
      personIds.set(person.id, existing.id);
    } else {
      const id = freshId("p", persons);
      persons.push({ ...person, id });
      personIds.set(person.id, id);
    }
  }

  const eventIds: { id: string }[] = into.reports.flatMap((r) => [...r.events]);
  const reportIds: { id: string }[] = [...into.reports];
  const reports: Report[] = imported.reports.map((report) => {
    const events = report.events.map((event): ReportEvent => {
      const id = freshId("e", eventIds);
      eventIds.push({ id });
      if (event.kind === "imported") return { ...event, id };
      const remapped = {
        ...event,
        id,
        securityId: securityIds.get(event.securityId) ?? event.securityId,
        participants: event.participants.map((p: { personId: string }) => ({ ...p, personId: personIds.get(p.personId) ?? p.personId })),
      };
      return remapped as unknown as ReportEvent;
    });
    const id = freshId("r", reportIds);
    reportIds.push({ id });
    return { ...report, id, events };
  });

  return { ...into, securities, persons, reports: [...into.reports, ...reports] };
}

/** The next unused id with a prefix, e.g. "p7". */
export function freshId(prefix: string, taken: readonly { id: string }[]): string {
  const used = new Set(taken.map((t) => t.id));
  let n = taken.length + 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export interface ImportResult {
  readonly project: Project;
  /** Rows kept verbatim because they could not be described as an event without changing them. */
  readonly keptVerbatim: number;
  /** Rows that became part of an event. */
  readonly structured: number;
  /** Problems with the file itself: missing records, wrong line count and so on. */
  readonly problems: readonly ParseProblem[];
}

function sameLine(a: Row, b: Row): boolean {
  try {
    return formatRow(a) === formatRow(b);
  } catch {
    return false;
  }
}

/**
 * Build a project from the text of a 2278 file. A file normally holds one report, but rows
 * are sorted into one report per report type and income year.
 */
export function importFile(text: string): ImportResult {
  const parsed = parseFile(text);
  const firstOpsenr = parsed.rows[0]?.row.OPSENR ?? parsed.sender?.seNumber ?? "";
  const senderIsCompany = parsed.sender !== null && strip(parsed.sender.seNumber) === strip(firstOpsenr);
  const company: Company = {
    seNumber: firstOpsenr,
    name: senderIsCompany ? parsed.sender!.name : "",
    address: senderIsCompany ? parsed.sender!.address : "",
  };

  const securities = new Map<string, Security>();
  const persons = new Map<string, Person>();
  // Reports and their events, by key, in the order first seen.
  const reports = new Map<string, { scenario: Scenario; incomeYear: string; events: Map<string, ReportEvent> }>();
  let eventCount = 0;
  let structured = 0;
  let keptVerbatim = 0;

  const reportFor = (scenario: Scenario, incomeYear: string) => {
    const key = `${scenario}|${incomeYear}`;
    let report = reports.get(key);
    if (!report) {
      report = { scenario, incomeYear, events: new Map() };
      reports.set(key, report);
    }
    return report;
  };

  for (const { row } of parsed.rows) {
    const scenario = scenarioOf(row);
    const incomeYear = row.INDKAAR ?? "";

    // Describe the row, and keep the description only if it reproduces the row exactly.
    const securityKey = JSON.stringify(securityFromRow(row));
    const personKey = JSON.stringify(personFromRow(row));
    const securityId = securities.get(securityKey)?.id ?? `s${securities.size + 1}`;
    const personId = persons.get(personKey)?.id ?? `p${persons.size + 1}`;
    const security: Security = { id: securityId, ...securityFromRow(row) };
    const person: Person = { id: personId, ...personFromRow(row) };
    let event: ReportEvent | null = null;
    if (scenario) {
      try {
        event = eventFromRow(row, scenario, securityId, personId);
      } catch {
        // Letters in a number field and the like: keep the row as it is.
      }
    }

    let faithful = false;
    if (scenario && event) {
      const trial: Project = {
        format: PROJECT_FORMAT, version: PROJECT_VERSION, company, securities: [security], persons: [person], reports: [],
      };
      const expanded = expandReport(trial, { id: "", scenario, incomeYear, events: [event] });
      const only = expanded.rows[0];
      faithful = expanded.rows.length === 1 && only !== undefined && sameLine(only.row, row);
    }

    if (scenario && event && faithful && event.kind !== "imported") {
      securities.set(securityKey, security);
      persons.set(personKey, person);
      const report = reportFor(scenario, incomeYear);
      const { participants, ...shared } = event;
      const eventKey = JSON.stringify(shared);
      const existing = report.events.get(eventKey);
      if (existing && existing.kind !== "imported") {
        (existing.participants as unknown[]).push(...participants);
      } else {
        eventCount += 1;
        report.events.set(eventKey, { ...event, id: `e${eventCount}`, participants: [...participants] } as ReportEvent);
      }
      structured += 1;
    } else {
      // Rows without a known code go with employee shares, the most common report.
      const report = reportFor(scenario ?? "B", incomeYear);
      const existing = report.events.get("imported");
      if (existing && existing.kind === "imported") {
        (existing.rows as Row[]).push(row);
      } else {
        eventCount += 1;
        report.events.set("imported", { kind: "imported", id: `e${eventCount}`, rows: [row] });
      }
      keptVerbatim += 1;
    }
  }

  const reportList: Report[] = [...reports.values()].map((r, i) => ({
    id: `r${i + 1}`,
    scenario: r.scenario,
    incomeYear: r.incomeYear,
    events: [...r.events.values()],
  }));

  return {
    project: {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      company,
      ...(parsed.sender && !senderIsCompany ? { sender: parsed.sender } : {}),
      securities: [...securities.values()],
      persons: [...persons.values()],
      reports: reportList,
    },
    keptVerbatim,
    structured,
    problems: parsed.problems,
  };
}
