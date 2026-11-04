import {
  classifyId, isPlausibleCpr, isValidCvr, isValidDateDmy, isValidDateYmd, isValidIsin, isValidTime,
} from "./checks.ts";
import { type Scenario, TRANSACTION_CODES } from "./codes.ts";
import { unencodableCharacters } from "./encoding.ts";
import { AMOUNT_FIELDS, FIELDS, type FieldKey, FOREIGN_OWNER_FIELDS, SIGN_FIELDS } from "./fields.ts";
import { formatField, type Row } from "./record.ts";
import { ruleFor } from "./scenarios.ts";
import { convertToDkk, marketValueOre } from "./units.ts";

export type Severity = "error" | "warning";

/** Identifiers of validation rules. Messages for each are in messages.ts. */
export type RuleId =
  | "format.tooLong" | "format.notDigits" | "format.controlCharacter" | "format.encoding"
  | "rule.fixed" | "rule.mustBeBlank" | "rule.notInList" | "required"
  | "opsenr.invalid" | "opsenr.checksum"
  | "id.missing" | "id.invalid" | "id.cvrChecksum" | "id.employeeNeedsCpr"
  | "date.invalid" | "time.invalid" | "year.invalid"
  | "year.tradeDateMismatch" | "year.valueDateMismatch" | "date.valueDateDiffers"
  | "year.differsFromReport" | "file.mixedYears" | "file.empty"
  | "isin.invalid" | "isin.requiredWhenListed" | "asid.invalid"
  | "owner.domesticHasForeignData" | "owner.foreignNeedsCountry" | "owner.foreignCountryIsDk"
  | "owner.tinTypeMissing" | "owner.tinMissing" | "owner.tinBirthDateInvalid"
  | "owner.birthPlaceMissing" | "owner.birthCountryMissing" | "owner.nameMissing"
  | "owner.addressMissing" | "owner.townMissing" | "owner.countryNameMissing"
  | "sign.minusNeedsCorrection" | "sign.mixed"
  | "amount.dkkRateNot100" | "amount.dkkFieldsDiffer" | "amount.marketValueMismatch"
  | "amount.dkkConversionMismatch" | "amount.netMismatch" | "amount.proceedsMissing"
  | "quantity.zero"
  | "code.notValidOnDate" | "code.securityTypeMismatch"
  | "investorOwnership.required" | "investorOwnership.notForFund"
  | "sender.seInvalid" | "sender.nameTooLong" | "sender.addressTooLong"
  | "model.unknownPerson" | "model.unknownSecurity" | "model.rateRequired"
  | "model.schemeNotAvailable" | "model.invalidNumber" | "model.priceRequired"
  | "model.costsExceedValue" | "model.wrongEventKind" | "model.noParticipants";

export interface Issue {
  readonly rule: RuleId;
  readonly severity: Severity;
  /** The field the issue is about, if one. */
  readonly field?: FieldKey;
  /** SKAT's intake-test error code that this check anticipates (Bilag 4), if any. */
  readonly skatCode?: string;
  /** Values for the message template. */
  readonly params?: Readonly<Record<string, string | number>>;
  /** 0-based index of the row in the list passed to validateRows. */
  readonly row?: number;
}

export interface ValidateOptions {
  readonly scenario: Scenario;
  /** Income year of the report, if already chosen; every row must match it. */
  readonly incomeYear?: string;
}

/** Fields every scenario requires (after fixed values are applied). */
const REQUIRED_ALL: readonly FieldKey[] = [
  "OPSENR", "EJERSTATUKOD", "RETTEKOD", "PAPIRIDENTNVN", "PAPIRTYPEKOD", "PAPIRLANDKOD",
  ...SIGN_FIELDS, "STKANT", "AKTIPAPIRKURSPCT", "OMSVALKOD", "AFRVALKOD",
  ...AMOUNT_FIELDS.map(([amount]) => amount), "VALKURSPCT", "HANDEDTO", "VALOEDTO", "INDKAAR",
  "KOEBSALGKOD", "ASIDNR", "OPTAGHANDEKOD", "DEPOTTYPEKOD", "HANDETID",
];

const REQUIRED_EXTRA: Readonly<Record<Scenario, readonly FieldKey[]>> = {
  A: ["FONDNOTANR"],
  B: ["FONDNOTANR"],
  C: ["FONDNOTANR"],
  D: [],
};

const v = (row: Row, key: FieldKey): string => (row[key] ?? "").trim();
const big = (s: string): bigint => (/^\d+$/.test(s) ? BigInt(s) : 0n);

/** True when |a − b| is above both 100 øre and 0.1 % of the larger value. */
function differsMaterially(a: bigint, b: bigint): boolean {
  const diff = a > b ? a - b : b - a;
  const larger = a > b ? a : b;
  return diff > 100n && diff * 1000n > larger;
}

/**
 * Check one row against the format, the scenario's field rules and SKAT's documented
 * business rules. Returns all issues found; an empty list means the row is ready.
 */
export function validateRow(row: Row, { scenario, incomeYear }: ValidateOptions): Issue[] {
  const issues: Issue[] = [];
  const add = (issue: Issue) => issues.push(issue);

  // 1. Format and scenario rules per field.
  for (const def of FIELDS) {
    if (def.key === "FILLER") continue;
    const value = v(row, def.key);
    const written = formatField(def, value);
    if (typeof written !== "string") {
      const rule = (`format.${written.reason}`) as RuleId;
      add({ rule, severity: "error", field: def.key, params: { value, max: def.length } });
      continue;
    }
    if (def.padding !== "numeric") {
      const bad = unencodableCharacters(value);
      if (bad.length > 0) add({ rule: "format.encoding", severity: "error", field: def.key, params: { chars: bad.join(" ") } });
    }
    const rule = ruleFor(scenario, def.key);
    if (rule.kind === "fixed") {
      if (written !== formatField(def, rule.value)) {
        add({ rule: "rule.fixed", severity: "error", field: def.key, params: { value, expected: rule.value } });
      }
    } else if (rule.kind === "blank") {
      if (value !== "") add({ rule: "rule.mustBeBlank", severity: "error", field: def.key, params: { value } });
    } else if (rule.kind === "list") {
      if (value !== "" && !rule.values.includes(value)) {
        add({ rule: "rule.notInList", severity: "error", field: def.key, params: { value, allowed: rule.values.length <= 10 ? rule.values.join(", ") : "" } });
      }
    }
  }

  // 2. Required fields.
  for (const key of [...REQUIRED_ALL, ...REQUIRED_EXTRA[scenario]]) {
    if (v(row, key) === "" && ruleFor(scenario, key).kind !== "blank") {
      add({ rule: "required", severity: "error", field: key, ...(key === "FONDNOTANR" ? { skatCode: "197" } : key === "PAPIRIDENTNVN" ? { skatCode: "189" } : {}) });
    }
  }

  // 3. Reporting company.
  const opsenr = v(row, "OPSENR");
  if (opsenr !== "") {
    if (!/^\d{8}$/.test(opsenr)) add({ rule: "opsenr.invalid", severity: "error", field: "OPSENR", skatCode: "017", params: { value: opsenr } });
    else if (!isValidCvr(opsenr)) add({ rule: "opsenr.checksum", severity: "warning", field: "OPSENR", skatCode: "187", params: { value: opsenr } });
  }

  // 4. Person or company reported on (field 11) and owner status.
  const status = v(row, "EJERSTATUKOD");
  const idValue = v(row, "PNRSENR");
  if (idValue === "") {
    if (status !== "1") add({ rule: "id.missing", severity: "error", field: "PNRSENR", skatCode: "058" });
  } else {
    const { kind, normalized } = classifyId(idValue);
    if (kind === "invalid" || (kind === "cpr" && !isPlausibleCpr(normalized))) {
      add({ rule: "id.invalid", severity: "error", field: "PNRSENR", skatCode: "057", params: { value: idValue } });
    } else if (kind === "cvr" && !isValidCvr(normalized)) {
      add({ rule: "id.cvrChecksum", severity: "warning", field: "PNRSENR", skatCode: "057", params: { value: normalized } });
    }
    if (scenario === "B" && kind === "cvr") {
      add({ rule: "id.employeeNeedsCpr", severity: "warning", field: "PNRSENR", skatCode: "396" });
    }
  }

  if (status === "0") {
    for (const key of FOREIGN_OWNER_FIELDS) {
      if (v(row, key) !== "") {
        add({ rule: "owner.domesticHasForeignData", severity: "error", field: key, skatCode: "233" });
      }
    }
  } else if (status === "1") {
    const country = v(row, "LANDKOD");
    if (country === "") add({ rule: "owner.foreignNeedsCountry", severity: "error", field: "LANDKOD", skatCode: "039" });
    else if (country === "DK") add({ rule: "owner.foreignCountryIsDk", severity: "error", field: "LANDKOD", skatCode: "039" });

    const tinType = v(row, "TINNRTYPEKOD");
    const tin = v(row, "TINNR");
    if (tinType === "") add({ rule: "owner.tinTypeMissing", severity: "error", field: "TINNRTYPEKOD", skatCode: "239" });
    if (tinType === "1" && tin === "") add({ rule: "owner.tinMissing", severity: "error", field: "TINNR", skatCode: "238" });
    if (tinType === "2") {
      if (!isValidDateDmy(tin)) add({ rule: "owner.tinBirthDateInvalid", severity: "error", field: "TINNR", skatCode: "240", params: { value: tin } });
      if (v(row, "FOEDESTEDNVN") === "") add({ rule: "owner.birthPlaceMissing", severity: "error", field: "FOEDESTEDNVN", skatCode: "235" });
      if (v(row, "FOEDELANDKOD") === "") add({ rule: "owner.birthCountryMissing", severity: "error", field: "FOEDELANDKOD", skatCode: "236" });
    }
    if (v(row, "PERSFORNVN") === "") add({ rule: "owner.nameMissing", severity: "error", field: "PERSFORNVN", skatCode: "242" });
    if (v(row, "PERSEFTERNVN") === "") add({ rule: "owner.nameMissing", severity: "error", field: "PERSEFTERNVN", skatCode: "243" });
    if (v(row, "VEJNVN") === "" && v(row, "POSTBOXADR") === "") add({ rule: "owner.addressMissing", severity: "error", field: "VEJNVN", skatCode: "244" });
    if (v(row, "POSTDISTRADR") === "") add({ rule: "owner.townMissing", severity: "error", field: "POSTDISTRADR", skatCode: "245" });
    if (v(row, "LANDENVN") === "") add({ rule: "owner.countryNameMissing", severity: "error", field: "LANDENVN" });
  }

  // 5. Signs and corrections.
  const correction = v(row, "RETTEKOD");
  const chosenSigns = SIGN_FIELDS.filter((k) => ruleFor(scenario, k).kind !== "fixed").map((k) => v(row, k));
  if (correction === "0" && SIGN_FIELDS.some((k) => v(row, k) === "-")) {
    add({ rule: "sign.minusNeedsCorrection", severity: "error", field: "STKFTG", skatCode: "072" });
  }
  if (new Set(chosenSigns.filter((s) => s !== "")).size > 1) {
    add({ rule: "sign.mixed", severity: "warning", field: "STKFTG", skatCode: "327" });
  }

  // 6. Dates, times and years.
  const tradeDate = v(row, "HANDEDTO");
  const valueDate = v(row, "VALOEDTO");
  const year = v(row, "INDKAAR");
  if (tradeDate !== "" && !isValidDateYmd(tradeDate)) add({ rule: "date.invalid", severity: "error", field: "HANDEDTO", skatCode: "205", params: { value: tradeDate } });
  if (scenario !== "D" && valueDate !== "" && !isValidDateYmd(valueDate)) add({ rule: "date.invalid", severity: "error", field: "VALOEDTO", skatCode: "206", params: { value: valueDate } });
  const time = v(row, "HANDETID");
  if (time !== "" && !isValidTime(time)) add({ rule: "time.invalid", severity: "error", field: "HANDETID", skatCode: "312", params: { value: time } });
  if (year !== "" && !/^(19|20)\d{2}$/.test(year)) add({ rule: "year.invalid", severity: "error", field: "INDKAAR", params: { value: year } });
  if (/^\d{4}$/.test(year)) {
    if (isValidDateYmd(tradeDate) && tradeDate.slice(0, 4) !== year) {
      add({ rule: "year.tradeDateMismatch", severity: "error", field: "HANDEDTO", skatCode: "207", params: { year, value: tradeDate } });
    }
    if (scenario !== "D" && isValidDateYmd(valueDate) && valueDate.slice(0, 4) !== year) {
      add({ rule: "year.valueDateMismatch", severity: "error", field: "VALOEDTO", skatCode: "208", params: { year, value: valueDate } });
    }
    if (incomeYear !== undefined && year !== incomeYear) {
      add({ rule: "year.differsFromReport", severity: "error", field: "INDKAAR", params: { year: incomeYear, value: year } });
    }
  }
  if (scenario !== "D" && isValidDateYmd(tradeDate) && isValidDateYmd(valueDate) && tradeDate !== valueDate) {
    add({ rule: "date.valueDateDiffers", severity: "warning", field: "VALOEDTO" });
  }

  // 7. Security identification.
  const isin = v(row, "ISINKOD");
  if (isin !== "" && !isValidIsin(isin)) add({ rule: "isin.invalid", severity: "error", field: "ISINKOD", skatCode: "282", params: { value: isin } });
  if (isin === "" && v(row, "OPTAGHANDEKOD") === "1" && ruleFor(scenario, "ISINKOD").kind !== "blank") {
    add({ rule: "isin.requiredWhenListed", severity: "error", field: "ISINKOD", skatCode: "281" });
  }
  const asid = v(row, "ASIDNR");
  if (asid !== "" && !/^\d{5}$/.test(asid)) add({ rule: "asid.invalid", severity: "error", field: "ASIDNR", skatCode: "270", params: { value: asid } });

  // 8. Transaction codes.
  const code = v(row, "KOEBSALGKOD");
  const codeDef = TRANSACTION_CODES.find((c) => c.code === code);
  if (codeDef && isValidDateYmd(tradeDate)) {
    if ((codeDef.validFrom && tradeDate < codeDef.validFrom) || (codeDef.validTo && tradeDate > codeDef.validTo)) {
      add({
        rule: "code.notValidOnDate", severity: "error", field: "KOEBSALGKOD", skatCode: "304",
        params: { value: code, from: codeDef.validFrom ?? "", to: codeDef.validTo ?? "" },
      });
    }
  }
  if (scenario === "C") {
    const type = v(row, "PAPIRTYPEKOD");
    const ownership = v(row, "INVESTOREJERSKAB");
    if (type === "3" && code === "R") add({ rule: "code.securityTypeMismatch", severity: "error", field: "KOEBSALGKOD", skatCode: "399" });
    const targetCompanyReports = (code === "K" && type === "3") || (code === "R" && type === "4");
    if (targetCompanyReports && ownership === "") add({ rule: "investorOwnership.required", severity: "error", field: "INVESTOREJERSKAB", skatCode: "392" });
    if (code === "K" && type === "4" && ownership !== "") add({ rule: "investorOwnership.notForFund", severity: "error", field: "INVESTOREJERSKAB", skatCode: "397" });
  }

  // 9. Amounts.
  const qty = v(row, "STKANT");
  if (/^0+$/.test(qty)) add({ rule: "quantity.zero", severity: "warning", field: "STKANT", skatCode: "191" });

  const tradeCcy = v(row, "OMSVALKOD");
  const settleCcy = v(row, "AFRVALKOD");
  const rate = v(row, "VALKURSPCT");
  if (scenario === "A" || scenario === "B") {
    if (tradeCcy === "DKK" && /^\d+$/.test(rate) && big(rate) !== 100_000_000n) {
      add({ rule: "amount.dkkRateNot100", severity: "error", field: "VALKURSPCT", skatCode: "195", params: { value: rate } });
    }
    const value = big(v(row, "KURVAEOMSVALBLB"));
    if (scenario === "A" && /^\d+$/.test(qty) && /^\d+$/.test(v(row, "AKTIPAPIRKURSPCT"))) {
      const expected = marketValueOre(big(qty), big(v(row, "AKTIPAPIRKURSPCT")));
      if (differsMaterially(value, expected)) {
        add({ rule: "amount.marketValueMismatch", severity: "warning", field: "KURVAEOMSVALBLB", params: { expected: expected.toString() } });
      }
    }
    if (/^\d+$/.test(rate) && big(rate) > 0n) {
      const expected = convertToDkk(value, big(rate));
      if (differsMaterially(big(v(row, "KURVAEBSKVALBLB")), expected)) {
        add({ rule: "amount.dkkConversionMismatch", severity: "warning", field: "KURVAEBSKVALBLB", params: { expected: expected.toString() } });
      }
    }
    const noCosts = big(v(row, "OMKOMSVALBLB")) === 0n && big(v(row, "OMKBSKVALBLB")) === 0n;
    if (scenario === "B" && tradeCcy === "DKK" && settleCcy === "DKK" && noCosts) {
      const keys = ["KURVAEOMSVALBLB", "NTOAFROMSVALBLB", "NTOAFRAFRVALBLB", "KURVAEBSKVALBLB", "NTOAFRBSKVALBLB"] as const;
      if (new Set(keys.map((k) => big(v(row, k)))).size > 1) {
        add({ rule: "amount.dkkFieldsDiffer", severity: "warning", field: "KURVAEOMSVALBLB" });
      }
    }
  }
  if (scenario === "C") {
    const net = big(v(row, "NTOAFRBSKVALBLB"));
    const sum = big(v(row, "KURVAEBSKVALBLB")) + big(v(row, "OMKBSKVALBLB"));
    if (net !== sum) add({ rule: "amount.netMismatch", severity: "error", field: "NTOAFRBSKVALBLB", params: { expected: sum.toString() } });
  }
  if (scenario === "D" && big(v(row, "NTOAFRBSKVALBLB")) === 0n) {
    add({ rule: "amount.proceedsMissing", severity: "error", field: "NTOAFRBSKVALBLB" });
  }

  return issues;
}

/**
 * Validate all rows of one report, including checks across rows. Each issue carries the
 * 0-based index of its row.
 */
export function validateRows(rows: readonly Row[], options: ValidateOptions): Issue[] {
  const issues: Issue[] = [];
  if (rows.length === 0) issues.push({ rule: "file.empty", severity: "error" });
  rows.forEach((row, i) => {
    for (const issue of validateRow(row, options)) issues.push({ ...issue, row: i });
  });
  const years = new Set(rows.map((r) => v(r, "INDKAAR")).filter((y) => y !== ""));
  if (years.size > 1) {
    issues.push({ rule: "file.mixedYears", severity: "error", field: "INDKAAR", params: { years: [...years].sort().join(", ") } });
  }
  return issues;
}

/** True when the issues contain no errors (warnings are allowed). */
export function isReady(issues: readonly Issue[]): boolean {
  return !issues.some((i) => i.severity === "error");
}
