/**
 * Turning a pasted spreadsheet or CSV file into people in an event. People lists almost always
 * exist already, in payroll or a cap-table tool.
 */
import { classifyId } from "../checks.ts";
import { type NumberLocale, toFixedDigits } from "../units.ts";

/** Split delimited text into rows of cells. Handles tabs (Excel paste), semicolons, commas and quotes. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (clean.trim() === "") return [];
  const firstLine = clean.split("\n", 1)[0]!;
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delimiter = count("\t") > 0 ? "\t" : count(";") > 0 ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell.trim()); cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim()); rows.push(row); row = []; cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** The columns a people list can supply. */
export type PeopleColumn = "name" | "id" | "shares" | "taxed" | "paid" | "note";

const HEADER_WORDS: Readonly<Record<PeopleColumn, RegExp>> = {
  id: /cpr|cvr|personnummer|person.?nr|national.?id|\bssn\b/i,
  name: /navn|name|medarbejder|employee/i,
  shares: /antal|aktier|anparter|shares|quantity|qty|units/i,
  taxed: /beskat|taxed|taxable|e-?indkomst|skattepligtig|l[øo]n|payroll|benefit/i,
  paid: /betalt|\bpaid\b|egenbetaling/i,
  note: /nota|note|reference|ref\b/i,
};

/** Suggest which column holds what, from the header row. Each column is used at most once. */
export function guessColumns(headers: readonly string[]): Partial<Record<PeopleColumn, number>> {
  const guess: Partial<Record<PeopleColumn, number>> = {};
  const used = new Set<number>();
  // Most specific first, so "Beskattet løn" isn't taken for a name or "CPR-nummer" for a note.
  for (const column of ["id", "taxed", "paid", "shares", "note", "name"] as const) {
    const index = headers.findIndex((h, i) => !used.has(i) && HEADER_WORDS[column].test(h));
    if (index >= 0) { guess[column] = index; used.add(index); }
  }
  return guess;
}

/** True when the first row looks like headers: no cell in it holds a number or an ID. */
export function hasHeaderRow(rows: readonly (readonly string[])[]): boolean {
  const first = rows[0];
  return first !== undefined && !first.some((c) => /\d/.test(c));
}

export interface ImportedPersonRow {
  /** 1-based row in what was pasted, for error messages. */
  readonly rowNumber: number;
  readonly name?: string;
  /** Digits only: 10 for a CPR number, 8 for CVR/SE. */
  readonly danishId?: string;
  readonly shares?: string;
  readonly taxed?: string;
  readonly paid?: string;
  readonly noteNumber?: string;
  /** Cells that could not be read, by column. Nothing is guessed. */
  readonly problems: readonly PeopleColumn[];
}

/**
 * Read the rows with a chosen column mapping. Numbers use the user's language (`1.234,50` in
 * Danish), and a value that is ambiguous or malformed is reported, never guessed. A CPR number
 * may be written with a hyphen; a leading zero lost by Excel is restored when the result then
 * forms a valid 10 digits.
 */
export function readPeople(
  rows: readonly (readonly string[])[],
  mapping: Partial<Record<PeopleColumn, number>>,
  locale: NumberLocale,
  skipFirstRow: boolean,
): ImportedPersonRow[] {
  const out: ImportedPersonRow[] = [];
  rows.forEach((row, i) => {
    if (skipFirstRow && i === 0) return;
    const cell = (c: PeopleColumn) => {
      const index = mapping[c];
      return index === undefined ? "" : (row[index] ?? "").trim();
    };
    const problems: PeopleColumn[] = [];

    let danishId: string | undefined;
    const rawId = cell("id").replace(/[\s-]/g, "");
    if (rawId !== "") {
      const padded = /^\d{9}$/.test(rawId) ? "0" + rawId : rawId;
      if (classifyId(padded).kind === "invalid") problems.push("id");
      else danishId = padded;
    }

    const number = (c: PeopleColumn, decimals: number): string | undefined => {
      const value = cell(c);
      if (value === "") return undefined;
      const parsed = toFixedDigits(value, decimals, locale);
      if (parsed.ok) return parsed.digits;
      problems.push(c);
      return undefined;
    };
    const shares = number("shares", 6);
    const taxed = number("taxed", 2);
    const paid = number("paid", 2);
    const name = cell("name");
    const note = cell("note");

    out.push({
      rowNumber: i + 1,
      ...(name ? { name } : {}),
      ...(danishId ? { danishId } : {}),
      ...(shares !== undefined ? { shares } : {}),
      ...(taxed !== undefined ? { taxed } : {}),
      ...(paid !== undefined ? { paid } : {}),
      ...(note ? { noteNumber: note } : {}),
      problems,
    });
  });
  return out;
}
