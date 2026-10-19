// Smoke: print top ranked opportunities. Run with: npx tsx scripts/smoke-opportunities.mjs
// (This file is TS-imported via tsx by re-exporting — actually use a .ts file)

import { getListings } from "../app/lib/data.ts";
import { getMarkets } from "../app/lib/markets.ts";
import { scanListings } from "../app/lib/scoring.ts";
import { getBusinesses } from "../app/lib/business/data.ts";
import { scanBusinesses } from "../app/lib/business/scoring.ts";

const listings = await getListings();
const { markets } = await getMarkets();
const props = scanListings(listings, markets);
const biz = scanBusinesses(getBusinesses());

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

console.log("\n=== TOP BUSINESSES ===");
for (const b of biz.slice(0, 6)) {
  console.log(
    b.investability,
    b.verdict.padEnd(9),
    b.deal.strategy.padEnd(16),
    "sell",
    String(b.deal.sellReadiness).padStart(3),
    b.isActionable ? "ACTION" : "     ",
    b.listing.name,
  );
}
console.log("actionable biz", biz.filter((b) => b.isActionable).length);
