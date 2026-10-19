import { getListingsWithMeta } from "./lib/data";
import { getMarkets } from "./lib/markets";
import { scanListings } from "./lib/scoring";
import { Dashboard } from "./components/Dashboard";

/** Weekly refresh: one regeneration spends 5 RentCast calls (one per
 * metro), and the free tier is ~50/month. See README > Live data sources. */
export const revalidate = 604800;

export default async function Home() {
  const [{ listings, source }, { markets, redfinLive, periodBegin, rentcastRent }] =
    await Promise.all([getListingsWithMeta(), getMarkets()]);

  const scored = scanListings(listings, markets);

  const deals = scored.filter((s) => s.overallScore >= 68).length;
  const avg = Math.round(
    scored.reduce((a, s) => a + s.overallScore, 0) / Math.max(1, scored.length),
  );

  const listingLabel =
    source === "rentcast"
      ? "live RentCast / MLS listings"
      : "demo listings (set RENTCAST_LIVE=1 for live data)";
  const marketLabel = redfinLive
    ? `live Redfin Data Center (${periodBegin})`
    : `Redfin Data Center snapshot (${periodBegin})`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Dealflow — property opportunity scanner
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Scanned {scored.length} listings across {Object.keys(markets).length} markets
        </h1>
        <p className="mt-1 text-zinc-500">
          Each home is independently valued, then scored 0–100 on below-market price, cash
          flow, seller motivation, and appreciation. {deals} graded B or better · average
          score {avg}.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Data: {listingLabel} · market $/sqft from {marketLabel}
          {rentcastRent ? " · rent $/sqft enriched via RentCast" : ""}.
        </p>
      </header>

      <Dashboard scored={scored} />

      <footer className="mt-10 text-xs text-zinc-400">
        Scores are estimates from a heuristic model — not investment advice.
        {source === "mock" && (
          <>
            {" "}
            Listing records are demo data until <code>RENTCAST_API_KEY</code> and{" "}
            <code>RENTCAST_LIVE=1</code> are set in <code>.env.local</code>.
          </>
        )}
      </footer>
    </main>
  );
}
