import type { Row } from "../src/record.ts";

const SIGNS_PLUS = {
  STKFTG: "+", KURVAEOMSVALFTG: "+", OMKOMSVALFTG: "+", NTOAFROMSVALFTG: "+",
  NTOAFRAFRVALFTG: "+", KURVAEBSKVALFTG: "+", OMKBSKVALFTG: "+", NTOAFRBSKVALFTG: "+",
} as const;

/**
 * A complete, valid scenario B row: 150 shares granted at 125,75 DKK under the new
 * § 7 P scheme (code H), acquisition sum 18.862,50 DKK, employee resident in Denmark.
 */
export function employeeShareRow(overrides: Row = {}): Row {
  return {
    INDVNR: "2278",
    OPSENR: "24256790",
    FONDNOTANR: "1",
    PNRSENR: "0101584455",
    EJERSTATUKOD: "0",
    RETTEKOD: "0",
    PAPIRIDENTNVN: "Eksempel A/S B-aktier",
    PAPIRTYPEKOD: "1",
    PAPIRLANDKOD: "DK",
    ...SIGNS_PLUS,
    STKANT: "150000000",
    AKTIPAPIRKURSPCT: "125750000",
    OMSVALKOD: "DKK",
    KURVAEOMSVALBLB: "1886250",
    OMKOMSVALBLB: "0",
    NTOAFROMSVALBLB: "1886250",
    AFRVALKOD: "DKK",
    NTOAFRAFRVALBLB: "1886250",
    KURVAEBSKVALBLB: "1886250",
    OMKBSKVALBLB: "0",
    NTOAFRBSKVALBLB: "1886250",
    VALKURSPCT: "100000000",
    HANDEDTO: "20260915",
    VALOEDTO: "20260915",
    INDKAAR: "2026",
    KOEBSALGKOD: "H",
    ASIDNR: "00000",
    OPTAGHANDEKOD: "2",
    DEPOTTYPEKOD: "0",
    HANDETID: "120000",
    ...overrides,
  };
}

/** A foreign-resident owner block (TIN type 1). */
export const FOREIGN_OWNER: Row = {
  EJERSTATUKOD: "1",
  PNRSENR: "",
  TINNR: "123-45-6789",
  TINNRTYPEKOD: "1",
  PERSFORNVN: "Jane",
  PERSEFTERNVN: "Doe",
  VEJNVN: "Main Street",
  HUSNR: "1",
  POSTNR: "10001",
  POSTDISTRADR: "New York",
  LANDENVN: "United States",
  LANDKOD: "US",
};

export function without(row: Row, ...keys: (keyof Row)[]): Row {
  const out = { ...row };
  for (const k of keys) delete out[k];
  return out;
}
