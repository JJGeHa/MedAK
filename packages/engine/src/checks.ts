/** Checks for identifiers, dates and times used in 2278 records. */

/** True for an 8-digit Danish CVR or SE number with a valid modulus-11 check. */
export function isValidCvr(value: string): boolean {
  if (!/^[1-9]\d{7}$/.test(value)) return false;
  const weights = [2, 7, 6, 5, 4, 3, 2, 1];
  const sum = [...value].reduce((acc, d, i) => acc + Number(d) * weights[i]!, 0);
  return sum % 11 === 0;
}

function isValidDayMonth(day: number, month: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  // Year unknown in a CPR number, so 29 February is accepted.
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day <= max;
}

/**
 * True for a 10-digit CPR number whose first six digits are a date DDMMÅÅ.
 * Substitute numbers (erstatningspersonnumre) with 60 added to the day are accepted.
 * The modulus-11 check is deliberately not applied: CPR numbers issued since 2007 need
 * not satisfy it.
 */
export function isPlausibleCpr(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const day = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  return isValidDayMonth(day, month) || isValidDayMonth(day - 60, month);
}

/** Old-style CPR modulus-11 check. Failing it is only a hint of a typo. */
export function passesCprModulus11(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const weights = [4, 3, 2, 7, 6, 5, 4, 3, 2, 1];
  return [...value].reduce((acc, d, i) => acc + Number(d) * weights[i]!, 0) % 11 === 0;
}

/** What kind of Danish identifier field 11 (PNRSENR) holds. */
export type IdKind = "cpr" | "cvr" | "invalid";

/**
 * Classify a PNRSENR value. The template writes an 8-digit CVR/SE as "00" + number, so a
 * 10-digit value starting with "00" is a CVR/SE (no CPR starts with day 00).
 */
export function classifyId(value: string): { kind: IdKind; normalized: string } {
  const v = value.trim();
  if (/^00\d{8}$/.test(v)) return { kind: "cvr", normalized: v.slice(2) };
  if (/^\d{8}$/.test(v)) return { kind: "cvr", normalized: v };
  if (/^\d{10}$/.test(v)) return { kind: "cpr", normalized: v };
  return { kind: "invalid", normalized: v };
}

/** True for a 12-character ISIN with a valid check digit. */
export function isValidIsin(value: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value)) return false;
  // Letters become two digits (A=10 … Z=35); then a Luhn check over all digits.
  const digits = [...value]
    .map((ch) => (/\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)))
    .join("");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** True for a real calendar date written ÅÅÅÅMMDD. */
export function isValidDateYmd(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  return isRealDate(Number(value.slice(0, 4)), Number(value.slice(4, 6)), Number(value.slice(6, 8)));
}

/** True for a real calendar date written DDMMÅÅÅÅ (TIN type 2: birth date). */
export function isValidDateDmy(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  return isRealDate(Number(value.slice(4, 8)), Number(value.slice(2, 4)), Number(value.slice(0, 2)));
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (y < 1800 || m < 1 || m > 12 || d < 1) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** True for a time written TTMMSS (000000–235959). */
export function isValidTime(value: string): boolean {
  if (!/^\d{6}$/.test(value)) return false;
  const h = Number(value.slice(0, 2));
  const m = Number(value.slice(2, 4));
  const s = Number(value.slice(4, 6));
  return h <= 23 && m <= 59 && s <= 59;
}
