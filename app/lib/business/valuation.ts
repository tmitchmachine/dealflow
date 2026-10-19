// Independent opinion of what a small business is worth.
//
// Starts from industry SDE multiples, then haircuts / premiums for transfer
// risk, customer concentration, trend, and documentation quality. Asking
// price is never an input to fair value.

import { INDUSTRY_BENCHMARKS } from "./industries";
import type { BusinessListing, OwnerDependence, RevenueTrend, SaleReason } from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const OWNER_DEP_FACTOR: Record<OwnerDependence, number> = {
  low: 1.08,
  medium: 1.0,
  high: 0.82,
};

const TREND_FACTOR: Record<RevenueTrend, number> = {
  growing: 1.08,
  stable: 1.0,
  declining: 0.78,
};

/** Stronger sale reasons can justify a slight multiple premium (motivated ≠ distressed junk). */
const REASON_FACTOR: Record<SaleReason, number> = {
  retirement: 1.02,
  health: 1.0,
  relocation: 1.0,
  divorce: 0.97,
  burnout: 0.95,
  "new-venture": 0.98,
  undisclosed: 0.92,
  "growth-capital": 1.0,
};

export interface BusinessValuation {
  /** Fair enterprise value based on risk-adjusted SDE multiple. */
  value: number;
  low: number;
  high: number;
  /** 0–1 confidence in the point estimate. */
  confidence: number;
  /** Multiple we applied after adjustments. */
  appliedMultiple: number;
  /** Industry midpoint multiple before adjustments. */
  baseMultiple: number;
  basis: string;
}

export function valueBusiness(listing: BusinessListing): BusinessValuation {
  const bench = INDUSTRY_BENCHMARKS[listing.industry];
  const baseMultiple = bench.sdeMultiple;

  // Customer concentration haircut — one whale is fragile.
  const concentrationFactor =
    listing.topCustomerShare >= 0.35
      ? 0.78
      : listing.topCustomerShare >= 0.2
        ? 0.9
        : listing.topCustomerShare >= 0.1
          ? 0.97
          : 1.03;

  // Tenure & scale: older + larger tends to transfer cleaner.
  const tenureFactor =
    listing.yearsInBusiness >= 15 ? 1.06 : listing.yearsInBusiness >= 8 ? 1.02 : listing.yearsInBusiness < 3 ? 0.85 : 1;
  const scaleFactor =
    listing.sdeTtm >= 500_000 ? 1.06 : listing.sdeTtm >= 250_000 ? 1.02 : listing.sdeTtm < 80_000 ? 0.9 : 1;

  // Documentation quality — no books, no premium.
  const docsFactor = listing.hasFinancialsPackage ? 1.04 : 0.88;

  // Growth vs industry expectation.
  const growthGap = listing.revenueYoY - bench.expectedGrowth;
  const growthFactor = clamp(1 + growthGap * 1.2, 0.75, 1.15);

  const appliedMultiple =
    baseMultiple *
    OWNER_DEP_FACTOR[listing.ownerDependence] *
    TREND_FACTOR[listing.revenueTrend] *
    REASON_FACTOR[listing.saleReason] *
    concentrationFactor *
    tenureFactor *
    scaleFactor *
    docsFactor *
    growthFactor;

  const inventory = listing.inventoryIncluded ? (listing.inventoryValue ?? 0) : 0;
  const value = Math.round(listing.sdeTtm * appliedMultiple + inventory);

  // Confidence from docs, concentration, trend clarity, and industry dispersion.
  const docsConf = listing.hasFinancialsPackage ? 0.9 : 0.55;
  const concConf = clamp(1 - listing.topCustomerShare * 1.2, 0.4, 1);
  const trendConf = listing.revenueTrend === "declining" ? 0.7 : 0.9;
  const dispersionConf = clamp(1 - bench.multipleDispersion * 0.6, 0.4, 1);
  const confidence = clamp(docsConf * 0.35 + concConf * 0.25 + trendConf * 0.2 + dispersionConf * 0.2, 0.3, 0.95);

  const band = bench.multipleDispersion / baseMultiple + (1 - confidence) * 0.12;
  const low = Math.round(value * (1 - band));
  const high = Math.round(value * (1 + band));

  const basis = `${bench.label} mid ${baseMultiple.toFixed(1)}× SDE → ${appliedMultiple.toFixed(2)}× after transfer, concentration, trend, and docs adjustments on $${listing.sdeTtm.toLocaleString()} SDE.`;

  return { value, low, high, confidence, appliedMultiple, baseMultiple, basis };
}
