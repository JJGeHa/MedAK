# Testing

MedAK's output must be accepted by Skattestyrelsen, so the engine is tested at three levels.

| Level | What it proves | Runs |
|---|---|---|
| Unit tests | Field layout, formatting, parsing, number conversion, identifier checks, every validation rule | Every push and pull request ([CI](../.github/workflows/ci.yml)) |
| Golden files | The engine writes **byte for byte** the same file as SKAT's own Excel template, and reads it back unchanged | Every push and pull request, once the expected files exist |
| Template watch | SKAT has not published a new template or guidance since the golden files were made | Weekly ([workflow](../.github/workflows/skat-watch.yml)), opens an issue on change |

What none of these can prove is that SKAT's intake test accepts the file. That needs a real
upload in TastSelv Erhverv, or a test via FTPs Gateway in weeks 47–50 (requires registration
with eKapital).

## Golden files

### Why not run Excel in CI?

GitHub's hosted runners have no Microsoft Office. LibreOffice can run some VBA, but its
`Format()` and string handling are not guaranteed to match Excel's, which is exactly what is
being tested. The template also asks for the sender and a file name in dialogs. Instead, Excel
is run by hand, rarely (when a case is added or SKAT updates the template), and its output is
committed.

### The pieces

| File | Role |
|---|---|
| [`packages/engine/test/golden/cases.ts`](../packages/engine/test/golden/cases.ts) | The test cases: sender and rows, as typed into the template. Fictional data only |
| `packages/engine/test/golden/harness/harness-*.bas` | Generated VBA modules, one per template, with a macro per case |
| `packages/engine/test/golden/expected/<case>.txt` | The files SKAT's template produced. Never edit these by hand |
| [`golden.test.ts`](../packages/engine/test/golden/golden.test.ts) | Compares the engine's bytes with each expected file, and checks the harness is up to date |

Each case macro selects the scenario (as the intro sheet's buttons do), fills the "AKSA 2278"
sheet with events switched off, so the cells hold exactly the test values, pre-fills the sender,
and opens the template's own "Dan fil" dialog. SKAT's code does the rest.

### Producing the expected files

You need Windows with desktop Excel (the guidance notes the template is unreliable on Mac).

1. Download fresh templates from skat.dk (links in [`scripts/skat-watch/skat.lock`](../scripts/skat-watch/skat.lock)):
   `aksa2278-salg-af-aktier.xlsm` for cases A, B and C, and `aksa2278-likvidationsprovenu.xlsm` for D.
2. Open the template and click **Enable content** (Aktivér indhold).
3. Press **Alt+F11**, choose **File → Import File…** and pick the matching
   `harness-salg-af-aktier.bas` or `harness-likvidationsprovenu.bas`. Close the VBA editor.
4. Press **Alt+F8**, run a `MedAK_…` macro (e.g. `MedAK_b_basic`).
5. The "Gem fil" dialog opens with the sender already filled in. Click **Gem fil** and save as
   `<case>.txt` (e.g. `b-basic.txt`) into `packages/engine/test/golden/expected/`.
6. Repeat step 4–5 for every macro. Don't save the workbook itself.
7. Run `npm test`. Each expected file now runs two tests instead of being skipped.

`d-liquidation` has no expected file, because liquidation proceeds has no guided flow for now (see
[decisions](decisions.md)). Its two tests stay skipped until someone needs it.

If a golden test fails, the message names the line, position and field that differ. Decide whether
the engine is wrong (fix the engine) or the template has a quirk worth documenting (record it in
[2278-format.md](2278-format.md) and decide whether the engine should copy it).

### Changing the cases

Edit `cases.ts`, run `npm run golden:harness` to regenerate the `.bas` files (a test fails if you
forget), and produce expected files for new or changed cases. Delete expected files for removed cases.

## Template watch

[`scripts/skat-watch/check.sh`](../scripts/skat-watch/check.sh) finds the AKSA 2278 templates on
skat.dk, hashes them, and reads the publication date of the three guidance documents. It compares
the result with `skat.lock`:

```bash
npm run skat:check                     # exit 0: unchanged, 1: changed, 2: could not read skat.dk
scripts/skat-watch/check.sh --update   # record the current state after updating the engine
```

The weekly workflow opens (or comments on) a GitHub issue when something changed. When that
happens: review what changed, update the engine and docs, regenerate the golden files from the
new template, then run `--update` and commit the new lock file.
