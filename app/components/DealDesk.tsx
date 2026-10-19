"use client";

import { useMemo, useState } from "react";
import type { ScoredListing } from "../lib/scoring";
import type { NicheFirmCardData } from "../lib/niches/types";
import { PropertyCard } from "./PropertyCard";
import { NicheFirmCard } from "./NicheFirmCard";

type Tab = "all" | "property" | "accounting" | "hvac";
type SortKey = "best" | "score";

type DeskItem =
  | {
      kind: "property";
      scored: ScoredListing;
      investability: number;
      isActionable: boolean;
      overallScore: number;
    }
  | {
      kind: "niche";
      firm: NicheFirmCardData;
      investability: number;
      isActionable: boolean;
      overallScore: number;
    };

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "property", label: "Real estate" },
  { key: "accounting", label: "Accounting" },
  { key: "hvac", label: "HVAC" },
];

export function DealDesk({
  properties,
  accounting,
  hvac,
}: {
  properties: ScoredListing[];
  accounting: NicheFirmCardData[];
  hvac: NicheFirmCardData[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<SortKey>("best");
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
    const acct: DeskItem[] = accounting.map((firm) => ({
      kind: "niche",
      firm,
      investability: firm.investability,
      isActionable: firm.isActionable,
      overallScore: firm.score,
    }));
    const hvacItems: DeskItem[] = hvac.map((firm) => ({
      kind: "niche",
      firm,
      investability: firm.investability,
      isActionable: firm.isActionable,
      overallScore: firm.score,
    }));

    let pool: DeskItem[];
    if (tab === "property") pool = props;
    else if (tab === "accounting") pool = acct;
    else if (tab === "hvac") pool = hvacItems;
    else pool = [...props, ...acct, ...hvacItems];

    pool = pool.filter((item) => {
      if (actionableOnly && !item.isActionable) return false;
      if (item.investability < minInvestability) return false;
      if (hideHighRisk && item.kind === "property") {
        if (item.scored.risks.some((r) => r.level === "high")) return false;
      }
      return true;
    });

    pool.sort((a, b) => {
      if (sort === "score") {
        if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
        return b.investability - a.investability;
      }
      if (b.investability !== a.investability) return b.investability - a.investability;
      return b.overallScore - a.overallScore;
    });

    return pool;
  }, [
    properties,
    accounting,
    hvac,
    tab,
    sort,
    actionableOnly,
    hideHighRisk,
    minInvestability,
  ]);

  const actionableCount =
    properties.filter((p) => p.isActionable).length +
    accounting.filter((f) => f.isActionable).length +
    hvac.filter((f) => f.isActionable).length;

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
          {actionableCount} actionable across the desk
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
            <option value="best">Best → worst</option>
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
          <span className="text-zinc-500">Hide high-risk RE</span>
        </label>

        <span className="ml-auto text-zinc-400">{items.length} shown</span>
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
              <NicheFirmCard
                key={`${item.firm.nicheId}-${item.firm.licenseNumber}`}
                firm={item.firm}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
