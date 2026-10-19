// Smoke: print top ranked opportunities. Run with: npx tsx scripts/smoke-opportunities.mjs
// (This file is TS-imported via tsx by re-exporting — actually use a .ts file)

import { getListings } from "../app/lib/data.ts";
import { getMarkets } from "../app/lib/markets.ts";
import { scanListings } from "../app/lib/scoring.ts";

const listings = await getListings();
const { markets } = await getMarkets();
const props = scanListings(listings, markets);

if (props.length === 0) {
  console.log("No live listings — set RENTCAST_API_KEY and RENTCAST_LIVE=1.");
}

console.log("=== TOP PROPERTIES ===");
for (const p of props.slice(0, 6)) {
  console.log(
    p.investability,
    p.verdict.padEnd(9),
    p.deal.strategy.padEnd(14),
    "DSCR",
    p.financials.dscr.toFixed(2),
    p.isActionable ? "ACTION" : "     ",
    p.listing.address,
  );
}
console.log("actionable props", props.filter((p) => p.isActionable).length);

