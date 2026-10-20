# Phase 0a — Empire Flippers + Flippa probe (2026-10-19)

Fixtures under `fixtures/` from Firecrawl scrapes (robots-checked). Motion Invest deferred (robots deny filters/detail).

## Empire Flippers (`empireflippers.com`)

| Probe | Result |
| --- | --- |
| Seed | `https://empireflippers.com/marketplace/` |
| Listing URL | `/listing/{id}/` |
| Cards / index | **~16** for-sale cards in markdown (plus nav duplicates of same URLs) |
| `hostCoverage` | **partial** — “Load More” SPA; `?page=2` mostly repeats page-1 IDs (15/16 overlap). Not a reliable full inventory sweep. |
| Sold-in-map / index | **Yes** — “Sold” appears on marketplace cards → index is **not** pure liveness; never treat map-only as unsell. Force partial. |
| Paging by URL | Unreliable (SPA). Rotation length **unknown**; use `goneAfterDays` floor **30** until a real cycle is measured. |
| Index fields | `#id`, niche, monetization list, **Price**, **Net Profit** (annual), **Revenue**, Multiple, **First Made Money** (year), New Listing / Sold badges |
| Detail fields | Listing Price, Multiple, Net Profit, Revenue, Profit Margin, First Made Money (+ “N years M months”), Verified, monetization; prose may mention Amazon share / hours — **no P&L table or chart** in public scrape → `trendSource` stays `none`/`claim`, not `measured` |
| Inventory add-on | Not seen as “price + inventory” on probe detail |
| Vetted | “Verified” badge on listings → `verifiedFinancials` for cheap-cap exception |

**Default:** EF almost never has **measured** trend → Pursue gate fails → **Negotiate cap stays** unless a future probe finds a public numeric earnings series.

## Flippa (`flippa.com`)

| Probe | Result |
| --- | --- |
| Seed | Search `status=open`, property types website/ecommerce/app/saas, classified+auction+BIN; optional `filter[price][min]` |
| Listing URL | `https://flippa.com/{id}(-slug)?` |
| Cards / index | **50** per page (“Showing 1-50 of ~5,098”) |
| `hostCoverage` | **partial** — inventory too large for one discovery; URL paging works |
| Sold-in-index | Open-status search → sold not mixed; still partial for gone detection |
| Paging by URL | **Yes** — `page[number]=2` has **0** overlap with page 1. ~102 pages → ~**51 days** at 2 discovery pages/day; after one full rotation `goneAfterDays = max(30, 2 × cycleLengthDays)` |
| Index fields | Title, Monthly Revenue, Monthly Profit, Profit Multiple, Age, Type, **Asking price** (BIN/classified — ignore live bid), Data Verified; hours sometimes in title (“10–20 Hrs/Wk”) |
| Detail (public) | Asking Price (Classified), Monthly Profit, Age, Profit Multiple, Verified/Vetted; growth claims in copy/title. Financial charts often behind signup/NDA → measured trend rare without login |
| Inventory | Phrase “+ inventory” not seen on probe cards; parser still looks for it |
| Bids | Prefer Asking / Buy It Now; never use auction current bid as `askingPrice` |

## Field availability (index vs detail)

| Field | EF index | EF detail | Flippa index | Flippa detail |
| --- | --- | --- | --- | --- |
| Asking / true price | ✓ | ✓ | ✓ | ✓ |
| Earnings (annual or monthly) | annual profit | annual | monthly → ×12 | monthly |
| Revenue | ✓ | ✓ | monthly | sometimes |
| Site age | First Made Money year | years+months | Age years | Age |
| Monetization types | ✓ | ✓ | Type | Type |
| Owner hours | — | rare prose | title keywords | rare |
| Measured trend (table/chart) | — | **no** (probe) | — | usually NDA |
| `+ inventory` add-on | — | — | rare | rare |
| Verified financials | — | Verified | Data Verified | Verified/Vetted |

## Fill-rate expectation (first sync)

Print after each sync, e.g. `trend measured: EF 0/N, Flippa ~0/N` until public charts appear. Track record and price/earnings fill well from index alone.

## Robots (probe)

- EF: allows `/marketplace/`, `/listing/` (only disallows `/wp-admin/`).
- Flippa: allows search + listing pages; disallows `/users/`, watch, some auction action URLs — we never hit those.
