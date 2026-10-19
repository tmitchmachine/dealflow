import { getListingsWithMeta } from "./lib/data";
import { getMarkets } from "./lib/markets";
import { scanListings } from "./lib/scoring";
import { DeskLoader } from "./components/DeskLoader";

/** Weekly refresh: one regeneration spends 5 RentCast calls (one per
 * metro), and the free tier is ~50/month. See README > Live data sources. */
export const revalidate = 604800;

export default async function Home() {
  const [{ listings, source, note }, { markets, redfinLive, periodBegin, rentcastRent }] =
    await Promise.all([getListingsWithMeta(), getMarkets()]);

  const properties = scanListings(listings, markets);

  const marketLabel = `${redfinLive ? "Live Redfin Data Center" : "Redfin Data Center snapshot"} (${periodBegin})${
    rentcastRent ? " · rent $/sqft via RentCast" : ""
  }`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" />
          Dealflow
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">Opportunity desk</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Accounting practices for sale, tax-defaulted parcels, live real estate listings, and
          California accounting and HVAC license indexes in one book — actionable deals
          first, then best → worst. Real data only: a source that isn&apos;t connected shows
          as off, never as sample records.
        </p>
      </header>

      <DeskLoader
        properties={properties}
        propertySource={{ live: source === "rentcast", note }}
        market={{ live: redfinLive, label: marketLabel }}
      />

      <footer className="mt-10 space-y-2 text-xs text-subtle">
        <p>Scores and verdicts are estimates from heuristic models — not investment advice.</p>
      </footer>
    </main>
  );
}
