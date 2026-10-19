import { parseArgs } from "node:util";
import { enrichFirms, type EnrichNiche } from "./enrich";

const USAGE = `Usage: npm run enrich -- [options]

  --niche accounting           accounting | hvac (default accounting)
  --counties Orange            county names; omit for statewide
  --limit 50                   top-ranked firms to cover (default 50)
  --max-age-days 90            re-check firms older than this (default 90)
  --concurrency 4              firms checked at once (default 4)
  --no-places                  skip Google Places even when a key is set
  --data-dir data/raw          where the state license files live

Finds each firm's website (Google Places when GOOGLE_MAPS_API_KEY is set,
capped by PLACES_MONTHLY_CAP, default 500/month; otherwise verified domain
guesses), reads the homepage plus up to two about/team pages, and writes
data/sources/enrichment-<niche>.json with a yield report.`;

const { values } = parseArgs({
  options: {
    niche: { type: "string", default: "accounting" },
    counties: { type: "string", default: "Orange" },
    limit: { type: "string", default: "50" },
    "max-age-days": { type: "string", default: "90" },
    concurrency: { type: "string", default: "4" },
    "no-places": { type: "boolean", default: false },
    "data-dir": { type: "string", default: "data/raw" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const niche = values.niche as EnrichNiche;
const limit = Number.parseInt(values.limit, 10);
const maxAgeDays = Number(values["max-age-days"]);
const concurrency = Number.parseInt(values.concurrency, 10);
if (
  !["accounting", "hvac"].includes(niche) ||
  !(limit > 0) ||
  !(maxAgeDays >= 0) ||
  !(concurrency > 0)
) {
  console.error(USAGE);
  process.exit(1);
}

enrichFirms({
  niche,
  counties: values.counties.split(",").map((c) => c.trim()).filter(Boolean),
  limit,
  maxAgeDays,
  concurrency,
  usePlaces: !values["no-places"],
  dataDir: values["data-dir"],
  log: console.log,
}).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
