/**
 * Windows-1252 encoding. SKAT's Excel template writes files with VBA `Print #`, which uses
 * the Windows ANSI code page (1252 on Danish and Western European Windows). This is our
 * best assumption of what SKAT expects for æ, ø and å; see docs/2278-format.md.
 */

/** Unicode code points for bytes 0x80–0x9F in Windows-1252 (where it differs from Latin-1). */
const HIGH: Readonly<Record<number, number>> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function byteFor(codePoint: number): number | undefined {
  if (codePoint < 0x80 || (codePoint >= 0xa0 && codePoint <= 0xff)) return codePoint;
  return HIGH[codePoint];
}

/** Characters in `text` that Windows-1252 cannot represent, without duplicates. */
export function unencodableCharacters(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    if (byteFor(ch.codePointAt(0)!) === undefined) bad.add(ch);
  }
  return [...bad];
}

export class EncodingError extends Error {
  readonly characters: readonly string[];
  constructor(characters: readonly string[]) {
    super(`Cannot encode in Windows-1252: ${characters.join(" ")}`);
    this.name = "EncodingError";
    this.characters = characters;
  }
}

/**
 * Encode text as Windows-1252 bytes.
 * @throws EncodingError listing the characters that cannot be represented.
 */
export function encodeWindows1252(text: string): Uint8Array {
  const bad = unencodableCharacters(text);
  if (bad.length > 0) throw new EncodingError(bad);
  const out: number[] = [];
  for (const ch of text) out.push(byteFor(ch.codePointAt(0)!)!);
  return Uint8Array.from(out);
}

/** Decode Windows-1252 bytes (e.g. a file produced by SKAT's template). */
export function decodeWindows1252(bytes: Uint8Array): string {
  return new TextDecoder("windows-1252").decode(bytes);
}
