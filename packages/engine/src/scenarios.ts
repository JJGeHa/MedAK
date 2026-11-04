import type { Scenario } from "./codes.ts";
import { TRANSACTION_CODES } from "./codes.ts";
import { COUNTRY_CODES, CURRENCY_CODES, FOREIGN_COUNTRY_CODES } from "./data/lists.ts";
import { FIELDS, type FieldKey, SIGN_FIELDS } from "./fields.ts";
import type { Row } from "./record.ts";

/**
 * What a scenario allows in a field. Mirrors the hidden "Konfiguration" sheet of SKAT's
 * template, corrected where the guidance (version 1.9) says otherwise.
 */
export type FieldRule =
  | { readonly kind: "fixed"; readonly value: string }
  | { readonly kind: "blank" }
  | { readonly kind: "list"; readonly values: readonly string[] }
  | { readonly kind: "free" };

const fixed = (value: string): FieldRule => ({ kind: "fixed", value });
const list = (values: readonly string[]): FieldRule => ({ kind: "list", values });
const BLANK: FieldRule = { kind: "blank" };
const FREE: FieldRule = { kind: "free" };
const SIGNS = list(["+", "-"]);

const codesFor = (s: Scenario) => TRANSACTION_CODES.filter((c) => c.scenarios.includes(s)).map((c) => c.code);

/** Rules shared by all scenarios before scenario-specific overrides. */
const COMMON: Partial<Record<FieldKey, FieldRule>> = {
  INDVNR: fixed("2278"),
  BANKRGISTNR: BLANK,
  EJERSTATUKOD: list(["0", "1"]),
  RETTEKOD: list(["0", "1", "2"]),
  ...Object.fromEntries(SIGN_FIELDS.map((k) => [k, SIGNS])),
  TINNRTYPEKOD: list(["1", "2", "3"]),
  FOEDELANDKOD: list(COUNTRY_CODES),
  LANDKOD: list(FOREIGN_COUNTRY_CODES),
  DEPOTTYPEKOD: fixed("0"),
  INVESTOREJERSKAB: BLANK,
  EJERANDELRKOPCT: BLANK,
  FILLER: BLANK,
};

/** A and B: real trades in any currency. */
const TRADES: Partial<Record<FieldKey, FieldRule>> = {
  ...COMMON,
  PAPIRTYPEKOD: fixed("1"),
  PAPIRLANDKOD: list(COUNTRY_CODES),
  OMSVALKOD: list(CURRENCY_CODES),
  AFRVALKOD: list(CURRENCY_CODES),
  OPTAGHANDEKOD: list(["1", "2"]),
};

const OVERRIDES: Readonly<Record<Scenario, Partial<Record<FieldKey, FieldRule>>>> = {
  A: { ...TRADES, KOEBSALGKOD: fixed("S") },
  B: { ...TRADES, KOEBSALGKOD: list(codesFor("B")) },
  C: {
    ...COMMON,
    ISINKOD: BLANK,
    PAPIRTYPEKOD: list(["3", "4"]),
    PAPIRLANDKOD: fixed("DK"),
    OMSVALKOD: fixed("DKK"),
    KURVAEOMSVALBLB: fixed("0"),
    OMKOMSVALBLB: fixed("0"),
    NTOAFROMSVALBLB: fixed("0"),
    AFRVALKOD: fixed("DKK"),
    NTOAFRAFRVALBLB: fixed("0"),
    VALKURSPCT: fixed("100000000"),
    // The template offers 1, 2 and 3; the investorfradrag guidance allows only 1 and 2.
    TINNRTYPEKOD: list(["1", "2"]),
    KOEBSALGKOD: list(codesFor("C")),
    ASIDNR: fixed("00000"),
    OPTAGHANDEKOD: fixed("2"),
    INVESTOREJERSKAB: list(["1", "2", "3"]),
  },
  D: {
    ...COMMON,
    PAPIRTYPEKOD: list(["1", "5"]),
    PAPIRLANDKOD: fixed("DK"),
    // Only the quantity and proceeds signs are chosen; the template locks the rest to "+".
    KURVAEOMSVALFTG: fixed("+"),
    OMKOMSVALFTG: fixed("+"),
    NTOAFROMSVALFTG: fixed("+"),
    NTOAFRAFRVALFTG: fixed("+"),
    KURVAEBSKVALFTG: fixed("+"),
    OMKBSKVALFTG: fixed("+"),
    // Written as the template's own literal: its "Dan fil" check wants at least 7 digits here.
    AKTIPAPIRKURSPCT: fixed("0000000"),
    OMSVALKOD: fixed("DKK"),
    KURVAEOMSVALBLB: fixed("0"),
    OMKOMSVALBLB: fixed("0"),
    NTOAFROMSVALBLB: fixed("0"),
    AFRVALKOD: fixed("DKK"),
    NTOAFRAFRVALBLB: fixed("0"),
    KURVAEBSKVALBLB: fixed("0"),
    OMKBSKVALBLB: fixed("0"),
    VALKURSPCT: fixed("100000000"),
    VALOEDTO: fixed("00000000"),
    KOEBSALGKOD: fixed("L"),
    OPTAGHANDEKOD: list(["1", "2"]),
  },
};

/** The rule for a field in a scenario. Fields without a specific rule are free input. */
export function ruleFor(scenario: Scenario, key: FieldKey): FieldRule {
  return OVERRIDES[scenario][key] ?? FREE;
}

/** Values filled in when the user leaves a field empty (the guidance's documented defaults). */
export const DEFAULTS: Readonly<Record<Scenario, Partial<Record<FieldKey, string>>>> = {
  A: { RETTEKOD: "0", HANDETID: "120000" },
  B: { RETTEKOD: "0", HANDETID: "120000" },
  C: { RETTEKOD: "0", HANDETID: "150000" },
  D: { RETTEKOD: "0", HANDETID: "120000", ASIDNR: "00000" },
};

/**
 * Fill fixed values and defaults, and clear fields that must be blank, the way SKAT's
 * template does when column B is filled. Values the user typed in free or list fields
 * are left alone.
 */
export function applyScenario(row: Row, scenario: Scenario): Row {
  const out: Row = { ...row };
  for (const { key } of FIELDS) {
    const rule = ruleFor(scenario, key);
    if (rule.kind === "fixed") out[key] = rule.value;
    else if (rule.kind === "blank") delete out[key];
    else if ((out[key] ?? "").trim() === "") {
      const def = DEFAULTS[scenario][key];
      if (def !== undefined) out[key] = def;
    }
  }
  return out;
}
