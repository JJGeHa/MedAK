import { describe, expect, it } from "vitest";
import { FIELD_BY_KEY, FIELDS, LINE_LENGTH } from "../src/fields.ts";

/**
 * Start positions and lengths as written in SKAT's VBA import routine `OpbygRaekke`
 * (`Mid(textline, start, length)`), plus field 63 from the likvidationsprovenu template.
 * An independent source from the table in fields.ts.
 */
const VBA_LAYOUT: readonly [string, number, number][] = [
  ["INDVNR", 1, 4], ["OPSENR", 5, 8], ["BANKRGISTNR", 13, 4], ["DEPOTNR", 17, 17],
  ["FONDNOTANR", 34, 17], ["PNRSENR", 51, 10], ["EJERSTATUKOD", 61, 1], ["RETTEKOD", 62, 1],
  ["ISINKOD", 63, 12], ["PAPIRIDENTNVN", 75, 50], ["PAPIRTYPEKOD", 125, 1], ["PAPIRLANDKOD", 126, 2],
  ["STKFTG", 128, 1], ["STKANT", 129, 18], ["AKTIPAPIRKURSPCT", 147, 16], ["OMSVALKOD", 163, 3],
  ["KURVAEOMSVALFTG", 166, 1], ["KURVAEOMSVALBLB", 167, 17], ["OMKOMSVALFTG", 184, 1],
  ["OMKOMSVALBLB", 185, 10], ["NTOAFROMSVALFTG", 195, 1], ["NTOAFROMSVALBLB", 196, 17],
  ["AFRVALKOD", 213, 3], ["NTOAFRAFRVALFTG", 216, 1], ["NTOAFRAFRVALBLB", 217, 17],
  ["KURVAEBSKVALFTG", 234, 1], ["KURVAEBSKVALBLB", 235, 17], ["OMKBSKVALFTG", 252, 1],
  ["OMKBSKVALBLB", 253, 10], ["NTOAFRBSKVALFTG", 263, 1], ["NTOAFRBSKVALBLB", 264, 17],
  ["VALKURSPCT", 281, 11], ["HANDEDTO", 292, 8], ["VALOEDTO", 300, 8], ["INDKAAR", 308, 4],
  ["TINNR", 312, 20], ["TINNRTYPEKOD", 332, 1], ["FOEDESTEDNVN", 333, 35], ["FOEDELANDKOD", 368, 2],
  ["PERSFORNVN", 370, 70], ["PERSEFTERNVN", 440, 70], ["CONVN", 510, 70], ["VEJNVN", 580, 70],
  ["HUSNR", 650, 10], ["ETAGENR", 660, 5], ["SIDEDOERNR", 665, 10], ["POSTBOXADR", 675, 20],
  ["LANDBYNVN", 695, 70], ["POSTNR", 765, 15], ["POSTDISTRADR", 780, 70], ["HUSNVN", 850, 70],
  ["LJLIHVAERSNR", 920, 20], ["EGNLANDELSTANVN", 940, 70], ["LANDENVN", 1010, 70],
  ["LANDKOD", 1080, 2], ["KOEBSALGKOD", 1082, 1], ["ASIDNR", 1083, 5], ["OPTAGHANDEKOD", 1088, 1],
  ["DEPOTTYPEKOD", 1089, 1], ["HANDETID", 1090, 6], ["INVESTOREJERSKAB", 1096, 1],
  ["EJERANDELRKOPCT", 1097, 6], ["FILLER", 1103, 10],
];

describe("field layout", () => {
  it("adds up to 1,112 characters", () => {
    const last = FIELDS.at(-1)!;
    expect(last.start + last.length - 1).toBe(LINE_LENGTH);
    expect(FIELDS.reduce((n, f) => n + f.length, 0)).toBe(LINE_LENGTH);
  });

  it("matches the positions in SKAT's VBA", () => {
    expect(FIELDS.map((f) => [f.key, f.start, f.length])).toEqual(VBA_LAYOUT);
  });

  it("has a Danish and an English label for every field", () => {
    for (const f of FIELDS) {
      expect(f.label.da.length, f.key).toBeGreaterThan(0);
      expect(f.label.en.length, f.key).toBeGreaterThan(0);
    }
  });

  it("indexes fields by key", () => {
    expect(FIELD_BY_KEY.PNRSENR.felt).toBe(11);
    expect(FIELD_BY_KEY.LANDKOD.felt).toBe(35);
  });
});
