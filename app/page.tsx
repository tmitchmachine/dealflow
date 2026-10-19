import { getListingsWithMeta } from "./lib/data";
import { getMarkets } from "./lib/markets";
import { scanListings } from "./lib/scoring";
import { getBusinesses } from "./lib/business/data";
import { scanBusinesses } from "./lib/business/scoring";
import { DealDesk } from "./components/DealDesk";

/** Weekly refresh: one regeneration spends 5 RentCast calls (one per
 * metro), and the free tier is ~50/month. See README > Live data sources. */
export const revalidate = 604800;

export default async function Home() {
  const [{ listings, source }, { markets, redfinLive, periodBegin, rentcastRent }] =
    await Promise.all([getListingsWithMeta(), getMarkets()]);

  const properties = scanListings(listings, markets);
  const businesses = scanBusinesses(getBusinesses());

  const actionable =
    properties.filter((s) => s.isActionable).length + businesses.filter((s) => s.isActionable).length;
  const pursue =
    properties.filter((s) => s.verdict === "pursue").length +
    businesses.filter((s) => s.verdict === "pursue").length;

  const listingLabel =
    source === "rentcast"
      ? "live RentCast / MLS listings"
      : "demo property listings (set RENTCAST_LIVE=1 for live data)";
  const marketLabel = redfinLive
    ? `live Redfin Data Center (${periodBegin})`
    : `Redfin Data Center snapshot (${periodBegin})`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Dealflow — opportunity desk
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {properties.length} properties · {businesses.length} businesses · {actionable} actionable
        </h1>
        <p className="mt-1 text-zinc-500">
          Everything in one book by default, ranked best → worst on investability. Properties clear
          DSCR / strategy gates; businesses clear SDE-multiple and transfer / sell-readiness gates.{" "}
          {pursue} marked pursue.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Data: {listingLabel} · market $/sqft from {marketLabel}
          {rentcastRent ? " · rent $/sqft enriched via RentCast" : ""} · businesses from curated
          demo catalog.
        </p>
      </header>

      <DealDesk properties={properties} businesses={businesses} />

      <footer className="mt-10 text-xs text-zinc-400">
        Scores and verdicts are estimates from a heuristic model — not investment advice.
        {source === "mock" && (
          <>
            {" "}
            Property records are demo data until <code>RENTCAST_API_KEY</code> and{" "}
            <code>RENTCAST_LIVE=1</code> are set in <code>.env.local</code>.
          </>
        )}
      </footer>
    </main>
  );
}
