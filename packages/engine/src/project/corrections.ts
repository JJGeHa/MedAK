/**
 * Corrections of an accepted report (guidance section 6): the wrong line is repeated with
 * minus signs, the right line follows with plus signs, both with correction code 1, and both
 * must arrive in the same production run. The file writes the sign in its own fields, never
 * inside an amount.
 */
import type { Scenario } from "../codes.ts";
import { SIGN_FIELDS } from "../fields.ts";
import type { Row } from "../record.ts";
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
