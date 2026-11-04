import type { Text } from "./fields.ts";

/** The four report types that share dataindivid 2278. */
export type Scenario = "A" | "B" | "C" | "D";

export const SCENARIOS: Readonly<Record<Scenario, { title: Text; legalBasis: string }>> = {
  A: { title: { da: "Selskabets erhvervelse af egne aktier", en: "Company buying back its own shares" }, legalBasis: "SIL § 28" },
  B: { title: { da: "Medarbejderaktier og købe-/tegningsretter", en: "Employee shares, options and warrants" }, legalBasis: "SIL § 8; LL §§ 7 P, 16, 28" },
  C: { title: { da: "Kapitalindskud med investorfradrag", en: "Capital contributions with investor deduction" }, legalBasis: "SIL §§ 29 a, 29 b" },
  D: { title: { da: "Likvidationsprovenu", en: "Liquidation proceeds" }, legalBasis: "SIL § 28 a" },
};

export interface TransactionCode {
  readonly code: string;
  readonly scenarios: readonly Scenario[];
  readonly label: Text;
  /** First trade date (ÅÅÅÅMMDD) the code may be used for, if limited. */
  readonly validFrom?: string;
  /** Last trade date (ÅÅÅÅMMDD) the code may be used for, if limited. */
  readonly validTo?: string;
}

/** KOEBSALGKOD (felt 57). Source: guidance 4.1, version 1.9 (24.09.26). */
export const TRANSACTION_CODES: readonly TransactionCode[] = [
  { code: "S", scenarios: ["A"], label: { da: "Selskabets erhvervelse af egne aktier", en: "Company acquires its own shares" } },
  { code: "E", scenarios: ["B"], label: { da: "Medarbejderaktier, LL § 7 P stk. 2 nr. 2, 1. pkt. (op til 10 % af årslønnen)", en: "Employee shares, LL § 7 P(2)(2), 1st sentence (up to 10% of annual salary)" } },
  { code: "F", scenarios: ["B"], label: { da: "Medarbejderaktier, LL § 7 P stk. 2 nr. 2, 2. pkt. (op til 20 % af årslønnen)", en: "Employee shares, LL § 7 P(2)(2), 2nd sentence (up to 20% of annual salary)" } },
  { code: "G", scenarios: ["B"], validTo: "20260630", label: { da: "Medarbejderaktier, LL § 7 P stk. 2 nr. 2, 4. pkt. (op til 50 % af lønnen), til og med 30.06.2026", en: "Employee shares, LL § 7 P(2)(2), 4th sentence (up to 50% of salary), until 30 June 2026" } },
  { code: "H", scenarios: ["B"], validFrom: "20260701", label: { da: "Medarbejderaktier, LL § 7 P stk. 2 nr. 2, 4. pkt. uden grænse, med krav om grundbeløb i årsløn, fra 01.07.2026", en: "Employee shares, LL § 7 P(2)(2), 4th sentence, no cap but base salary requirement, from 1 July 2026" } },
  { code: "B", scenarios: ["B"], label: { da: "Udnyttelse af købe- eller tegningsretter, LL § 28", en: "Exercise of purchase or subscription rights, LL § 28" } },
  { code: "M", scenarios: ["B"], label: { da: "Aktier som vederlag eller udnyttelse af retter, LL § 16", en: "Shares as remuneration or exercise of rights, LL § 16" } },
  { code: "K", scenarios: ["B", "C"], label: { da: "B: investeringsaktier med matching shares. C: erhvervelse i målselskab eller investorfradragsfond", en: "B: investment shares with matching shares. C: acquisition in target company or investor-deduction fund" } },
  { code: "R", scenarios: ["C"], label: { da: "Målselskabets indberetning om investorfradragsfondens investering", en: "Target company reporting an investor-deduction fund's investment" } },
  { code: "L", scenarios: ["D"], label: { da: "Udbetalt likvidationsprovenu, SIL § 28 a", en: "Liquidation proceeds paid out, SIL § 28 a" } },
];

/** Human-readable labels for the remaining code fields. */
export const CODE_LABELS = {
  EJERSTATUKOD: {
    "0": { da: "Bopæl/hjemsted i Danmark", en: "Resident in Denmark" },
    "1": { da: "Bopæl/hjemsted i udlandet", en: "Resident abroad" },
  },
  RETTEKOD: {
    "0": { da: "Ordinær indberetning", en: "Ordinary report" },
    "1": { da: "Rettelse af godkendt indberetning", en: "Correction of an accepted report" },
    "2": { da: "Genindberetning af afvist indberetning (FTPs Gateway)", en: "Re-submission of a rejected report (FTPs Gateway)" },
  },
  PAPIRTYPEKOD: {
    "1": { da: "Aktier og anparter", en: "Shares" },
    "3": { da: "Aktier i målselskab (direkte investering)", en: "Shares in target company (direct investment)" },
    "4": { da: "Andele i investorfradragsfond (indirekte investering)", en: "Units in investor-deduction fund (indirect investment)" },
    "5": { da: "Andelsbeviser", en: "Cooperative certificates (andelsbeviser)" },
  },
  TINNRTYPEKOD: {
    "1": { da: "TIN-nummer", en: "Tax identification number" },
    "2": { da: "Fødselsdato (DDMMÅÅÅÅ)", en: "Date of birth (DDMMYYYY)" },
    "3": { da: "Manglende identifikationsoplysninger", en: "Identification missing" },
  },
  OPTAGHANDEKOD: {
    "1": { da: "Optaget til handel (reguleret marked eller MHF)", en: "Admitted to trading (regulated market or MTF)" },
    "2": { da: "Ikke optaget til handel", en: "Not admitted to trading" },
  },
  INVESTOREJERSKAB: {
    "1": { da: "Investor har ejet aktier i målselskabet inden for 3 år", en: "Investor owned shares in the target company within 3 years" },
    "2": { da: "Investor har ikke ejet aktier i målselskabet inden for 3 år", en: "Investor did not own shares in the target company within 3 years" },
    "3": { da: "Opfølgende investering efter forretningsplanen", en: "Follow-on investment under the business plan" },
  },
} as const satisfies Record<string, Record<string, Text>>;

/** Version string written in the end record, per SKAT's latest template for the scenario. */
export const TEMPLATE_VERSION: Readonly<Record<Scenario, string>> = {
  A: "2024-v1",
  B: "2024-v1",
  C: "2024-v1",
  D: "2025-v1",
};
