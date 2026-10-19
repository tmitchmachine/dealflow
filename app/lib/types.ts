// Core domain types for the property-opportunity scanner.
//
// Design principle: the app forms its OWN opinion of a property's value, rent,
// and risk. So a `Listing` carries only facts you can actually observe from a
// listing page (price, size, condition, location) — never a handed-to-us
// "estimated value". Value and rent are computed by the valuation engine from
// `MarketStats`, which is the kind of market-level data you can get for free
// (e.g. Redfin Data Center publishes median $/sqft and YoY by metro/ZIP).

export type ListingSource =
  | "zillow"
  | "redfin"
  | "realtor"
  | "mls"
  | "rentcast"
  | "mock";

export type PropertyType =
  | "single-family"
  | "condo"
  | "townhouse"
  | "multi-family";

/**
 * Observable condition of the home — drives value, rent, and rehab estimates.
 * In a real pipeline this is inferred from listing remarks/photos; here it's
 * authored.
 */
export type Condition = "turnkey" | "average" | "dated" | "fixer";

/** A signal that a seller may be motivated / the deal may be distressed. */
export type DistressFlag =
  | "foreclosure"
  | "short-sale"
  | "auction"
  | "estate-sale"
  | "price-reduced";

export interface PriceChange {
  date: string; // ISO date
  price: number; // dollars after the change
}

/**
 * Market-level statistics for a metro/ZIP. These are obtainable for free at the
 * market level (unlike per-home AVMs, which cost money) and are the raw
 * material our valuation engine turns into a per-property value opinion.
 */
export interface MarketStats {
  id: string;
  metro: string;
  state: string;

  /** Median sold price per square foot, in dollars. */
  medianPpsf: number;
  /** Trailing 12-month change in $/sqft, as a ratio (0.05 = +5%). */
  ppsfYoY: number;
  /** Spread of $/sqft across comps (coefficient of variation, e.g. 0.12). Higher = less certain valuations. */
  ppsfDispersion: number;
  /** Number of comparable sales behind these stats — feeds valuation confidence. */
  compSampleSize: number;

  /** Typical achievable monthly rent per square foot, in dollars. */
  rentPpsfMonthly: number;
  /** Median days-on-market locally — context for a listing's own DOM. */
  medianDaysOnMarket: number;

  /** Annual property tax as a fraction of value. */
  propertyTaxRate: number;
  /** Annual insurance as a fraction of value (coastal/FL markets run high). */
  insuranceRate: number;
}

export interface Listing {
  id: string;
  source: ListingSource;
  url?: string;

  // Location
  address: string;
  metroId: string; // -> MarketStats.id
  zip: string;

  // Physical (observable facts)
  propertyType: PropertyType;
  condition: Condition;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  lotSqft?: number;

  // Pricing / timing (observable facts)
  listPrice: number;
  priceHistory: PriceChange[];
  daysOnMarket: number;
  hoaMonthly: number;

  /**
   * Optional third-party AVM (Zestimate / Redfin Estimate) shown for contrast
   * against our independent number — never used as an input to scoring.
   */
  thirdPartyEstimate?: number;

  distressFlags: DistressFlag[];

  /**
   * Photo URLs from the source listing, hero first. Demo listings have none —
   * there is no real home behind them to photograph — so the UI falls back to
   * `imageColor`. A real adapter populates this from the feed.
   */
  photos?: string[];

  imageColor: string; // placeholder visual used when `photos` is empty
  listedDate: string;
}
