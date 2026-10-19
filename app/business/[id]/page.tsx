import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness, getBusinesses } from "../../lib/business/data";
import { scoreBusiness, type RiskLevel } from "../../lib/business/scoring";
import { industryLabel } from "../../lib/business/industries";
import { ScoreDial } from "../../components/ScoreDial";
import { VerdictBadge } from "../../components/VerdictBadge";
import { usd, pct, scoreColor } from "../../lib/format";

export const revalidate = 604800;

export function generateStaticParams() {
  return getBusinesses().map((b) => ({ id: b.id }));
}

export default async function BusinessPage({ params }: PageProps<"/business/[id]">) {
  const { id } = await params;
  const listing = getBusiness(id);
  if (!listing) notFound();

  const scored = scoreBusiness(listing);
  const { valuation: val, financials: fin, criteria, deal, risks, overallScore, grade, verdict, verdictReason, investability } =
    scored;

  const valVsAsk = fin.discountToValue;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-emerald-600 hover:underline">
        ← Back to desk
      </Link>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative h-44" style={{ backgroundColor: listing.imageColor }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <VerdictBadge verdict={verdict} />
            <span className="rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white">
              {industryLabel(listing.industry)}
            </span>
          </div>
          <div className="absolute bottom-3 left-4 text-white">
            <div className="text-2xl font-bold">{usd(listing.askingPrice)}</div>
            <div className="text-sm text-white/85">
              {listing.name} · {listing.city}, {listing.state}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 p-5">
          <ScoreDial score={overallScore} grade={grade} size={88} />
          <div className="flex flex-wrap gap-6 text-sm">
            <Spec label="SDE" value={usd(listing.sdeTtm)} />
            <Spec label="Revenue" value={usd(listing.revenueTtm)} />
            <Spec label="Ask multiple" value={`${fin.askingMultiple.toFixed(1)}×`} />
            <Spec label="Employees" value={listing.employeeCount} />
            <Spec label="Years" value={listing.yearsInBusiness} />
            <Spec label="Investability" value={investability} />
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Verdict</h2>
          <VerdictBadge verdict={verdict} />
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{verdictReason}</p>
        <p className="mt-3 text-sm text-zinc-500">{listing.summary}</p>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Our value opinion</h2>
          <span className="text-xs text-zinc-400">{Math.round(val.confidence * 100)}% confidence</span>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <BigStat label="Fair value" value={usd(val.value)} sub={`range ${usd(val.low)}–${usd(val.high)}`} />
          <BigStat
            label="Ask vs fair value"
            value={pct(valVsAsk)}
            sub={valVsAsk >= 0 ? "below value" : "above value"}
            tone={valVsAsk >= 0.03 ? "good" : valVsAsk < -0.03 ? "bad" : "neutral"}
          />
          <BigStat
            label="Applied multiple"
            value={`${val.appliedMultiple.toFixed(2)}×`}
            sub={`industry mid ${val.baseMultiple.toFixed(1)}× SDE`}
          />
        </div>
        <p className="mt-3 text-sm text-zinc-500">{val.basis}</p>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">What to do</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Action
            title="Buy side"
            headline={deal.strategy.startsWith("buy") || deal.strategy === "negotiate" ? deal.strategy.replace("-", " ") : "pass / watch"}
            good={deal.buyFit >= 65}
            lines={[
              `Buy fit ${deal.buyFit}/100 · max offer ${usd(fin.maxOffer)}`,
              fin.listBelowMaxOffer
                ? "Ask clears our offer bar."
                : `Negotiate toward ${usd(fin.maxOffer)} (${fin.fairMultiple.toFixed(1)}× fair).`,
              `Cash yield ${pct(fin.cashYield)} · payback ${fin.paybackYears.toFixed(1)} years.`,
            ]}
          />
          <Action
            title="Help sell"
            headline={`Readiness ${deal.sellReadiness}/100`}
            good={deal.sellReadiness >= 65}
            lines={[
              deal.sellAdvice,
              `Seller reason: ${listing.saleReason.replace("-", " ")} · ${listing.daysOnMarket} DOM.`,
              listing.hasFinancialsPackage ? "Financials package on hand." : "Needs a real financials package.",
            ]}
          />
        </div>
      </section>

      {risks.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Risk flags</h2>
          <div className="flex flex-col gap-2">
            {risks.map((r) => (
              <div
                key={r.label}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <RiskDot level={r.level} />
                <span className="text-zinc-700 dark:text-zinc-200">{r.label}</span>
                <span className="ml-auto text-xs uppercase tracking-wide text-zinc-400">{r.level}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Why it scored {overallScore}
        </h2>
        <div className="flex flex-col gap-3">
          {Object.values(criteria).map((c) => {
            const colors = scoreColor(c.score);
            return (
              <div
                key={c.key}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
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

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Deal math</h2>
        <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
          <Money label="Asking price" value={usd(listing.askingPrice)} />
          <Money label="SDE (TTM)" value={usd(listing.sdeTtm)} />
          <Money label="Ask multiple" value={`${fin.askingMultiple.toFixed(2)}×`} />
          <Money label="Fair multiple" value={`${fin.fairMultiple.toFixed(2)}×`} good={fin.fairMultiple >= fin.askingMultiple} />
          <Money label="Cash yield at ask" value={pct(fin.cashYield)} good={fin.cashYield >= 0.25} />
          <Money label="Payback" value={`${fin.paybackYears.toFixed(1)} years`} good={fin.paybackYears <= 4} />
          <Money label="Max offer (90% FV)" value={usd(fin.maxOffer)} />
          <Money label="Top customer share" value={pct(listing.topCustomerShare, 0)} good={listing.topCustomerShare < 0.15} />
        </div>
      </section>

      <footer className="mt-8 text-xs text-zinc-400">
        Estimates from a heuristic model — not investment advice. Seller-reported SDE should be
        verified with tax returns and quality-of-earnings work.
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

function BigStat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-orange-500" : "text-zinc-900 dark:text-zinc-50";
  return (
    <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-zinc-400">{sub}</div>
    </div>
  );
}

function Action({
  title,
  headline,
  good,
  lines,
}: {
  title: string;
  headline: string;
  good: boolean;
  lines: string[];
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold capitalize text-zinc-800 dark:text-zinc-100">{title}</h3>
        <span className={`text-sm font-bold capitalize ${good ? "text-emerald-600" : "text-orange-500"}`}>
          {headline}
        </span>
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
      <span
        className={`text-sm font-semibold ${
          good === undefined ? "text-zinc-800 dark:text-zinc-100" : good ? "text-emerald-600" : "text-orange-500"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
