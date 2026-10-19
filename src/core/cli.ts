import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { stringify } from "csv-stringify/sync";
import { getNiche, NICHES } from "@/niches";

const USAGE = `Usage: npm run list -- [options]

  --niche accounting                which index to list: ${NICHES.map((n) => n.id).join(" | ")} (default ${NICHES[0].id})
  --counties "Orange,Los Angeles"   county names; omit for statewide
  --limit 200                       rows to write (default 200)
  --min-years 0                     minimum years since the firm registered or was licensed
  --include-inactive                also list delinquent, inactive or suspended licenses
  --data-dir data/raw               where the downloaded state files live
  --out out/<name>.csv              default: out/<${NICHES.map((n) => n.filePrefix).join("|")}>-<counties>-<date>.csv`;

const { values } = parseArgs({
  options: {
    niche: { type: "string", default: NICHES[0].id },
    counties: { type: "string", default: "" },
    limit: { type: "string", default: "200" },
    "min-years": { type: "string", default: "0" },
    "include-inactive": { type: "boolean", default: false },
    "data-dir": { type: "string", default: "data/raw" },
    out: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const counties = values.counties
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);
const limit = Number.parseInt(values.limit, 10);
const minYears = Number.parseInt(values["min-years"], 10);
if (
  !Number.isFinite(limit) ||
  limit < 1 ||
  !Number.isFinite(minYears) ||
  minYears < 0
) {
  console.error(
    `--limit must be a positive number and --min-years zero or more.\n\n${USAGE}`,
  );
  process.exit(1);
}

const niche = getNiche(values.niche);
const asOf = new Date();
const { rows, considered, summary } = niche.list(
  niche.load(values["data-dir"]),
  {
    counties,
    limit,
    minYears,
    includeInactive: values["include-inactive"],
    asOf,
  },
);

const slug = counties.length
  ? counties.map((c) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-")).join("_")
  : "statewide";
const out =
  values.out ??
  `out/${niche.filePrefix}-${slug}-${asOf.toISOString().slice(0, 10)}.csv`;
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, stringify(rows, { header: true }));

console.log(
  `${niche.label}: ${considered.toLocaleString()} matched the filters; ${summary}.`,
);
console.log(`Wrote ${rows.length} rows to ${out}`);
console.log(niche.disclaimer);
if (niche.stage === "comparison") {
  // NICHES[0] is the one selling index; src/niches/index.test.ts enforces it.
  console.log(
    `${niche.id} is a comparison index, not for outreach. Outreach goes to ${NICHES[0].id} buyers; changing that is a decision for IDEAS.md.`,
  );
}
