import { getListingsWithMeta } from "./lib/data";
import { getMarkets } from "./lib/markets";
import { scanListings } from "./lib/scoring";
import { NicheBooksLoader } from "./components/NicheBooksLoader";

/** Weekly refresh: one regeneration spends 5 RentCast calls (one per
 * metro), and the free tier is ~50/month. See README > Live data sources. */
export const revalidate = 604800;

export default async function Home() {
  const [{ listings, source }, { markets, redfinLive, periodBegin, rentcastRent }] =
    await Promise.all([getListingsWithMeta(), getMarkets()]);

  const properties = scanListings(listings, markets);
  const actionableProps = properties.filter((s) => s.isActionable).length;
  const pursueProps = properties.filter((s) => s.verdict === "pursue").length;

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
          {properties.length} properties · California license indexes load below ·{" "}
          {actionableProps} RE actionable
        </h1>
        <p className="mt-1 text-zinc-500">
          Real estate plus accounting and HVAC license indexes in one book, ranked best →
          worst on investability. HVAC is comparison only. {pursueProps} properties marked
          pursue.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Data: {listingLabel} · market $/sqft from {marketLabel}
          {rentcastRent ? " · rent $/sqft enriched via RentCast" : ""} · niches via{" "}
          <code>/api/niches</code> (Orange County top 200).
        </p>
      </header>

      <NicheBooksLoader properties={properties} />

      <footer className="mt-10 space-y-2 text-xs text-zinc-400">
        <p>Scores and verdicts are estimates from heuristic models — not investment advice.</p>
        {source === "mock" && (
          <p>
            Property records are demo data until <code>RENTCAST_API_KEY</code> and{" "}
            <code>RENTCAST_LIVE=1</code> are set in <code>.env.local</code>.
          </p>
        )}
      </footer>
    </main>
  );
}
