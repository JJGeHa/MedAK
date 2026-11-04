# Decisions

Decisions made so far, with the reasoning. Newest at the bottom of each section.

## Scope (2026-11-04)

All four report types that use dataindivid 2278: A (egne aktier), B (medarbejderaktier),
C (investorfradrag), D (likvidationsprovenu). They share one engine; the differences
are per-field rules (fixed values, allowed codes, hidden fields). See
[2278-format.md](2278-format.md).

Out of scope: IFPA 2237 (investment funds' liquidation proceeds), which is a different
record layout.

## Principles

1. **Personal data never leaves the user's device** in the free version. Parsing,
   validation and file generation run in the browser. No backend is needed, which also
   keeps hosting cost near zero.
2. **Byte-compatible output.** For the same input, the generated file must match what
   SKAT's own template produces, except where the template is demonstrably wrong (e.g.
   silent truncation). Deviations are documented.
3. **Validate more, not less.** Catch what SKAT's intake test will reject (see the error
   code list in [validation-rules.md](validation-rules.md)) before upload.
4. **Rules as data.** Like the template's hidden "Konfiguration" sheet, per-scenario field
   rules live in a data file, so yearly changes from SKAT are small, reviewable edits.
5. **Import the old format.** Users can load a `.txt` file produced by the Excel template
   (the template has a "Hent fil" button for this too).

## Stack (2026-11-04)

TypeScript throughout. A dependency-free engine package (field rules as data, writer,
reader, validator) and a static Vite + React web app with no backend.

## User experience (2026-11-04)

1. **Better than the Excel template, not a copy of it.** A web spreadsheet with friendlier
   number entry is explicitly not the goal.
2. **Organised around events.** The user describes what happened (a grant, an exercise, a
   buyback, a capital round, a liquidation payout) through plain-language questions. The
   app derives SKAT's codes. See [data-model.md](data-model.md).
3. **Enter each fact once.** Values that are the same for every row of a submission (the
   reporting company's CVR, income year), for every person in one event (date, scheme,
   share, price, currency) or for a person across events (identity, address) are entered
   once at that level. The app calculates derived fields.
4. **Danish and English.** Both languages from the start, for every screen, help text and
   the printable review. SKAT's Danish terms remain visible next to the English, so users
   can match them to SKAT's guidance and TastSelv.
5. **International audience.** The users include Danish subsidiaries of foreign groups
   (e.g. RSUs from a foreign listed parent, with foreign currency and FX rates) and
   non-Danish-speaking finance staff, not only Danish start-ups.

## Flows and guidance (2026-11-04)

1. **B first.** The employee-share flow (medarbejderaktier, options, warrants, RSUs) is
   designed and polished first. A, C and D follow.
2. **"Do I need to report?" guidance is never tax advice.** Wherever the app explains
   whether or what to report (e.g. cash settlement of the difference, matching shares, a
   foreign parent granting shares), it states clearly, in both languages, that this is
   general information and not tax advice, and that the user should seek professional
   advice if in any doubt. Each explanation links to SKAT's guidance.
3. **Liquidation (D) points to SKAT's own single-entry form first.** SKAT's
   *Enkeltindberetning* in TastSelv Erhverv (Øvrige indberetninger → Værdipapirer → AKSA →
   Enkeltindberetning) is simpler for most liquidations. The D flow starts by sending users
   there. MedAK's file is offered for the cases the form does not cover (guidance section
   3.3):
   - the shares are admitted to trading on a regulated market or MTF, or
   - someone other than the liquidated company paid out the proceeds on its behalf.

## Licence (2026-11-04)

Apache-2.0.
- Character encoding SKAT expects for æ/ø/å (the template writes the Windows ANSI code
  page). Needs confirming with eKapital or a real upload.
