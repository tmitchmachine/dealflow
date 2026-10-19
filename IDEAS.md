# Ideas parking lot

New ideas go here instead of into the code. Review once a month. Nothing here gets built before the Nov 18, 2026 review.

## Parked

- Other trades from the same CSLB data (plumbing C-36, electrical C-10)
- RIAs (SEC Form ADV) and insurance agencies
- Software for licensed business brokers
- Getting a California real estate license and earning commission
- Other states' accountancy boards or contractor boards
- Outreach tools: letters, email, call lists
- Address-only and surname-plus-ZIP CPA matching (reached 49–57% of Orange County firms but is noisy; revisit only if buyers ask for CPA facts on more rows)
- HVAC: rank specialists above multi-trade firms (today "also licensed for" adds points, so plumbing companies holding C-20 can outrank pure HVAC shops)

## Index roadmap

Dealflow adds asset classes the way Ironflow adds markets: one index at a time, each with its own feed and score. The order:

1. **More board-file indexes** from the parked list, on today's pipeline: other CSLB trades, other states' accountancy and contractor boards, RIAs (SEC Form ADV), insurance agencies.
2. **Land and residential real estate.** It needs a separate pipeline (assessor and MLS data, not license files), so only with a specific data edge.
3. **Rename `Niche` to `DealIndex` in the code** (`src/niches` → `src/indexes`, and `--index` with `--niche` kept as an alias) when the next index is added. User-facing copy already says "index".

**Deferred wording:** when `classify.ts` ships and passes the 85% hand-label check, put "plus website classification" back in the accounting disclaimer, and add `automatable_share` as a factor with the weights rebalanced to 100. Until then, nothing in `src/` or the README mentions website classification.

## Decisions

### Oct 18, 2026: HVAC brought back alongside accounting

Built so the two niches can be compared side by side in the CLI and the UI. Data comparison on day one:

- **Accounting:** 5,647 active firms statewide; owner facts (CPA license years) on 22%.
- **HVAC:** 11,587 active C-20 licenses statewide; owner/officer tenure on nearly 100%, plus a business phone on 99.9%.

Outreach still goes to one niche's buyers at a time.

### Oct 18, 2026: an off-market deal index with one selling index

Dealflow is an off-market deal index, the sibling to Ironflow, and each index publishes its factors and their points. Accounting is the `selling` index and HVAC is `comparison` (the `stage` field in each `src/niches/<index>/index.ts`). The CLI and UI mark the comparison index as not for outreach. Making a different index `selling` is a decision and gets its own entry here.

### Nov 18, 2026 review

These rules were written in advance, in the Oct 18 plan. The review counts four numbers for the selling index only: buyers who have seen a sample (the weekly number), replies, buyers who asked the price, and buyers who paid upfront for a list or subscription.

| Evidence | Decision |
| --- | --- |
| 1+ paid, or 2+ buyers asking the price | **Keep.** Next county, then the next state |
| Replies, but no one will pay $500 or more | **One adjustment:** switch the buyer type to individual CPA buyers and brokers at a lower price, then decide again by Dec 15 |
| Fewer than 3 replies from the 20 buyers contacted | **Drop.** Write why here |
| The firm-only teaser got shrugs (the CPA-match gate failed on Oct 18) | **Drop** |

_Decision: to be written on Nov 18._
