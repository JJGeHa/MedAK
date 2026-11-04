// Writes the VBA harness modules used to produce golden files with SKAT's Excel template.
// Run from the repo root:  node scripts/golden/make-harness.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { harnessFileName, makeHarness, TEMPLATES } from "../../packages/engine/test/golden/harness.ts";

const dir = join(import.meta.dirname, "../../packages/engine/test/golden/harness");
mkdirSync(dir, { recursive: true });
for (const template of TEMPLATES) {
  const file = join(dir, harnessFileName(template));
  writeFileSync(file, makeHarness(template));
  console.log(`wrote ${file}`);
}
