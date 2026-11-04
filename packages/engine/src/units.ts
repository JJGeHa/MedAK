/**
 * Convert between numbers as people type them ("1.234,56" in Danish, "1,234.56" in
 * English) and the digit strings the file stores (øre, or 6 implied decimals).
 *
 * Integer arithmetic only (BigInt), so amounts are never subject to floating-point error.
 * Ambiguous input is rejected rather than guessed: in Danish, "125.75" is not read as
 * 12575, because a decimal shifted by 100 is exactly the mistake we want to prevent.
 */

export type NumberLocale = "da" | "en";

export type ParseNumberError = "empty" | "invalid" | "negative" | "tooManyDecimals";

export type ParseNumberResult =
  | { readonly ok: true; readonly digits: string }
  | { readonly ok: false; readonly error: ParseNumberError };

const SEPARATORS: Readonly<Record<NumberLocale, { group: string; decimal: string }>> = {
  da: { group: ".", decimal: "," },
  en: { group: ",", decimal: "." },
};

/**
 * Parse a human-typed non-negative number into a digit string with `decimals` implied
 * decimals. Examples with decimals = 2 (øre): da "1.234,5" → "123450"; en "15" → "1500".
 */
export function toFixedDigits(input: string, decimals: number, locale: NumberLocale): ParseNumberResult {
  const { group, decimal } = SEPARATORS[locale];
  // Spaces, non-breaking and thin spaces are accepted as thousands separators too.
  const s = input.trim().replace(/[\s  ]/g, "");
  if (s === "") return { ok: false, error: "empty" };
  if (s.startsWith("-")) return { ok: false, error: "negative" };

  const parts = s.split(decimal);
  if (parts.length > 2) return { ok: false, error: "invalid" };
  const intPart = parts[0] ?? "";
  const fracPart = parts[1] ?? "";

  // Thousands separators are only accepted in a valid 3-digit grouping.
  let intDigits = intPart;
  if (intPart.includes(group)) {
    const groups = intPart.split(group);
    const [first, ...rest] = groups;
    if (!first || !/^\d{1,3}$/.test(first) || !rest.every((g) => /^\d{3}$/.test(g))) {
      return { ok: false, error: "invalid" };
    }
    intDigits = groups.join("");
  }
  if (intDigits === "" && fracPart === "") return { ok: false, error: "invalid" };
  if (!/^\d*$/.test(intDigits) || !/^\d*$/.test(fracPart)) return { ok: false, error: "invalid" };
  if (parts.length === 2 && fracPart === "") return { ok: false, error: "invalid" };
  if (fracPart.length > decimals) return { ok: false, error: "tooManyDecimals" };

  const digits = (intDigits + fracPart.padEnd(decimals, "0")).replace(/^0+(?=\d)/, "");
  return { ok: true, digits: digits === "" ? "0" : digits };
}

/**
 * Format a stored digit string for display. Example: ("1886250", 2, "da") → "18.862,50".
 * Trailing zero decimals beyond `minDecimals` are dropped (useful for 6-decimal fields).
 */
export function fromFixedDigits(
  digits: string,
  decimals: number,
  locale: NumberLocale,
  minDecimals = decimals,
): string {
  const { group, decimal } = SEPARATORS[locale];
  const clean = digits.replace(/^0+(?=\d)/, "").padStart(decimals + 1, "0");
  const intPart = clean.slice(0, clean.length - decimals);
  let frac = clean.slice(clean.length - decimals);
  while (frac.length > minDecimals && frac.endsWith("0")) frac = frac.slice(0, -1);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return frac === "" ? grouped : grouped + decimal + frac;
}

/** Integer division of a non-negative value, rounding half up. */
function divRound(n: bigint, d: bigint): bigint {
  return (n + d / 2n) / d;
}

/**
 * Convert an amount in øre of a foreign currency to DKK øre.
 * @param rate VALKURSPCT: DKK per 100 units of the currency, with 6 implied decimals
 *             (USD at 6,85 DKK → 685 → "685000000").
 */
export function convertToDkk(amountOre: bigint, rate: bigint): bigint {
  return divRound(amountOre * rate, 100_000_000n);
}

/** Market value in øre from a quantity and a price per share, both with 6 implied decimals. */
export function marketValueOre(quantity: bigint, price: bigint): bigint {
  return divRound(quantity * price, 10_000_000_000n);
}
