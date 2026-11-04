import { LINE_LENGTH } from "./fields.ts";
import { formatRow, parseRow, type Row } from "./record.ts";

/**
 * Who submits the file: the reporting company itself, or the advisor firm that reports
 * on its behalf. Written in the start record (`0001`) and end record (`9998`).
 */
export interface Sender {
  /** 8-digit CVR or SE number. */
  readonly seNumber: string;
  /** Up to 27 characters. */
  readonly name: string;
  /** Up to 35 characters. */
  readonly address: string;
}

export const START_RECORD = "0001";
export const DATA_RECORD = "2278";
export const END_RECORD = "9998";

/** Constant written after the sender number in the start record (meaning undocumented). */
const START_CONSTANT = "0301451";
/** File number for 2278 files, written after the constant. */
const FILE_NUMBER = "278";

const SENDER_NAME_LENGTH = 27;
const SENDER_ADDRESS_LENGTH = 35;

export class SenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SenderError";
  }
}

function checkSender(sender: Sender): void {
  if (!/^\d{1,8}$/.test(sender.seNumber.trim())) {
    throw new SenderError("Sender SE/CVR number must be 1–8 digits");
  }
  if (sender.name.trim().length > SENDER_NAME_LENGTH) {
    throw new SenderError(`Sender name is longer than ${SENDER_NAME_LENGTH} characters`);
  }
  if (sender.address.trim().length > SENDER_ADDRESS_LENGTH) {
    throw new SenderError(`Sender address is longer than ${SENDER_ADDRESS_LENGTH} characters`);
  }
}

const se8 = (s: string) => s.trim().padStart(8, "0");

export function formatStartRecord(sender: Sender): string {
  checkSender(sender);
  return (
    START_RECORD +
    se8(sender.seNumber) +
    START_CONSTANT +
    FILE_NUMBER +
    sender.name.trim().padEnd(SENDER_NAME_LENGTH, " ") +
    sender.address.trim().padEnd(SENDER_ADDRESS_LENGTH, " ")
  ).padEnd(LINE_LENGTH, " ");
}

/**
 * @param lineCount number of lines in the file, including the start and end record.
 * @param version template version string, e.g. `2024-v1`.
 */
export function formatEndRecord(seNumber: string, lineCount: number, version: string): string {
  if (lineCount > 9_999_999) throw new RangeError("Too many lines for one file");
  return (END_RECORD + se8(seNumber) + String(lineCount).padStart(7, "0") + version).padEnd(
    LINE_LENGTH,
    " ",
  );
}

export interface BuildFileOptions {
  readonly sender: Sender;
  readonly rows: readonly Row[];
  /** Template version string for the end record; see TEMPLATE_VERSION. */
  readonly version: string;
  /** Defaults to CRLF, which is what the Excel template writes. */
  readonly lineEnding?: "\r\n" | "\n";
}

/**
 * Build the full file text: start record, one line per row, end record. Every line,
 * including the last, ends with the line ending (as VBA `Print #` does).
 * @throws FormatError or SenderError when data does not fit.
 */
export function buildFile({ sender, rows, version, lineEnding = "\r\n" }: BuildFileOptions): string {
  const lines = [
    formatStartRecord(sender),
    ...rows.map(formatRow),
    formatEndRecord(sender.seNumber, rows.length + 2, version),
  ];
  return lines.map((l) => l + lineEnding).join("");
}

export interface EndRecord {
  readonly seNumber: string;
  readonly lineCount: number;
  readonly version: string;
}

export type ParseProblem =
  | { readonly kind: "missingStartRecord" }
  | { readonly kind: "missingEndRecord" }
  | { readonly kind: "unknownRecordType"; readonly line: number; readonly recordType: string }
  | { readonly kind: "wrongLineLength"; readonly line: number; readonly length: number }
  | { readonly kind: "lineCountMismatch"; readonly expected: number; readonly actual: number };

export interface ParsedFile {
  readonly sender: Sender | null;
  /** Data records with their 1-based line number in the file. */
  readonly rows: readonly { readonly line: number; readonly row: Row }[];
  readonly end: EndRecord | null;
  readonly problems: readonly ParseProblem[];
}

/**
 * Read a 2278 file, e.g. one produced by SKAT's Excel template. Tolerant: collects
 * problems instead of throwing, so a damaged file can still be loaded and repaired.
 */
export function parseFile(text: string): ParsedFile {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();

  let sender: Sender | null = null;
  let end: EndRecord | null = null;
  const rows: { line: number; row: Row }[] = [];
  const problems: ParseProblem[] = [];

  for (const [i, line] of lines.entries()) {
    const lineNo = i + 1;
    if (line.trim() === "") continue;
    if (line.length > LINE_LENGTH) problems.push({ kind: "wrongLineLength", line: lineNo, length: line.length });
    const type = line.slice(0, 4);
    if (type === START_RECORD) {
      sender = {
        seNumber: line.slice(4, 12).trim(),
        name: line.slice(22, 22 + SENDER_NAME_LENGTH).trim(),
        address: line.slice(49, 49 + SENDER_ADDRESS_LENGTH).trim(),
      };
    } else if (type === DATA_RECORD) {
      rows.push({ line: lineNo, row: parseRow(line) });
    } else if (type === END_RECORD) {
      end = {
        seNumber: line.slice(4, 12).trim(),
        lineCount: Number(line.slice(12, 19)),
        version: line.slice(19).trim(),
      };
    } else {
      problems.push({ kind: "unknownRecordType", line: lineNo, recordType: type });
    }
  }

  if (sender === null) problems.push({ kind: "missingStartRecord" });
  if (end === null) problems.push({ kind: "missingEndRecord" });
  else {
    const actual = rows.length + (sender === null ? 0 : 1) + 1;
    if (end.lineCount !== actual) problems.push({ kind: "lineCountMismatch", expected: end.lineCount, actual });
  }
  return { sender, rows, end, problems };
}
