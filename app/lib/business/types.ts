// Business listing domain types.
//
// Same design principle as property: a listing carries observable facts
// (asking price, reported cash flow, industry, tenure, reason for sale).
// Fair value and investability are computed by Dealflow — never taken from
// the broker's marketing multiple.

export type BusinessSource = "bizbuysell" | "axial" | "broker" | "owner";

export type BusinessIndustry =
  | "hvac-plumbing"
  | "landscaping"
  | "restaurant"
  | "retail"
  | "ecommerce"
  | "healthcare"
  | "saas"
  | "manufacturing"
  | "auto-services"
  | "cleaning"
  | "laundry"
  | "professional-services";

/** Why the owner is selling — strongest motivation signals first. */
export type SaleReason =
  | "retirement"
  | "health"
  | "relocation"
  | "divorce"
  | "burnout"
  | "new-venture"
  | "undisclosed"
  | "growth-capital"; // selling partial / looking for partner — weaker urgency

export type RevenueTrend = "growing" | "stable" | "declining";

/**
 * How much of the business lives in the owner's head vs. systems.
 * Lower owner dependence → easier transfer → better buy (and easier to help sell).
 */
export type OwnerDependence = "low" | "medium" | "high";

export interface IndustryBenchmark {
  industry: BusinessIndustry;
  label: string;
  /** Typical SDE / discretionary earnings multiple (midpoint). */
  sdeMultiple: number;
  /** Band around the midpoint (e.g. 0.4 → ± 0.4x). */
  multipleDispersion: number;
  /** Rough annual revenue growth expectation for a healthy operator. */
  expectedGrowth: number;
}

/**
 * Observable facts from a business listing / CIM excerpt.
 * Cash-flow figures are seller-reported — we still form our own value opinion
 * by applying industry multiples with haircuts for risk.
 */
export interface BusinessListing {
  id: string;
  source: BusinessSource;
  url?: string;

  name: string;
  industry: BusinessIndustry;
  city: string;
  state: string;

  /** Asking price (enterprise value / asset deal as marketed). */
  askingPrice: number;
  /** Trailing-twelve-month revenue. */
  revenueTtm: number;
  /**
   * Seller's discretionary earnings (SDE) — owner-operator cash flow before
   * owner's salary add-backs. Preferred small-business yardstick.
   */
  sdeTtm: number;
  /** Optional EBITDA when the deal is pitched that way (larger SMBs). */
  ebitdaTtm?: number;

  yearsInBusiness: number;
  employeeCount: number;
  /** Hours/week the owner currently works in the business. */
  ownerHoursPerWeek: number;
  ownerDependence: OwnerDependence;

  /** Largest customer as a share of revenue (0–1). */
  topCustomerShare: number;
  revenueTrend: RevenueTrend;
  /** YoY revenue change as a ratio (0.08 = +8%). */
  revenueYoY: number;

  saleReason: SaleReason;
  /** Days since the listing went live. */
  daysOnMarket: number;
  /** True when the seller provided tax returns / P&Ls (improves sell-side readiness). */
  hasFinancialsPackage: boolean;
  /** True when inventory / FF&E is included in asking price. */
  inventoryIncluded: boolean;
  /** Optional FFE / inventory value called out separately. */
  inventoryValue?: number;

  summary: string;
  imageColor: string;
  listedDate: string;
}
