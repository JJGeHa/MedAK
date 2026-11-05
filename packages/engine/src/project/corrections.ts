/**
 * Corrections of an accepted report (guidance section 6): the wrong line is repeated with
 * minus signs, the right line follows with plus signs, both with correction code 1, and both
 * must arrive in the same production run. The file writes the sign in its own fields, never
 * inside an amount.
 */
import { classifyId } from "../checks.ts";
import type { Scenario } from "../codes.ts";
import { SIGN_FIELDS } from "../fields.ts";
import { formatRow, type Row } from "../record.ts";
import { ruleFor } from "../scenarios.ts";

/** The line that cancels an accepted line. Signs locked by the scenario stay as they are. */
export function reverseRow(original: Row, scenario: Scenario): Row {
  const row: Row = { ...original, RETTEKOD: "1" };
  for (const key of SIGN_FIELDS) {
    if (ruleFor(scenario, key).kind !== "fixed") row[key] = "-";
  }
  return row;
}

/** The two lines that replace an accepted line with a corrected one, in the order to send them. */
export function correctionPair(original: Row, corrected: Row, scenario: Scenario): [Row, Row] {
  return [reverseRow(original, scenario), { ...corrected, RETTEKOD: "1" }];
}

/** What identifies a transaction across files: who, which share, which code, when and which note. */
function transactionKey(row: Row): string {
  const who = row.PNRSENR ? classifyId(row.PNRSENR).normalized : `${row.TINNR ?? ""}|${row.PERSFORNVN ?? ""}|${row.PERSEFTERNVN ?? ""}`;
  return [who, row.ISINKOD ?? "", row.PAPIRIDENTNVN ?? "", row.KOEBSALGKOD ?? "", row.HANDEDTO ?? "", (row.FONDNOTANR ?? "").trim()].join("|");
}

const isReversal = (row: Row) => row.STKFTG === "-";

/**
 * What SKAT holds after a series of accepted files: each ordinary or corrected line is in force
 * until a reversal cancels a line with the same contents. Identical transactions are kept apart.
 */
export function acceptedState(files: readonly (readonly Row[])[]): Row[] {
  const held: Row[] = [];
  for (const rows of files) {
    for (const row of rows) {
      if (isReversal(row)) {
        const wanted = comparable(row);
        const index = held.findIndex((h) => comparable(h) === wanted);
        if (index >= 0) held.splice(index, 1);
      } else {
        held.push(row);
      }
    }
  }
  return held;
}

/** A row as a string for comparing contents, ignoring correction code and signs. */
function comparable(row: Row): string {
  const plain: Row = { ...row, RETTEKOD: "0" };
  for (const key of SIGN_FIELDS) plain[key] = "+";
  return formatRow(plain);
}

export type CorrectionChange =
  | { readonly kind: "changed"; readonly before: Row; readonly after: Row }
  | { readonly kind: "removed"; readonly before: Row }
  | { readonly kind: "added"; readonly after: Row };

export interface Correction {
  readonly changes: readonly CorrectionChange[];
  /** The lines to send, in order. Empty when nothing changed. */
  readonly rows: readonly Row[];
}

/**
 * The correction needed to bring what SKAT accepted in line with the report as it is now. Changed
 * lines become a reversal and a corrected line (code 1), removed lines a reversal, and lines not
 * reported before are ordinary lines (code 0).
 */
export function buildCorrection(accepted: readonly Row[], current: readonly Row[], scenario: Scenario): Correction {
  const remaining = new Map<string, Row[]>();
  for (const row of accepted) {
    const key = transactionKey(row);
    remaining.set(key, [...(remaining.get(key) ?? []), row]);
  }
  const changes: CorrectionChange[] = [];
  const rows: Row[] = [];

  // First pair off lines that are unchanged, so a change is matched to the right original.
  const unmatched: Row[] = [];
  for (const row of current) {
    const key = transactionKey(row);
    const candidates = remaining.get(key) ?? [];
    const same = candidates.findIndex((c) => comparable(c) === comparable(row));
    if (same >= 0) candidates.splice(same, 1);
    else unmatched.push(row);
  }
  for (const row of unmatched) {
    const candidates = remaining.get(transactionKey(row)) ?? [];
    const before = candidates.shift();
    if (before) {
      changes.push({ kind: "changed", before, after: row });
      rows.push(...correctionPair(before, row, scenario));
    } else {
      changes.push({ kind: "added", after: row });
      rows.push({ ...row, RETTEKOD: "0" });
    }
  }
  for (const before of [...remaining.values()].flat()) {
    changes.push({ kind: "removed", before });
    rows.push(reverseRow(before, scenario));
  }
  return { changes, rows };
}
