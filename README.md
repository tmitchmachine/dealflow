# Dealflow

Dealflow helps people find deals worth a closer look — businesses for sale and
real-estate opportunities — and helps owners present what they have to buyers.

## What it does

- **Find businesses for sale.** Browse listings of companies that are on the
  market, with enough context to decide whether a deal is worth a closer look.
- **Help sell a business.** Give owners a place to present their company to
  buyers who are actively looking.
- **Scan property listings.** Rank real-estate opportunities by buy-side score —
  independent opinions of value, rent, and risk (from
  [ReturnState Property](https://github.com/tmitchmachine/returnstateproperty)).

## Property opportunity scanner

The first shipped surface is the property scanner (Next.js 16). It scans
listings, forms an independent opinion of value/rent/risk, and ranks them by
buy-side opportunity.

```bash
cp .env.example .env.local   # add RENTCAST_API_KEY + RENTCAST_LIVE=1 for live listings
npm install
npm run dev                  # http://localhost:3000
npm run build                # production build
npm run refresh:markets      # pull the latest Redfin metro snapshot (~4s)
npm run test:data            # verify the live adapters
```

Live listings are **opt-in**: a key alone serves the mock catalog. Set
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
| `app/lib/data.ts` | `getListings()` seam (RentCast live, else mock). |
| `scripts/refresh-markets.mjs` | Rewrites the committed Redfin snapshot. |

### Scoring criteria (weights)

- **Below market (30%)** — list price vs. our independent value, shrunk toward
  neutral when comp confidence is low (so a thin-comp guess can't fake a deal).
- **Cash flow (30%)** — cap rate + monthly cash flow on a real mortgage/NOI model.
- **Seller motivation (20%)** — days-on-market vs. local median, price cuts, distress.
- **Appreciation (20%)** — market YoY trend, adjusted for property age.

### Live data sources

| Need | Source | Auth |
| --- | --- | --- |
| Market $/sqft, YoY, days-on-market | [Redfin Data Center](https://www.redfin.com/news/data-center/) metro tracker (public S3 TSV) | None — cached weekly; snapshot at `app/lib/data/redfin-metro-snapshot.json` as fallback |
| Per-listing facts (price, beds, sqft, DOM, MLS type) | [RentCast](https://www.rentcast.io/api) `/listings/sale` | `RENTCAST_API_KEY` **and** `RENTCAST_LIVE=1` in `.env.local` |
| Rent $/sqft (optional enrichment) | RentCast `/markets` by ZIP | Same key; set `RENTCAST_ENRICH_RENT=1` to enable |

Without `RENTCAST_LIVE=1`, the app serves the curated mock listing catalog so
local demos still work. Market stats still load from Redfin (live or snapshot).

Redfin's metro tracker is a ~106MB gzip, so it is **never downloaded during a
render** — a request is served from the committed snapshot (or the in-process
rows once warm) and the refresh runs via `after()` once the response is flushed.
Run `npm run refresh:markets` weekly to keep the snapshot, and therefore the
first page view after a restart, current.

> Note: Zillow/Redfin have no open public *listing* API and their ToS prohibit
> direct scraping. Use Redfin's *published* market data (free) plus a licensed
> aggregator like RentCast for listing-level records.

## Disclaimer

Scores are estimates from a heuristic model — not investment advice. Always do
your own diligence before making a purchase decision.
