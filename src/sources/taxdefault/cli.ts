import { parseArgs } from "node:util";
import { COUNTY_FEEDS } from "./counties";
import { syncTaxDefault } from "./sync";

const USAGE = `Usage: npm run sync:taxdefault -- [--county sonoma-ca,clermont-oh]

Pulls delinquent / tax-defaulted parcels from county open-data APIs (no key)
and writes data/sources/tax-default.json. Counties: ${COUNTY_FEEDS.map((f) => f.id).join(", ")}.`;

const { values } = parseArgs({
  options: {
    county: { type: "string", default: "" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const wanted = values.county.split(",").map((c) => c.trim()).filter(Boolean);
const unknown = wanted.filter((id) => !COUNTY_FEEDS.some((f) => f.id === id));
if (unknown.length) {
  console.error(`Unknown county: ${unknown.join(", ")}\n\n${USAGE}`);
  process.exit(1);
}

syncTaxDefault(
  wanted.length ? COUNTY_FEEDS.filter((f) => wanted.includes(f.id)) : COUNTY_FEEDS,
  console.log,
).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
