# Dealflow

Dealflow helps people find **investable** deals — real estate worth buying and
businesses worth buying or worth helping sell — by forming an independent
opinion of value and only promoting deals that clear hard gates.

## What it does

- **Real estate.** Independent AVM from market $/sqft, then DSCR, break-even
  occupancy, hold vs flip strategy fit, and a pursue / negotiate / watch / pass
  verdict (not just a pretty score).
- **California license indexes.** Ranked accounting firms (Board of Accountancy)
  and HVAC contractors (CSLB) from public license files — off-market deal
  sourcing by published tenure factors. Accounting is the selling index; HVAC
  is comparison only.
- **Practices for sale.** Accounting practices listed by brokers (Accounting
  Practice Sales, Poe Group Advisors), priced against those brokers' own sold
  listings.
- **Tax-default parcels.** Delinquent-tax properties from county open-data
  feeds — owners under pressure to sell before the county does.
- **Firm enrichment and license changes.** Websites, contact emails, Google
  open/closed status, succession language, and owner/officer exits layered onto
  the license indexes.
- **Opportunity desk.** One ranked view across all of it, actionable-first.

Property listing adapters started from
[ReturnState Property](https://github.com/tmitchmachine/returnstateproperty).

## Opportunity scanner

Next.js 16 app. Real data only: license indexes come from the public files in
`data/raw/`, and property listings come from RentCast when live data is on. With
no live feed the desk shows zero properties and says why. It never shows sample
records.

```bash
cp .env.example .env.local   # add RENTCAST_API_KEY + RENTCAST_LIVE=1 for live listings
npm install
npm run dev                  # http://localhost:3000
npm run build                # production build
npm run refresh:markets      # pull the latest Redfin metro snapshot (~4s)
npm run test:data            # verify the live adapters
```

Live listings are **opt-in**: a key alone serves no listings. Set
`RENTCAST_LIVE=1` only when you want to spend quota — the free tier is ~50
requests/month and one scan costs five (one per metro).

### How it works

The pipeline is intentionally source-agnostic — every source maps to one
`Listing` shape, and the analysis is computed, never handed in.

```
Listing (observable facts) ──┐
                             ├─► valuation.ts ─► value, rent, rehab, ARV (+confidence)
MarketStats ($/sqft, YoY) ───┘
                                      │
                                      ▼
                              scoring.ts
                              ├─ 4 weighted criteria → deal score + grade
                              ├─ deal analysis → max offer, 5yr return, flip math
                              └─ risk flags
                                      │
                                      ▼
                                  UI (cards, detail)
```

| File | Responsibility |
| --- | --- |
| `app/lib/types.ts` | Domain types. `Listing` holds only observable facts. |
| `app/lib/metros.ts` | Scan metros + tax/insurance/rent baselines. |
| `app/lib/markets.ts` | `getMarkets()` — Redfin sale stats (+ optional RentCast rent). |
| `app/lib/sources/redfin-markets.ts` | Streams Redfin Data Center metro tracker TSV. |
| `app/lib/sources/rentcast.ts` | RentCast sale-listings + ZIP rent adapter. |
| `app/lib/valuation.ts` | The AVM — value/rent/rehab/ARV with a confidence range. |
| `app/lib/scoring.ts` | Criteria scoring, deal analysis, risk flags. |
| `app/lib/data.ts` | `getListings()` seam (RentCast live, else none + reason). |
| `scripts/refresh-markets.mjs` | Rewrites the committed Redfin snapshot. |

### Property scoring (weights)

- **Below market (28%)** — list vs independent value; confidence-shrunk.
- **Cash flow (32%)** — cap rate, monthly CF, **DSCR**, and rent-to-price.
- **Seller motivation (20%)** — DOM vs median, price cuts, distress flags.
- **Appreciation (20%)** — market YoY, age, multi-family tilt.

Hard gates then produce a verdict: hold needs DSCR ≥ 1.2 and target return;
flips need ≥ 12% margin after rehab/selling costs. Investability is
risk-adjusted so thin-comp / high-risk deals don't rank as buys.

### Business scoring (weights)

- **Price vs value (30%)** — ask vs risk-adjusted SDE fair value.
- **Cash yield (30%)** — SDE / ask and payback years.
- **Seller motivation (20%)** — reason for sale + DOM.
- **Business quality (20%)** — owner dependence, concentration, trend, docs.

Parallel **sell-readiness** track advises whether Dealflow should help take the
company to market (and what to fix first).

### Live data sources

| Need | Source | Auth |
| --- | --- | --- |
| Market $/sqft, YoY, days-on-market | [Redfin Data Center](https://www.redfin.com/news/data-center/) metro tracker (public S3 TSV) | None — cached weekly; snapshot at `app/lib/data/redfin-metro-snapshot.json` as fallback |
| Per-listing facts (price, beds, sqft, DOM, MLS type) | [RentCast](https://www.rentcast.io/api) `/listings/sale` | `RENTCAST_API_KEY` **and** `RENTCAST_LIVE=1` in `.env.local` |
| Rent $/sqft (optional enrichment) | RentCast `/markets` by ZIP | Same key; set `RENTCAST_ENRICH_RENT=1` to enable |

Without `RENTCAST_LIVE=1`, the app serves no property listings and the desk's
data-sources panel says why. Market stats still load from Redfin (live or snapshot).

### California license indexes (accounting + HVAC)

The desk loads up to 1,500 firms per index for the county picked in its filter bar
(Orange by default, or statewide / any of the nine largest counties) via
`app/lib/niches/load.ts`, and renders them 60 cards at a time:

1. **Preferred:** live state files in `data/raw/` (gitignored).
2. **Fallback:** previously written `out/<cpa|hvac>-*.csv` exports from `npm run list`.

```bash
npm run list -- --counties "Orange" --limit 200                  # accounting
npm run list -- --niche hvac --counties "Orange" --limit 200
npm test                                                         # niche unit tests
```

**Accounting raw file:** download `Accountancy_Data00.xls` from DCA's Box folder
into `data/raw/` (see [IDEAS.md](IDEAS.md) / public DCA licensee lists).

**HVAC raw files:** CSLB License Master + Personnel CSVs as
`data/raw/cslb/MasterLicenseData.csv` and `data/raw/cslb/PersonnelData.csv`.

#### Accounting factors (max 100)

| Factor | Column | Max | How it's earned |
| --- | --- | --- | --- |
| Years registered | `pts_firm_years` | 40 | Years since the firm registered with the Board; full points at 30 years |
| Entity type | `pts_entity` | 15 | CPA corporation or partnership 15; registered firm name (typically a sole practice) 5 |
| License status | `pts_status` | 10 | Active license |
| Senior CPA | `pts_senior_cpa` | 20 | A matched CPA licensed 30+ years (needs a high-confidence CPA match) |
| No recent CPA | `pts_no_recent_cpa` | 15 | Every matched CPA licensed 15+ years (needs a high-confidence CPA match) |

#### HVAC factors (max 100)

| Factor | Column | Max | How it's earned |
| --- | --- | --- | --- |
| Years licensed | `pts_license_years` | 35 | Years since the CSLB license was issued; full points at 30 years |
| Business type | `pts_entity` | 10 | Corporation, LLC, partnership or joint venture 10; sole owner 5 |
| Extra trades | `pts_extra_classifications` | 5 | Licensed for more than C-20 alone |
| License status | `pts_status` | 10 | CLEAR license status |
| Owner tenure | `pts_owner_tenure` | 25 | Longest-serving current owner/officer's years on the license; full points at 30 years |
| No recent owner | `pts_no_recent_owner` | 15 | Every current owner/officer joined 15+ years ago |

Redfin's metro tracker is a ~106MB gzip, so it is **never downloaded during a
render** — a request is served from the committed snapshot (or the in-process
rows once warm) and the refresh runs via `after()` once the response is flushed.
Run `npm run refresh:markets` weekly to keep the snapshot, and therefore the
first page view after a restart, current.

### Web sources

Each web source is a CLI that writes a file the desk reads, so the app never
crawls on a page view. All HTTP goes through `src/web/fetch.ts` (ported from
Heavenya's crawler): an identified user agent, robots.txt honored, ~1.5s
between requests per host, and 429/503 backoff. Sites that block bots
(BizBuySell) or disallow crawling (HUD Home Store) are not used.

```bash
npm run sync:brokers      # broker listings → data/sources/practice-listings.json
npm run sync:taxdefault   # county feeds    → data/sources/tax-default.json (~15s)
npm run enrich -- --niche accounting --counties Orange --limit 100
npm run snapshot          # after each fresh data/raw download
```

| Source | Where it comes from | Notes |
| --- | --- | --- |
| Practices for sale | APS and Poe sitemaps → listing pages | Incremental: a page is refetched only when its sitemap `lastmod` changes, and each run fetches at most `--max-fetch` pages (default 300), so the first ~900-page sync spans a few runs. Sold California APS listings since 2025 (plus Poe's sold pages) are the price comps. |
| Tax-default parcels | Socrata APIs: Sonoma County CA, Norfolk VA, Clermont County OH | No key. Rows roll up per parcel; parcels owing under $500 are dropped. Add a county in `src/sources/taxdefault/counties.ts`. |
| Firm websites | Google Places API (New) Text Search, else verified domain guesses | Set `GOOGLE_MAPS_API_KEY` (and `PLACES_MONTHLY_CAP`, default 500/month). Without a key, guessed domains must show the firm's name *and* its city or license number; that finds ~7% of firms. The run prints a yield report. |
| License changes | Snapshots of the state files in `data/snapshots/` | Diffs start with the second download. HVAC owner/officer exits in the last 24 months come from CSLB's personnel dates right away. |

Scores for the new sources publish their factors like the license indexes
(`src/sources/brokers/score.ts`, `src/sources/taxdefault/aggregate.ts`). A firm
Google lists as permanently closed is marked pass. `data/sources/` and
`data/snapshots/` are small and safe to commit; `data/cache/` (page caches,
API spend counters) is gitignored. Tax-default files include owner names and
mailing addresses from public county records.

> Note: Zillow/Redfin have no open public *listing* API and their ToS prohibit
> direct scraping. Use Redfin's *published* market data (free) plus a licensed
> aggregator like RentCast for listing-level records.

## Disclaimer

Scores are estimates from a heuristic model — not investment advice. Always do
your own diligence before making a purchase decision.
