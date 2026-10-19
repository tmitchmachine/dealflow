"use client";

import { useMemo, useState } from "react";
import type { ScoredListing } from "../lib/scoring";
import type { LeadCardData, LeadSource } from "../lib/desk/types";
import { PropertyCard } from "./PropertyCard";
import { LeadCard } from "./LeadCard";
import { COUNTIES, countyLabel, type County } from "../lib/niches/counties";

/** Cards rendered per "Show more" step; thousands at once would stall the page. */
const PAGE_SIZE = 60;

type Tab = "all" | "property" | LeadSource;

export interface PropertySource {
  live: boolean;
  /** Why there are no listings when the live feed is off. */
  note?: string;
}
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
      kind: "lead";
      lead: LeadCardData;
      investability: number;
      isActionable: boolean;
      overallScore: number;
    };

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "practice", label: "For sale" },
  { key: "property", label: "Real estate" },
  { key: "taxdefault", label: "Tax default" },
  { key: "accounting", label: "Accounting" },
  { key: "hvac", label: "HVAC" },
];

/** Why a lead tab is empty and how to fill it. */
const EMPTY_LEADS: Record<LeadSource, string> = {
  practice: "No broker listings synced yet. Run npm run sync:brokers.",
  taxdefault: "No tax-default parcels synced yet. Run npm run sync:taxdefault.",
  accounting: "No accounting firms loaded for this county.",
  hvac: "No HVAC contractors loaded for this county.",
};

export type Leads = Record<LeadSource, LeadCardData[]>;

export function DealDesk({
  properties,
  propertySource,
  county,
  onCountyChange,
  leads,
}: {
  properties: ScoredListing[];
  propertySource: PropertySource;
  county: County;
  onCountyChange: (county: County) => void;
  leads: Leads;
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
    const leadItems = (source: LeadSource): DeskItem[] =>
      leads[source].map((lead) => ({
        kind: "lead",
        lead,
        investability: lead.investability,
        isActionable: lead.isActionable,
        overallScore: lead.score,
      }));

    let pool: DeskItem[];
    if (tab === "property") pool = props;
    else if (tab === "all")
      pool = [
        ...props,
        ...(Object.keys(leads) as LeadSource[]).flatMap(leadItems),
      ];
    else pool = leadItems(tab);

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
      // Actionable first: comparison-only HVAC can score 100 on tenure, but
      // it must not outrank deals you can actually pursue.
      if (a.isActionable !== b.isActionable) return a.isActionable ? -1 : 1;
      if (b.investability !== a.investability) return b.investability - a.investability;
      return b.overallScore - a.overallScore;
    });

    return pool;
  }, [
    properties,
    leads,
    tab,
    sort,
    actionableOnly,
    hideHighRisk,
    minInvestability,
  ]);

  // Paging resets whenever the filtered list changes, without an effect.
  const pagingKey = [tab, sort, actionableOnly, hideHighRisk, minInvestability, items.length].join("|");
  const [paging, setPaging] = useState({ key: pagingKey, count: PAGE_SIZE });
  const visibleCount = paging.key === pagingKey ? paging.count : PAGE_SIZE;
  const visible = items.slice(0, visibleCount);

  const tabCounts: Record<Tab, number> = {
    all: properties.length + Object.values(leads).reduce((n, l) => n + l.length, 0),
    property: properties.length,
    practice: leads.practice.length,
    taxdefault: leads.taxdefault.length,
    accounting: leads.accounting.length,
    hvac: leads.hvac.length,
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-fg text-canvas"
                : "bg-surface-2 text-muted hover:bg-line"
            }`}
          >
            {t.label}{" "}
            <span className={`tabular-nums ${tab === t.key ? "opacity-70" : "text-subtle"}`}>
              {tabCounts[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
        {/* The county only scopes the license indexes. */}
        {(tab === "all" || tab === "accounting" || tab === "hvac") && (
          <label className="flex items-center gap-2">
            <span className="text-muted">Licenses in</span>
            <select
              value={county}
              onChange={(e) => onCountyChange(e.target.value as County)}
              className="rounded-md border border-line-strong bg-surface px-2 py-1 text-fg"
            >
              {COUNTIES.map((c) => (
                <option key={c} value={c}>
                  {countyLabel(c)}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-2">
          <span className="text-muted">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-line-strong bg-surface px-2 py-1 text-fg"
          >
            <option value="best">Actionable first, best → worst</option>
            <option value="score">Raw score</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-muted">
            Min investability <span className="tabular-nums text-fg">{minInvestability}</span>
          </span>
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
          <span className="text-muted">Actionable only</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hideHighRisk}
            onChange={(e) => setHideHighRisk(e.target.checked)}
          />
          <span className="text-muted">Hide high-risk RE</span>
        </label>

        <span className="ml-auto tabular-nums text-subtle">
          {Math.min(visibleCount, items.length).toLocaleString()} of{" "}
          {items.length.toLocaleString()}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong p-10 text-center text-muted">
          {tab === "property" && properties.length === 0
            ? `No live property listings. ${propertySource.note ?? ""}`
            : tab !== "all" && tab !== "property" && leads[tab].length === 0
              ? EMPTY_LEADS[tab]
              : "No opportunities match these filters."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) =>
            item.kind === "property" ? (
              <PropertyCard key={`p-${item.scored.listing.id}`} scored={item.scored} />
            ) : (
              <LeadCard key={`${item.lead.source}-${item.lead.id}`} lead={item.lead} />
            ),
          )}
        </div>
      )}

      {visibleCount < items.length && (
        <button
          type="button"
          onClick={() => setPaging({ key: pagingKey, count: visibleCount + PAGE_SIZE })}
          className="self-center rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-fg transition hover:bg-surface-2"
        >
          Show {Math.min(PAGE_SIZE, items.length - visibleCount)} more ·{" "}
          {(items.length - visibleCount).toLocaleString()} left
        </button>
      )}
    </div>
  );
}
