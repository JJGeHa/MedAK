# Data model: where each value is entered

The Excel template asks for all 63 fields on every row. Most of them are the same for
every row in a submission, the same for everyone in one event, or can be calculated.
This document sorts every field of dataindivid 2278 by **the level at which the user
enters it** in MedAK. The record writer expands these levels into rows.

## Levels

| Level | Entered | Example |
|---|---|---|
| **Fixed** | Never. Constant or blank in every record | INDVNR `2278`, DEPOTTYPEKOD `0` |
| **Sender** | Once per user/advisor profile, reused across companies | Advisor firm's CVR, name, address |
| **Company** | Once per company, reused across years | Reporting company's CVR |
| **Report** | Once per submitted file | Income year |
| **Security** | Once per share class, reused across events and years | Name, ISIN, listed or not |
| **Event** | Once per grant / exercise / buyback / round / payout | Date, scheme, price per share, currency |
| **Person** | Once per person, reused across events and years | CPR, or foreign identity and address |
| **Participation** | Once per person per event | Number of shares, amount paid, amount taxed |
| **Derived** | Never; calculated from other values | Value date = trade date |

Persons are kept in a register within the project, so an employee who is in three
grants, or comes back next year, is entered once.

## Field by field

"Answer" means the value comes from a plain-language question rather than a code.

| Felt | Field | Level | How the value is obtained |
|---|---|---|---|
| 1 | INDVNR | Fixed | `2278` |
| – | Start/end record: sender SE, name, address | Sender | Defaults to the company itself; an advisor sets their own firm once |
| 7 | OPSENR | Company | Reporting company's CVR/SE. Entered once, not per row |
| 8 | BANKRGISTNR | Fixed | Blank |
| 9 | DEPOTNR | Participation | Optional, hidden under "more details"; blank in almost all cases |
| 10 | FONDNOTANR | Participation → Derived | Contract note no. if one exists; otherwise the shareholder-register no.; otherwise derived from the person's birth date or CVR/SE, as the guidance allows |
| 11 | PNRSENR | Person | CPR (or CVR/SE when the counterparty is a company, e.g. A and D) |
| 12 | EJERSTATUKOD | Derived | From "Does this person/company live abroad?" |
| 13 | RETTEKOD | Report → Derived | `0` for a normal report; the correction flow sets `1` on the cancelling and replacing lines |
| 14 | ISINKOD | Security | Optional; required if listed |
| 15 | PAPIRIDENTNVN | Security | Share name, e.g. "Selskab A/S B-aktier" |
| 16 | PAPIRTYPEKOD | Derived | A/B: `1`. C: from role (target company `3`, fund `4`). D: answer "shares or andelsbeviser" |
| 17 | PAPIRLANDKOD | Security | Defaults to the company's country (DK) |
| 18 | signs (×8) | Derived | `+`; the correction flow writes `-` on cancelling lines |
| 19 | STKANT | Participation | Number of shares, typed as a normal number |
| 20 | AKTIPAPIRKURSPCT | Event | Price per share (B: the price the employee paid). C: per participation, total nominal value. D: fixed 0 |
| 21 | OMSVALKOD | Event | Trading currency; default DKK |
| 22 | KURVAEOMSVALBLB | Derived | B: amount paid + amount taxed via payroll. A: shares × price. C, D: 0 |
| 23 | OMKOMSVALBLB | Event → Participation | Costs; default 0 |
| 24 | NTOAFROMSVALBLB | Derived | From 22 and 23 |
| 25 | AFRVALKOD | Event | Settlement currency; default = trading currency |
| 26 | NTOAFRAFRVALBLB | Derived | From 24 and the rate between trading and settlement currency |
| 27 | KURVAEBSKVALBLB | Derived | 22 converted to DKK (C: acquisition sum, entered per participation) |
| 28 | OMKBSKVALBLB | Derived | 23 converted to DKK |
| 29 | NTOAFRBSKVALBLB | Derived | 24 converted to DKK. D: the proceeds paid to this shareholder (Participation) |
| 30 | VALKURSPCT | Event | `100` for DKK; for other currencies the rate on the trade date, suggested from Danmarks Nationalbank and editable |
| 31 | HANDEDTO | Event | Date of grant / acquiring the right / buyback / payout |
| 32 | VALØDTO | Derived | = 31 (D: `00000000`) |
| 33 | INDKÅR | Report | Chosen once; every event date must fall in this year |
| 35, 38–56 | foreign identity and address | Person | Shown only if the person lives abroad; TIN or birth date + place, depending on what the person has |
| 57 | KOEBSALGKOD | Derived | From the scenario and the scheme questions (e.g. "new § 7 P scheme from 1 July 2026" → `H`) |
| 58 | ASIDNR | Security → Derived | Euronext Securities id if registered, otherwise `88888`/`00000` from the listing answer |
| 59 | OPTAGHANDEKOD | Security | "Is the share listed?" Defaults from the security; can be overridden per event (e.g. a listing during the year) |
| 60 | DEPOTTYPEKOD | Fixed | `0` |
| 61 | HANDETID | Event | Optional; default `120000` (C: `150000`) |
| 62 | INVESTOREJERSKAB | Participation (C only) | Answer: "Did the investor own shares in the company in the last 3 years?" and "Follow-on investment under the business plan?" |
| 63 | EJERANDELRKOPCT | Fixed | Blank (guidance: not used) |

## What the user actually types, per scenario

| Scenario | Once per report | Per event | Per person | Per person per event |
|---|---|---|---|---|
| B employee shares | Company, year | Date, scheme, share, price per share, currency | Identity | Shares, amount paid, amount taxed |
| A buyback | Company, year | Date, share | Identity (person or company) | Shares, price, costs |
| C investorfradrag | Company or fund, year, role | Date, share | Identity | Shares, nominal value, acquisition sum, costs, prior ownership |
| D liquidation | Company, year | Payout date, share/andelsbevis, listed | Identity (person or company) | Shares held, proceeds |

For a typical B grant to 40 employees in DKK, that is one event form plus 40 × (identity
+ 3 numbers), instead of 40 rows × 62 columns.

## Consequences for the engine

- The record engine stays row-based (one row = one 2278 record), so it can read and write
  files exactly.
- A layer above it holds the project model (company, securities, persons, events,
  participations) and expands it to rows.
- Importing an existing `.txt` goes the other way: rows are grouped back into events and
  persons where values match. Rows that don't group cleanly stay as individual events.
