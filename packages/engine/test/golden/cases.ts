/**
 * Golden test cases: rows typed into SKAT's Excel template, and the sender entered in its
 * "Dan fil" dialog. Each case's expected output (`expected/<id>.txt`) is produced by SKAT's
 * own template; see docs/testing.md. The engine must produce the same bytes.
 *
 * All people, companies and identifiers are fictional. CPR numbers follow the example in
 * SKAT's guidance (0101584455); CVR numbers and ISINs are made up but pass their checks.
 *
 * Values are exactly what goes into the template's cells, so they mirror its conventions:
 * øre for amounts, 6 implied decimals for quantities, prices and rates.
 */
import type { Scenario } from "../../src/codes.ts";
import type { Sender } from "../../src/file.ts";
import type { Row } from "../../src/record.ts";

export type Template = "salg-af-aktier" | "likvidationsprovenu";

export interface GoldenCase {
  /** File name of the expected output, and the macro name in the Excel harness. */
  readonly id: string;
  readonly description: string;
  readonly template: Template;
  readonly scenario: Scenario;
  readonly sender: Sender;
  readonly rows: readonly Row[];
}

const signs = (s: "+" | "-"): Row => ({
  STKFTG: s, KURVAEOMSVALFTG: s, OMKOMSVALFTG: s, NTOAFROMSVALFTG: s,
  NTOAFRAFRVALFTG: s, KURVAEBSKVALFTG: s, OMKBSKVALFTG: s, NTOAFRBSKVALFTG: s,
});

/** Same amount (øre) in all five value fields and no costs: DKK, as the guidance describes for B. */
const dkkAmounts = (ore: string): Row => ({
  OMSVALKOD: "DKK", AFRVALKOD: "DKK", VALKURSPCT: "100000000",
  KURVAEOMSVALBLB: ore, OMKOMSVALBLB: "0", NTOAFROMSVALBLB: ore, NTOAFRAFRVALBLB: ore,
  KURVAEBSKVALBLB: ore, OMKBSKVALBLB: "0", NTOAFRBSKVALBLB: ore,
});

const date = (d: string): Row => ({ HANDEDTO: d, VALOEDTO: d, INDKAAR: d.slice(0, 4) });

const NORDLYS: Sender = { seNumber: "12345674", name: "Nordlys Software ApS", address: "Søndergade 1, 8000 Aarhus C" };

/** Shared fields of a scenario B row for Nordlys Software ApS's unlisted B shares. */
const nordlysB: Row = {
  INDVNR: "2278", OPSENR: "12345674", EJERSTATUKOD: "0", RETTEKOD: "0",
  PAPIRIDENTNVN: "Nordlys Software ApS B-anparter", PAPIRTYPEKOD: "1", PAPIRLANDKOD: "DK",
  ASIDNR: "00000", OPTAGHANDEKOD: "2", DEPOTTYPEKOD: "0", HANDETID: "120000",
};

/** An RSU from a fictional US-listed parent, settled in USD at 685,25 DKK per 100 USD. */
const auroraRsu: Row = {
  INDVNR: "2278", OPSENR: "12345674", RETTEKOD: "0",
  ISINKOD: "US05432A1076", PAPIRIDENTNVN: "Aurora Holdings Inc. Common Stock", PAPIRTYPEKOD: "1", PAPIRLANDKOD: "US",
  ...signs("+"), OMSVALKOD: "USD", AFRVALKOD: "USD", VALKURSPCT: "685250000",
  ...date("20260301"), KOEBSALGKOD: "M", ASIDNR: "00000", OPTAGHANDEKOD: "1", DEPOTTYPEKOD: "0", HANDETID: "153000",
};

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    id: "b-basic",
    description: "Two employees resident in Denmark, shares granted under the new § 7 P scheme (H), DKK",
    template: "salg-af-aktier",
    scenario: "B",
    sender: NORDLYS,
    rows: [
      // 400 shares at 25,00 = 10.000,00 paid + 18.400,00 taxed = 28.400,00
      { ...nordlysB, FONDNOTANR: "1", PNRSENR: "0101584455", ...signs("+"), STKANT: "400000000", AKTIPAPIRKURSPCT: "25000000", ...dkkAmounts("2840000"), ...date("20260915"), KOEBSALGKOD: "H" },
      // 250 shares at 25,00 = 6.250,00 paid + 11.500,00 taxed = 17.750,00
      { ...nordlysB, FONDNOTANR: "2", PNRSENR: "0202584455", ...signs("+"), STKANT: "250000000", AKTIPAPIRKURSPCT: "25000000", ...dkkAmounts("1775000"), ...date("20260915"), KOEBSALGKOD: "H" },
    ],
  },
  {
    id: "b-foreign-usd",
    description: "RSUs from a foreign listed parent in USD (§ 16, M); one employee resident in Sweden with TIN, æøå/åäö in names",
    template: "salg-af-aktier",
    scenario: "B",
    sender: NORDLYS,
    rows: [
      // 10 shares at 150,00 USD = 1.500,00 USD = 10.278,75 DKK
      { ...auroraRsu, FONDNOTANR: "RSU-2026-0001", PNRSENR: "0303584455", EJERSTATUKOD: "0", STKANT: "10000000", AKTIPAPIRKURSPCT: "150000000",
        KURVAEOMSVALBLB: "150000", OMKOMSVALBLB: "0", NTOAFROMSVALBLB: "150000", NTOAFRAFRVALBLB: "150000",
        KURVAEBSKVALBLB: "1027875", OMKBSKVALBLB: "0", NTOAFRBSKVALBLB: "1027875" },
      // 5 shares at 150,00 USD = 750,00 USD = 5.139,38 DKK; no Danish CPR
      { ...auroraRsu, FONDNOTANR: "RSU-2026-0002", EJERSTATUKOD: "1", STKANT: "5000000", AKTIPAPIRKURSPCT: "150000000",
        KURVAEOMSVALBLB: "75000", OMKOMSVALBLB: "0", NTOAFROMSVALBLB: "75000", NTOAFRAFRVALBLB: "75000",
        KURVAEBSKVALBLB: "513938", OMKBSKVALBLB: "0", NTOAFRBSKVALBLB: "513938",
        TINNR: "19850312-1234", TINNRTYPEKOD: "1", PERSFORNVN: "Åsa", PERSEFTERNVN: "Lindström",
        VEJNVN: "Storgatan", HUSNR: "12", ETAGENR: "3 tr", POSTNR: "211 42", POSTDISTRADR: "Malmö",
        LANDENVN: "Sverige", LANDKOD: "SE" },
    ],
  },
  {
    id: "b-correction",
    description: "Correction of an accepted report (rettekode 1): the original line reversed with minus signs, then the corrected line; old 50 % scheme (G)",
    template: "salg-af-aktier",
    scenario: "B",
    sender: NORDLYS,
    rows: [
      { ...nordlysB, RETTEKOD: "1", FONDNOTANR: "7", PNRSENR: "0404584455", ...signs("-"), STKANT: "100000000", AKTIPAPIRKURSPCT: "10000000", ...dkkAmounts("500000"), ...date("20260510"), KOEBSALGKOD: "G" },
      { ...nordlysB, RETTEKOD: "1", FONDNOTANR: "7", PNRSENR: "0404584455", ...signs("+"), STKANT: "120000000", AKTIPAPIRKURSPCT: "10000000", ...dkkAmounts("600000"), ...date("20260510"), KOEBSALGKOD: "G" },
    ],
  },
  {
    id: "b-edge",
    description: "Edge cases: 8-digit CVR in field 11, maximum-length texts, custody account, costs, listed Danish share not in Euronext Securities (88888)",
    template: "salg-af-aktier",
    scenario: "B",
    sender: NORDLYS,
    rows: [
      { ...nordlysB, PNRSENR: "87654303", DEPOTNR: "3200-1234567890", FONDNOTANR: "ABCDEFGHIJ1234567",
        PAPIRIDENTNVN: "Nordlys Software ApS, B-anparter (matching shares)", ...signs("+"),
        STKANT: "40000000", AKTIPAPIRKURSPCT: "25000000", OMSVALKOD: "DKK", AFRVALKOD: "DKK", VALKURSPCT: "100000000",
        KURVAEOMSVALBLB: "1000000", OMKOMSVALBLB: "2500", NTOAFROMSVALBLB: "1002500", NTOAFRAFRVALBLB: "1002500",
        KURVAEBSKVALBLB: "1000000", OMKBSKVALBLB: "2500", NTOAFRBSKVALBLB: "1002500",
        ...date("20261130"), KOEBSALGKOD: "K", HANDETID: "091500" },
      { ...nordlysB, PNRSENR: "0101584455", FONDNOTANR: "3", ISINKOD: "DK0012345675", PAPIRIDENTNVN: "Nordlys Holding A/S", ...signs("+"),
        STKANT: "1000000", AKTIPAPIRKURSPCT: "312750000", ...dkkAmounts("31275"), ...date("20261130"),
        KOEBSALGKOD: "F", ASIDNR: "88888", OPTAGHANDEKOD: "1" },
    ],
  },
  {
    id: "a-buyback",
    description: "Company buys back its own shares from a person and from a company (S)",
    template: "salg-af-aktier",
    scenario: "A",
    sender: NORDLYS,
    rows: [
      // 1.000 shares at 120,50 = 120.500,00
      { ...nordlysB, FONDNOTANR: "Aktiebog 14", PNRSENR: "0505584455", ...signs("+"), STKANT: "1000000000", AKTIPAPIRKURSPCT: "120500000",
        ...dkkAmounts("12050000"), ...date("20260402"), KOEBSALGKOD: "S" },
      // 500 shares at 120,50 = 60.250,00, costs 500,00, net 59.750,00
      { ...nordlysB, FONDNOTANR: "87654311", PNRSENR: "87654311", ...signs("+"), STKANT: "500000000", AKTIPAPIRKURSPCT: "120500000",
        OMSVALKOD: "DKK", AFRVALKOD: "DKK", VALKURSPCT: "100000000",
        KURVAEOMSVALBLB: "6025000", OMKOMSVALBLB: "50000", NTOAFROMSVALBLB: "5975000", NTOAFRAFRVALBLB: "5975000",
        KURVAEBSKVALBLB: "6025000", OMKBSKVALBLB: "50000", NTOAFRBSKVALBLB: "5975000",
        ...date("20260402"), KOEBSALGKOD: "S" },
    ],
  },
  {
    id: "c-investor",
    description: "Target company reports a direct investment (K, type 3) and an investor-deduction fund's investment (R, type 4)",
    template: "salg-af-aktier",
    scenario: "C",
    sender: { seNumber: "87654338", name: "Startup Hub ApS", address: "Vestergade 5, 1456 København K" },
    rows: [
      { INDVNR: "2278", OPSENR: "87654338", FONDNOTANR: "05051958", PNRSENR: "0505584455", EJERSTATUKOD: "0", RETTEKOD: "0",
        PAPIRIDENTNVN: "Startup Hub ApS", PAPIRTYPEKOD: "3", PAPIRLANDKOD: "DK", ...signs("+"),
        STKANT: "5000000000", AKTIPAPIRKURSPCT: "5000000000", OMSVALKOD: "DKK", AFRVALKOD: "DKK", VALKURSPCT: "100000000",
        KURVAEOMSVALBLB: "0", OMKOMSVALBLB: "0", NTOAFROMSVALBLB: "0", NTOAFRAFRVALBLB: "0",
        KURVAEBSKVALBLB: "25000000", OMKBSKVALBLB: "0", NTOAFRBSKVALBLB: "25000000",
        ...date("20260601"), KOEBSALGKOD: "K", ASIDNR: "00000", OPTAGHANDEKOD: "2", DEPOTTYPEKOD: "0", HANDETID: "150000",
        INVESTOREJERSKAB: "2" },
      { INDVNR: "2278", OPSENR: "87654338", FONDNOTANR: "06061958", PNRSENR: "0606584455", EJERSTATUKOD: "0", RETTEKOD: "0",
        PAPIRIDENTNVN: "Startup Hub ApS", PAPIRTYPEKOD: "4", PAPIRLANDKOD: "DK", ...signs("+"),
        STKANT: "2000000000", AKTIPAPIRKURSPCT: "2000000000", OMSVALKOD: "DKK", AFRVALKOD: "DKK", VALKURSPCT: "100000000",
        KURVAEOMSVALBLB: "0", OMKOMSVALBLB: "0", NTOAFROMSVALBLB: "0", NTOAFRAFRVALBLB: "0",
        KURVAEBSKVALBLB: "10000000", OMKBSKVALBLB: "125000", NTOAFRBSKVALBLB: "10125000",
        ...date("20260601"), KOEBSALGKOD: "R", ASIDNR: "00000", OPTAGHANDEKOD: "2", DEPOTTYPEKOD: "0", HANDETID: "150000",
        INVESTOREJERSKAB: "1" },
    ],
  },
  {
    id: "d-liquidation",
    description: "Liquidation proceeds to a person and a company shareholder (L), using SKAT's likvidationsprovenu template",
    template: "likvidationsprovenu",
    scenario: "D",
    sender: { seNumber: "87654311", name: "Gammel Handel ApS", address: "Torvet 3, 5000 Odense C" },
    rows: [
      { INDVNR: "2278", OPSENR: "87654311", PNRSENR: "0707584455", EJERSTATUKOD: "0", RETTEKOD: "0",
        PAPIRIDENTNVN: "Gammel Handel ApS", PAPIRTYPEKOD: "1", PAPIRLANDKOD: "DK", ...signs("+"),
        STKANT: "1000000", AKTIPAPIRKURSPCT: "0000000", OMSVALKOD: "DKK", AFRVALKOD: "DKK", VALKURSPCT: "100000000",
        KURVAEOMSVALBLB: "0", OMKOMSVALBLB: "0", NTOAFROMSVALBLB: "0", NTOAFRAFRVALBLB: "0",
        KURVAEBSKVALBLB: "0", OMKBSKVALBLB: "0", NTOAFRBSKVALBLB: "2500000",
        HANDEDTO: "20261120", VALOEDTO: "00000000", INDKAAR: "2026", KOEBSALGKOD: "L", ASIDNR: "00000",
        OPTAGHANDEKOD: "2", DEPOTTYPEKOD: "0", HANDETID: "120000" },
      { INDVNR: "2278", OPSENR: "87654311", PNRSENR: "87654303", EJERSTATUKOD: "0", RETTEKOD: "0",
        PAPIRIDENTNVN: "Gammel Handel ApS", PAPIRTYPEKOD: "1", PAPIRLANDKOD: "DK", ...signs("+"),
        STKANT: "3000000", AKTIPAPIRKURSPCT: "0000000", OMSVALKOD: "DKK", AFRVALKOD: "DKK", VALKURSPCT: "100000000",
        KURVAEOMSVALBLB: "0", OMKOMSVALBLB: "0", NTOAFROMSVALBLB: "0", NTOAFRAFRVALBLB: "0",
        KURVAEBSKVALBLB: "0", OMKBSKVALBLB: "0", NTOAFRBSKVALBLB: "7500000",
        HANDEDTO: "20261120", VALOEDTO: "00000000", INDKAAR: "2026", KOEBSALGKOD: "L", ASIDNR: "00000",
        OPTAGHANDEKOD: "2", DEPOTTYPEKOD: "0", HANDETID: "120000" },
    ],
  },
];
