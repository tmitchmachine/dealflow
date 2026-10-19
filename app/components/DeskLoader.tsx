"use client";

import { useEffect, useState } from "react";
import type { ScoredListing } from "../lib/scoring";
import type { NicheBook } from "../lib/niches/types";
import type { PracticeBook } from "../lib/desk/practices";
import type { TaxDefaultBook } from "../lib/desk/taxdefault";
import { countyLabel, type County } from "../lib/niches/counties";
import { DealDesk, type Leads, type PropertySource } from "./DealDesk";

/** Per index. Covers every active firm in any one county; statewide keeps the top 1,500. */
const BOOK_LIMIT = 1500;

/** Top tax-default parcels sent to the desk (of ~10k synced). */
const TAX_DEFAULT_LIMIT = 1500;

interface NicheBooksResponse {
  accounting: NicheBook;
  hvac: NicheBook;
  error?: string;
}

interface DealsResponse {
  practices: PracticeBook;
  taxDefault: TaxDefaultBook;
  error?: string;
}

type SourceState = "live" | "cached" | "off" | "loading";

/** ISO timestamp → the viewer's local calendar date. */
const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

const DOT: Record<SourceState, string> = {
  live: "bg-emerald-500",
  cached: "bg-amber-500",
  off: "bg-red-500",
  loading: "bg-line-strong animate-pulse",
};

export function DeskLoader({
  properties,
  propertySource,
  market,
}: {
  properties: ScoredListing[];
  propertySource: PropertySource;
  market: { live: boolean; label: string };
}) {
  const [books, setBooks] = useState<{ accounting: NicheBook; hvac: NicheBook } | null>(
    null,
  );
  const [county, setCounty] = useState<County>("Orange");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const changeCounty = (next: County) => {
    setCounty(next);
    setStatus("loading");
    setError(null);
  };

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ counties: county, limit: String(BOOK_LIMIT) });

    fetch(`/api/niches?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as NicheBooksResponse;
        if (!res.ok) throw new Error(body.error ?? "Failed to load niches");
        setBooks({ accounting: body.accounting, hvac: body.hvac });
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load niches");
        setStatus("error");
      });

    return () => controller.abort();
  }, [county]);

  // Web-sourced leads don't depend on the county picker, so they load once.
  const [deals, setDeals] = useState<DealsResponse | null>(null);
  const [dealsError, setDealsError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/deals?taxLimit=${TAX_DEFAULT_LIMIT}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as DealsResponse;
        if (!res.ok) throw new Error(body.error ?? "Failed to load deals");
        setDeals(body);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setDealsError(err instanceof Error ? err.message : "Failed to load deals");
      });
    return () => controller.abort();
  }, []);

  const leads: Leads = {
    practice: deals?.practices.cards ?? [],
    taxdefault: deals?.taxDefault.cards ?? [],
    accounting: books?.accounting.firms ?? [],
    hvac: books?.hvac.firms ?? [],
  };
  const firms = [...leads.accounting, ...leads.hvac];
  const enriched = firms.filter((f) => f.facts.some((x) => x.label === "Website")).length;
  const ownerChanges = firms.filter((f) => f.badges.some((b) => b.label === "Owner change")).length;
  const actionable =
    properties.filter((p) => p.isActionable).length +
    Object.values(leads).reduce((n, list) => n + list.filter((l) => l.isActionable).length, 0);
  const practices = deals?.practices;
  const taxDefault = deals?.taxDefault;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Practices for sale"
          value={practices ? practices.listed : "…"}
          sub={practices?.compMultiple ? `vs ${practices.compCount} sold comps` : "Broker listings"}
        />
        <Stat
          label="Tax-default"
          value={taxDefault ? taxDefault.total.toLocaleString() : "…"}
          sub={
            taxDefault
              ? `parcels · ${taxDefault.counties.length} counties · top ${taxDefault.cards.length.toLocaleString()} shown`
              : "County open data"
          }
        />
        <Stat
          label="Properties"
          value={properties.length}
          sub={propertySource.live ? "Live RentCast / MLS" : "Live feed off"}
        />
        <Stat
          label="Accounting firms"
          value={books ? leads.accounting.length : "…"}
          sub={books ? `of ${books.accounting.considered.toLocaleString()} · selling index` : "Loading"}
        />
        <Stat
          label="HVAC contractors"
          value={books ? leads.hvac.length : "…"}
          sub={books ? `of ${books.hvac.considered.toLocaleString()} · comparison` : "Loading"}
        />
        <Stat
          label="Actionable"
          value={status === "loading" ? "…" : actionable}
          sub="pursue or negotiate"
          highlight
        />
      </div>

      <section
        aria-label="Data sources"
        className="rounded-xl border border-line bg-surface p-4 text-sm"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Data sources
        </h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          <Source
            state={propertySource.live ? "live" : "off"}
            name="Property listings"
            detail={
              propertySource.live
                ? "RentCast active sale listings (MLS aggregator)"
                : (propertySource.note ?? "Live listings unavailable")
            }
          />
          <Source state={market.live ? "live" : "cached"} name="Market $/sqft" detail={market.label} />
          <Source
            state={bookState(status, books?.accounting)}
            name="Accounting licenses"
            detail={bookDetail(status, books?.accounting, "CA Board of Accountancy (DCA) file", county)}
          />
          <Source
            state={bookState(status, books?.hvac)}
            name="HVAC licenses"
            detail={bookDetail(status, books?.hvac, "CSLB master + personnel files", county)}
          />
          <Source
            state={!deals ? "loading" : practices?.syncedAt ? "live" : "off"}
            name="Practices for sale"
            detail={
              !deals
                ? "Loading…"
                : practices?.syncedAt
                  ? `Accounting Practice Sales + Poe Group Advisors · ${practices.listed} listed, ${practices.sold} sold comps${
                      practices.compMultiple ? ` (median ${practices.compMultiple.toFixed(2)}× revenue)` : ""
                    } · synced ${localDay(practices.syncedAt)}`
                  : "Not synced — run npm run sync:brokers"
            }
          />
          <Source
            state={!deals ? "loading" : taxDefault?.syncedAt ? "live" : "off"}
            name="Tax-default parcels"
            detail={
              !deals
                ? "Loading…"
                : taxDefault?.syncedAt
                  ? `${taxDefault.counties.map((c) => `${c.label} ${c.parcels.toLocaleString()}`).join(" · ")} · synced ${localDay(taxDefault.syncedAt)}`
                  : "Not synced — run npm run sync:taxdefault"
            }
          />
          <Source
            state={status === "loading" ? "loading" : enriched ? "live" : "off"}
            name="Firm websites"
            detail={
              enriched
                ? `${enriched} of ${firms.length.toLocaleString()} loaded firms have a website, email or Google status`
                : "Not enriched — run npm run enrich (Google Places with GOOGLE_MAPS_API_KEY, else verified domain guesses)"
            }
          />
          <Source
            state={status === "loading" ? "loading" : ownerChanges ? "live" : "off"}
            name="License changes"
            detail={
              ownerChanges
                ? `${ownerChanges} loaded firms with an owner/officer exit in the last 24 months · run npm run snapshot after each download`
                : "No snapshot signals — run npm run snapshot"
            }
          />
        </ul>
        {!propertySource.live && (
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            To turn on property listings, add <code className="text-fg">RENTCAST_API_KEY</code>{" "}
            and <code className="text-fg">RENTCAST_LIVE=1</code> to{" "}
            <code className="text-fg">.env.local</code> and restart. One scan uses 5 of
            RentCast&apos;s ~50 free monthly requests.
          </p>
        )}
        {status === "error" && error && (
          <p className="mt-3 border-t border-line pt-3 text-xs text-negative">{error}</p>
        )}
        {dealsError && (
          <p className="mt-3 border-t border-line pt-3 text-xs text-negative">{dealsError}</p>
        )}
      </section>

      {status === "loading" && (
        <p className="text-sm text-muted">
          Loading California license indexes… the first load can take ~30s while the CSLB
          files parse; later requests are cached.
        </p>
      )}

      <DealDesk
        properties={properties}
        propertySource={propertySource}
        county={county}
        onCountyChange={changeCounty}
        leads={leads}
      />

      {books && (
        <p className="text-xs text-subtle">
          {books.accounting.disclaimer} {books.hvac.disclaimer} Broker listings link back to
          each broker; tax-default parcels come from county open-data portals.
        </p>
      )}
    </div>
  );
}

function bookState(status: "loading" | "ready" | "error", book?: NicheBook): SourceState {
  if (status === "loading") return "loading";
  if (!book || book.firms.length === 0) return "off";
  return book.source === "raw" ? "live" : "cached";
}

function bookDetail(
  status: "loading" | "ready" | "error",
  book: NicheBook | undefined,
  rawLabel: string,
  county: County,
): string {
  if (status === "loading") return "Loading…";
  if (!book) return "Failed to load";
  if (book.firms.length === 0) return book.summary;
  return book.source === "raw"
    ? `${rawLabel} · ${countyLabel(county)}`
    : `Saved out/*.csv export · restore data/raw/ for the live file`;
}

function Stat({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: number | string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${highlight ? "text-accent" : "text-fg"}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
    </div>
  );
}

function Source({ state, name, detail }: { state: SourceState; name: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[state]}`} aria-hidden />
      <div className="min-w-0">
        <div className="font-medium text-fg">
          {name}{" "}
          <span className="text-xs font-normal text-subtle">
            {state === "live" ? "live" : state === "cached" ? "saved snapshot" : state === "off" ? "off" : ""}
          </span>
        </div>
        <div className="text-xs text-muted">{detail}</div>
      </div>
    </li>
  );
}
