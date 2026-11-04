# @medak/engine

Reads, writes and validates SKAT's **dataindivid 2278** files: the fixed-width `.txt`
format used for reporting employee shares, share buybacks, investorfradrag and
liquidation proceeds. No runtime dependencies; runs in the browser and in Node.

This package works on **rows**: one row is one 2278 record, with values in the raw form
the file stores (øre, 6 implied decimals, `ÅÅÅÅMMDD`). The app's event model sits on top.

```ts
import {
  applyScenario, validateRows, isReady, formatIssue, buildFile, encodeWindows1252,
  TEMPLATE_VERSION, toFixedDigits,
} from "@medak/engine";

const amount = toFixedDigits("18.862,50", 2, "da"); // { ok: true, digits: "1886250" }

const rows = [applyScenario(row, "B")];              // fill locked fields and defaults
const issues = validateRows(rows, { scenario: "B", incomeYear: "2026" });
issues.forEach((i) => console.log(formatIssue(i, "en")));

if (isReady(issues)) {
  const text = buildFile({ sender, rows, version: TEMPLATE_VERSION.B });
  const bytes = encodeWindows1252(text);              // what gets uploaded
}
```

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

Spec: [docs/2278-format.md](../../docs/2278-format.md), [docs/validation-rules.md](../../docs/validation-rules.md).

```bash
npm test          # vitest
npm run typecheck # tsc
```
