// Business opportunity scanner — buy-side investability + sell-side readiness.
//
// Buy track: is this worth acquiring at ask (or with a negotiated price)?
// Sell track: if we are helping the owner sell, how ready / how priced is it?

import { riskAdjustScore, toGrade, type OpportunityMeta, type Verdict } from "../opportunity";
import { industryLabel } from "./industries";
import type { BusinessListing, SaleReason } from "./types";
import { valueBusiness, type BusinessValuation } from "./valuation";

export const BUSINESS_WEIGHTS = {
  belowMarket: 0.3,
  yield: 0.3,
  motivation: 0.2,
  quality: 0.2,
} as const;

export type BusinessCriterionKey = "belowMarket" | "yield" | "motivation" | "quality";

export interface BusinessCriterionScore {
  key: BusinessCriterionKey;
  label: string;
  score: number;
  weight: number;
  reason: string;
}

export interface BusinessFinancials {
  /** Asking / SDE — marketed payback multiple. */
  askingMultiple: number;
  /** Our fair multiple after risk adjustments. */
  fairMultiple: number;
  /** Simple payback years at ask using seller SDE. */
  paybackYears: number;
  /** SDE / asking — cash yield before debt. */
  cashYield: number;
  /** Suggested max offer for ~20% equity cushion vs our value. */
  maxOffer: number;
  listBelowMaxOffer: boolean;
  discountToValue: number;
}

export type BusinessStrategy = "buy-operate" | "buy-semi-absentee" | "help-sell" | "negotiate" | "pass";

export interface BusinessDealAnalysis {
  strategy: BusinessStrategy;
  /** 0–100 buy-side fit. */
  buyFit: number;
  /** 0–100 how ready/attractive this is to help the owner sell. */
  sellReadiness: number;
  /** Plain-English next step for a seller we represent. */
  sellAdvice: string;
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskFlag {
  label: string;
  level: RiskLevel;
}

export interface ScoredBusiness extends OpportunityMeta {
  kind: "business";
  listing: BusinessListing;
  valuation: BusinessValuation;
  financials: BusinessFinancials;
  criteria: Record<BusinessCriterionKey, BusinessCriterionScore>;
  deal: BusinessDealAnalysis;
  risks: RiskFlag[];
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function scale(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp(((value - lo) / (hi - lo)) * 100);
}

const MOTIVATION_STRENGTH: Record<SaleReason, number> = {
  retirement: 85,
  health: 90,
  divorce: 80,
  burnout: 70,
  relocation: 65,
  "new-venture": 55,
  undisclosed: 35,
  "growth-capital": 25,
};

function computeFinancials(listing: BusinessListing, val: BusinessValuation): BusinessFinancials {
  const askingMultiple = listing.sdeTtm > 0 ? listing.askingPrice / listing.sdeTtm : 99;
  const fairMultiple = val.appliedMultiple;
  const paybackYears = listing.sdeTtm > 0 ? listing.askingPrice / listing.sdeTtm : 99;
  const cashYield = listing.askingPrice > 0 ? listing.sdeTtm / listing.askingPrice : 0;
  const maxOffer = Math.round(val.value * 0.9);
  const listBelowMaxOffer = listing.askingPrice <= maxOffer;
  const discountToValue = val.value > 0 ? (val.value - listing.askingPrice) / val.value : 0;
  return {
    askingMultiple,
    fairMultiple,
    paybackYears,
    cashYield,
    maxOffer,
    listBelowMaxOffer,
    discountToValue,
  };
}

function scoreBelowMarket(listing: BusinessListing, val: BusinessValuation, fin: BusinessFinancials): BusinessCriterionScore {
  const discount = fin.discountToValue;
  let score = clamp(50 + discount * (50 / 0.2));
  score = 50 + (score - 50) * val.confidence;
  const reason =
    discount >= 0
      ? `Ask is ${(discount * 100).toFixed(1)}% under our $${val.value.toLocaleString()} fair value (${fin.askingMultiple.toFixed(1)}× vs ${fin.fairMultiple.toFixed(1)}× SDE).`
      : `Ask is ${(Math.abs(discount) * 100).toFixed(1)}% above our $${val.value.toLocaleString()} fair value.`;
  return {
    key: "belowMarket",
    label: "Price vs Value",
    score: clamp(score),
    weight: BUSINESS_WEIGHTS.belowMarket,
    reason,
  };
}

function scoreYield(fin: BusinessFinancials): BusinessCriterionScore {
  // Target ~3–4yr payback / 25–35% cash yield for owner-operator SMBs.
  const yieldScore = scale(fin.cashYield, 0.15, 0.4);
  const paybackScore = scale(5 - fin.paybackYears, 0, 3); // shorter payback → higher
  const score = clamp(yieldScore * 0.6 + paybackScore * 0.4);
  const reason = `${(fin.cashYield * 100).toFixed(1)}% SDE yield at ask · ${fin.paybackYears.toFixed(1)}yr payback · ${fin.askingMultiple.toFixed(1)}× multiple.`;
  return { key: "yield", label: "Cash Yield", score, weight: BUSINESS_WEIGHTS.yield, reason };
}

function scoreMotivation(listing: BusinessListing): BusinessCriterionScore {
  let score = MOTIVATION_STRENGTH[listing.saleReason];
  // Long DOM without a price cut story → some negotiation room.
  if (listing.daysOnMarket > 120) score = clamp(score + 10);
  else if (listing.daysOnMarket > 60) score = clamp(score + 5);
  const reason = `Seller reason: ${listing.saleReason.replace("-", " ")} · ${listing.daysOnMarket} days on market.`;
  return { key: "motivation", label: "Seller Motivation", score, weight: BUSINESS_WEIGHTS.motivation, reason };
}

function scoreQuality(listing: BusinessListing, val: BusinessValuation): BusinessCriterionScore {
  let score = 50;
  const reasons: string[] = [];

  if (listing.ownerDependence === "low") {
    score += 18;
    reasons.push("systems-driven (low owner dependence)");
  } else if (listing.ownerDependence === "high") {
    score -= 18;
    reasons.push("high owner dependence");
  }

  if (listing.topCustomerShare < 0.1) {
    score += 10;
    reasons.push("diversified customers");
  } else if (listing.topCustomerShare > 0.25) {
    score -= 14;
    reasons.push(`${Math.round(listing.topCustomerShare * 100)}% top-customer concentration`);
  }

  if (listing.revenueTrend === "growing") {
    score += 12;
    reasons.push(`revenue ${(listing.revenueYoY * 100).toFixed(0)}% YoY`);
  } else if (listing.revenueTrend === "declining") {
    score -= 16;
    reasons.push("declining revenue");
  }

  if (listing.yearsInBusiness >= 10) {
    score += 8;
    reasons.push(`${listing.yearsInBusiness} yrs operating`);
  } else if (listing.yearsInBusiness < 3) {
    score -= 10;
    reasons.push("young business");
  }

  if (listing.hasFinancialsPackage) {
    score += 6;
  } else {
    score -= 8;
    reasons.push("thin financials package");
  }

  score = clamp(score * (0.85 + 0.15 * val.confidence));
  const reason = reasons.length ? reasons.join("; ") + "." : `${industryLabel(listing.industry)} — average transfer profile.`;
  return { key: "quality", label: "Business Quality", score: clamp(score), weight: BUSINESS_WEIGHTS.quality, reason };
}

function assessRisks(listing: BusinessListing, val: BusinessValuation, fin: BusinessFinancials): RiskFlag[] {
  const risks: RiskFlag[] = [];

  if (!listing.hasFinancialsPackage) {
    risks.push({ label: "No verified financials package — underwrite carefully", level: "high" });
  }
  if (listing.ownerDependence === "high") {
    risks.push({ label: "High owner dependence — transfer / key-person risk", level: "high" });
  } else if (listing.ownerDependence === "medium" && listing.ownerHoursPerWeek > 40) {
    risks.push({ label: `Owner still in it ${listing.ownerHoursPerWeek} hrs/wk`, level: "medium" });
  }
  if (listing.topCustomerShare >= 0.3) {
    risks.push({
      label: `Top customer is ${Math.round(listing.topCustomerShare * 100)}% of revenue`,
      level: "high",
    });
  } else if (listing.topCustomerShare >= 0.15) {
    risks.push({
      label: `Customer concentration ${Math.round(listing.topCustomerShare * 100)}%`,
      level: "medium",
    });
  }
  if (listing.revenueTrend === "declining") {
    risks.push({ label: `Revenue declining (${(listing.revenueYoY * 100).toFixed(0)}% YoY)`, level: "high" });
  }
  if (fin.discountToValue < -0.15) {
    risks.push({ label: "Materially overpriced vs our fair value", level: "high" });
  } else if (fin.discountToValue < -0.05) {
    risks.push({ label: "Asking above our fair value", level: "medium" });
  }
  if (val.confidence < 0.55) {
    risks.push({ label: `Low valuation confidence (${Math.round(val.confidence * 100)}%)`, level: "medium" });
  }
  if (listing.yearsInBusiness < 3) {
    risks.push({ label: "Short operating history", level: "medium" });
  }

  return risks;
}

function analyzeDeal(listing: BusinessListing, fin: BusinessFinancials, quality: number): BusinessDealAnalysis {
  // Sell readiness: documentation, pricing realism, transferability, story.
  let sellReadiness = 40;
  if (listing.hasFinancialsPackage) sellReadiness += 18;
  if (listing.ownerDependence === "low") sellReadiness += 15;
  else if (listing.ownerDependence === "high") sellReadiness -= 12;
  if (fin.discountToValue >= 0) sellReadiness += 12; // priced at/under fair value → easier to sell
  else if (fin.discountToValue < -0.15) sellReadiness -= 18;
  else sellReadiness -= 8;
  if (listing.revenueTrend === "growing") sellReadiness += 10;
  else if (listing.revenueTrend === "declining") sellReadiness -= 12;
  if (listing.topCustomerShare < 0.15) sellReadiness += 8;
  sellReadiness = clamp(sellReadiness);

  let sellAdvice: string;
  if (!listing.hasFinancialsPackage) {
    sellAdvice = "Assemble 3yrs P&Ls + tax returns before marketing hard — buyers will haircut heavily.";
  } else if (fin.discountToValue < -0.1) {
    sellAdvice = `Reprice toward $${fin.maxOffer.toLocaleString()} (our 90% of fair value) to attract serious buyers.`;
  } else if (listing.ownerDependence === "high") {
    sellAdvice = "Document SOPs and reduce owner hours before launch — transfer risk is the blocker.";
  } else if (sellReadiness >= 70) {
    sellAdvice = "Listing is sale-ready — market to owner-operators and small PE searching this niche.";
  } else {
    sellAdvice = "Tighten the CIM story (trend, customers, transition plan) before spending on outreach.";
  }

  // Buy fit.
  let buyFit = clamp(quality * 0.4 + scale(fin.cashYield, 0.15, 0.35) * 0.35 + (fin.listBelowMaxOffer ? 25 : scale(fin.discountToValue, -0.1, 0.15) * 0.25));

  let strategy: BusinessStrategy = "pass";
  if (buyFit >= 70 && fin.listBelowMaxOffer && listing.ownerDependence !== "high") {
    strategy = listing.ownerHoursPerWeek <= 20 && listing.ownerDependence === "low" ? "buy-semi-absentee" : "buy-operate";
  } else if (buyFit >= 55 && !fin.listBelowMaxOffer && fin.discountToValue > -0.2) {
    strategy = "negotiate";
  } else if (sellReadiness >= 65 && buyFit < 55) {
    // Strong sell-side case even if we wouldn't buy at ask.
    strategy = "help-sell";
  } else if (sellReadiness >= 55) {
    strategy = "help-sell";
  }

  return { strategy, buyFit: Math.round(buyFit), sellReadiness: Math.round(sellReadiness), sellAdvice };
}

function decideVerdict(
  listing: BusinessListing,
  fin: BusinessFinancials,
  deal: BusinessDealAnalysis,
  risks: RiskFlag[],
  investability: number,
): Pick<OpportunityMeta, "verdict" | "verdictReason" | "isActionable"> {
  const highRisks = risks.filter((r) => r.level === "high").length;

  if (highRisks >= 3) {
    return { verdict: "pass", verdictReason: "Too many high risks to underwrite or take to market as-is.", isActionable: false };
  }

  if (deal.strategy === "buy-operate" || deal.strategy === "buy-semi-absentee") {
    return {
      verdict: "pursue",
      verdictReason: `Buy-side clears gates at ask — ${fin.askingMultiple.toFixed(1)}× SDE vs our ${fin.fairMultiple.toFixed(1)}×.`,
      isActionable: true,
    };
  }

  if (deal.strategy === "negotiate") {
    return {
      verdict: "negotiate",
      verdictReason: `Worth owning near $${fin.maxOffer.toLocaleString()} (${fin.fairMultiple.toFixed(1)}× fair).`,
      isActionable: investability >= 58,
    };
  }

  if (deal.strategy === "help-sell" && deal.sellReadiness >= 65) {
    return {
      verdict: "pursue",
      verdictReason: `Strong sell-side mandate — readiness ${deal.sellReadiness}/100. ${deal.sellAdvice}`,
      isActionable: true,
    };
  }

  if (deal.strategy === "help-sell") {
    return {
      verdict: "watch",
      verdictReason: deal.sellAdvice,
      isActionable: false,
    };
  }

  if (investability >= 50) {
    return { verdict: "watch", verdictReason: "Not actionable yet — price or transfer risk still in the way.", isActionable: false };
  }

  return { verdict: "pass", verdictReason: "Does not clear buy or sell investability gates.", isActionable: false };
}

export function scoreBusiness(listing: BusinessListing): ScoredBusiness {
  const valuation = valueBusiness(listing);
  const financials = computeFinancials(listing, valuation);
  const criteria = {
    belowMarket: scoreBelowMarket(listing, valuation, financials),
    yield: scoreYield(financials),
    motivation: scoreMotivation(listing),
    quality: scoreQuality(listing, valuation),
  };

  const rawScore =
    criteria.belowMarket.score * BUSINESS_WEIGHTS.belowMarket +
    criteria.yield.score * BUSINESS_WEIGHTS.yield +
    criteria.motivation.score * BUSINESS_WEIGHTS.motivation +
    criteria.quality.score * BUSINESS_WEIGHTS.quality;

  const risks = assessRisks(listing, valuation, financials);
  const deal = analyzeDeal(listing, financials, criteria.quality.score);

  const highRisks = risks.filter((r) => r.level === "high").length;
  const mediumRisks = risks.filter((r) => r.level === "medium").length;
  let investability = riskAdjustScore(rawScore, {
    highRisks,
    mediumRisks,
    confidence: valuation.confidence,
  });

  // Lift sell-side mandates so "help sell" opportunities aren't buried.
  if (deal.strategy === "help-sell") {
    investability = clamp(Math.round(investability * 0.7 + deal.sellReadiness * 0.3));
  } else {
    investability = clamp(Math.round(investability * 0.85 + deal.buyFit * 0.15));
  }

  const { verdict, verdictReason, isActionable } = decideVerdict(listing, financials, deal, risks, investability);
  const overallScore = Math.round(rawScore);

  return {
    kind: "business",
    listing,
    valuation,
    financials,
    criteria,
    deal,
    risks,
    overallScore,
    grade: toGrade(overallScore),
    verdict: verdict as Verdict,
    verdictReason,
    investability,
    isActionable,
  };
}

export function scanBusinesses(listings: BusinessListing[]): ScoredBusiness[] {
  return listings
    .map(scoreBusiness)
    .sort((a, b) => {
      if (a.isActionable !== b.isActionable) return a.isActionable ? -1 : 1;
      if (b.investability !== a.investability) return b.investability - a.investability;
      return b.overallScore - a.overallScore;
    });
}
