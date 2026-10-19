// The property opportunity scanner.
//
// Pipeline: Listing + MarketStats → independent Valuation → financials
// (including DSCR / break-even) → weighted criteria → risk-adjusted
// investability + a clear verdict (pursue / negotiate / watch / pass).
//
// The goal is not a pretty score — it is surfacing deals a buyer should
// actually act on under a stated strategy (buy-hold or fix-flip).

import type { Listing, MarketStats } from "./types";
import { valueListing, type Valuation } from "./valuation";
import {
  riskAdjustScore,
  toGrade,
  type OpportunityMeta,
  type PropertyStrategy,
  type Verdict,
} from "./opportunity";

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
  /** Minimum DSCR most investment lenders will underwrite. */
  minDscr: 1.2,
  /** Flip margin needed after rehab + selling costs to call it investable. */
  minFlipMargin: 0.12,
  /** Target annualized hold return (levered). */
  minHoldReturn: 0.12,
} as const;

export const WEIGHTS = {
  belowMarket: 0.28,
  cashFlow: 0.32,
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
  /** Debt-service coverage: NOI / annual debt service. Lenders care about this. */
  dscr: number;
  /** Occupancy needed for NOI to cover debt service (0–1). */
  breakEvenOccupancy: number;
  /** Monthly rent / list price — proximity to the classic 1% rule. */
  rentToPrice: number;
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
  /** Best-fit strategy for this listing under our model. */
  strategy: PropertyStrategy;
  /** 0–100 how well the deal fits buy-and-hold. */
  holdFit: number;
  /** 0–100 how well the deal fits fix-and-flip. */
  flipFit: number;
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskFlag {
  label: string;
  level: RiskLevel;
}

export interface ScoredListing extends OpportunityMeta {
  kind: "property";
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
  const annualDebt = mortgagePayment * 12;
  const capRate = listing.listPrice > 0 ? noiAnnual / listing.listPrice : 0;
  const monthlyCashFlow = noiAnnual / 12 - mortgagePayment;
  const cashInvested = listing.listPrice * (A.downPaymentRate + A.closingCostRate);
  const cashOnCash = cashInvested > 0 ? (monthlyCashFlow * 12) / cashInvested : 0;
  const grossYield = listing.listPrice > 0 ? grossRentAnnual / listing.listPrice : 0;
  const dscr = annualDebt > 0 ? noiAnnual / annualDebt : 0;

  // Fixed costs (tax/ins/HOA/maint/mgmt) + debt, vs gross rent.
  const fixedAnnual =
    val.value * A.maintenanceRate +
    val.value * market.propertyTaxRate +
    val.value * market.insuranceRate +
    listing.hoaMonthly * 12 +
    grossRentAnnual * A.managementRate +
    annualDebt;
  const breakEvenOccupancy =
    grossRentAnnual > 0 ? clamp(fixedAnnual / grossRentAnnual, 0, 1.5) / 1 : 1;
  const rentToPrice = listing.listPrice > 0 ? val.rentMonthly / listing.listPrice : 0;

  return {
    mortgagePayment,
    noiAnnual,
    capRate,
    monthlyCashFlow,
    cashOnCash,
    cashInvested,
    grossYield,
    dscr,
    breakEvenOccupancy: clamp(breakEvenOccupancy, 0, 1),
    rentToPrice,
  };
}

// ---------------------------------------------------------------------------
// Deal analysis (the "what should I do" layer)
// ---------------------------------------------------------------------------

function strategyFits(
  listing: Listing,
  val: Valuation,
  fin: Financials,
  deal: Pick<DealAnalysis, "discountToValue" | "flipMarginPct" | "projectedAnnualizedReturn" | "listBelowMaxOffer">,
): { strategy: PropertyStrategy; holdFit: number; flipFit: number } {
  const A = ASSUMPTIONS;

  // Hold fit: DSCR, cash flow, hold return, under-value entry.
  let holdFit = 0;
  holdFit += scale(fin.dscr, 0.9, 1.5) * 0.35;
  holdFit += scale(fin.monthlyCashFlow, -150, 500) * 0.25;
  holdFit += scale(deal.projectedAnnualizedReturn, 0, 0.2) * 0.25;
  holdFit += (deal.listBelowMaxOffer ? 15 : scale(deal.discountToValue, -0.05, 0.12) * 0.15);
  holdFit = clamp(holdFit);

  // Flip fit: margin after rehab, rehab not terrifying, ARV confidence, distress/DOM.
  let flipFit = 0;
  flipFit += scale(deal.flipMarginPct, 0, 0.25) * 0.45;
  flipFit += scale(1 - val.rehab / Math.max(1, val.arv), 0.7, 1) * 0.2;
  flipFit += val.confidence * 25;
  if (listing.condition === "fixer" || listing.condition === "dated") flipFit += 8;
  if (listing.distressFlags.length > 0) flipFit += 6;
  flipFit = clamp(flipFit);

  let strategy: PropertyStrategy = "pass";
  if (holdFit >= 70 && fin.dscr >= A.minDscr && deal.projectedAnnualizedReturn >= A.minHoldReturn) {
    strategy = deal.listBelowMaxOffer ? "buy-hold" : "negotiate-hold";
  } else if (flipFit >= 70 && deal.flipMarginPct >= A.minFlipMargin && val.confidence >= 0.55) {
    strategy = "fix-flip";
  } else if (holdFit >= 55 && !deal.listBelowMaxOffer && deal.discountToValue > -0.05) {
    strategy = "negotiate-hold";
  } else if (Math.max(holdFit, flipFit) >= 55) {
    strategy = holdFit >= flipFit ? "negotiate-hold" : "fix-flip";
  }

  return { strategy, holdFit: Math.round(holdFit), flipFit: Math.round(flipFit) };
}

function analyzeDeal(listing: Listing, market: MarketStats, val: Valuation, fin: Financials): DealAnalysis {
  const A = ASSUMPTIONS;
  const discountToValue = val.value > 0 ? (val.value - listing.listPrice) / val.value : 0;
  const maxOffer = Math.round(val.value * (1 - A.targetEquity));
  const listBelowMaxOffer = listing.listPrice <= maxOffer;

  // Flip: buy at list, spend rehab, sell at ARV less selling costs.
  const flipProceeds = val.arv * (1 - A.sellingCostRate);
  const flipProfit = Math.round(flipProceeds - listing.listPrice - val.rehab);
  const flipMarginPct = listing.listPrice > 0 ? flipProfit / listing.listPrice : 0;

  // Buy-and-hold projection over the hold period.
  const months = A.holdYears * 12;
  const loanAmount = listing.listPrice * (1 - A.downPaymentRate);
  const futureValue = val.value * Math.pow(1 + market.ppsfYoY, A.holdYears);
  const equityFromAppreciation = futureValue - val.value;
  const principalPaid = loanAmount - remainingBalance(loanAmount, A.mortgageRate, A.loanTermYears, months);
  const cumulativeCashFlow = fin.monthlyCashFlow * months;
  const buySideEquityNow = val.value - listing.listPrice;

  const projectedProfit = Math.round(
    buySideEquityNow + equityFromAppreciation + principalPaid + cumulativeCashFlow,
  );
  const totalReturn = fin.cashInvested > 0 ? projectedProfit / fin.cashInvested : 0;
  const projectedAnnualizedReturn =
    fin.cashInvested <= 0
      ? 0
      : totalReturn <= -1
        ? -1
        : Math.pow(1 + totalReturn, 1 / A.holdYears) - 1;

  const partial = {
    discountToValue,
    flipMarginPct,
    projectedAnnualizedReturn,
    listBelowMaxOffer,
  };
  const { strategy, holdFit, flipFit } = strategyFits(listing, val, fin, partial);

  return {
    discountToValue,
    maxOffer,
    listBelowMaxOffer,
    flipProfit,
    flipMarginPct,
    projectedProfit,
    projectedAnnualizedReturn,
    strategy,
    holdFit,
    flipFit,
  };
}

function decideVerdict(
  listing: Listing,
  val: Valuation,
  fin: Financials,
  deal: DealAnalysis,
  risks: RiskFlag[],
  investability: number,
): Pick<OpportunityMeta, "verdict" | "verdictReason" | "isActionable"> {
  const highRisks = risks.filter((r) => r.level === "high").length;
  const A = ASSUMPTIONS;

  if (val.confidence < 0.4 || highRisks >= 3) {
    return {
      verdict: "pass",
      verdictReason: "Too much uncertainty or stacked high risks to underwrite.",
      isActionable: false,
    };
  }

  if (deal.strategy === "buy-hold" && fin.dscr >= A.minDscr && deal.listBelowMaxOffer) {
    return {
      verdict: "pursue",
      verdictReason: `Clears hold gates — DSCR ${fin.dscr.toFixed(2)}, list at/under max offer ${deal.maxOffer.toLocaleString()}.`,
      isActionable: true,
    };
  }

  if (deal.strategy === "fix-flip" && deal.flipMarginPct >= A.minFlipMargin) {
    return {
      verdict: "pursue",
      verdictReason: `Flip margin ${Math.round(deal.flipMarginPct * 100)}% after rehab and selling costs.`,
      isActionable: true,
    };
  }

  if (deal.strategy === "negotiate-hold" || (!deal.listBelowMaxOffer && deal.discountToValue > -0.08 && investability >= 55)) {
    const gap = Math.max(0, listing.listPrice - deal.maxOffer);
    return {
      verdict: "negotiate",
      verdictReason:
        gap > 0
          ? `Worth it near $${deal.maxOffer.toLocaleString()} (≈$${Math.round(gap / 1000)}k below ask).`
          : "Structure and price need work before this is investable.",
      isActionable: investability >= 60,
    };
  }

  if (investability >= 50) {
    return {
      verdict: "watch",
      verdictReason: "Not actionable at ask — watch for a price cut or clearer comps.",
      isActionable: false,
    };
  }

  return {
    verdict: "pass",
    verdictReason: "Returns and risk do not clear investability gates at this price.",
    isActionable: false,
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

  if (fin.dscr < 1.0) {
    risks.push({ label: `DSCR below 1.0 (${fin.dscr.toFixed(2)}) — won't clear most lenders`, level: "high" });
  } else if (fin.dscr < ASSUMPTIONS.minDscr) {
    risks.push({ label: `Thin DSCR (${fin.dscr.toFixed(2)}) vs ${ASSUMPTIONS.minDscr} lender bar`, level: "medium" });
  }

  if (fin.monthlyCashFlow < 0) {
    risks.push({
      label: `Negative cash flow (${Math.round(fin.monthlyCashFlow)}/mo)`,
      level: fin.monthlyCashFlow < -300 ? "high" : "medium",
    });
  }

  if (fin.breakEvenOccupancy > 0.9) {
    risks.push({ label: `Break-even occupancy ${Math.round(fin.breakEvenOccupancy * 100)}% — little vacancy cushion`, level: "high" });
  } else if (fin.breakEvenOccupancy > 0.8) {
    risks.push({ label: `Tight break-even occupancy (${Math.round(fin.breakEvenOccupancy * 100)}%)`, level: "medium" });
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
  const carryBurden =
    grossRent > 0
      ? (val.value * (market.propertyTaxRate + market.insuranceRate) + listing.hoaMonthly * 12) / grossRent
      : 0;
  if (carryBurden > 0.35) {
    risks.push({ label: "High tax / insurance / HOA burden", level: "medium" });
  }

  return risks;
}

// ---------------------------------------------------------------------------
// Criteria
// ---------------------------------------------------------------------------

function scoreBelowMarket(listing: Listing, val: Valuation): CriterionScore {
  const discount = val.value > 0 ? (val.value - listing.listPrice) / val.value : 0;
  let score = clamp(50 + discount * (50 / 0.15)); // 0% -> 50, +15% -> 100
  // Shrink the edge toward neutral when we're not confident in the value.
  score = 50 + (score - 50) * val.confidence;

  // Bonus when our value sits between list and a higher third-party AVM —
  // suggests the ask is soft without relying on the AVM as an input to value.
  if (
    listing.thirdPartyEstimate &&
    listing.listPrice < val.value &&
    val.value <= listing.thirdPartyEstimate * 1.05
  ) {
    score = clamp(score + 5);
  }

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
  const dscrComponent = scale(fin.dscr, 0.85, 1.45);
  const onePct = scale(fin.rentToPrice, 0.005, 0.012);
  const score = clamp(capComponent * 0.3 + cfComponent * 0.3 + dscrComponent * 0.3 + onePct * 0.1);
  const cf = Math.round(fin.monthlyCashFlow);
  const reason = `${(fin.capRate * 100).toFixed(1)}% cap, DSCR ${fin.dscr.toFixed(2)}, ${cf >= 0 ? "+" : "−"}$${Math.abs(cf).toLocaleString()}/mo (20% down, 7% rate).`;
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
  // Prefer income property types slightly for appreciation-through-rent growth.
  const typeBonus = listing.propertyType === "multi-family" ? 4 : 0;
  const score = clamp(trendScore + ageBonus + typeBonus);
  const reason = `${market.metro} market ${(market.ppsfYoY * 100).toFixed(1)}% YoY; built ${listing.yearBuilt}.`;
  return { key: "appreciation", label: "Appreciation", score, weight: WEIGHTS.appreciation, reason };
}

// ---------------------------------------------------------------------------
// Top-level scan
// ---------------------------------------------------------------------------

export function scoreListing(listing: Listing, market: MarketStats): ScoredListing {
  const valuation = valueListing(listing, market);
  const financials = computeFinancials(listing, market, valuation);

  const criteria = {
    belowMarket: scoreBelowMarket(listing, valuation),
    cashFlow: scoreCashFlow(financials),
    motivation: scoreMotivation(listing, market),
    appreciation: scoreAppreciation(listing, market),
  };

  const rawScore =
    criteria.belowMarket.score * WEIGHTS.belowMarket +
    criteria.cashFlow.score * WEIGHTS.cashFlow +
    criteria.motivation.score * WEIGHTS.motivation +
    criteria.appreciation.score * WEIGHTS.appreciation;

  const deal = analyzeDeal(listing, market, valuation, financials);
  const risks = assessRisks(listing, market, valuation, financials);

  const highRisks = risks.filter((r) => r.level === "high").length;
  const mediumRisks = risks.filter((r) => r.level === "medium").length;
  const investability = riskAdjustScore(rawScore, {
    highRisks,
    mediumRisks,
    confidence: valuation.confidence,
  });

  // Blend strategy fit into investability so a strong flip isn't buried by mediocre hold math.
  const strategyBoost = Math.round(Math.max(deal.holdFit, deal.flipFit) * 0.15);
  const investabilityFinal = clamp(Math.round(investability * 0.85 + strategyBoost));

  const { verdict, verdictReason, isActionable } = decideVerdict(
    listing,
    valuation,
    financials,
    deal,
    risks,
    investabilityFinal,
  );

  const overallScore = Math.round(rawScore);

  return {
    kind: "property",
    listing,
    market,
    valuation,
    financials,
    criteria,
    deal,
    risks,
    overallScore,
    grade: toGrade(overallScore),
    verdict,
    verdictReason,
    investability: investabilityFinal,
    isActionable,
  };
}

/** Score and rank listings best → worst by investability. */
export function scanListings(listings: Listing[], markets: Record<string, MarketStats>): ScoredListing[] {
  return listings
    .filter((l) => markets[l.metroId])
    .map((l) => scoreListing(l, markets[l.metroId]))
    .sort((a, b) => {
      if (b.investability !== a.investability) return b.investability - a.investability;
      return b.overallScore - a.overallScore;
    });
}

export type { Verdict, PropertyStrategy };
