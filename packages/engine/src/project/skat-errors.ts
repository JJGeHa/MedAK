/**
 * Understanding what SKAT reports back. TastSelv Erhverv shows a validation report with line
 * numbers and texts (its exact format is undocumented, so this reads it generously); FTPs Gateway
 * returns fixed-width error records (individ 3921, Bilag 3).
 */
import { classifyId } from "../checks.ts";
import type { Text } from "../fields.ts";
import type { Row } from "../record.ts";

const e = (da: string, en: string): Text => ({ da, en });

/** SKAT's error codes (Bilag 4), with SKAT's own text and an English equivalent. */
export const SKAT_ERROR_CODES: Readonly<Record<string, Text>> = {
  "017": e("Fejl i OPSENR", "Error in the reporting company's CVR/SE number"),
  "024": e("Fejl i rettekode", "Error in the correction code"),
  "033": e("Fejl i ejerstatuskode", "Error in the owner status"),
  "039": e("Fejl i hjemlandskode", "Error in the country of residence. Check that owner status and country fit together: an owner living in Denmark can't have a foreign country code"),
  "041": e("Fejl i regnr.", "Error in the bank registration number"),
  "057": e("Fejl i CPR/CVR/SENR", "Error in the CPR/CVR/SE number"),
  "058": e("CPR/CVR/SENR mangler", "The CPR/CVR/SE number is missing"),
  "072": e("Negativt beløb kræver rette-kode 1 eller 2", "A negative amount requires correction code 1 or 2"),
  "087": e("SENR ukendt i systemet", "SKAT does not know this SE number"),
  "138": e("Fejl i depottypekode", "Error in the custody type"),
  "156": e("Fejl i depottypekode", "Error in the custody type"),
  "159": e("Medarbejderaktier med SENR", "Employee shares reported on an SE number"),
  "183": e("Fejl i landekode", "Error in the country code"),
  "187": e("Fejl i indberetningspligtiges senr.", "Error in the reporting company's SE number"),
  "189": e("Papirnavn mangler", "The security name is missing"),
  "190": e("Neg antal kræver rettekode 1 el 2", "A negative quantity requires correction code 1 or 2"),
  "191": e("Fejl i antal styk", "Error in the number of shares"),
  "192": e("Fejl i aktie-/papirkurs", "Error in the price per share"),
  "193": e("Fejl i kursværdi beskatningsvaluta", "Error in the market value in DKK"),
  "194": e("Fejl i omsætningsvalutakode", "Error in the trading currency"),
  "195": e("Fejl i valutakurs", "Error in the exchange rate"),
  "196": e("Fejl i kursværdi beskatningsvaluta", "Error in the market value in DKK"),
  "197": e("Fondsnotanummer mangler", "The contract note number is missing"),
  "198": e("Fejl i papirtype", "Error in the security type"),
  "199": e("Fejl i afregningsvalutakode", "Error in the settlement currency"),
  "200": e("Fejl i omkostningsomsætningsvaluta", "Error in the costs in trading currency"),
  "201": e("Fejl i nettoafregningsomsætningsvaluta", "Error in the net settlement in trading currency"),
  "202": e("Fejl i omkostningsbeskatningsvaluta", "Error in the costs in DKK"),
  "203": e("Fejl i nettoafregningsbeskatningsvaluta", "Error in the net settlement in DKK"),
  "204": e("Fejl i nettoafregningsvaluta", "Error in the net settlement in settlement currency"),
  "205": e("Fejl i handelsdato", "Error in the trade date"),
  "206": e("Fejl i valørdato", "Error in the value date"),
  "207": e("Fejl i år i handelsdato", "The year of the trade date does not match the income year"),
  "208": e("Fejl i år i valørdato", "The year of the value date does not match the income year"),
  "233": e("TINNR ejrst ikke val/diplo", "TIN given, but the owner status is not 'lives abroad'"),
  "234": e("TINNRtyp ejrst ej val/diplo", "TIN type given, but the owner status is not 'lives abroad'"),
  "235": e("Fødested ejrst ej val/diplo", "Place of birth given, but the owner status is not 'lives abroad'"),
  "236": e("Fødeland ejrst ej val/diplo", "Country of birth given, but the owner status is not 'lives abroad'"),
  "237": e("Fejl i TINNR typekode", "Error in the TIN type"),
  "238": e("TINNR er ikke indberettet", "The TIN is missing"),
  "239": e("TINNR typekode mangler", "The TIN type is missing"),
  "240": e("TINNR er ikke en valid dato", "The TIN is not a valid date: with type 2 it must be DDMMYYYY"),
  "241": e("Fejl i fødestedslandekode", "Error in the country of birth"),
  "242": e("Fejl i fornavn", "Error in the first name"),
  "243": e("Fejl i efternavn", "Error in the last name"),
  "244": e("Fejl i vejnavn", "Error in the street"),
  "245": e("Fejl i postdistrikt", "Error in the town"),
  "246": e("Fejl i husnr.", "Error in the house number"),
  "247": e("Fejl i postnr.", "Error in the postcode"),
  "270": e("Fejl i AS-ident", "Error in the AS-ident"),
  "281": e("ISINkode mangler", "The ISIN is missing"),
  "282": e("Fejl i ISINkode", "Error in the ISIN"),
  "284": e("AS-ident mangler", "The AS-ident is missing"),
  "289": e("SENR ophørt før indkomstår", "The investor's CVR/SE number ended before the income year"),
  "295": e("Fejl i optaget til handelkode", "Error in the 'admitted to trading' code"),
  "298": e("Fejl i postboks", "Error in the PO box"),
  "304": e("Fejl i køb/salg", "Error in the transaction code"),
  "312": e("Fejl i handelstidspunkt", "Error in the trade time"),
  "327": e("Fejl i fortegn for antal styk", "Error in the sign of the quantity"),
  "390": e("Depottypekode kræver CPRnr", "The custody type requires a CPR number"),
  "392": e("Fejl i investorejerskab", "Error in the prior investor ownership"),
  "393": e("Køb/salg ej for depottype 2", "The transaction code can't be used with custody type 2"),
  "394": e("Køb/salg kræver papirtype 1", "The transaction code requires security type 1"),
  "395": e("Køb/salg kræver ejerstatus 0/1", "The transaction code requires owner status 0 or 1"),
  "396": e("Køb/salg kræver CPRNR", "The transaction code requires a CPR number"),
  "397": e("Inv.ejerskab ej for papirtype", "Prior investor ownership can't be used with this security type"),
  "398": e("Papirtype ej for opt.t.handel", "This security type requires 'not admitted to trading'"),
  "399": e("Papirtype kræver køb/salg K/R", "This security type requires transaction code K or R"),
  "418": e("Køb/salg kun papirtype 1/2/5", "The transaction code only works with security types 1, 2 or 5"),
};

/** The code meaning "no errors" on a line from FTPs Gateway. */
const NO_ERROR = "599";

export interface SkatError {
  /** 1-based line in the file sent to SKAT, when the report names one. */
  readonly fileLine?: number;
  /** SKAT's error codes found. Their meaning is in SKAT_ERROR_CODES. */
  readonly codes: readonly string[];
  /** SKAT's own words, when it gave text rather than a code. */
  readonly text?: string;
  /** Identifies the row when there is no line number (FTPs Gateway error records). */
  readonly identity?: { readonly id: string; readonly note: string };
}

/** Read 3-digit error codes from the 75-character FEJLNR field of an error record. */
function codesFromField(field: string): string[] {
  const codes: string[] = [];
  for (let i = 0; i + 3 <= field.length; i += 3) {
    const code = field.slice(i, i + 3);
    if (/^\d{3}$/.test(code) && code !== "000" && code !== NO_ERROR) codes.push(code);
  }
  return codes;
}

/**
 * Read what the user pasted from SKAT. Lines that name a line number, or are error records, become
 * errors. Other lines are only taken if they hold a known code, so headers and blurb are ignored.
 */
export function parseSkatErrors(text: string): SkatError[] {
  const errors: SkatError[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") continue;

    // Trailing blanks may be gone, so only the first code position is required.
    if (line.startsWith("3921") && line.length >= 1084) {
      const codes = codesFromField(line.slice(1081, 1156));
      if (codes.length > 0) {
        errors.push({
          codes,
          identity: { id: classifyId(line.slice(50, 60).trim()).normalized, note: line.slice(33, 50).trim() },
        });
      }
      continue;
    }

    const lineRef = /\b(?:linje|line)\s*(?:nr\.?\s*)?(\d{1,7})\b/i.exec(line);
    const rest = lineRef ? line.replace(lineRef[0], " ") : line;
    const codes = [...rest.matchAll(/(?<![\d.,-])\d{3}(?![\d.,-])/g)].map((m) => m[0]).filter((c) => SKAT_ERROR_CODES[c] !== undefined);
    if (lineRef) {
      const words = rest.replace(/^[\s:;,.–-]+|[\s:;,.–-]+$/g, "");
      errors.push({ fileLine: Number(lineRef[1]), codes, ...(words ? { text: words } : {}) });
    } else if (codes.length > 0) {
      errors.push({ codes, text: line.trim() });
    }
  }
  return errors;
}

/**
 * Which row of a sent file each error belongs to; null when it can't be told. In the file, line 1
 * is the start record, so data row i (from 0) is on line i + 2.
 */
export function matchErrorsToRows(errors: readonly SkatError[], rows: readonly Row[]): (number | null)[] {
  return errors.map((error) => {
    if (error.fileLine !== undefined) {
      const index = error.fileLine - 2;
      return index >= 0 && index < rows.length ? index : null;
    }
    if (error.identity) {
      const { id, note } = error.identity;
      const index = rows.findIndex(
        (r) => classifyId(r.PNRSENR ?? "").normalized === id && (r.FONDNOTANR ?? "").trim() === note,
      );
      return index >= 0 ? index : null;
    }
    return null;
  });
}
