# MedAK

A free, open-source replacement for Skattestyrelsen's Excel template **AKSA 2278**
(`aksa2278-salg-af-aktier.xlsm` and `aksa2278-likvidationsprovenu.xlsm`).

Companies use the template to build the fixed-width `.txt` file they upload to
TastSelv Erhverv (Øvrige indberetninger → Værdipapirer) or send via FTPs Gateway.
MedAK does the same job, but in a friendlier way:

- you describe what happened (a grant, a buyback, a payout), and the app works out SKAT's codes
- shared facts are entered once, not repeated on every row
- in Danish and English
- runs in the browser on any OS (the Excel template is Windows-only in practice)
- accepts normal numbers (`15` shares, `125,75` kr.) instead of `15000000` and øre
- checks the data against the rules SKAT will reject on, before you upload
- never sends personal data (CPR numbers) anywhere: everything stays on your device

## Report types covered

All four report types share the same record layout ("dataindivid 2278"):

| | Report | Legal basis | SKAT guidance |
|---|---|---|---|
| A | Company buys back its own shares (erhvervelse af egne aktier) | SIL § 28 | [Vejledning](https://info.skat.dk/data.aspx?oid=2289412) |
| B | Employee shares (medarbejderaktier, købe-/tegningsretter) | SIL § 8; LL §§ 7 P, 16, 28 | [Vejledning](https://info.skat.dk/data.aspx?oid=2289412) |
| C | Capital contributions giving investor deduction (investorfradrag) | SIL §§ 29 a, 29 b | [Vejledning](https://info.skat.dk/data.aspx?oid=16096) |
| D | Liquidation proceeds (likvidationsprovenu) | SIL § 28 a | [Vejledning](https://info.skat.dk/data.aspx?oid=1918) |

## Status

- **Engine** ([packages/engine](packages/engine)): done. Reads, writes and validates 2278 files
  for all four report types. No web app yet; its UX is being designed (see
  [docs/data-model.md](docs/data-model.md)).

```bash
npm install
npm test
```

- [docs/decisions.md](docs/decisions.md): goals, scope and principles
- [docs/data-model.md](docs/data-model.md): which values are entered once per report, event or person
- [docs/2278-format.md](docs/2278-format.md): the file format, reverse-engineered from the template and the guidance
- [docs/validation-rules.md](docs/validation-rules.md): what to check before upload

## Disclaimer

MedAK is not made by or affiliated with Skattestyrelsen. The reporting company
(den indberetningspligtige) remains responsible for the correctness and timeliness
of its report, whichever tool is used to produce it.
