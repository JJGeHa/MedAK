/**
 * Turns the project model into 2278 rows: answers become codes, and the fields SKAT's file
 * repeats or derives are filled in. See docs/data-model.md for where each field comes from.
 */
import { birthDateFromCpr, classifyId } from "../checks.ts";
import { type Scenario, TEMPLATE_VERSION, TRANSACTION_CODES } from "../codes.ts";
import { encodeWindows1252 } from "../encoding.ts";
import { type FieldKey, SIGN_FIELDS } from "../fields.ts";
import { buildFile, type Sender } from "../file.ts";
import type { Row } from "../record.ts";
import { applyScenario } from "../scenarios.ts";
import { convertFromDkk, convertToDkk, marketValueOre } from "../units.ts";
import { type Issue, type RuleId, validateRows } from "../validate.ts";
import type {
  BuybackEvent, EmployeeShareEvent, EmployeeShareScheme, EmployeeShareWhat, InvestmentEvent,
  LiquidationEvent, Person, PriorOwnership, Project, Report, ReportEvent, Security,
} from "./types.ts";

// ---------- Answers to codes ----------

const uncappedSwitch = TRANSACTION_CODES.find((c) => c.code === "H")!.validFrom!;
const dateDigits = (iso: string) => iso.replaceAll("-", "");

/**
 * SKAT's transaction code (felt 57) for a scenario B event, or null if the answers do not
 * fit together. The date decides between G (until 30.06.2026) and H (from 01.07.2026).
 *
 * Assumption to confirm with SKAT: the § 7 P codes also apply to exercised options and warrants.
 */
export function employeeShareCode(
  what: EmployeeShareWhat,
  scheme: EmployeeShareScheme | undefined,
  date: string,
): string | null {
  if (what === "matching") return "K";
  switch (scheme) {
    case "lp7-10": return "E";
    case "lp7-20": return "F";
    case "lp7-uncapped": return dateDigits(date) >= uncappedSwitch ? "H" : "G";
    case "ll16": return "M";
    case "ll28": return what === "options" ? "B" : null;
    case undefined: return null;
  }
}

/** The schemes to offer for an answer to "what happened?", with the code each one gives. */
export function schemeOptions(what: EmployeeShareWhat, date: string): { scheme: EmployeeShareScheme; code: string }[] {
  if (what === "matching") return [];
  const schemes: EmployeeShareScheme[] = ["lp7-10", "lp7-20", "lp7-uncapped", "ll16", "ll28"];
  return schemes.flatMap((scheme) => {
    const code = employeeShareCode(what, scheme, date);
    return code === null ? [] : [{ scheme, code }];
  });
}

// ---------- Helpers ----------

/** A problem with one participant or event; stops that row but not the rest of the report. */
class ModelError extends Error {
  readonly rule: RuleId;
  readonly params: Readonly<Record<string, string>>;
  constructor(rule: RuleId, params: Readonly<Record<string, string>> = {}) {
    super(rule);
    this.rule = rule;
    this.params = params;
  }
}

function num(value: string | undefined, fallback?: bigint): bigint {
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new ModelError("model.invalidNumber", { value: value ?? "" });
  }
  if (!/^\d+$/.test(value)) throw new ModelError("model.invalidNumber", { value });
  return BigInt(value);
}

/** Drop undefined and empty values, so a row only holds what is filled in. */
function compact(fields: Partial<Record<FieldKey, string | undefined>>): Row {
  const row: Row = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== "") row[key as FieldKey] = value;
  }
  return row;
}

const DKK_RATE = 100_000_000n;

function tradeRate(event: { tradeCurrency: string; exchangeRate?: string }): bigint {
  if (event.tradeCurrency === "DKK") return DKK_RATE;
  const rate = event.exchangeRate === undefined ? 0n : num(event.exchangeRate, 0n);
  if (rate === 0n) throw new ModelError("model.rateRequired", { value: event.tradeCurrency });
  return rate;
}

/** The amount in the settlement currency, given the same amount in trade currency and DKK. */
function inSettlement(
  event: { tradeCurrency: string; settlementCurrency?: string; settlementRate?: string },
  trade: bigint,
  dkk: bigint,
): bigint {
  const settlement = event.settlementCurrency ?? event.tradeCurrency;
  if (settlement === event.tradeCurrency) return trade;
  if (settlement === "DKK") return dkk;
  const rate = event.settlementRate === undefined ? 0n : num(event.settlementRate, 0n);
  if (rate === 0n) throw new ModelError("model.rateRequired", { value: settlement });
  return convertFromDkk(dkk, rate);
}

function securityFields(security: Security, listedOverride: boolean | undefined): Row {
  const listed = listedOverride ?? security.listed;
  const derivedAsIdent = security.issuerCountry === "DK" && listed ? "88888" : "00000";
  return compact({
    ISINKOD: security.isin,
    PAPIRIDENTNVN: security.name,
    PAPIRTYPEKOD: security.kind === "cooperativeCertificates" ? "5" : "1",
    PAPIRLANDKOD: security.issuerCountry,
    ASIDNR: security.asIdent ?? derivedAsIdent,
    OPTAGHANDEKOD: listed ? "1" : "2",
  });
}

/** `YYYY-MM-DD` to the `DDMMÅÅÅÅ` the file uses for birth dates. */
const dmy = (iso: string) => {
  const [y = "", m = "", d = ""] = iso.split("-");
  return d + m + y;
};

function personFields(person: Person): Row {
  const a = person.abroad;
  if (!a) return compact({ EJERSTATUKOD: "0", PNRSENR: person.danishId });
  const id = a.identification;
  const birth = id.type === "birth";
  return compact({
    EJERSTATUKOD: "1",
    PNRSENR: person.danishId,
    TINNR: id.type === "tin" ? id.tin : birth ? dmy(id.birthDate) : undefined,
    TINNRTYPEKOD: id.type === "tin" ? "1" : birth ? "2" : "3",
    // The guidance allows the country code when the place of birth is not on the person's ID.
    FOEDESTEDNVN: birth ? (id.birthPlace ?? id.birthCountry) : undefined,
    FOEDELANDKOD: birth ? id.birthCountry : undefined,
    PERSFORNVN: a.names.kind === "company" ? a.names.name : a.names.first,
    PERSEFTERNVN: a.names.kind === "company" ? a.names.name : a.names.last,
    CONVN: a.careOf,
    VEJNVN: a.street,
    HUSNR: a.houseNumber,
    ETAGENR: a.floor,
    SIDEDOERNR: a.door,
    POSTBOXADR: a.poBox,
    LANDBYNVN: a.village,
    POSTNR: a.postcode,
    POSTDISTRADR: a.town,
    HUSNVN: a.houseName,
    LJLIHVAERSNR: a.apartment,
    EGNLANDELSTANVN: a.region,
    LANDENVN: a.countryName,
    LANDKOD: a.country,
  });
}

/** The guidance's fallback for FONDNOTANR: the person's birth date, or CVR/SE number. */
function birthDateOrCvr(person: Person): string | undefined {
  if (person.danishId) {
    const { kind, normalized } = classifyId(person.danishId);
    if (kind === "cvr") return normalized;
    if (kind === "cpr") return birthDateFromCpr(normalized) ?? undefined;
  }
  const id = person.abroad?.identification;
  return id?.type === "birth" ? dmy(id.birthDate) : undefined;
}

const PLUS_SIGNS: Row = Object.fromEntries(SIGN_FIELDS.map((k) => [k, "+"]));

const OWNERSHIP_CODE: Readonly<Record<PriorOwnership, string>> = { owned: "1", none: "2", followOn: "3" };

// ---------- Events to rows ----------

/** Fields every row of a report shares. */
interface RowContext {
  readonly project: Project;
  readonly report: Report;
  readonly person: Person;
  readonly security: Security;
}

function baseRow(ctx: RowContext, event: { date: string; time?: string; listed?: boolean }): Row {
  const date = dateDigits(event.date);
  return {
    OPSENR: ctx.project.company.seNumber,
    RETTEKOD: "0",
    ...PLUS_SIGNS,
    ...securityFields(ctx.security, event.listed),
    ...personFields(ctx.person),
    HANDEDTO: date,
    VALOEDTO: date,
    INDKAAR: ctx.report.incomeYear,
    ...compact({ HANDETID: event.time }),
  };
}

function employeeRows(event: EmployeeShareEvent, each: EachParticipant): void {
  const code = employeeShareCode(event.what, event.scheme, event.date);
  if (code === null) throw new ModelError("model.schemeNotAvailable");
  const rate = tradeRate(event);
  const price = num(event.pricePerShare);
  const dkk = event.tradeCurrency === "DKK";

  each(event.participants, (p, ctx) => {
    const shares = num(p.shares);
    const paid = p.paid === undefined ? marketValueOre(shares, price) : num(p.paid);
    const taxed = num(p.taxed, 0n);
    const costs = num(p.costs, 0n);
    // The acquisition sum is what was paid plus what was taxed. Payroll tax is always in DKK.
    const acquisitionDkk = (dkk ? paid : convertToDkk(paid, rate)) + taxed;
    const acquisitionTrade = dkk ? acquisitionDkk : taxed === 0n ? paid : convertFromDkk(acquisitionDkk, rate);
    const costsDkk = dkk ? costs : convertToDkk(costs, rate);
    const netTrade = acquisitionTrade + costs;
    const netDkk = acquisitionDkk + costsDkk;
    return {
      ...baseRow(ctx, event),
      ...compact({ FONDNOTANR: p.noteNumber ?? ctx.person.shareRegisterNo ?? birthDateOrCvr(ctx.person), DEPOTNR: p.depot }),
      STKANT: p.shares,
      AKTIPAPIRKURSPCT: event.pricePerShare,
      OMSVALKOD: event.tradeCurrency,
      KURVAEOMSVALBLB: acquisitionTrade.toString(),
      OMKOMSVALBLB: costs.toString(),
      NTOAFROMSVALBLB: netTrade.toString(),
      AFRVALKOD: event.settlementCurrency ?? event.tradeCurrency,
      NTOAFRAFRVALBLB: inSettlement(event, netTrade, netDkk).toString(),
      KURVAEBSKVALBLB: acquisitionDkk.toString(),
      OMKBSKVALBLB: costsDkk.toString(),
      NTOAFRBSKVALBLB: netDkk.toString(),
      VALKURSPCT: rate.toString(),
      KOEBSALGKOD: code,
    };
  });
}

function buybackRows(event: BuybackEvent, each: EachParticipant): void {
  const rate = tradeRate(event);
  const dkk = event.tradeCurrency === "DKK";

  each(event.participants, (p, ctx) => {
    const priceText = p.pricePerShare ?? event.pricePerShare;
    if (priceText === undefined) throw new ModelError("model.priceRequired");
    const value = marketValueOre(num(p.shares), num(priceText));
    const costs = num(p.costs, 0n);
    if (costs > value) throw new ModelError("model.costsExceedValue");
    const valueDkk = dkk ? value : convertToDkk(value, rate);
    const costsDkk = dkk ? costs : convertToDkk(costs, rate);
    // A sale: the seller's net is the value minus costs.
    const net = value - costs;
    const netDkk = valueDkk - costsDkk;
    return {
      ...baseRow(ctx, event),
      ...compact({ FONDNOTANR: p.noteNumber ?? ctx.person.shareRegisterNo ?? birthDateOrCvr(ctx.person), DEPOTNR: p.depot }),
      STKANT: p.shares,
      AKTIPAPIRKURSPCT: priceText,
      OMSVALKOD: event.tradeCurrency,
      KURVAEOMSVALBLB: value.toString(),
      OMKOMSVALBLB: costs.toString(),
      NTOAFROMSVALBLB: net.toString(),
      AFRVALKOD: event.settlementCurrency ?? event.tradeCurrency,
      NTOAFRAFRVALBLB: inSettlement(event, net, netDkk).toString(),
      KURVAEBSKVALBLB: valueDkk.toString(),
      OMKBSKVALBLB: costsDkk.toString(),
      NTOAFRBSKVALBLB: netDkk.toString(),
      VALKURSPCT: rate.toString(),
    };
  });
}

function investmentRows(event: InvestmentEvent, each: EachParticipant): void {
  each(event.participants, (p, ctx) => {
    const acquisition = num(p.acquisitionSum);
    const costs = num(p.costs, 0n);
    const viaFund = event.role === "targetCompany" && p.via === "fund";
    return {
      ...baseRow(ctx, event),
      ...compact({
        // The guidance: the investor's birth date or CVR/SE number.
        FONDNOTANR: p.noteNumber ?? birthDateOrCvr(ctx.person),
        DEPOTNR: p.depot,
        INVESTOREJERSKAB: event.role === "targetCompany" && p.priorOwnership ? OWNERSHIP_CODE[p.priorOwnership] : undefined,
      }),
      PAPIRTYPEKOD: event.role === "fund" || viaFund ? "4" : "3",
      KOEBSALGKOD: viaFund ? "R" : "K",
      STKANT: p.shares,
      AKTIPAPIRKURSPCT: p.nominalValue,
      KURVAEBSKVALBLB: acquisition.toString(),
      OMKBSKVALBLB: costs.toString(),
      NTOAFRBSKVALBLB: (acquisition + costs).toString(),
    };
  });
}

function liquidationRows(event: LiquidationEvent, each: EachParticipant): void {
  each(event.participants, (p, ctx) => ({
    ...baseRow(ctx, event),
    // May stay blank in a liquidation report, so nothing is derived.
    ...compact({ FONDNOTANR: p.noteNumber, DEPOTNR: p.depot }),
    STKANT: p.shares,
    NTOAFRBSKVALBLB: num(p.proceeds).toString(),
  }));
}

/** Runs a row builder for each participant, turning its problems into issues on that person. */
type EachParticipant = <P extends { readonly personId: string }>(
  participants: readonly P[],
  build: (participant: P, ctx: RowContext) => Row,
) => void;

const EVENT_SCENARIO: Readonly<Record<Exclude<ReportEvent["kind"], "imported">, Scenario>> = {
  employeeShares: "B",
  buyback: "A",
  investment: "C",
  liquidation: "D",
};

// ---------- Reports ----------

export interface ExpandedRow {
  readonly row: Row;
  readonly eventId: string;
  readonly personId?: string;
}

/** An issue, with the event and person it belongs to where known. */
export interface ReportIssue extends Issue {
  readonly eventId?: string;
  readonly personId?: string;
}

export interface ExpandedReport {
  readonly rows: readonly ExpandedRow[];
  /** Problems that stopped a row from being made. Always errors, except an empty event. */
  readonly problems: readonly ReportIssue[];
}

/** Turn a report's events into rows, in event and participant order. */
export function expandReport(project: Project, report: Report): ExpandedReport {
  const rows: ExpandedRow[] = [];
  const problems: ReportIssue[] = [];
  const persons = new Map(project.persons.map((p) => [p.id, p]));
  const securities = new Map(project.securities.map((s) => [s.id, s]));

  const problem = (e: unknown, eventId: string, personId?: string) => {
    if (!(e instanceof ModelError)) throw e;
    problems.push({ rule: e.rule, severity: "error", eventId, ...(personId ? { personId } : {}), params: e.params });
  };

  for (const event of report.events) {
    if (event.kind === "imported") {
      for (const row of event.rows) rows.push({ row, eventId: event.id });
      continue;
    }
    if (EVENT_SCENARIO[event.kind] !== report.scenario) {
      problems.push({ rule: "model.wrongEventKind", severity: "error", eventId: event.id });
      continue;
    }
    const security = securities.get(event.securityId);
    if (!security) {
      problems.push({ rule: "model.unknownSecurity", severity: "error", eventId: event.id });
      continue;
    }
    if (event.participants.length === 0) {
      problems.push({ rule: "model.noParticipants", severity: "warning", eventId: event.id });
    }

    const each: EachParticipant = (participants, build) => {
      for (const p of participants) {
        const person = persons.get(p.personId);
        if (!person) {
          problems.push({ rule: "model.unknownPerson", severity: "error", eventId: event.id, personId: p.personId });
          continue;
        }
        try {
          const row = applyScenario(build(p, { project, report, person, security }), report.scenario);
          rows.push({ row, eventId: event.id, personId: person.id });
        } catch (e) {
          problem(e, event.id, person.id);
        }
      }
    };

    try {
      switch (event.kind) {
        case "employeeShares": employeeRows(event, each); break;
        case "buyback": buybackRows(event, each); break;
        case "investment": investmentRows(event, each); break;
        case "liquidation": liquidationRows(event, each); break;
      }
    } catch (e) {
      problem(e, event.id);
    }
  }
  return { rows, problems };
}

/** Who the file is sent by: the advisor if one is set, otherwise the company itself. */
export function senderOf(project: Project): Sender {
  return project.sender ?? project.company;
}

function checkSender(sender: Sender): ReportIssue[] {
  const issues: ReportIssue[] = [];
  if (!/^\d{1,8}$/.test(sender.seNumber.trim())) issues.push({ rule: "sender.seInvalid", severity: "error" });
  if (sender.name.trim().length > 27) issues.push({ rule: "sender.nameTooLong", severity: "error", params: { max: 27 } });
  if (sender.address.trim().length > 35) issues.push({ rule: "sender.addressTooLong", severity: "error", params: { max: 35 } });
  return issues;
}

/** Every problem in a report, each tied to its event and person where possible. */
export function checkReport(project: Project, report: Report): ReportIssue[] {
  const { rows, problems } = expandReport(project, report);
  const validated = validateRows(rows.map((r) => r.row), { scenario: report.scenario, incomeYear: report.incomeYear });
  const fileEmpty = rows.length === 0 && problems.length > 0;
  return [
    ...checkSender(senderOf(project)),
    ...problems,
    ...validated
      .filter((issue) => !(fileEmpty && issue.rule === "file.empty"))
      .map((issue): ReportIssue => {
        const source = issue.row === undefined ? undefined : rows[issue.row];
        return {
          ...issue,
          ...(source ? { eventId: source.eventId } : {}),
          ...(source?.personId ? { personId: source.personId } : {}),
        };
      }),
  ];
}

/** The report's file as text. Check it with checkReport first. */
export function buildReportFile(project: Project, report: Report): string {
  const { rows } = expandReport(project, report);
  return buildFile({
    sender: senderOf(project),
    rows: rows.map((r) => r.row),
    version: TEMPLATE_VERSION[report.scenario],
  });
}

/** The report's file as the bytes to upload (Windows-1252). */
export function buildReportBytes(project: Project, report: Report): Uint8Array {
  return encodeWindows1252(buildReportFile(project, report));
}

/** A descriptive file name, e.g. `MedAK_2278_B_2026_12345674.txt`. */
export function reportFileName(project: Project, report: Report): string {
  return `MedAK_2278_${report.scenario}_${report.incomeYear}_${project.company.seNumber}.txt`;
}

/**
 * Totals to compare with SKAT's receipt, which shows a number of records and an amount.
 * The amount is the net settlement in DKK (felt 29), minus for reversals. Which amount the
 * receipt shows is not documented, so confirm against a real upload.
 */
export function reportTotals(project: Project, report: Report): { records: number; totalDkkOre: bigint } {
  const { rows } = expandReport(project, report);
  let total = 0n;
  for (const { row } of rows) {
    const amount = /^\d+$/.test(row.NTOAFRBSKVALBLB ?? "") ? BigInt(row.NTOAFRBSKVALBLB!) : 0n;
    total += row.NTOAFRBSKVALFTG === "-" ? -amount : amount;
  }
  return { records: rows.length, totalDkkOre: total };
}
