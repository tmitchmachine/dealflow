import Link from "next/link";
import { notFound } from "next/navigation";
import { getListing, getListings } from "../../lib/data";
import { getMarkets } from "../../lib/markets";
import { scoreListing, type RiskLevel } from "../../lib/scoring";
import { ScoreDial } from "../../components/ScoreDial";
import { usd, pct, signedUsd, scoreColor } from "../../lib/format";
import { listingLink } from "../../lib/links";

export const revalidate = 604800;

export async function generateStaticParams() {
  const listings = await getListings();
  return listings.map((l) => ({ id: l.id }));
}

export default async function PropertyPage({ params }: PageProps<"/property/[id]">) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();
  const { markets } = await getMarkets();
  const market = markets[listing.metroId];
  if (!market) notFound();

  const { valuation: val, financials: fin, criteria, deal, risks, overallScore, grade } =
    scoreListing(listing, market);

  const valVsList = (val.value - listing.listPrice) / val.value;
  const source = listingLink(listing, market);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-emerald-600 hover:underline">← Back to scan</Link>

      {/* Hero */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative h-56" style={{ backgroundColor: listing.imageColor }}>
          {listing.photos?.[0] && (
            // Photos come from the source feed's CDN — a plain <img> avoids
            // whitelisting arbitrary hosts in next.config images.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.photos[0]}
              alt={`${listing.address}, ${market.metro}, ${market.state}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-3 left-4 text-white">
            <div className="text-2xl font-bold">{usd(listing.listPrice)}</div>
            <div className="text-sm text-white/85">
              {listing.address}, {market.metro}, {market.state} {listing.zip}
            </div>
          </div>
          <a
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 right-4 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-white"
          >
            {source.isDirect ? `${source.short} listing` : "Look up address"} ↗
          </a>
        </div>

        {listing.photos && listing.photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-b border-zinc-100 p-3 dark:border-zinc-800">
            {listing.photos.slice(1, 7).map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p}
                src={p}
                alt={`${listing.address} photo ${i + 2}`}
                loading="lazy"
                className="h-20 w-28 shrink-0 rounded-lg object-cover"
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-6 p-5">
          <ScoreDial score={overallScore} grade={grade} size={88} />
          <div className="flex flex-wrap gap-6 text-sm">
            <Spec label="Beds" value={listing.beds} />
            <Spec label="Baths" value={listing.baths} />
            <Spec label="Sqft" value={listing.sqft.toLocaleString()} />
            <Spec label="Built" value={listing.yearBuilt} />
            <Spec label="Condition" value={listing.condition} />
            <Spec label="Days on mkt" value={listing.daysOnMarket} />
          </div>
        </div>
      </div>

      {/* Our value opinion */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Our value opinion</h2>
          <span className="text-xs text-zinc-400">{Math.round(val.confidence * 100)}% confidence</span>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <BigStat label="Independent value" value={usd(val.value)} sub={`range ${usd(val.low)}–${usd(val.high)}`} />
          <BigStat
            label="List vs. our value"
            value={pct(valVsList)}
            sub={valVsList >= 0 ? "below value" : "above value"}
            tone={valVsList >= 0.03 ? "good" : valVsList < -0.03 ? "bad" : "neutral"}
          />
          <BigStat
            label="Zestimate (3rd party)"
            value={listing.thirdPartyEstimate ? usd(listing.thirdPartyEstimate) : "—"}
            sub="for contrast"
          />
        </div>
        {/* Value vs list vs offer scale */}
        <ValueBar listPrice={listing.listPrice} value={val.value} maxOffer={deal.maxOffer} low={val.low} high={val.high} />
        <p className="mt-3 text-sm text-zinc-500">{val.basis}</p>
      </section>

      {/* What to do */}
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">What to do</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Action
            title="Buy & hold"
            headline={`${pct(deal.projectedAnnualizedReturn)}/yr projected`}
            good={deal.projectedAnnualizedReturn >= 0.1}
            lines={[
              `Max offer for 10% equity: ${usd(deal.maxOffer)}`,
              listing.listPrice <= deal.maxOffer
                ? `List price clears that bar — offer up to ${usd(deal.maxOffer)}.`
                : `List is above the bar — negotiate toward ${usd(deal.maxOffer)}.`,
              `5-yr projected profit: ${signedUsd(deal.projectedProfit)} on ${usd(fin.cashInvested)} in.`,
            ]}
          />
          <Action
            title="Fix & flip"
            headline={`${signedUsd(deal.flipProfit)} (${pct(deal.flipMarginPct)})`}
            good={deal.flipMarginPct >= 0.1}
            lines={[
              `Rehab to turnkey: ~${usd(val.rehab)}`,
              `After-repair value: ${usd(val.arv)}`,
              `Buy ${usd(listing.listPrice)} + rehab − 6% selling costs.`,
            ]}
          />
        </div>
      </section>

      {/* Risks */}
      {risks.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Risk flags</h2>
          <div className="flex flex-col gap-2">
            {risks.map((r) => (
              <div key={r.label} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <RiskDot level={r.level} />
                <span className="text-zinc-700 dark:text-zinc-200">{r.label}</span>
                <span className="ml-auto text-xs uppercase tracking-wide text-zinc-400">{r.level}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Score breakdown */}
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Why it scored {overallScore}</h2>
        <div className="flex flex-col gap-3">
          {Object.values(criteria).map((c) => {
            const colors = scoreColor(c.score);
            return (
              <div key={c.key} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-zinc-800 dark:text-zinc-100">{c.label}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`font-semibold ${colors.text}`}>{Math.round(c.score)}</span>
                    <span className="text-zinc-400">· weight {pct(c.weight, 0)}</span>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className={`h-full ${colors.bar}`} style={{ width: `${c.score}%` }} />
                </div>
                <p className="mt-2 text-sm text-zinc-500">{c.reason}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Financials */}
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Investment math</h2>
        <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <Money label="Est. market rent / mo" value={usd(val.rentMonthly)} />
          <Money label="Gross yield" value={pct(fin.grossYield)} />
          <Money label="Cap rate" value={pct(fin.capRate)} good={fin.capRate >= 0.06} />
          <Money label="Mortgage / mo" value={usd(fin.mortgagePayment)} />
          <Money label="Monthly cash flow" value={signedUsd(Math.round(fin.monthlyCashFlow))} good={fin.monthlyCashFlow >= 0} />
          <Money label="Cash-on-cash" value={pct(fin.cashOnCash)} good={fin.cashOnCash >= 0} />
          <Money label="Cash to close (est.)" value={usd(fin.cashInvested)} />
          <Money label="NOI / yr" value={usd(fin.noiAnnual)} />
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Assumes 20% down, 7% / 30-yr financing, 5% vacancy, 8% management, 1% annual
          maintenance, plus {market.metro}&apos;s {pct(market.propertyTaxRate)} tax and{" "}
          {pct(market.insuranceRate)} insurance rates and the listing&apos;s HOA.
        </p>
      </section>

      {/* Price history */}
      {listing.priceHistory.length > 1 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Price history</h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            {listing.priceHistory.map((h, i) => {
              const prev = listing.priceHistory[i - 1];
              const delta = prev ? h.price - prev.price : 0;
              return (
                <div key={h.date} className="flex items-center justify-between border-b border-zinc-100 py-2 text-sm last:border-0 dark:border-zinc-800">
                  <span className="text-zinc-500">{h.date}</span>
                  <span className="font-medium">{usd(h.price)}</span>
                  <span className={delta < 0 ? "text-emerald-600" : delta > 0 ? "text-red-500" : "text-zinc-400"}>
                    {delta === 0 ? "listed" : signedUsd(delta)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="mt-8 text-xs text-zinc-400">
        Estimates from a heuristic model — not investment advice.
        {!source.isDirect && (
          <>
            {" "}
            No direct listing URL was provided by the feed, so the link above searches
            the address rather than opening a canonical listing page.
          </>
        )}
      </footer>
    </main>
  );
}

function Spec({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-semibold capitalize text-zinc-900 dark:text-zinc-50">{value}</div>
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
    </div>
  );
}

function BigStat({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub: string; tone?: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-orange-500" : "text-zinc-900 dark:text-zinc-50";
  return (
    <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-zinc-400">{sub}</div>
    </div>
  );
}

function ValueBar({ listPrice, value, maxOffer, low, high }: { listPrice: number; value: number; maxOffer: number; low: number; high: number }) {
  const min = Math.min(listPrice, low) * 0.97;
  const max = Math.max(value, high, listPrice) * 1.03;
  const at = (n: number) => `${((n - min) / (max - min)) * 100}%`;
  return (
    <div className="mt-4">
      <div className="relative h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
        {/* value band */}
        <div className="absolute h-2 rounded-full bg-emerald-200 dark:bg-emerald-900/60" style={{ left: at(low), right: `calc(100% - ${at(high)})` }} />
        {/* markers */}
        <Marker pos={at(value)} color="bg-emerald-600" label="value" />
        <Marker pos={at(maxOffer)} color="bg-amber-500" label="max offer" />
        <Marker pos={at(listPrice)} color="bg-zinc-900 dark:bg-white" label="list" />
      </div>
      <div className="mt-6" />
    </div>
  );
}

function Marker({ pos, color, label }: { pos: string; color: string; label: string }) {
  return (
    <div className="absolute -top-1 flex -translate-x-1/2 flex-col items-center" style={{ left: pos }}>
      <div className={`h-4 w-1 rounded-full ${color}`} />
      <span className="mt-0.5 whitespace-nowrap text-[10px] text-zinc-500">{label}</span>
    </div>
  );
}

function Action({ title, headline, good, lines }: { title: string; headline: string; good: boolean; lines: string[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-800 dark:text-zinc-100">{title}</h3>
        <span className={`text-sm font-bold ${good ? "text-emerald-600" : "text-orange-500"}`}>{headline}</span>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-zinc-500">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function RiskDot({ level }: { level: RiskLevel }) {
  const color = level === "high" ? "bg-red-500" : level === "medium" ? "bg-amber-500" : "bg-emerald-500";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}

function Money({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 pb-2 dark:border-zinc-800">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={`text-sm font-semibold ${good === undefined ? "text-zinc-800 dark:text-zinc-100" : good ? "text-emerald-600" : "text-orange-500"}`}>
        {value}
      </span>
    </div>
  );
}
