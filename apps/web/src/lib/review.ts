/** Plain-language descriptions of lines in a report, for the page people read and sign off. */
import { fromFixedDigits, type Person, type Row, type Security, SKAT_ERROR_CODES } from "@medak/engine";
import { maskId } from "./format";
import type { Lang } from "./types";

export function personName(person: Person | undefined, lang: Lang): string {
  if (!person) return lang === "da" ? "Ukendt person" : "Unknown person";
  if (person.displayName) return person.displayName;
  const names = person.abroad?.names;
  if (names) return names.kind === "company" ? names.name : `${names.first} ${names.last}`.trim();
  return maskId(person.danishId) || (lang === "da" ? "Person uden navn" : "Person without a name");
}

/** The name on a line of a file, using the register where the person is known. */
export function rowName(row: Row, persons: readonly Person[], lang: Lang): string {
  const id = row.PNRSENR?.replace(/^00(?=\d{8}$)/, "");
  const person = id ? persons.find((p) => p.danishId === id) : undefined;
  if (person) return personName(person, lang);
  if (row.PERSFORNVN) return row.PERSFORNVN === row.PERSEFTERNVN ? row.PERSFORNVN : `${row.PERSFORNVN} ${row.PERSEFTERNVN ?? ""}`.trim();
  return maskId(id) || (lang === "da" ? "Ukendt person" : "Unknown person");
}

function formatDate(ymd: string | undefined, lang: Lang): string {
  if (!ymd || !/^\d{8}$/.test(ymd) || ymd === "00000000") return "";
  const date = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))));
  return date.toLocaleDateString(lang === "da" ? "da-DK" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const money = (digits: string | undefined, lang: Lang) => fromFixedDigits(digits && /^\d+$/.test(digits) ? digits : "0", 2, lang);
const quantity = (digits: string | undefined, lang: Lang) => fromFixedDigits(digits && /^\d+$/.test(digits) ? digits : "0", 6, lang, 0);

/** One sentence describing a line: who, what, when, and for how much. */
export function describeRow(row: Row, persons: readonly Person[], lang: Lang): string {
  const name = rowName(row, persons, lang);
  const shares = quantity(row.STKANT, lang);
  const security = row.PAPIRIDENTNVN ?? "";
  const date = formatDate(row.HANDEDTO, lang);
  const amount = money(row.NTOAFRBSKVALBLB, lang);
  const code = row.KOEBSALGKOD ?? "";
  const reversal = row.STKFTG === "-";
  if (lang === "da") {
    const prefix = reversal ? "Tilbageførsel: " : "";
    switch (code) {
      case "S": return `${prefix}Selskabet købte ${shares} ${security} af ${name} den ${date} for ${amount} kr. (kode S).`;
      case "L": return `${prefix}${name} fik ${amount} kr. i likvidationsprovenu for ${shares} ${security} den ${date} (kode L).`;
      case "R": case "K":
        if (row.PAPIRTYPEKOD === "3" || row.PAPIRTYPEKOD === "4") return `${prefix}${name} investerede ${amount} kr. i ${security} den ${date} (kode ${code}).`;
    }
    return `${prefix}${name} fik ${shares} ${security} den ${date}. Anskaffelsessum ${amount} kr. (kode ${code}).`;
  }
  const prefix = reversal ? "Reversal: " : "";
  switch (code) {
    case "S": return `${prefix}The company bought ${shares} ${security} from ${name} on ${date} for DKK ${amount} (code S).`;
    case "L": return `${prefix}${name} received DKK ${amount} in liquidation proceeds for ${shares} ${security} on ${date} (code L).`;
    case "R": case "K":
      if (row.PAPIRTYPEKOD === "3" || row.PAPIRTYPEKOD === "4") return `${prefix}${name} invested DKK ${amount} in ${security} on ${date} (code ${code}).`;
  }
  return `${prefix}${name} received ${shares} ${security} on ${date}. Acquisition sum DKK ${amount} (code ${code}).`;
}

/** SKAT's code in plain words, with the code itself for matching against SKAT's report. */
export function explainCode(code: string, lang: Lang): string {
  const text = SKAT_ERROR_CODES[code];
  return text ? `${text[lang]} (${lang === "da" ? "kode" : "code"} ${code})` : `${lang === "da" ? "Kode" : "Code"} ${code}`;
}

export function securityLabel(security: Security | undefined, lang: Lang): string {
  if (!security) return lang === "da" ? "Ingen aktie valgt" : "No share chosen";
  return security.name || (lang === "da" ? "Aktie uden navn" : "Share without a name");
}
