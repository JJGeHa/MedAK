import { type FieldDef, type FieldKey, FIELDS, LINE_LENGTH } from "./fields.ts";

/**
 * One 2278 record as field values, in the same raw form the Excel template keeps in its
 * cells: digit strings for numeric fields (øre, 6 implied decimals, ÅÅÅÅMMDD), codes and
 * text otherwise. A missing key means blank.
 */
export type Row = Partial<Record<FieldKey, string>>;

export type FormatProblemReason = "tooLong" | "notDigits" | "controlCharacter";

export interface FormatProblem {
  readonly field: FieldKey;
  readonly reason: FormatProblemReason;
  readonly value: string;
}

/** Thrown when a row cannot be written without losing or corrupting data. */
export class FormatError extends Error {
  readonly problems: readonly FormatProblem[];
  constructor(problems: readonly FormatProblem[]) {
    super(
      "Cannot write 2278 record: " +
        problems.map((p) => `${p.field} ${p.reason} (${JSON.stringify(p.value)})`).join("; "),
    );
    this.name = "FormatError";
    this.problems = problems;
  }
}

// Control characters would break the fixed-width line.
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Format one field the way SKAT's template does, except that values which do not fit
 * are reported instead of being cut off.
 */
export function formatField(def: FieldDef, raw: string | undefined): string | FormatProblem {
  const value = (raw ?? "").trim();
  if (CONTROL.test(value)) return { field: def.key, reason: "controlCharacter", value };

  switch (def.padding) {
    case "alpha":
      if (value.length > def.length) return { field: def.key, reason: "tooLong", value };
      return value.padEnd(def.length, " ");

    case "numeric":
      // The template's Format() leaves a blank value blank.
      if (value === "") return " ".repeat(def.length);
      if (!/^\d+$/.test(value)) return { field: def.key, reason: "notDigits", value };
      if (value.length > def.length) return { field: def.key, reason: "tooLong", value };
      return value.padStart(def.length, "0");

    case "id":
      // An 8-digit CVR/SE number is written as "00" + number; a CPR fills all 10 positions.
      if (value.length === 8) return "00" + value;
      if (value.length > def.length) return { field: def.key, reason: "tooLong", value };
      return value.padEnd(def.length, " ");
  }
}

/**
 * Write a row as a 1,112-character 2278 line (without line ending).
 * INDVNR is always written as `2278` and the filler as spaces.
 * @throws FormatError if any value does not fit its field.
 */
export function formatRow(row: Row): string {
  const parts: string[] = [];
  const problems: FormatProblem[] = [];
  for (const def of FIELDS) {
    const raw = def.key === "INDVNR" ? "2278" : def.key === "FILLER" ? "" : row[def.key];
    const out = formatField(def, raw);
    if (typeof out === "string") parts.push(out);
    else problems.push(out);
  }
  if (problems.length > 0) throw new FormatError(problems);
  return parts.join("");
}

/**
 * Read a 2278 line into a row. Values are trimmed, as the template's "Hent fil" does;
 * numeric values keep their leading zeros. Blank fields are omitted. A line shorter
 * than 1,112 characters (e.g. trailing spaces stripped by an editor) is padded.
 */
export function parseRow(line: string): Row {
  const padded = line.padEnd(LINE_LENGTH, " ");
  const row: Row = {};
  for (const def of FIELDS) {
    if (def.key === "FILLER") continue;
    const value = padded.slice(def.start - 1, def.start - 1 + def.length).trim();
    if (value !== "") row[def.key] = value;
  }
  return row;
}
