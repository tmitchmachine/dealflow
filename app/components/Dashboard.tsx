"use client";

import { useMemo, useState } from "react";
import type { ScoredListing } from "../lib/scoring";
import { PropertyCard } from "./PropertyCard";

type SortKey = "score" | "priceAsc" | "priceDesc" | "cap" | "cashflow" | "discount" | "return";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Deal score" },
  { key: "discount", label: "Below market" },
  { key: "return", label: "5yr return" },
  { key: "cap", label: "Cap rate" },
  { key: "cashflow", label: "Cash flow" },
  { key: "priceAsc", label: "Price ↑" },
  { key: "priceDesc", label: "Price ↓" },
];

export function Dashboard({ scored }: { scored: ScoredListing[] }) {
  const [sort, setSort] = useState<SortKey>("score");
  const [minScore, setMinScore] = useState(0);
  const [type, setType] = useState<string>("all");
  const [metro, setMetro] = useState<string>("all");
  const [positiveCashFlow, setPositiveCashFlow] = useState(false);
  const [hideHighRisk, setHideHighRisk] = useState(false);

  const types = useMemo(
    () => Array.from(new Set(scored.map((s) => s.listing.propertyType))).sort(),
    [scored],
  );
  const metros = useMemo(
    () => Array.from(new Set(scored.map((s) => s.market.metro))).sort(),
    [scored],
  );

  const visible = useMemo(() => {
    const filtered = scored.filter((s) => {
      if (s.overallScore < minScore) return false;
      if (type !== "all" && s.listing.propertyType !== type) return false;
      if (metro !== "all" && s.market.metro !== metro) return false;
      if (positiveCashFlow && s.financials.monthlyCashFlow < 0) return false;
      if (hideHighRisk && s.risks.some((r) => r.level === "high")) return false;
      return true;
    });

    const sorters: Record<SortKey, (a: ScoredListing, b: ScoredListing) => number> = {
      score: (a, b) => b.overallScore - a.overallScore,
      discount: (a, b) => b.deal.discountToValue - a.deal.discountToValue,
      return: (a, b) => b.deal.projectedAnnualizedReturn - a.deal.projectedAnnualizedReturn,
      cap: (a, b) => b.financials.capRate - a.financials.capRate,
      cashflow: (a, b) => b.financials.monthlyCashFlow - a.financials.monthlyCashFlow,
      priceAsc: (a, b) => a.listing.listPrice - b.listing.listPrice,
      priceDesc: (a, b) => b.listing.listPrice - a.listing.listPrice,
    };

    return [...filtered].sort(sorters[sort]);
  }, [scored, sort, minScore, type, metro, positiveCashFlow, hideHighRisk]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 capitalize dark:border-zinc-700"
          >
            <option value="all">All</option>
            {types.map((t) => (
              <option key={t} value={t} className="capitalize">{t.replace("-", " ")}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Market</span>
          <select
            value={metro}
            onChange={(e) => setMetro(e.target.value)}
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            <option value="all">All</option>
            {metros.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Min score {minScore}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={positiveCashFlow}
            onChange={(e) => setPositiveCashFlow(e.target.checked)}
          />
          <span className="text-zinc-500">Positive cash flow</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hideHighRisk}
            onChange={(e) => setHideHighRisk(e.target.checked)}
          />
          <span className="text-zinc-500">Hide high-risk</span>
        </label>

        <span className="ml-auto text-zinc-400">{visible.length} of {scored.length} properties</span>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          No properties match these filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <PropertyCard key={s.listing.id} scored={s} />
          ))}
        </div>
      )}
    </div>
  );
}
