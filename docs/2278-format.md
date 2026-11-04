# Dataindivid 2278: file format

Reverse-engineered from SKAT's Excel templates (VBA modules `Module1`, `UserForm1`,
`CollectionControl`, `Sheet1` and the hidden sheets `Konfiguration`, `Standardlister`,
`Fejltekster`, `Ledetekster`) and checked against the guidance (Bilag 1 *Datastruktur
2278*, section 4.1 *Feltbeskrivelse*, Bilag 3 *Fejlliste individ 3921*).

Sources (versions as fetched 2026-11-04):

| Source | Version |
|---|---|
| `aksa2278-salg-af-aktier.xlsm` (scenarios A, B, C; D configured but no button) | config `2024-v1` |
| `aksa2278-likvidationsprovenu.xlsm` (scenario D only) | config `2025-v1` |
| Vejledning, medarbejderaktier og egne aktier (oid 2289412) | 1.9, 24.09.26 |
| Vejledning, investorfradrag (oid 16096) | 08.12.25 |
| Vejledning, likvidationsprovenu (oid 1918) | 2025/2026 |

## File structure

A file is plain text, one record per line, every line exactly **1,112 characters**
(padded with spaces). The template writes lines with VBA `Print #`, i.e. CRLF line
endings and the Windows ANSI code page.

```
0001…   start record (1 line)
2278…   data records (1 per reported transaction)
9998…   end record (1 line)
```

One file per income year (INDKÅR); the guidance requires separate files per year.

### Start record `0001`

| Pos | Len | Content |
|---|---|---|
| 1 | 4 | `0001` |
| 5 | 8 | Sender's SE/CVR number, zero-padded (*Indsenders SENR*) |
| 13 | 7 | Constant `0301451` (meaning unknown; copy verbatim) |
| 20 | 3 | Constant `278` (file number) |
| 23 | 27 | Sender's name, left-justified |
| 50 | 35 | Sender's address, left-justified |
| 85 | 1028 | Spaces |

The sender is whoever submits: the company itself, or the advisor's firm when an
advisor reports on the company's behalf (Bilag 2).

### End record `9998`

| Pos | Len | Content |
|---|---|---|
| 1 | 4 | `9998` |
| 5 | 8 | Sender's SE/CVR number, zero-padded |
| 13 | 7 | Number of lines in the file **including** start and end record, zero-padded |
| 20 | 7 | Template version string, e.g. `2024-v1` / `2025-v1` |
| 27 | 1086 | Spaces |

Open question: whether SKAT checks the version string. Default to the newest known value.

## Data record `2278`

"Col" is the column in the Excel sheet; "Felt" is SKAT's field number (all eight sign
fields share number 18). Types:

- **A**: alphanumeric. Trimmed, left-justified, space-padded.
- **N**: numeric. Right-justified, zero-padded.
- **N2**: numeric amount in øre (2 implied decimals), e.g. 2.658,00 kr. → `265800`.
- **N6**: numeric with 6 implied decimals, e.g. 15 shares → `15000000`, rate 125,75 → `125750000`.
- **S**: sign, `+` or `-`. Each amount and quantity field has one directly before it.
- **D**: date `ÅÅÅÅMMDD`.
- **T**: time `TTMMSS`.

| Col | Felt | Name | Pos | Len | Type | Meaning |
|---|---|---|---|---|---|---|
| A | 1 | INDVNR | 1 | 4 | N | Always `2278` |
| B | 7 | OPSENR | 5 | 8 | N | Reporting company's CVR/SE no. |
| C | 8 | BANKRGISTNR | 13 | 4 | N | Bank reg. no. Always blank (banks only) |
| D | 9 | DEPOTNR | 17 | 17 | A | Custody account no., blank if none |
| E | 10 | FONDNOTANR | 34 | 17 | A | Contract note no.; fallbacks per scenario (see below) |
| F | 11 | PNRSENR | 51 | 10 | N\* | CPR/CVR/SE of the person or company reported on, no hyphen |
| G | 12 | EJERSTATUKOD | 61 | 1 | A | Owner status: `0` resident in DK, `1` resident abroad |
| H | 13 | RETTEKOD | 62 | 1 | A | `0` ordinary, `1` correction of accepted report, `2` re-submission of rejected (FTPs only) |
| I | 14 | ISINKOD | 63 | 12 | A | ISIN, blank if none officially issued |
| J | 15 | PAPIRIDENTNVN | 75 | 50 | A | Full security name, e.g. `SELSKAB A/S B aktier` |
| K | 16 | PAPIRTYPEKOD | 125 | 1 | A | Security type |
| L | 17 | PAPIRLANDKOD | 126 | 2 | A | ISO country of issuer |
| M | 18 | STKFTG | 128 | 1 | S | Sign for quantity |
| N | 19 | STKANT | 129 | 18 | N6 | Number of shares |
| O | 20 | AKTIPAPIRKURSPCT | 147 | 16 | N6 | Price per share in trading currency |
| P | 21 | OMSVALKOD | 163 | 3 | A | Trading currency (ISO 4217) |
| Q | 18 | KURVAEOMSVALFTG | 166 | 1 | S | |
| R | 22 | KURVAEOMSVALBLB | 167 | 17 | N2 | Market value, trading currency |
| S | 18 | OMKOMSVALFTG | 184 | 1 | S | |
| T | 23 | OMKOMSVALBLB | 185 | 10 | N2 | Costs, trading currency |
| U | 18 | NTOAFROMSVALFTG | 195 | 1 | S | |
| V | 24 | NTOAFROMSVALBLB | 196 | 17 | N2 | Net settlement, trading currency |
| W | 25 | AFRVALKOD | 213 | 3 | A | Settlement currency |
| X | 18 | NTOAFRAFRVALFTG | 216 | 1 | S | |
| Y | 26 | NTOAFRAFRVALBLB | 217 | 17 | N2 | Net settlement, settlement currency |
| Z | 18 | KURVAEBSKVALFTG | 234 | 1 | S | |
| AA | 27 | KURVAEBSKVALBLB | 235 | 17 | N2 | Market value in DKK (taxation currency) |
| AB | 18 | OMKBSKVALFTG | 252 | 1 | S | |
| AC | 28 | OMKBSKVALBLB | 253 | 10 | N2 | Costs in DKK |
| AD | 18 | NTOAFRBSKVALFTG | 263 | 1 | S | |
| AE | 29 | NTOAFRBSKVALBLB | 264 | 17 | N2 | Net settlement in DKK (D: the liquidation proceeds) |
| AF | 30 | VALKURSPCT | 281 | 11 | N6 | FX rate DKK per 100 units; `100` when DKK |
| AG | 31 | HANDEDTO | 292 | 8 | D | Trade date = date of acquiring the right (D: payout date) |
| AH | 32 | VALØDTO | 300 | 8 | D | Value date; same as trade date (D: `00000000`) |
| AI | 33 | INDKÅR | 308 | 4 | N | Income year |
| AJ | 38 | TINNR | 312 | 20 | A | Foreign TIN (owner status 1 only) |
| AK | 39 | TINNRTYPEKOD | 332 | 1 | A | `1` TIN, `2` birth date DDMMÅÅÅÅ in TINNR, `3` missing |
| AL | 40 | FOEDESTEDNVN | 333 | 35 | A | Place of birth |
| AM | 41 | FOEDELANDKOD | 368 | 2 | A | Country of birth |
| AN | 42 | PERSFORNVN | 370 | 70 | A | First name (company: full name) |
| AO | 43 | PERSEFTERNVN | 440 | 70 | A | Last name (company: full name again) |
| AP | 44 | CONVN | 510 | 70 | A | c/o name |
| AQ | 45 | VEJNVN | 580 | 70 | A | Street |
| AR | 46 | HUSNR | 650 | 10 | A | House no. |
| AS | 47 | ETAGENR | 660 | 5 | A | Floor |
| AT | 48 | SIDEDOERNR | 665 | 10 | A | Door |
| AU | 49 | POSTBOXADR | 675 | 20 | A | PO box |
| AV | 50 | LANDBYNVN | 695 | 70 | A | Village |
| AW | 51 | POSTNR | 765 | 15 | A | Postcode |
| AX | 52 | POSTDISTRADR | 780 | 70 | A | Town |
| AY | 53 | HUSNVN | 850 | 70 | A | House name |
| AZ | 54 | LJLIHVAERSNR | 920 | 20 | A | Apartment/room |
| BA | 55 | EGNLANDELSTANVN | 940 | 70 | A | Region/state |
| BB | 56 | LANDENVN | 1010 | 70 | A | Country name |
| BC | 35 | LANDKOD | 1080 | 2 | A | ISO country of residence |
| BD | 57 | KOEBSALGKOD | 1082 | 1 | A | Transaction code (see below) |
| BE | 58 | ASIDNR | 1083 | 5 | A | Euronext Securities AS-ident; `88888` / `00000` fallbacks |
| BF | 59 | OPTAGHANDEKOD | 1088 | 1 | A | `1` admitted to trading (regulated market/MTF), `2` not |
| BG | 60 | DEPOTTYPEKOD | 1089 | 1 | A | Always `0` |
| BH | 61 | HANDETID | 1090 | 6 | T | Trade time; `120000` if unknown (C: `150000`) |
| BI | 62 | INVESTOREJERSKAB | 1096 | 1 | A | C only: `1`/`2`/`3`, prior ownership |
| BJ | 63 | EJERANDELRKOPCT | 1097 | 6 | A\* | Ownership share, 4 decimals. Only in the D template; "anvendes ikke" |
| – | – | FILLER | 1103 | 10 | A | Spaces |

In the `2024-v1` template the record ends with a 16-space filler from position 1097,
so fields 63 and FILLER are simply blank. The `2025-v1` (D) template writes field 63
followed by a 10-space filler. Both produce 1,112 characters.

Fields 38–56 and 35 are the foreign-owner block: they must be filled when
EJERSTATUKOD = `1` and must be empty when it is `0`.

## Per-scenario rules

Abbreviations: **free** = user input, **list** = must be one of the values,
**fixed** = locked to a value, **prefill** = pre-filled but editable, **hidden** = blank.
Fields not listed are "free" in all scenarios. Values are taken from the Konfiguration
sheets; deviations from the guidance are marked ⚠.

| Felt | Field | A egne aktier | B medarbejderaktier | C investorfradrag | D likvidationsprovenu |
|---|---|---|---|---|---|
| 1 | INDVNR | fixed 2278 | fixed 2278 | fixed 2278 | fixed 2278 |
| 8 | BANKRGISTNR | hidden | hidden | hidden | hidden |
| 12 | EJERSTATUKOD | list 0,1 | list 0,1 | list 0,1 | list 0,1 ⚠ old template also offers 2,4,5,7,F,V |
| 13 | RETTEKOD | list 0,1,2 | list 0,1,2 | list 0,1,2 | list 0,1,2 |
| 14 | ISINKOD | free | free | hidden | free |
| 16 | PAPIRTYPEKOD | fixed 1 | fixed 1 | list 3,4 | list 1,5 (5 = andelsbeviser) |
| 17 | PAPIRLANDKOD | list countries | list countries | fixed DK | fixed DK |
| 18 | signs | list +,- | list +,- | list +,- | STKFTG and NTOAFRBSKVALFTG list +,-; others fixed + |
| 20 | AKTIPAPIRKURSPCT | free | free | free (= total nominal value) | fixed `0000000` |
| 21, 25 | OMSVALKOD, AFRVALKOD | list currencies | list currencies | fixed DKK | fixed DKK |
| 22, 23, 24, 26 | trading/settlement amounts | free | free | prefill 0 | fixed 0 |
| 27, 28 | KURVAEBSKVALBLB, OMKBSKVALBLB | free | free | free | fixed 0 |
| 30 | VALKURSPCT | free | free | prefill 100000000 | fixed 100000000 |
| 32 | VALØDTO | free date | free date | free date | fixed 00000000 |
| 39 | TINNRTYPEKOD | list 1,2,3 | list 1,2,3 | list 1,2,3 ⚠ guidance allows only 1,2 | list ⚠ empty in template; guidance 1,2,3 |
| 57 | KOEBSALGKOD | fixed S | list E,F,B,M,G,K ⚠ **H missing** | list K,R | fixed L |
| 58 | ASIDNR | free | free | prefill 00000 | free (blank → 00000 per guidance) |
| 59 | OPTAGHANDEKOD | list 1,2 | list 1,2 | fixed 2 | list 1,2 |
| 60 | DEPOTTYPEKOD | fixed 0 | fixed 0 | fixed 0 | fixed 0 |
| 62 | INVESTOREJERSKAB | hidden | hidden | list 1,2,3 (blank for funds) | hidden |
| 63 | EJERANDELRKOPCT | – | – | – | free in template; guidance says unused |

### KOEBSALGKOD (felt 57)

| Code | Scenario | Meaning | Valid |
|---|---|---|---|
| S | A | Company acquires own shares; reported as a sale by the seller | 2016– |
| E | B | Employee shares, LL § 7 P stk. 2 nr. 2, 1. pkt. (up to 10 % of salary) | 2016– |
| F | B | LL § 7 P stk. 2 nr. 2, 2. pkt. (up to 20 %) | 2019– |
| G | B | LL § 7 P stk. 2 nr. 2, 4. pkt. (up to 50 %) | 2021 – 30.06.2026 |
| H | B | LL § 7 P stk. 2 nr. 2, 4. pkt., no cap but base salary requirement | from 01.07.2026 |
| B | B | Exercise of purchase/subscription rights, LL § 28 | 2019– |
| M | B | Shares as remuneration / exercise of rights, LL § 16 | 2019– |
| K | B, C | B: investment shares with matching shares (purchase and grant). C: acquisition by target company (papirtype 3) or fund (papirtype 4) | 2021– |
| R | C | Target company reporting a fund's investment (papirtype 4) | |
| L | D | Liquidation proceeds, SIL § 28 a | |

### Scenario-specific meanings

- **FONDNOTANR (10):** A/B: contract note no.; else shareholder register no.; else the
  investor's birth date or CVR/SE. C: investor's birth date (DDMMÅÅÅÅ) or CVR/SE.
  D: may be blank.
- **Amounts (22–29), scenario B:** report the employee's acquisition sum = amount paid +
  amount taxed as salary in eIndkomst (e.g. paid 100 + taxed 50 → 150). 0 if granted
  free. In DKK with no costs, fields 22, 24, 26, 27 and 29 hold the same amount.
- **Amounts, scenario A:** the seller's sale price.
- **Amounts, scenario C:** 27 = acquisition sum, 28 = costs, 29 = 27 + 28. 22–26 = 0.
- **Amounts, scenario D:** only 29 = the shareholder's share of proceeds. Not reported if
  nothing is paid out.
- **STKANT (19), scenario D:** number of shares held; a sole owner may report 1 share.

## How the template formats values (VBA behaviour)

To be byte-compatible, the generator must reproduce this. ⚠ marks behaviour we should
**not** reproduce silently; instead, the app should block or warn.

1. **Alphanumeric:** `Left(Trim(value) & Space(n), n)`. ⚠ Over-long text is truncated
   without warning.
2. **Numeric:** `Format(Left(Trim(value) & Space(n), n), String(n, "0"))`. ⚠ Over-long
   numbers are cut *before* zero-padding, so `123456789012345678` in a 17-character field
   becomes `12345678901234567` (a factor of 10 off). ⚠ VBA converts to Double, so values
   above ~15 significant digits lose precision.
3. **Blank numeric fields:** `Format("    ", "0000")` most likely returns the spaces
   unchanged, so blank stays blank. To verify by running the macro.
4. **PNRSENR:** if exactly 8 characters (CVR/SE) it is prefixed with `00`; otherwise
   left-justified and space-padded (10-digit CPR fills the field).
5. **EJERANDELRKOPCT (D template):** written as alphanumeric (left-justified), although
   documented as numeric. The template only accepts empty or exactly 6 digits.
6. **Signs:** entering a sign in any sign column copies it to all eight sign columns of
   that row.
7. **Fixed/prefilled values** are written into a row when column B (OPSENR) is filled.
8. **Auto-correction on "Dan fil":** decimals in an øre field are offered as ×100
   (`12,5` → `1250`); decimals in a 6-decimal field as ×1,000,000. The user confirms each one.
9. **Import ("Hent fil"):** reads `0001` (sender data) and every `2278` line by fixed
   positions; other record types are ignored.

## Error list record `3921` (FTPs Gateway only)

Returned by SKAT for rejected records via FTPs Gateway: 1,196 characters, the same
fields as 2278 but reordered, plus FEJLNR (pos 1082, 75 chars = up to 25 three-digit
error codes), INDSENDERSENR (pos 1157, 8) and REFERENCENR (pos 1165, 9). Full layout in
Bilag 3. TastSelv Erhverv uploads get a validation report in the browser instead.

## Open questions

1. Encoding SKAT expects (Windows-1252 assumed, since that is what the template writes).
2. Meaning of the constant `0301451` in the start record, and whether the version string
   in the end record is checked.
3. Whether SKAT accepts an `EJERANDELRKOPCT` value from A/B/C files.
4. TINNRTYPEKOD values allowed in C (template 1,2,3 vs guidance 1,2).
