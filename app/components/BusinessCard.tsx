import Link from "next/link";
import type { ScoredBusiness } from "../lib/business/scoring";
import { industryLabel } from "../lib/business/industries";
import { ScoreDial } from "./ScoreDial";
import { VerdictBadge } from "./VerdictBadge";
import { usd, pct, scoreColor } from "../lib/format";

export function BusinessCard({ scored }: { scored: ScoredBusiness }) {
  const { listing, valuation, financials, deal, risks, overallScore, grade, criteria, verdict, investability } =
    scored;
  const highRisks = risks.filter((r) => r.level === "high").length;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <Link
        href={`/business/${listing.id}`}
        className="absolute inset-0 z-10"
        aria-label={`${listing.name} — full analysis`}
      />

      <div className="relative h-28" style={{ backgroundColor: listing.imageColor }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <VerdictBadge verdict={verdict} compact />
          {deal.strategy === "help-sell" && (
            <span className="rounded-full bg-sky-600/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Help sell
            </span>
          )}
          {financials.discountToValue > 0.05 && (
            <span className="rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              {pct(financials.discountToValue, 0)} under value
            </span>
          )}
        </div>
        <span className="absolute bottom-2 left-3 text-xs font-medium text-white/90">
          {listing.city}, {listing.state}
        </span>
        <span className="absolute bottom-2 right-3 text-[10px] font-medium uppercase tracking-wide text-white/80">
          {industryLabel(listing.industry)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{usd(listing.askingPrice)}</div>
            <div className="text-sm text-zinc-500">{listing.name}</div>
            <div className="mt-0.5 text-xs text-zinc-400">
              Fair value {usd(valuation.value)} · investability {investability}
            </div>
          </div>
          <ScoreDial score={overallScore} grade={grade} size={56} />
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>{usd(listing.sdeTtm)} SDE</span>
          <span>{financials.askingMultiple.toFixed(1)}× ask</span>
          <span className="capitalize">{listing.saleReason.replace("-", " ")}</span>
        </div>

        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 text-center dark:border-zinc-800">
          <Stat label="SDE yield" value={pct(financials.cashYield)} good={financials.cashYield >= 0.25} />
          <Stat label="payback" value={`${financials.paybackYears.toFixed(1)}y`} good={financials.paybackYears <= 4} />
          <Stat label="sell ready" value={`${deal.sellReadiness}`} good={deal.sellReadiness >= 65} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <MiniBars criteria={criteria} />
          {highRisks > 0 && (
            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
              {highRisks} risk{highRisks > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div>
      <div className={`text-sm font-semibold ${good ? "text-emerald-600" : "text-zinc-500"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
    </div>
  );
}

function MiniBars({ criteria }: { criteria: ScoredBusiness["criteria"] }) {
  return (
    <div className="flex flex-1 gap-1">
      {Object.values(criteria).map((c) => {
        const colors = scoreColor(c.score);
        return (
          <div key={c.key} className="flex-1" title={`${c.label}: ${Math.round(c.score)}`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className={`h-full ${colors.bar}`} style={{ width: `${c.score}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
