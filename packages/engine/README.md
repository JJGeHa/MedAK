# @medak/engine

Reads, writes and validates SKAT's **dataindivid 2278** files: the fixed-width `.txt`
format used for reporting employee shares, share buybacks, investorfradrag and
liquidation proceeds. No runtime dependencies; runs in the browser and in Node.

It has two layers. Most callers want the **project model**, where you describe what happened:

```ts
import { checkReport, buildReportBytes, reportFileName, formatIssue, isReady, toFixedDigits } from "@medak/engine";

const report = {
  id: "r1", scenario: "B", incomeYear: "2026",
  events: [{
    kind: "employeeShares", id: "e1", what: "pay", scheme: "lp7-uncapped", date: "2026-09-15",
    securityId: "s1", tradeCurrency: "DKK", pricePerShare: "25000000",
    participants: [{ personId: "anna", shares: "400000000", taxed: "1840000" }],
  }],
};
const project = {
  format: "medak-project", version: 1,
  company: { seNumber: "12345674", name: "Nordlys Software ApS", address: "Søndergade 1, 8000 Aarhus C" },
  securities: [{ id: "s1", name: "Nordlys Software ApS B-anparter", issuerCountry: "DK", listed: false }],
  persons: [{ id: "anna", displayName: "Anna Jensen", danishId: "0101584455" }],
  reports: [report],
};

const issues = checkReport(project, report);          // tied to event and person
issues.forEach((i) => console.log(formatIssue(i, "en")));

if (isReady(issues)) {
  const bytes = buildReportBytes(project, report);    // what gets uploaded
  const name = reportFileName(project, report);       // MedAK_2278_B_2026_12345674.txt
}

// Amounts are stored in the file's units; convert what people type:
toFixedDigits("18.862,50", 2, "da");                  // { ok: true, digits: "1886250" }
```

Underneath is the **row engine**: one row is one 2278 record, with values in the raw form the
file stores (øre, 6 implied decimals, `ÅÅÅÅMMDD`). Use `validateRows`, `buildFile` and `parseFile`
directly to work at that level.

| Module | Purpose |
|---|---|
| `fields.ts` | The 63-field layout: positions, lengths, padding, labels (da/en) |
| `codes.ts` | Scenarios A–D, transaction codes (with validity dates), code labels |
| `scenarios.ts` | Per-scenario field rules (fixed, blank, list, free) and defaults |
| `record.ts` | Format and parse one 1,112-character line. Never truncates silently |
| `file.ts` | Start record `0001`, data lines, end record `9998`; tolerant parsing |
| `encoding.ts` | Windows-1252 encode/decode |
| `units.ts` | Human numbers ↔ stored digits; currency conversion in BigInt |
| `checks.ts` | CVR, CPR, ISIN, date and time checks |
| `validate.ts`, `messages.ts` | Validation rules mapped to SKAT error codes; messages in Danish and English |
| `project/types.ts` | The project model: company, shares, people, events, reports |
| `project/expand.ts` | Answers to codes, events to rows, report checks, the file to upload |
| `project/import.ts` | A 2278 file back into events; rows it can't reproduce exactly are kept verbatim |
| `project/corrections.ts` | The lines that cancel or replace an accepted line |
| `project/file.ts` | The project file the user saves and reopens |

Spec: [docs/2278-format.md](../../docs/2278-format.md), [docs/validation-rules.md](../../docs/validation-rules.md), [docs/data-model.md](../../docs/data-model.md).

```bash
npm test          # vitest
npm run typecheck # tsc
```
