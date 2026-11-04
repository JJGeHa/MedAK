/**
 * Layout of dataindivid 2278: 63 fields (plus filler) in a 1,112-character line.
 *
 * Positions, lengths and padding follow SKAT's Excel template (VBA `opbygIndivid`)
 * and Bilag 1 of the guidance. See docs/2278-format.md.
 */

export type Lang = "da" | "en";
export type Text = Readonly<Record<Lang, string>>;

/**
 * How a value is written into its slot.
 * - `alpha`: left-justified, padded with spaces.
 * - `numeric`: right-justified, padded with zeros. Blank stays blank (spaces).
 * - `id`: field 11. An 8-digit CVR/SE gets a `00` prefix; otherwise left-justified.
 */
export type Padding = "alpha" | "numeric" | "id";

/** What the stored digits mean, for numeric fields. */
export type Unit =
  | "integer" // plain number, e.g. a year or a CVR number
  | "ore" // money with 2 implied decimals (øre)
  | "decimal6" // quantity, price or FX rate with 6 implied decimals
  | "date" // ÅÅÅÅMMDD
  | "time" // TTMMSS
  | "sign"; // "+" or "-"

export type FieldKey =
  | "INDVNR" | "OPSENR" | "BANKRGISTNR" | "DEPOTNR" | "FONDNOTANR" | "PNRSENR"
  | "EJERSTATUKOD" | "RETTEKOD" | "ISINKOD" | "PAPIRIDENTNVN" | "PAPIRTYPEKOD" | "PAPIRLANDKOD"
  | "STKFTG" | "STKANT" | "AKTIPAPIRKURSPCT" | "OMSVALKOD"
  | "KURVAEOMSVALFTG" | "KURVAEOMSVALBLB" | "OMKOMSVALFTG" | "OMKOMSVALBLB"
  | "NTOAFROMSVALFTG" | "NTOAFROMSVALBLB" | "AFRVALKOD" | "NTOAFRAFRVALFTG" | "NTOAFRAFRVALBLB"
  | "KURVAEBSKVALFTG" | "KURVAEBSKVALBLB" | "OMKBSKVALFTG" | "OMKBSKVALBLB"
  | "NTOAFRBSKVALFTG" | "NTOAFRBSKVALBLB" | "VALKURSPCT" | "HANDEDTO" | "VALOEDTO" | "INDKAAR"
  | "TINNR" | "TINNRTYPEKOD" | "FOEDESTEDNVN" | "FOEDELANDKOD" | "PERSFORNVN" | "PERSEFTERNVN"
  | "CONVN" | "VEJNVN" | "HUSNR" | "ETAGENR" | "SIDEDOERNR" | "POSTBOXADR" | "LANDBYNVN"
  | "POSTNR" | "POSTDISTRADR" | "HUSNVN" | "LJLIHVAERSNR" | "EGNLANDELSTANVN" | "LANDENVN"
  | "LANDKOD" | "KOEBSALGKOD" | "ASIDNR" | "OPTAGHANDEKOD" | "DEPOTTYPEKOD" | "HANDETID"
  | "INVESTOREJERSKAB" | "EJERANDELRKOPCT" | "FILLER";

export interface FieldDef {
  readonly key: FieldKey;
  /** SKAT's field number ("Felt"). All eight sign fields are number 18. 0 for the filler. */
  readonly felt: number;
  /** Column in SKAT's Excel sheet. */
  readonly column: string;
  /** 1-based start position in the line. */
  readonly start: number;
  readonly length: number;
  readonly padding: Padding;
  readonly unit?: Unit;
  readonly label: Text;
}

type FieldSpec = Omit<FieldDef, "start">;

const t = (da: string, en: string): Text => ({ da, en });

const SPECS: readonly FieldSpec[] = [
  { key: "INDVNR", felt: 1, column: "A", length: 4, padding: "numeric", unit: "integer", label: t("Individnummer", "Record type") },
  { key: "OPSENR", felt: 7, column: "B", length: 8, padding: "numeric", unit: "integer", label: t("Indberetningspligtiges cvr-/se-nr.", "Reporting company's CVR/SE no.") },
  { key: "BANKRGISTNR", felt: 8, column: "C", length: 4, padding: "numeric", unit: "integer", label: t("Bankregistreringsnummer", "Bank registration no.") },
  { key: "DEPOTNR", felt: 9, column: "D", length: 17, padding: "alpha", label: t("Depotnummer", "Custody account no.") },
  { key: "FONDNOTANR", felt: 10, column: "E", length: 17, padding: "alpha", label: t("Fondsnotanummer", "Contract note no.") },
  { key: "PNRSENR", felt: 11, column: "F", length: 10, padding: "id", label: t("Cpr-/cvr-/se-nr.", "CPR/CVR/SE no.") },
  { key: "EJERSTATUKOD", felt: 12, column: "G", length: 1, padding: "alpha", label: t("Ejerstatuskode", "Owner status") },
  { key: "RETTEKOD", felt: 13, column: "H", length: 1, padding: "alpha", label: t("Rettekode", "Correction code") },
  { key: "ISINKOD", felt: 14, column: "I", length: 12, padding: "alpha", label: t("ISIN-kode", "ISIN") },
  { key: "PAPIRIDENTNVN", felt: 15, column: "J", length: 50, padding: "alpha", label: t("Papirnavn", "Security name") },
  { key: "PAPIRTYPEKOD", felt: 16, column: "K", length: 1, padding: "alpha", label: t("Papirtype", "Security type") },
  { key: "PAPIRLANDKOD", felt: 17, column: "L", length: 2, padding: "alpha", label: t("Papirlandekode", "Issuer country") },
  { key: "STKFTG", felt: 18, column: "M", length: 1, padding: "alpha", unit: "sign", label: t("Fortegn (antal)", "Sign (quantity)") },
  { key: "STKANT", felt: 19, column: "N", length: 18, padding: "numeric", unit: "decimal6", label: t("Antal stk.", "Number of shares") },
  { key: "AKTIPAPIRKURSPCT", felt: 20, column: "O", length: 16, padding: "numeric", unit: "decimal6", label: t("Aktie-/papirkurs", "Price per share") },
  { key: "OMSVALKOD", felt: 21, column: "P", length: 3, padding: "alpha", label: t("Omsætningsvalutakode", "Trading currency") },
  { key: "KURVAEOMSVALFTG", felt: 18, column: "Q", length: 1, padding: "alpha", unit: "sign", label: t("Fortegn (kursværdi, omsætningsvaluta)", "Sign (market value, trading currency)") },
  { key: "KURVAEOMSVALBLB", felt: 22, column: "R", length: 17, padding: "numeric", unit: "ore", label: t("Kursværdi i omsætningsvaluta", "Market value (trading currency)") },
  { key: "OMKOMSVALFTG", felt: 18, column: "S", length: 1, padding: "alpha", unit: "sign", label: t("Fortegn (omkostninger, omsætningsvaluta)", "Sign (costs, trading currency)") },
  { key: "OMKOMSVALBLB", felt: 23, column: "T", length: 10, padding: "numeric", unit: "ore", label: t("Omkostninger i omsætningsvaluta", "Costs (trading currency)") },
  { key: "NTOAFROMSVALFTG", felt: 18, column: "U", length: 1, padding: "alpha", unit: "sign", label: t("Fortegn (nettoafregning, omsætningsvaluta)", "Sign (net settlement, trading currency)") },
  { key: "NTOAFROMSVALBLB", felt: 24, column: "V", length: 17, padding: "numeric", unit: "ore", label: t("Nettoafregning i omsætningsvaluta", "Net settlement (trading currency)") },
  { key: "AFRVALKOD", felt: 25, column: "W", length: 3, padding: "alpha", label: t("Afregningsvalutakode", "Settlement currency") },
  { key: "NTOAFRAFRVALFTG", felt: 18, column: "X", length: 1, padding: "alpha", unit: "sign", label: t("Fortegn (nettoafregning, afregningsvaluta)", "Sign (net settlement, settlement currency)") },
  { key: "NTOAFRAFRVALBLB", felt: 26, column: "Y", length: 17, padding: "numeric", unit: "ore", label: t("Nettoafregning i afregningsvaluta", "Net settlement (settlement currency)") },
  { key: "KURVAEBSKVALFTG", felt: 18, column: "Z", length: 1, padding: "alpha", unit: "sign", label: t("Fortegn (kursværdi, DKK)", "Sign (market value, DKK)") },
  { key: "KURVAEBSKVALBLB", felt: 27, column: "AA", length: 17, padding: "numeric", unit: "ore", label: t("Kursværdi i beskatningsvaluta (DKK)", "Market value (DKK)") },
  { key: "OMKBSKVALFTG", felt: 18, column: "AB", length: 1, padding: "alpha", unit: "sign", label: t("Fortegn (omkostninger, DKK)", "Sign (costs, DKK)") },
  { key: "OMKBSKVALBLB", felt: 28, column: "AC", length: 10, padding: "numeric", unit: "ore", label: t("Omkostninger i beskatningsvaluta (DKK)", "Costs (DKK)") },
  { key: "NTOAFRBSKVALFTG", felt: 18, column: "AD", length: 1, padding: "alpha", unit: "sign", label: t("Fortegn (nettoafregning, DKK)", "Sign (net settlement, DKK)") },
  { key: "NTOAFRBSKVALBLB", felt: 29, column: "AE", length: 17, padding: "numeric", unit: "ore", label: t("Nettoafregning i beskatningsvaluta (DKK)", "Net settlement (DKK)") },
  { key: "VALKURSPCT", felt: 30, column: "AF", length: 11, padding: "numeric", unit: "decimal6", label: t("Valutakurs", "Exchange rate (DKK per 100)") },
  { key: "HANDEDTO", felt: 31, column: "AG", length: 8, padding: "numeric", unit: "date", label: t("Handelsdato", "Trade date") },
  { key: "VALOEDTO", felt: 32, column: "AH", length: 8, padding: "numeric", unit: "date", label: t("Valørdato", "Value date") },
  { key: "INDKAAR", felt: 33, column: "AI", length: 4, padding: "numeric", unit: "integer", label: t("Indkomstår", "Income year") },
  { key: "TINNR", felt: 38, column: "AJ", length: 20, padding: "alpha", label: t("TIN-nummer", "Foreign tax ID (TIN)") },
  { key: "TINNRTYPEKOD", felt: 39, column: "AK", length: 1, padding: "alpha", label: t("TIN-typekode", "TIN type") },
  { key: "FOEDESTEDNVN", felt: 40, column: "AL", length: 35, padding: "alpha", label: t("Fødested", "Place of birth") },
  { key: "FOEDELANDKOD", felt: 41, column: "AM", length: 2, padding: "alpha", label: t("Fødeland", "Country of birth") },
  { key: "PERSFORNVN", felt: 42, column: "AN", length: 70, padding: "alpha", label: t("Fornavn", "First name") },
  { key: "PERSEFTERNVN", felt: 43, column: "AO", length: 70, padding: "alpha", label: t("Efternavn", "Last name") },
  { key: "CONVN", felt: 44, column: "AP", length: 70, padding: "alpha", label: t("C/o-navn", "c/o name") },
  { key: "VEJNVN", felt: 45, column: "AQ", length: 70, padding: "alpha", label: t("Vejnavn", "Street") },
  { key: "HUSNR", felt: 46, column: "AR", length: 10, padding: "alpha", label: t("Husnummer", "House number") },
  { key: "ETAGENR", felt: 47, column: "AS", length: 5, padding: "alpha", label: t("Etage", "Floor") },
  { key: "SIDEDOERNR", felt: 48, column: "AT", length: 10, padding: "alpha", label: t("Sidedør", "Door") },
  { key: "POSTBOXADR", felt: 49, column: "AU", length: 20, padding: "alpha", label: t("Postboks", "PO box") },
  { key: "LANDBYNVN", felt: 50, column: "AV", length: 70, padding: "alpha", label: t("Landsby", "Village") },
  { key: "POSTNR", felt: 51, column: "AW", length: 15, padding: "alpha", label: t("Postnummer", "Postcode") },
  { key: "POSTDISTRADR", felt: 52, column: "AX", length: 70, padding: "alpha", label: t("Postdistrikt", "Town") },
  { key: "HUSNVN", felt: 53, column: "AY", length: 70, padding: "alpha", label: t("Husnavn", "House name") },
  { key: "LJLIHVAERSNR", felt: 54, column: "AZ", length: 20, padding: "alpha", label: t("Lejlighed/værelsesnr.", "Apartment/room") },
  { key: "EGNLANDELSTANVN", felt: 55, column: "BA", length: 70, padding: "alpha", label: t("Egn/landsdel/stat", "Region/state") },
  { key: "LANDENVN", felt: 56, column: "BB", length: 70, padding: "alpha", label: t("Landenavn", "Country name") },
  { key: "LANDKOD", felt: 35, column: "BC", length: 2, padding: "alpha", label: t("Hjemlandskode", "Country of residence") },
  { key: "KOEBSALGKOD", felt: 57, column: "BD", length: 1, padding: "alpha", label: t("Køb/salgskode", "Transaction code") },
  { key: "ASIDNR", felt: 58, column: "BE", length: 5, padding: "alpha", label: t("AS-identnummer", "AS-ident (Euronext Securities)") },
  { key: "OPTAGHANDEKOD", felt: 59, column: "BF", length: 1, padding: "alpha", label: t("Optaget til handel-kode", "Admitted to trading") },
  { key: "DEPOTTYPEKOD", felt: 60, column: "BG", length: 1, padding: "alpha", label: t("Depottypekode", "Custody type") },
  { key: "HANDETID", felt: 61, column: "BH", length: 6, padding: "alpha", unit: "time", label: t("Handelstidspunkt", "Trade time") },
  { key: "INVESTOREJERSKAB", felt: 62, column: "BI", length: 1, padding: "alpha", label: t("Investorejerskabskode", "Prior investor ownership") },
  { key: "EJERANDELRKOPCT", felt: 63, column: "BJ", length: 6, padding: "alpha", label: t("Ejerandel", "Ownership share") },
  { key: "FILLER", felt: 0, column: "", length: 10, padding: "alpha", label: t("Udfyldning", "Filler") },
];

/** Fields in file order, with computed start positions. */
export const FIELDS: readonly FieldDef[] = (() => {
  let start = 1;
  return SPECS.map((spec) => {
    const def: FieldDef = { ...spec, start };
    start += spec.length;
    return def;
  });
})();

/** Length of every line in a 2278 file. */
export const LINE_LENGTH = 1112;

export const FIELD_BY_KEY: Readonly<Record<FieldKey, FieldDef>> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f]),
) as Record<FieldKey, FieldDef>;

/** The eight sign fields ("felt 18"), each placed just before the value it signs. */
export const SIGN_FIELDS = [
  "STKFTG", "KURVAEOMSVALFTG", "OMKOMSVALFTG", "NTOAFROMSVALFTG",
  "NTOAFRAFRVALFTG", "KURVAEBSKVALFTG", "OMKBSKVALFTG", "NTOAFRBSKVALFTG",
] as const satisfies readonly FieldKey[];

/** Amount fields in øre, paired with their sign field. */
export const AMOUNT_FIELDS = [
  ["KURVAEOMSVALBLB", "KURVAEOMSVALFTG"],
  ["OMKOMSVALBLB", "OMKOMSVALFTG"],
  ["NTOAFROMSVALBLB", "NTOAFROMSVALFTG"],
  ["NTOAFRAFRVALBLB", "NTOAFRAFRVALFTG"],
  ["KURVAEBSKVALBLB", "KURVAEBSKVALFTG"],
  ["OMKBSKVALBLB", "OMKBSKVALFTG"],
  ["NTOAFRBSKVALBLB", "NTOAFRBSKVALFTG"],
] as const satisfies readonly (readonly [FieldKey, FieldKey])[];

/** Fields 35 and 38–56: identity, name and address of an owner resident abroad. */
export const FOREIGN_OWNER_FIELDS = [
  "TINNR", "TINNRTYPEKOD", "FOEDESTEDNVN", "FOEDELANDKOD", "PERSFORNVN", "PERSEFTERNVN",
  "CONVN", "VEJNVN", "HUSNR", "ETAGENR", "SIDEDOERNR", "POSTBOXADR", "LANDBYNVN", "POSTNR",
  "POSTDISTRADR", "HUSNVN", "LJLIHVAERSNR", "EGNLANDELSTANVN", "LANDENVN", "LANDKOD",
] as const satisfies readonly FieldKey[];
