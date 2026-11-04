# Validation rules

What MedAK should check before a file is generated. Each rule names its severity:

- **error**: SKAT will reject the record, or the file is malformed. Block file generation.
- **warning**: probably wrong, but SKAT may accept it. Show it; allow override.

Where a rule matches an error code in SKAT's intake test (Bilag 4 *Fejlkode-liste*), the
code is given, so a user who gets a validation report from TastSelv can find the matching
check. Rules marked *(interpretation)* are our reading of the guidance and should be
confirmed against real uploads.

For field positions and per-scenario allowed values, see [2278-format.md](2278-format.md).

Implemented in [`packages/engine/src/validate.ts`](../packages/engine/src/validate.ts), with
Danish and English messages in [`messages.ts`](../packages/engine/src/messages.ts). Section
9 (deadlines) is not validation and is not in the engine.

## 1. What SKAT's own template checks

For reference: the Excel template's "Dan fil" checks only these.

| Check | Fields |
|---|---|
| No comma/period in amount and quantity fields (offers ×100 / ×1,000,000 auto-fix) | 19, 20, 22–30 |
| 6-decimal fields at least 7 digits long | 19, 20, 30 |
| Date is 8 digits and a valid date | 31, 32 |
| No hyphen | 11 |
| Fields 38–56 and 35 empty when EJERSTATUKOD is 0, 2, 4 or F | 35, 38–56 |
| Dropdown values (Excel data validation, bypassable by pasting) | list fields |
| Sender SE number filled and numeric | start record |

Everything below the line in this document is MedAK's addition, apart from the checks
above.

---

## 2. Field format (all scenarios)

| Rule | Severity | SKAT code |
|---|---|---|
| Every value fits its field length. Never truncate silently | error | – |
| Numeric fields contain digits only | error | 191–206 |
| Alphanumeric fields contain only characters representable in the target encoding (Windows-1252 assumed) | error | – |
| Dates (31, 32) are valid calendar dates `ÅÅÅÅMMDD` | error | 205, 206 |
| HANDETID (61) is a valid time `TTMMSS` (00–23, 00–59, 00–59) | error | 312 |
| INDKÅR (33) is 4 digits, a plausible year, and within SKAT's digital window (up to week 46 of the 6th year after the income year) | error / warning | – |
| OPSENR (7) is 8 digits | error | 017 |
| OPSENR (7) passes the CVR modulus-11 check (warning only: not confirmed that every SE number satisfies it) | warning | 187 |
| ISIN (14), when filled: 12 characters, 2-letter country prefix, valid check digit | error | 282 |
| Country codes (17, 35, 41) and currency codes (21, 25) are in SKAT's lists (Standardlister) | error | 183, 194, 199, 241 |

## 3. Identity of the person or company reported on (field 11)

| Rule | Severity | SKAT code |
|---|---|---|
| Field 11 filled, unless EJERSTATUKOD = 1 and no Danish number exists | error | 058 |
| Digits only, no hyphen; 10 digits (CPR) or 8 digits (CVR/SE) | error | 057 |
| CPR: first 6 digits form a valid date DDMMÅÅ (substitute numbers with day + 60 accepted) | error | 057 |
| CPR modulus-11: not checked (CPR numbers issued since 2007 need not satisfy it) | – | – |
| CVR/SE: modulus-11 check | warning | 057 |
| A 10-digit value starting with `00` is read as a CVR/SE (that is how the template writes them) | – | – |
| Leading zeros preserved (Excel's classic bug). Always store as text | – | – |
| Employee codes (B: E, F, G, H, B, M) report on a person, so field 11 should be a CPR *(interpretation)* | warning | 396 |

## 4. Owner status and foreign-owner block

| Rule | Severity | SKAT code |
|---|---|---|
| EJERSTATUKOD in {0, 1} | error | 033 |
| Status 0: fields 35 and 38–56 empty | error | 233–236 |
| Status 1: LANDKOD (35) filled and not `DK` | error | 039 |
| Status 1: TINNRTYPEKOD (39) filled | error | 239 |
| Type 1: TINNR (38) filled | error | 238 |
| Type 2: TINNR is a valid birth date `DDMMÅÅÅÅ` | error | 240 |
| Type 2, natural person: FOEDESTEDNVN (40) and FOEDELANDKOD (41) filled | error | 235, 236 |
| Status 1: PERSFORNVN (42) and PERSEFTERNVN (43) filled. A company's name goes in both | error | 242, 243 |
| Status 1: VEJNVN (45) or POSTBOXADR (49) filled | error | 244, 298 |
| Status 1: POSTDISTRADR (52) and LANDENVN (56) filled | error | 245 |
| Greenland (`GL`): status 1, CPR/CVR in field 11 and also as TINNR | warning | – |
| Scenario C: TINNRTYPEKOD only 1 or 2 | error | 237 |

## 5. Corrections and signs

| Rule | Severity | SKAT code |
|---|---|---|
| RETTEKOD in {0, 1, 2} | error | 024 |
| RETTEKOD 0 ⇒ every sign field is `+` | error | 072, 190 |
| All eight sign fields in a row are equal *(interpretation; the template forces this)* | warning | 327 |
| RETTEKOD 2 is only for FTPs Gateway re-submissions; TastSelv uploads use 0 again | warning | – |
| A correction (1) should come as a pair: the original line with `-`, then the corrected line with `+`, in the same file. MedAK can generate the pair from the original | warning | – |
| No sign characters inside amount fields | error | – |

## 6. Dates and years

| Rule | Severity | SKAT code |
|---|---|---|
| Year of HANDEDTO (31) = INDKÅR (33) | error | 207 |
| Year of VALØDTO (32) = INDKÅR (A, B, C) | error | 208 |
| VALØDTO = HANDEDTO (A, B, C) | warning | – |
| D: VALØDTO = `00000000` | error | 206 |
| All rows in one file have the same INDKÅR | error | – |

## 7. Amounts (consistency)

These are warnings: SKAT does not appear to recompute them, but mismatches usually
mean a typo, typically an øre or decimal-shift error.

| Rule | Severity |
|---|---|
| Market value 22 ≈ quantity 19 × price 20 (rounded to øre) | warning |
| DKK value 27 ≈ 22 × FX rate 30 / 100 | warning |
| Costs = difference between market value and net settlement (sale: net = value − costs; purchase/acquisition: net = value + costs) | warning |
| Everything in DKK and no costs (B): fields 22, 24, 26, 27 and 29 are equal | warning |
| Currency DKK ⇒ VALKURSPCT = 100 (`100000000`) | error |
| C: 29 = 27 + 28; fields 22–26 = 0 | error |
| D: only 29 non-zero among amounts; 29 > 0 (no payout means no report) | error |
| Amounts and quantities ≥ 0 (direction is expressed by the sign field) | error |

## 8. Scenario-specific codes

| Rule | Scenario | Severity | SKAT code |
|---|---|---|---|
| KOEBSALGKOD = `S` | A | error | 304 |
| KOEBSALGKOD in {E, F, G, H, B, M, K} | B | error | 304 |
| `G` only for trade dates up to 30.06.2026; `H` only from 01.07.2026 *(interpretation: guidance ties validity to the rule change date)* | B | error | 304 |
| KOEBSALGKOD in {K, R} | C | error | 304, 399 |
| KOEBSALGKOD = `L` | D | error | 304 |
| PAPIRTYPEKOD = 1 | A, B | error | 198, 394 |
| PAPIRTYPEKOD 3 ⇒ KOEBSALGKOD K; PAPIRTYPEKOD 4 ⇒ K (fund) or R (target company) | C | error | 399 |
| PAPIRTYPEKOD 3 ⇒ OPTAGHANDEKOD 2 | C | error | 398 |
| PAPIRTYPEKOD in {1, 5} | D | error | 418 |
| INVESTOREJERSKAB in {1, 2, 3} when reported by the target company (K + 3, R + 4); blank for a fund (K + 4) | C | error | 392, 397 |
| INVESTOREJERSKAB blank | A, B, D | error | 392 |
| ISINKOD blank | C | error | 282 |
| ISIN required when OPTAGHANDEKOD = 1 (listed shares always have an ISIN) | A, B, D | error | 281 |
| ASIDNR: 5 digits; `88888` if Danish listed but not in Euronext Securities; `00000` otherwise | all | error | 270, 284 |
| DEPOTTYPEKOD = 0 | all | error | 138 |
| FONDNOTANR filled | A, B, C | error | 197 |
| PAPIRIDENTNVN filled | all | error | 189 |
| PAPIRLANDKOD = DK | C, D | error | – |

## 9. Deadlines (for reminders, not validation)

| Report | Deadline |
|---|---|
| A, B, C annual | 20 January the following year (next Monday if a weekend) |
| A, B, C on cessation | 10 days after cessation |
| D | In the year of payout, before the company is deregistered at Erhvervsstyrelsen |
| Re-submitting rejected records | 14 days after SKAT's response |
| Corrections of accepted records | Immediately (without undue delay) |
| B, state aid under LL § 7 P stk. 2 nr. 2, 4. pkt. above EUR 500,000 per year | Separate form on virk.dk, by 1 September the following year |

Late filing after the first annual tax assessment (end of March): notify eKapital first.
