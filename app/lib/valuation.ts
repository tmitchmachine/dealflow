// The valuation engine — the app's independent opinion of what a home is worth,
// what it rents for, what it needs in repairs, and what it's worth fixed up.
//
// This is the part that makes the scanner *valuable*: rather than trusting a
// listing's price or a third-party estimate, we derive value from market-level
// $/sqft (free, obtainable data) and adjust for the specific home's condition,
// age, and size — then attach a confidence range so a thin-comp guess never
// masquerades as certainty.

import type { Condition, Listing, MarketStats } from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** How condition moves value vs. an "average" home at market $/sqft. */
const CONDITION_VALUE_FACTOR: Record<Condition, number> = {
  turnkey: 1.07,
  average: 1.0,
  dated: 0.92,
  fixer: 0.78,
};

/** Condition also moves achievable rent (a fixer rents for less). */
const CONDITION_RENT_FACTOR: Record<Condition, number> = {
  turnkey: 1.05,
  average: 1.0,
  dated: 0.94,
  fixer: 0.84,
};

/** Rough rehab cost per square foot to bring a home to turnkey. */
const REHAB_PPSF: Record<Condition, number> = {
  turnkey: 0,
  average: 4,
  dated: 18,
  fixer: 45,
};

const CURRENT_YEAR = 2026;

/** Older homes carry a modest functional-obsolescence discount; newer a small premium. */
function ageFactor(yearBuilt: number): number {
  const age = CURRENT_YEAR - yearBuilt;
  if (age <= 5) return 1.04;
  if (age <= 20) return 1.01;
  if (age <= 40) return 1.0;
  if (age <= 60) return 0.98;
  if (age <= 90) return 0.95;
  return 0.93;
}

export interface Valuation {
  /** Our independent fair-market value, in dollars. */
  value: number;
  /** Low/high band from comp dispersion + model uncertainty. */
  low: number;
  high: number;
  /** 0–1 confidence in the point estimate. */
  confidence: number;
  /** Estimated achievable monthly market rent, in dollars. */
  rentMonthly: number;
  /** Estimated cost to bring the home to turnkey, in dollars. */
  rehab: number;
  /** After-repair value: what it's worth once rehabbed to turnkey. */
  arv: number;
  /** Plain-English note on how the value was formed. */
  basis: string;
}

export function valueListing(listing: Listing, market: MarketStats): Valuation {
  const base = listing.sqft * market.medianPpsf;
  const condFactor = CONDITION_VALUE_FACTOR[listing.condition];
  const aFactor = ageFactor(listing.yearBuilt);

  // Multi-family trades on income, so $/sqft tends to understate it slightly.
  const typeFactor = listing.propertyType === "multi-family" ? 1.05 : 1.0;

  const value = Math.round(base * condFactor * aFactor * typeFactor);

  // Confidence: more comps + tighter dispersion + a "typical" sized home = higher.
  const sampleConf = 1 - 1 / Math.sqrt(market.compSampleSize); // ~0.6 at 6 comps, ~0.9 at 100
  const dispersionConf = clamp(1 - market.ppsfDispersion * 2.5, 0.2, 1);
  // Unusually large/small homes are harder to value from $/sqft alone.
  const typicalSqft = 1700;
  const sizeMiss = Math.abs(listing.sqft - typicalSqft) / typicalSqft;
  const sizeConf = clamp(1 - sizeMiss * 0.5, 0.5, 1);
  const confidence = clamp(sampleConf * 0.5 + dispersionConf * 0.35 + sizeConf * 0.15, 0, 0.97);

  // Value band widens as confidence drops.
  const band = market.ppsfDispersion + (1 - confidence) * 0.08;
  const low = Math.round(value * (1 - band));
  const high = Math.round(value * (1 + band));

  const rentMonthly = Math.round(
    listing.sqft * market.rentPpsfMonthly * CONDITION_RENT_FACTOR[listing.condition],
  );

  const rehab = Math.round(listing.sqft * REHAB_PPSF[listing.condition]);
  // ARV = the same home valued as turnkey.
  const arv = Math.round(base * CONDITION_VALUE_FACTOR.turnkey * aFactor * typeFactor);

  const basis = `${listing.sqft.toLocaleString()} sqft × ${market.metro} median $${market.medianPpsf}/sqft, adjusted for ${listing.condition} condition and ${CURRENT_YEAR - listing.yearBuilt}-yr age (${market.compSampleSize} comps).`;

  return { value, low, high, confidence, rentMonthly, rehab, arv, basis };
}
