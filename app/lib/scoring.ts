// The opportunity scanner.
//
// Pipeline: Listing + MarketStats -> independent Valuation (valuation.ts) ->
// financials -> four weighted sub-scores -> overall deal score + grade, plus an
// actionable deal analysis (max offer, projected return, flip math) and honest
// risk flags.

import type { Listing, MarketStats } from "./types";
import { valueListing, type Valuation } from "./valuation";

export const ASSUMPTIONS = {
  downPaymentRate: 0.2,
  mortgageRate: 0.07,
  loanTermYears: 30,
  closingCostRate: 0.03,
  maintenanceRate: 0.01, // of value / yr
  vacancyRate: 0.05, // of gross rent
  managementRate: 0.08, // of gross rent
  sellingCostRate: 0.06, // of sale price (for flip/exit math)
  /** Target instant equity for the "max offer" recommendation. */
  targetEquity: 0.1,
  holdYears: 5,
} as const;

export const WEIGHTS = {
  belowMarket: 0.3,
  cashFlow: 0.3,
  motivation: 0.2,
  appreciation: 0.2,
} as const;

export type CriterionKey = "belowMarket" | "cashFlow" | "motivation" | "appreciation";

export interface CriterionScore {
  key: CriterionKey;
  label: string;
  score: number; // 0–100
  weight: number;
  reason: string;
}

export interface Financials {
  mortgagePayment: number; // monthly P&I
  noiAnnual: number;
  capRate: number;
  monthlyCashFlow: number;
  cashOnCash: number;
  cashInvested: number;
  grossYield: number;
}

export interface DealAnalysis {
  /** Discount of list price vs. our value (positive = under value). */
  discountToValue: number;
  /** Highest price that still leaves the target instant equity. */
  maxOffer: number;
  /** Whether the current list price already clears our offer bar. */
  listBelowMaxOffer: boolean;
  /** Profit if you bought, rehabbed to turnkey, and resold (after selling costs). */
  flipProfit: number;
  flipMarginPct: number;
  /** Projected total profit over the hold period (equity gain + paydown + cash flow). */
  projectedProfit: number;
  projectedAnnualizedReturn: number;
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskFlag {
  label: string;
  level: RiskLevel;
}

export interface ScoredListing {
  listing: Listing;
  market: MarketStats;
  valuation: Valuation;
  financials: Financials;
  criteria: Record<CriterionKey, CriterionScore>;
  deal: DealAnalysis;
  risks: RiskFlag[];
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function scale(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp(((value - lo) / (hi - lo)) * 100);
}

export function monthlyMortgage(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Remaining loan balance after `months` of payments. */
function remainingBalance(principal: number, annualRate: number, years: number, months: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return principal * (1 - months / n);
  const pmt = monthlyMortgage(principal, annualRate, years);
  return principal * Math.pow(1 + r, months) - pmt * ((Math.pow(1 + r, months) - 1) / r);
}

// ---------------------------------------------------------------------------
// Financial model
// ---------------------------------------------------------------------------

export function computeFinancials(listing: Listing, market: MarketStats, val: Valuation): Financials {
  const A = ASSUMPTIONS;
  const loanAmount = listing.listPrice * (1 - A.downPaymentRate);
  const mortgagePayment = monthlyMortgage(loanAmount, A.mortgageRate, A.loanTermYears);

  const grossRentAnnual = val.rentMonthly * 12;
  const opexAnnual =
    grossRentAnnual * A.vacancyRate +
    grossRentAnnual * A.managementRate +
    val.value * A.maintenanceRate +
    val.value * market.propertyTaxRate +
    val.value * market.insuranceRate +
    listing.hoaMonthly * 12;

  const noiAnnual = grossRentAnnual - opexAnnual;
  const capRate = noiAnnual / listing.listPrice;
  const monthlyCashFlow = noiAnnual / 12 - mortgagePayment;
  const cashInvested = listing.listPrice * (A.downPaymentRate + A.closingCostRate);
  const cashOnCash = (monthlyCashFlow * 12) / cashInvested;
  const grossYield = grossRentAnnual / listing.listPrice;

  return { mortgagePayment, noiAnnual, capRate, monthlyCashFlow, cashOnCash, cashInvested, grossYield };
}

// ---------------------------------------------------------------------------
// Deal analysis (the "what should I do" layer)
// ---------------------------------------------------------------------------

function analyzeDeal(listing: Listing, market: MarketStats, val: Valuation, fin: Financials): DealAnalysis {
  const A = ASSUMPTIONS;
  const discountToValue = (val.value - listing.listPrice) / val.value;
  const maxOffer = Math.round(val.value * (1 - A.targetEquity));
  const listBelowMaxOffer = listing.listPrice <= maxOffer;

  // Flip: buy at list, spend rehab, sell at ARV less selling costs.
  const flipProceeds = val.arv * (1 - A.sellingCostRate);
  const flipProfit = Math.round(flipProceeds - listing.listPrice - val.rehab);
  const flipMarginPct = flipProfit / listing.listPrice;

  // Buy-and-hold projection over the hold period.
  const months = A.holdYears * 12;
  const loanAmount = listing.listPrice * (1 - A.downPaymentRate);
  const futureValue = val.value * Math.pow(1 + market.ppsfYoY, A.holdYears);
  const equityFromAppreciation = futureValue - val.value;
  const principalPaid = loanAmount - remainingBalance(loanAmount, A.mortgageRate, A.loanTermYears, months);
  const cumulativeCashFlow = fin.monthlyCashFlow * months;
  const buySideEquityNow = val.value - listing.listPrice; // instant equity captured at purchase

  const projectedProfit = Math.round(
    buySideEquityNow + equityFromAppreciation + principalPaid + cumulativeCashFlow,
  );
  // Annualizing needs a non-negative growth factor: when the projected loss
  // exceeds the cash invested, `1 + totalReturn` goes negative and raising it to
  // a fractional power yields NaN. Losing more than the whole stake floors at
  // -100%/yr — you cannot lose more than all of it, annualized.
  const totalReturn = fin.cashInvested > 0 ? projectedProfit / fin.cashInvested : 0;
  const projectedAnnualizedReturn =
    fin.cashInvested <= 0
      ? 0
      : totalReturn <= -1
        ? -1
        : Math.pow(1 + totalReturn, 1 / A.holdYears) - 1;

  return {
    discountToValue,
    maxOffer,
    listBelowMaxOffer,
    flipProfit,
    flipMarginPct,
    projectedProfit,
    projectedAnnualizedReturn,
  };
}

// ---------------------------------------------------------------------------
// Risk flags
// ---------------------------------------------------------------------------

function assessRisks(listing: Listing, market: MarketStats, val: Valuation, fin: Financials): RiskFlag[] {
  const risks: RiskFlag[] = [];

  if (val.confidence < 0.5) {
    risks.push({ label: `Low valuation confidence (${Math.round(val.confidence * 100)}%) — thin comps`, level: "high" });
  } else if (val.confidence < 0.65) {
    risks.push({ label: `Moderate valuation confidence (${Math.round(val.confidence * 100)}%)`, level: "medium" });
  }

  if (fin.monthlyCashFlow < 0) {
    risks.push({ label: `Negative cash flow (${Math.round(fin.monthlyCashFlow)}/mo)`, level: fin.monthlyCashFlow < -300 ? "high" : "medium" });
  }

  if (market.ppsfYoY < 0) {
    risks.push({ label: `Declining market (${(market.ppsfYoY * 100).toFixed(1)}% YoY)`, level: "high" });
  } else if (market.ppsfYoY < 0.02) {
    risks.push({ label: "Flat market appreciation", level: "medium" });
  }

  if (listing.listPrice > val.value * 1.03) {
    risks.push({ label: "Listed above our value estimate", level: "high" });
  }

  if (val.rehab > val.value * 0.15) {
    risks.push({ label: `Heavy rehab (~$${(val.rehab / 1000).toFixed(0)}k)`, level: "medium" });
  }

  const grossRent = val.rentMonthly * 12;
  const carryBurden = (val.value * (market.propertyTaxRate + market.insuranceRate) + listing.hoaMonthly * 12) / grossRent;
  if (carryBurden > 0.35) {
    risks.push({ label: "High tax / insurance / HOA burden", level: "medium" });
  }

  return risks;
}

// ---------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------

function scoreBelowMarket(listing: Listing, val: Valuation): CriterionScore {
  const discount = (val.value - listing.listPrice) / val.value;
  let score = clamp(50 + discount * (50 / 0.15)); // 0% -> 50, +15% -> 100
  // Shrink the edge toward neutral when we're not confident in the value.
  score = 50 + (score - 50) * val.confidence;
  const pct = (discount * 100).toFixed(1);
  const reason =
    discount > 0
      ? `Listed ${pct}% below our $${val.value.toLocaleString()} estimate (±${Math.round((1 - val.confidence) * 100)}% uncertainty).`
      : `Listed ${Math.abs(Number(pct))}% above our $${val.value.toLocaleString()} estimate.`;
  return { key: "belowMarket", label: "Below Market", score: clamp(score), weight: WEIGHTS.belowMarket, reason };
}

function scoreCashFlow(fin: Financials): CriterionScore {
  const capComponent = scale(fin.capRate, 0.03, 0.09);
  const cfComponent = scale(fin.monthlyCashFlow, -200, 600);
  const score = clamp(capComponent * 0.5 + cfComponent * 0.5);
  const cf = Math.round(fin.monthlyCashFlow);
  const reason = `${(fin.capRate * 100).toFixed(1)}% cap rate, ${cf >= 0 ? "+" : "−"}$${Math.abs(cf).toLocaleString()}/mo cash flow (20% down, 7% rate).`;
  return { key: "cashFlow", label: "Cash Flow", score, weight: WEIGHTS.cashFlow, reason };
}

function priceDrops(listing: Listing): { count: number; totalPct: number } {
  const h = listing.priceHistory;
  if (h.length < 2) return { count: 0, totalPct: 0 };
  let count = 0;
  for (let i = 1; i < h.length; i++) if (h[i].price < h[i - 1].price) count++;
  const totalPct = h[0].price > 0 ? Math.max(0, (h[0].price - h[h.length - 1].price) / h[0].price) : 0;
  return { count, totalPct };
}

function scoreMotivation(listing: Listing, market: MarketStats): CriterionScore {
  let score = 0;
  const reasons: string[] = [];

  const domRatio = listing.daysOnMarket / Math.max(1, market.medianDaysOnMarket);
  score += scale(domRatio, 0.5, 3) * 0.4;
  if (domRatio > 1.3) reasons.push(`${listing.daysOnMarket} days on market (${domRatio.toFixed(1)}× local median)`);

  const drops = priceDrops(listing);
  score += scale(drops.totalPct, 0, 0.15) * 0.35;
  if (drops.count > 0) reasons.push(`${drops.count} price cut${drops.count > 1 ? "s" : ""} totaling ${(drops.totalPct * 100).toFixed(1)}%`);

  const flagScore = clamp(listing.distressFlags.length * 35);
  score += (flagScore / 100) * 25;
  if (listing.distressFlags.length > 0) reasons.push(listing.distressFlags.join(", "));

  const reason = reasons.length ? reasons.join("; ") + "." : "No strong motivation signals.";
  return { key: "motivation", label: "Seller Motivation", score: clamp(score), weight: WEIGHTS.motivation, reason };
}

function scoreAppreciation(listing: Listing, market: MarketStats): CriterionScore {
  const trendScore = scale(market.ppsfYoY, 0, 0.1);
  const age = 2026 - listing.yearBuilt;
  const ageBonus = age < 25 ? 8 : age > 70 ? -8 : 0;
  const score = clamp(trendScore + ageBonus);
  const reason = `${market.metro} market ${(market.ppsfYoY * 100).toFixed(1)}% YoY; built ${listing.yearBuilt}.`;
  return { key: "appreciation", label: "Appreciation", score, weight: WEIGHTS.appreciation, reason };
}

// ---------------------------------------------------------------------------
// Top-level scan
// ---------------------------------------------------------------------------

function toGrade(score: number): ScoredListing["grade"] {
  if (score >= 80) return "A";
  if (score >= 68) return "B";
  if (score >= 55) return "C";
  if (score >= 42) return "D";
  return "F";
}

export function scoreListing(listing: Listing, market: MarketStats): ScoredListing {
  const valuation = valueListing(listing, market);
  const financials = computeFinancials(listing, market, valuation);

  const criteria = {
    belowMarket: scoreBelowMarket(listing, valuation),
    cashFlow: scoreCashFlow(financials),
    motivation: scoreMotivation(listing, market),
    appreciation: scoreAppreciation(listing, market),
  };

  const overallScore = Math.round(
    criteria.belowMarket.score * WEIGHTS.belowMarket +
      criteria.cashFlow.score * WEIGHTS.cashFlow +
      criteria.motivation.score * WEIGHTS.motivation +
      criteria.appreciation.score * WEIGHTS.appreciation,
  );

  const deal = analyzeDeal(listing, market, valuation, financials);
  const risks = assessRisks(listing, market, valuation, financials);

  return { listing, market, valuation, financials, criteria, deal, risks, overallScore, grade: toGrade(overallScore) };
}

/** Score and rank a whole set of listings, best opportunities first. */
export function scanListings(listings: Listing[], markets: Record<string, MarketStats>): ScoredListing[] {
  return listings
    .filter((l) => markets[l.metroId])
    .map((l) => scoreListing(l, markets[l.metroId]))
    .sort((a, b) => b.overallScore - a.overallScore);
}
