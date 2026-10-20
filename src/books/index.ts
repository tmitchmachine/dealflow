import type { PublishScope } from "../publish/scope";
import { PUBLISH_SCOPE } from "../publish/scope";
import { loadNicheBooks } from "./niches";
import { loadPracticeBook, type PracticeBook } from "./practices";
import { loadTaxDefaultBook, type TaxDefaultBook } from "./taxdefault";
import { loadBizSaleBook, type BizSaleBook } from "./bizsale";
import { rankLeads } from "./rank";
import type { LeadCardData, NicheBook } from "./types";

export type { LeadCardData, LeadSource, BadgeTone, NicheBook } from "./types";
export type { Verdict } from "./verdict";
export { verdictLabel, verdictTone } from "./verdict";
export { usd } from "./format";
export { compareLeads, rankLeads } from "./rank";
export { loadNicheBook, loadNicheBooks } from "./niches";
export { loadPracticeBook, type PracticeBook } from "./practices";
export { loadTaxDefaultBook, type TaxDefaultBook } from "./taxdefault";
export { loadBizSaleBook, type BizSaleBook } from "./bizsale";

export type DealBookId = "accounting" | "hvac" | "practice" | "taxdefault" | "bizsale";

export interface DealBooks {
  accounting: NicheBook;
  hvac: NicheBook;
  practice: PracticeBook;
  taxdefault: TaxDefaultBook;
  bizsale: BizSaleBook;
  /** All leads ranked actionable-first (for snapshot / publish). */
  rankedByBook: Record<DealBookId, LeadCardData[]>;
  scope: PublishScope;
}

/** Build every book under the pinned publish scope. */
export function buildDealBooks(scope: PublishScope = PUBLISH_SCOPE): DealBooks {
  const niches = loadNicheBooks({
    counties: [...scope.counties],
    limit: scope.nicheLimit,
  });
  const practice = loadPracticeBook();
  const taxdefault = loadTaxDefaultBook(scope.taxDefaultLimit);
  const bizsale = loadBizSaleBook(scope.bizSaleLimit);

  const rankedByBook: Record<DealBookId, LeadCardData[]> = {
    accounting: rankLeads(niches.accounting.firms),
    hvac: rankLeads(niches.hvac.firms),
    practice: rankLeads(practice.cards),
    taxdefault: rankLeads(taxdefault.cards),
    bizsale: rankLeads(bizsale.cards),
  };

  return {
    accounting: niches.accounting,
    hvac: niches.hvac,
    practice,
    taxdefault,
    bizsale,
    rankedByBook,
    scope,
  };
}
