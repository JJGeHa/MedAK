import { FIELD_BY_KEY, type Lang, type Text } from "./fields.ts";
import type { Issue, RuleId } from "./validate.ts";

/**
 * Message templates per rule. Placeholders: {field} (the field's label), {value},
 * {expected}, {allowed}, {max}, {chars}, {year}, {years}, {from}, {to}.
 * Amounts in {expected} are in øre and formatted by the caller if needed.
 */
export const MESSAGES: Readonly<Record<RuleId, Text>> = {
  "format.tooLong": {
    da: "{field} er for langt: højst {max} tegn.",
    en: "{field} is too long: at most {max} characters.",
  },
  "format.notDigits": {
    da: "{field} må kun indeholde cifre (fik \"{value}\").",
    en: "{field} may contain digits only (got \"{value}\").",
  },
  "format.controlCharacter": {
    da: "{field} indeholder et linjeskift eller et andet kontroltegn.",
    en: "{field} contains a line break or another control character.",
  },
  "format.encoding": {
    da: "{field} indeholder tegn, som SKATs filformat ikke kan gemme: {chars}",
    en: "{field} contains characters SKAT's file format cannot store: {chars}",
  },
  "rule.fixed": {
    da: "{field} skal være \"{expected}\" for denne type indberetning.",
    en: "{field} must be \"{expected}\" for this type of report.",
  },
  "rule.mustBeBlank": {
    da: "{field} skal være tomt for denne type indberetning.",
    en: "{field} must be empty for this type of report.",
  },
  "rule.notInList": {
    da: "\"{value}\" er ikke en gyldig værdi for {field}.",
    en: "\"{value}\" is not a valid value for {field}.",
  },
  required: {
    da: "{field} skal udfyldes.",
    en: "{field} is required.",
  },
  "opsenr.invalid": {
    da: "Selskabets cvr-/se-nr. skal være 8 cifre.",
    en: "The company's CVR/SE number must be 8 digits.",
  },
  "opsenr.checksum": {
    da: "Selskabets cvr-/se-nr. {value} ser forkert ud (kontrolciffer). Tjek for tastefejl.",
    en: "The company's CVR/SE number {value} looks wrong (check digit). Check for typos.",
  },
  "id.missing": {
    da: "Cpr-, cvr- eller se-nummer mangler. Det må kun udelades for personer og selskaber i udlandet uden dansk nummer.",
    en: "CPR, CVR or SE number is missing. It may only be left out for people and companies abroad without a Danish number.",
  },
  "id.invalid": {
    da: "\"{value}\" er ikke et gyldigt cpr-nr. (10 cifre, starter med fødselsdato) eller cvr-/se-nr. (8 cifre).",
    en: "\"{value}\" is not a valid CPR number (10 digits, starting with the birth date) or CVR/SE number (8 digits).",
  },
  "id.cvrChecksum": {
    da: "Cvr-/se-nr. {value} ser forkert ud (kontrolciffer). Tjek for tastefejl.",
    en: "CVR/SE number {value} looks wrong (check digit). Check for typos.",
  },
  "id.employeeNeedsCpr": {
    da: "Medarbejderaktier indberettes normalt på medarbejderens cpr-nr., ikke et cvr-nr.",
    en: "Employee shares are normally reported on the employee's CPR number, not a CVR number.",
  },
  "date.invalid": {
    da: "{field} \"{value}\" er ikke en gyldig dato.",
    en: "{field} \"{value}\" is not a valid date.",
  },
  "time.invalid": {
    da: "{field} \"{value}\" er ikke et gyldigt klokkeslæt (TTMMSS).",
    en: "{field} \"{value}\" is not a valid time (HHMMSS).",
  },
  "year.invalid": {
    da: "Indkomståret \"{value}\" er ikke et gyldigt årstal.",
    en: "Income year \"{value}\" is not a valid year.",
  },
  "year.tradeDateMismatch": {
    da: "Datoen ligger ikke i indkomståret {year}. Hvert år skal indberettes i sin egen fil.",
    en: "The date is not in income year {year}. Each year must be reported in its own file.",
  },
  "year.valueDateMismatch": {
    da: "Valørdatoen ligger ikke i indkomståret {year}.",
    en: "The value date is not in income year {year}.",
  },
  "date.valueDateDiffers": {
    da: "Valørdatoen bør være den samme som handelsdatoen.",
    en: "The value date should be the same as the trade date.",
  },
  "year.differsFromReport": {
    da: "Indkomståret {value} passer ikke med indberetningens år {year}.",
    en: "Income year {value} does not match the report's year {year}.",
  },
  "file.mixedYears": {
    da: "Indberetningen indeholder flere indkomstår ({years}). Lav én fil pr. år.",
    en: "The report contains several income years ({years}). Make one file per year.",
  },
  "file.empty": {
    da: "Der er intet at indberette.",
    en: "There is nothing to report.",
  },
  "isin.invalid": {
    da: "ISIN-koden \"{value}\" er ikke gyldig (12 tegn med kontrolciffer).",
    en: "ISIN \"{value}\" is not valid (12 characters with a check digit).",
  },
  "isin.requiredWhenListed": {
    da: "Børsnoterede aktier har altid en ISIN-kode. Udfyld den.",
    en: "Listed shares always have an ISIN. Please fill it in.",
  },
  "asid.invalid": {
    da: "AS-identen skal være 5 cifre. Brug 00000, hvis aktien ikke er registreret i Euronext Securities.",
    en: "The AS-ident must be 5 digits. Use 00000 if the share is not registered with Euronext Securities.",
  },
  "owner.domesticHasForeignData": {
    da: "{field} må kun udfyldes for personer og selskaber i udlandet.",
    en: "{field} may only be filled in for people and companies abroad.",
  },
  "owner.foreignNeedsCountry": {
    da: "Angiv hvilket land personen eller selskabet bor i.",
    en: "Choose the country the person or company lives in.",
  },
  "owner.foreignCountryIsDk": {
    da: "Bopælslandet kan ikke være Danmark, når ejeren er markeret som bosat i udlandet.",
    en: "The country of residence cannot be Denmark when the owner is marked as living abroad.",
  },
  "owner.tinTypeMissing": {
    da: "Angiv om der oplyses TIN-nummer, fødselsdato, eller at identifikation mangler.",
    en: "Choose whether a TIN, a date of birth, or no identification is given.",
  },
  "owner.tinMissing": {
    da: "Udfyld det udenlandske TIN-nummer.",
    en: "Fill in the foreign tax identification number (TIN).",
  },
  "owner.tinBirthDateInvalid": {
    da: "Fødselsdatoen \"{value}\" skal skrives DDMMÅÅÅÅ.",
    en: "The date of birth \"{value}\" must be written DDMMYYYY.",
  },
  "owner.birthPlaceMissing": {
    da: "Udfyld fødested, når der oplyses fødselsdato i stedet for TIN.",
    en: "Fill in the place of birth when a date of birth is given instead of a TIN.",
  },
  "owner.birthCountryMissing": {
    da: "Udfyld fødeland, når der oplyses fødselsdato i stedet for TIN.",
    en: "Fill in the country of birth when a date of birth is given instead of a TIN.",
  },
  "owner.nameMissing": {
    da: "{field} skal udfyldes. For et selskab skrives navnet i både fornavn og efternavn.",
    en: "{field} is required. For a company, write the name in both first and last name.",
  },
  "owner.addressMissing": {
    da: "Udfyld vejnavn eller postboks.",
    en: "Fill in a street or a PO box.",
  },
  "owner.townMissing": {
    da: "Udfyld by/postdistrikt.",
    en: "Fill in the town.",
  },
  "owner.countryNameMissing": {
    da: "Udfyld landets navn.",
    en: "Fill in the country name.",
  },
  "sign.minusNeedsCorrection": {
    da: "Minus må kun bruges ved rettelse af en tidligere indberetning.",
    en: "Minus may only be used when correcting an earlier report.",
  },
  "sign.mixed": {
    da: "Fortegnene i linjen er forskellige. Normalt er de alle plus, eller alle minus ved tilbageførsel.",
    en: "The signs in the line differ. Normally they are all plus, or all minus when reversing.",
  },
  "amount.dkkRateNot100": {
    da: "Når der handles i DKK, skal valutakursen være 100.",
    en: "When trading in DKK, the exchange rate must be 100.",
  },
  "amount.dkkFieldsDiffer": {
    da: "Ved handel i DKK uden omkostninger bør alle beløbsfelter have samme beløb (anskaffelsessummen).",
    en: "When trading in DKK without costs, all amount fields should hold the same amount (the acquisition sum).",
  },
  "amount.marketValueMismatch": {
    da: "Kursværdien passer ikke med antal × kurs.",
    en: "The market value does not match quantity × price.",
  },
  "amount.dkkConversionMismatch": {
    da: "Beløbet i DKK passer ikke med beløbet i omsætningsvaluta omregnet med valutakursen.",
    en: "The DKK amount does not match the trading-currency amount converted at the exchange rate.",
  },
  "amount.netMismatch": {
    da: "Nettoafregningen skal være anskaffelsessummen plus omkostninger.",
    en: "The net settlement must be the acquisition sum plus costs.",
  },
  "amount.proceedsMissing": {
    da: "Likvidationsprovenuet skal være større end 0. Er der intet udbetalt, skal der ikke indberettes.",
    en: "The liquidation proceeds must be more than 0. If nothing was paid out, there is nothing to report.",
  },
  "quantity.zero": {
    da: "Antal aktier er 0.",
    en: "The number of shares is 0.",
  },
  "code.notValidOnDate": {
    da: "Koden {value} kan ikke bruges på denne dato.",
    en: "Code {value} cannot be used on this date.",
  },
  "code.securityTypeMismatch": {
    da: "Kode R kræver papirtype 4 (andele i investorfradragsfond).",
    en: "Code R requires security type 4 (units in an investor-deduction fund).",
  },
  "investorOwnership.required": {
    da: "Angiv om investor har ejet aktier i målselskabet inden for de seneste 3 år.",
    en: "State whether the investor owned shares in the target company in the last 3 years.",
  },
  "investorOwnership.notForFund": {
    da: "Investorejerskab skal være tomt, når en investorfradragsfond indberetter.",
    en: "Prior investor ownership must be empty when an investor-deduction fund reports.",
  },
};

/** The issue as a sentence in the given language, with the field's label filled in. */
export function formatIssue(issue: Issue, lang: Lang): string {
  const params: Record<string, string | number> = { ...issue.params };
  if (issue.field) params.field = FIELD_BY_KEY[issue.field].label[lang];
  return MESSAGES[issue.rule][lang].replace(/\{(\w+)\}/g, (m, name: string) =>
    params[name] !== undefined ? String(params[name]) : m,
  );
}
