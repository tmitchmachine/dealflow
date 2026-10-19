import { parseArgs } from "node:util";
import { DEFAULT_SYNC, syncBrokers } from "./sync";

const USAGE = `Usage: npm run sync:brokers -- [options]

  --max-fetch 300            listing pages to fetch this run (default ${DEFAULT_SYNC.maxFetch})
  --comps-since 2025-01-01   only fetch sold comps changed on/after this date
  --comps-path california-   URL path fragment selecting APS sold comps (default California)

Reads Accounting Practice Sales and Poe Group Advisors sitemaps, fetches new or
changed listing pages (robots.txt honored, ~1.5s between requests per host), and
writes data/sources/practice-listings.json.`;

const { values } = parseArgs({
  options: {
    "max-fetch": { type: "string" },
    "comps-since": { type: "string" },
    "comps-path": { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const maxFetch = values["max-fetch"] ? Number.parseInt(values["max-fetch"], 10) : DEFAULT_SYNC.maxFetch;
if (!Number.isFinite(maxFetch) || maxFetch < 0) {
  console.error(`--max-fetch must be zero or more.\n\n${USAGE}`);
  process.exit(1);
}

async function main() {
  const file = await syncBrokers({
    maxFetch,
    compsSince: values["comps-since"] ?? DEFAULT_SYNC.compsSince,
    compsPath: values["comps-path"]
      ? new RegExp(values["comps-path"].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      : DEFAULT_SYNC.compsPath,
    log: console.log,
  });
  for (const [broker, c] of Object.entries(file.brokers)) {
    console.log(`  ${broker}: ${c.listed} for sale, ${c.sold} sold comps, ${c.fetched} fetched, ${c.errors} errors`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
