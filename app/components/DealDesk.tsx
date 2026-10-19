"use client";

import { useMemo, useState } from "react";
import type { ScoredListing } from "../lib/scoring";
import type { ScoredBusiness } from "../lib/business/scoring";
import { PropertyCard } from "./PropertyCard";
import { BusinessCard } from "./BusinessCard";

type Tab = "top" | "property" | "business";
type SortKey = "investability" | "score" | "actionable";

type DeskItem =
  | { kind: "property"; scored: ScoredListing; investability: number; isActionable: boolean; overallScore: number }
  | { kind: "business"; scored: ScoredBusiness; investability: number; isActionable: boolean; overallScore: number };

const TABS: { key: Tab; label: string }[] = [
  { key: "top", label: "Top opportunities" },
  { key: "property", label: "Real estate" },
  { key: "business", label: "Businesses" },
];

export function DealDesk({
  properties,
  businesses,
}: {
  properties: ScoredListing[];
  businesses: ScoredBusiness[];
}) {
  const [tab, setTab] = useState<Tab>("top");
  const [sort, setSort] = useState<SortKey>("investability");
  const [actionableOnly, setActionableOnly] = useState(false);
  const [hideHighRisk, setHideHighRisk] = useState(false);
  const [minInvestability, setMinInvestability] = useState(0);

  const items = useMemo<DeskItem[]>(() => {
    const props: DeskItem[] = properties.map((s) => ({
      kind: "property",
      scored: s,
      investability: s.investability,
      isActionable: s.isActionable,
      overallScore: s.overallScore,
    }));
    const biz: DeskItem[] = businesses.map((s) => ({
      kind: "business",
      scored: s,
      investability: s.investability,
      isActionable: s.isActionable,
      overallScore: s.overallScore,
    }));

    let pool =
      tab === "property" ? props : tab === "business" ? biz : [...props, ...biz];

    pool = pool.filter((item) => {
      if (actionableOnly && !item.isActionable) return false;
      if (item.investability < minInvestability) return false;
      if (hideHighRisk) {
        const risks = item.kind === "property" ? item.scored.risks : item.scored.risks;
        if (risks.some((r) => r.level === "high")) return false;
      }
      return true;
    });

    pool.sort((a, b) => {
      if (sort === "actionable") {
        if (a.isActionable !== b.isActionable) return a.isActionable ? -1 : 1;
        return b.investability - a.investability;
      }
      if (sort === "score") return b.overallScore - a.overallScore;
      if (a.isActionable !== b.isActionable) return a.isActionable ? -1 : 1;
      return b.investability - a.investability;
    });

    return pool;
  }, [properties, businesses, tab, sort, actionableOnly, hideHighRisk, minInvestability]);

  const actionableCount =
    properties.filter((p) => p.isActionable).length + businesses.filter((b) => b.isActionable).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-400">
          {actionableCount} actionable across both books
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            <option value="investability">Investability</option>
            <option value="actionable">Actionable first</option>
            <option value="score">Raw score</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Min investability {minInvestability}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minInvestability}
            onChange={(e) => setMinInvestability(Number(e.target.value))}
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={actionableOnly}
            onChange={(e) => setActionableOnly(e.target.checked)}
          />
          <span className="text-zinc-500">Actionable only</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hideHighRisk}
            onChange={(e) => setHideHighRisk(e.target.checked)}
          />
          <span className="text-zinc-500">Hide high-risk</span>
        </label>

        <span className="ml-auto text-zinc-400">
          {items.length} shown
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
          No opportunities match these filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) =>
            item.kind === "property" ? (
              <PropertyCard key={`p-${item.scored.listing.id}`} scored={item.scored} />
            ) : (
              <BusinessCard key={`b-${item.scored.listing.id}`} scored={item.scored} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
