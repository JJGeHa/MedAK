/**
 * The project model: what the user describes (company, shares, people, events), as opposed
 * to the rows SKAT's file stores. See docs/data-model.md. `expandReport` turns this into rows.
 *
 * The model is plain JSON, because it is saved as a project file the user keeps. Numbers are
 * therefore digit strings in the same units as the file:
 * - `Ore`: money with 2 implied decimals ("1886250" = 18.862,50)
 * - `Decimal6`: quantities, prices and rates with 6 implied decimals ("15000000" = 15)
 */
import type { Scenario } from "../codes.ts";
import type { Sender } from "../file.ts";
import type { Row } from "../record.ts";

export type Ore = string;
export type Decimal6 = string;
/** A date as `YYYY-MM-DD` (what `<input type="date">` gives). */
export type IsoDate = string;

export interface Company {
  /** 8-digit CVR or SE number of the reporting company. */
  readonly seNumber: string;
  readonly name: string;
  readonly address: string;
}

export interface Security {
  readonly id: string;
  /** Full name, e.g. "Nordlys Software ApS B-anparter". Keep it identical year to year. */
  readonly name: string;
  readonly isin?: string;
  /** ISO country of the issuing company. */
  readonly issuerCountry: string;
  /** Admitted to trading on a regulated market or multilateral trading facility. */
  readonly listed: boolean;
  /** Only liquidation reports distinguish these. Defaults to shares. */
  readonly kind?: "shares" | "cooperativeCertificates";
  /** Euronext Securities AS-ident. When absent, derived per the guidance (88888 or 00000). */
  readonly asIdent?: string;
}

/** How a person or company abroad is identified. */
export type Identification =
  | { readonly type: "tin"; readonly tin: string }
  | { readonly type: "birth"; readonly birthDate: IsoDate; readonly birthCountry: string; readonly birthPlace?: string }
  | { readonly type: "missing" };

/** Identity and address of an owner resident abroad (fields 35 and 38–56). */
export interface ForeignOwner {
  readonly identification: Identification;
  /** A company's name is written in both the first-name and last-name field. */
  readonly names:
    | { readonly kind: "person"; readonly first: string; readonly last: string }
    | { readonly kind: "company"; readonly name: string };
  readonly careOf?: string;
  readonly street?: string;
  readonly houseNumber?: string;
  readonly floor?: string;
  readonly door?: string;
  readonly poBox?: string;
  readonly village?: string;
  readonly postcode?: string;
  readonly town: string;
  readonly houseName?: string;
  readonly apartment?: string;
  readonly region?: string;
  readonly countryName: string;
  /** ISO country of residence. */
  readonly country: string;
}

export interface Person {
  readonly id: string;
  /** Shown in the app and the review only; a resident's name is not part of the file. */
  readonly displayName?: string;
  /** Danish CPR, CVR or SE number. May be absent only for someone abroad. */
  readonly danishId?: string;
  /** Present when the person or company lives abroad. */
  readonly abroad?: ForeignOwner;
  /** Number in the company's shareholder register, if numbered. */
  readonly shareRegisterNo?: string;
}

/** Fields shared by the events of scenarios A, B and D. */
interface EventBase {
  readonly id: string;
  /** The date the right was acquired, or the payout date. */
  readonly date: IsoDate;
  /** `HHMMSS`. Defaults to the time the guidance prescribes when unknown. */
  readonly time?: string;
  readonly securityId: string;
  /** Overrides the security's listing status for this event, e.g. a listing during the year. */
  readonly listed?: boolean;
}

interface Currencies {
  /** The currency the shares are priced in. */
  readonly tradeCurrency: string;
  /** Defaults to the trade currency. */
  readonly settlementCurrency?: string;
  /** DKK per 100 of the trade currency. Required unless the trade currency is DKK. */
  readonly exchangeRate?: Decimal6;
  /** DKK per 100 of the settlement currency, if it is neither DKK nor the trade currency. */
  readonly settlementRate?: Decimal6;
}

/** Fields shared by every participant. */
interface ParticipantBase {
  readonly personId: string;
  /** Number of shares. */
  readonly shares: Decimal6;
  /** Contract note number. When absent, derived per the guidance where it allows that. */
  readonly noteNumber?: string;
  /** Custody account number; rarely used. */
  readonly depot?: string;
}

/** What happened, in the words of the first question in flow B. */
export type EmployeeShareWhat = "pay" | "options" | "matching";

/** Which rules a B event falls under; together with the date this gives SKAT's code. */
export type EmployeeShareScheme =
  | "lp7-10" // LL § 7 P, up to 10 % of annual salary
  | "lp7-20" // LL § 7 P, up to 20 % of annual salary
  | "lp7-uncapped" // LL § 7 P, 4th sentence: up to 50 % until 30.06.2026, no cap from 01.07.2026
  | "ll16" // LL § 16, taxed as ordinary salary
  | "ll28"; // LL § 28, exercise of purchase or subscription rights

export interface EmployeeParticipant extends ParticipantBase {
  /** Amount taxed through payroll (eIndkomst), always in DKK. Defaults to 0. */
  readonly taxed?: Ore;
  /** Amount the person paid, in the trade currency. Defaults to shares × price per share. */
  readonly paid?: Ore;
  /** Costs in the trade currency. Defaults to 0. */
  readonly costs?: Ore;
}

/** Scenario B: employees got shares as pay, exercised rights, or bought with matching shares. */
export interface EmployeeShareEvent extends EventBase, Currencies {
  readonly kind: "employeeShares";
  readonly what: EmployeeShareWhat;
  /** Required unless `what` is "matching". */
  readonly scheme?: EmployeeShareScheme;
  /** What the employees paid per share; 0 if free. */
  readonly pricePerShare: Decimal6;
  readonly participants: readonly EmployeeParticipant[];
}

export interface BuybackParticipant extends ParticipantBase {
  /** Overrides the event's price when sellers got different prices. */
  readonly pricePerShare?: Decimal6;
  /** Costs in the trade currency. Defaults to 0. */
  readonly costs?: Ore;
}

/** Scenario A: the company buys back its own shares from people or companies. */
export interface BuybackEvent extends EventBase, Currencies {
  readonly kind: "buyback";
  readonly pricePerShare?: Decimal6;
  readonly participants: readonly BuybackParticipant[];
}

/** Did the investor own shares in the target company in the last 3 years? */
export type PriorOwnership = "owned" | "none" | "followOn";

export interface InvestmentParticipant extends ParticipantBase {
  /** Total nominal value of the shares or units (6 implied decimals). */
  readonly nominalValue: Decimal6;
  /** Acquisition sum in DKK. */
  readonly acquisitionSum: Ore;
  /** Costs in DKK. Defaults to 0. */
  readonly costs?: Ore;
  /** For a target company: a direct investment, or an investment by a fund. Defaults to direct. */
  readonly via?: "direct" | "fund";
  /** Required when the target company reports; never for a fund. */
  readonly priorOwnership?: PriorOwnership;
}

/** Scenario C: capital contributions giving investor deduction. Always DKK and unlisted. */
export interface InvestmentEvent {
  readonly kind: "investment";
  readonly id: string;
  readonly date: IsoDate;
  readonly time?: string;
  readonly securityId: string;
  /** Who is reporting. */
  readonly role: "targetCompany" | "fund";
  readonly participants: readonly InvestmentParticipant[];
}

export interface LiquidationParticipant extends ParticipantBase {
  /** This shareholder's share of the proceeds, in DKK. */
  readonly proceeds: Ore;
}

/** Scenario D: liquidation proceeds paid out to shareholders. */
export interface LiquidationEvent extends EventBase {
  readonly kind: "liquidation";
  readonly participants: readonly LiquidationParticipant[];
}

/**
 * Rows kept exactly as they were, e.g. from an imported file where they could not be
 * described as an event without changing a byte (corrections, unusual amounts).
 */
export interface ImportedEvent {
  readonly kind: "imported";
  readonly id: string;
  readonly rows: readonly Row[];
}

export type ReportEvent = EmployeeShareEvent | BuybackEvent | InvestmentEvent | LiquidationEvent | ImportedEvent;

/** One report: one scenario and one income year, which becomes one file. */
export interface Report {
  readonly id: string;
  readonly scenario: Scenario;
  readonly incomeYear: string;
  readonly events: readonly ReportEvent[];
}

export const PROJECT_FORMAT = "medak-project";
export const PROJECT_VERSION = 1;

export interface Project {
  readonly format: typeof PROJECT_FORMAT;
  readonly version: typeof PROJECT_VERSION;
  readonly company: Company;
  /** The advisor sending the file. When absent, the company sends it itself. */
  readonly sender?: Sender;
  readonly securities: readonly Security[];
  readonly persons: readonly Person[];
  readonly reports: readonly Report[];
}
