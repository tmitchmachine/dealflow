# Dealflow

CLI that builds off-market deal books (California license indexes, broker
practices for sale, tax-default parcels) and publishes them to Firebase for
**ReturnState Team → Deals**.

There is no product UI in this repo. View listings in ReturnState Team.

## Books

| Book | Source |
| --- | --- |
| Accounting | CA Board of Accountancy license index (selling) |
| HVAC | CSLB contractors (comparison only) |
| Practices | APS / Poe broker listings |
| Tax-default | County open-data delinquent parcels |
| Businesses for sale | Empire Flippers + Flippa (Firecrawl; Motion Invest deferred — robots) |

Pinned publish scope (Orange County, niche limit 200, tax-default cap 1,500,
biz-sale cap 200) lives in `src/publish/scope.ts` and is stored on every snapshot.

## Setup

```bash
cp .env.example .env
npm install
```

Put license files under `data/raw/` (see below). Sync web sources before publish:

```bash
npm run sync:brokers
npm run sync:taxdefault
npm run sync:marketplaces   # Empire Flippers + Flippa (needs FIRECRAWL_API_KEY)
npm run list -- --counties "Orange" --limit 200
npm run enrich -- --niche accounting --counties Orange --limit 100   # optional
npm run snapshot                                                       # after fresh raw downloads
```

Marketplace sync is index-first with a **10 detail scrapes/day** local budget
(`data/cache/budget-daily-*.json`). Robots.txt is checked before every Firecrawl
URL. See `src/sources/marketplaces/EVAL.md` for Phase 0a probe notes.

To pause crawling: leave `data/cache/marketplace-sync.paused` in place (or set
`MARKETPLACE_SYNC_PAUSED=1`). Delete the file to resume.

## Publish to ReturnState Team

Requires a **file path** to a Firebase Admin service account JSON (same as
ironflowlive — not inline JSON):

```bash
export FIRESTORE_CREDENTIALS=~/secrets/return-state-team-firebase-adminsdk.json
export FIRESTORE_PROJECT_ID=return-state-team
npm run publish:deals
```

Optional: `--allow-shrink` to prune a niche that came back empty or shrank more
than `shrinkGuardRatio` (default 50%). Without that flag, prune is skipped for
that niche and the Team tab keeps the previous snapshot rows marked stale.

The Deals tab stays stale until the next successful publish.

## Tests

```bash
npm test
```

## License index data

**Accounting:** download `Accountancy_Data00.xls` from DCA into `data/raw/`.

**HVAC:** CSLB License Master + Personnel CSVs as
`data/raw/cslb/MasterLicenseData.csv` and `data/raw/cslb/PersonnelData.csv`.

Fallback: previously written `out/*.csv` from `npm run list`.

### Accounting factors (max 100)

| Factor | Column | Max | How it's earned |
| --- | --- | --- | --- |
| Years registered | `pts_firm_years` | 40 | Years since the firm registered with the Board; full points at 30 years |
| Entity type | `pts_entity` | 15 | CPA corporation or partnership 15; registered firm name (typically a sole practice) 5 |
| License status | `pts_status` | 10 | Active license |
| Senior CPA | `pts_senior_cpa` | 20 | A matched CPA licensed 30+ years (needs a high-confidence CPA match) |
| No recent CPA | `pts_no_recent_cpa` | 15 | Every matched CPA licensed 15+ years (needs a high-confidence CPA match) |

### HVAC factors (max 100)

| Factor | Column | Max | How it's earned |
| --- | --- | --- | --- |
| Years licensed | `pts_license_years` | 35 | Years since the CSLB license was issued; full points at 30 years |
| Business type | `pts_entity` | 10 | Corporation, LLC, partnership or joint venture 10; sole owner 5 |
| Extra trades | `pts_extra_classifications` | 5 | Licensed for more than C-20 alone |
| License status | `pts_status` | 10 | CLEAR license status |
| Owner tenure | `pts_owner_tenure` | 25 | Longest-serving current owner/officer's years on the license; full points at 30 years |
| No recent owner | `pts_no_recent_owner` | 15 | Every current owner/officer joined 15+ years ago |

### Businesses for sale factors (max 100)

Public acquire screen (not NDA diligence). Cards show **N of 7 factors known**.

| Factor | Max | How it's earned |
| --- | --- | --- |
| Price vs earnings (true price) | 25 | `truePrice / annualEarnings` vs band (6× SaaS / 4× else); full at ≤1× band, 0 at 2×; unknown 8; &lt;6 months earnings → unknown |
| Trend (measured) | 15 | P&amp;L table/chart only: up 15, flat (±10%) 8, down 2, unknown 4; seller claims do not unlock Pursue |
| Earnings size | 15 | Log annual $ from $12k → $240k |
| Concentration / diversity | 15 | Largest source share ≤40% → 15, ≥80% → 0; else monetization-type count |
| Track record | 10 | Linear site age 12→60 months (min with profit-months when present) |
| Owner hours | 10 | ≤10h/wk → 10, 20 → 5, ≥40 → 0; unknown 3 |
| Freshness | 10 | `listDate` / first seen; first cycle without listDate → mid 5; never `lastSeenAt` |

Verdicts: ≥65 pursue (requires measured trend), ≥50 negotiate, ≥35 watch, else pass — capped when ask/earnings missing, no detail scrape yet, or suspiciously cheap (&lt;1×) without verified financials.

## Disclaimer

Scores are estimates from a heuristic model — not investment advice. Always do
your own diligence before making a purchase decision.
