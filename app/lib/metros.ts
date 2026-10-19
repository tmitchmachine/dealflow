// Metro scan targets: cities we pull listings for, plus tax/insurance/rent
// baselines that Redfin's free market tracker does not publish.

export interface MetroConfig {
  id: string;
  metro: string;
  state: string;
  /** Redfin Data Center REGION label (All Residential metro tracker). */
  redfinRegion: string;
  /** City name for RentCast /listings/sale?city=… */
  rentcastCity: string;
  /** Representative ZIP used when enriching rent $/sqft from RentCast /markets. */
  rentZip: string;
  /** Annual property tax as a fraction of value. */
  propertyTaxRate: number;
  /** Annual insurance as a fraction of value. */
  insuranceRate: number;
  /**
   * Baseline monthly rent $/sqft when RentCast market stats are unavailable.
   * Overridden by live RentCast /markets when RENTCAST_API_KEY is set.
   */
  rentPpsfMonthly: number;
  /** Placeholder card color when the feed has no photos. */
  imageColor: string;
}

export const METRO_CONFIGS: MetroConfig[] = [
  {
    id: "cleveland-oh",
    metro: "Cleveland",
    state: "OH",
    redfinRegion: "Cleveland, OH metro area",
    rentcastCity: "Cleveland",
    rentZip: "44109",
    propertyTaxRate: 0.019,
    insuranceRate: 0.006,
    rentPpsfMonthly: 1.18,
    imageColor: "#2f6b4f",
  },
  {
    id: "indianapolis-in",
    metro: "Indianapolis",
    state: "IN",
    redfinRegion: "Indianapolis, IN metro area",
    rentcastCity: "Indianapolis",
    rentZip: "46201",
    propertyTaxRate: 0.011,
    insuranceRate: 0.006,
    rentPpsfMonthly: 1.05,
    imageColor: "#3b5b6b",
  },
  {
    id: "memphis-tn",
    metro: "Memphis",
    state: "TN",
    redfinRegion: "Memphis, TN metro area",
    rentcastCity: "Memphis",
    rentZip: "38111",
    propertyTaxRate: 0.012,
    insuranceRate: 0.008,
    rentPpsfMonthly: 1.04,
    imageColor: "#6b4f3b",
  },
  {
    id: "tampa-fl",
    metro: "Tampa",
    state: "FL",
    redfinRegion: "Tampa, FL metro area",
    rentcastCity: "Tampa",
    rentZip: "33604",
    propertyTaxRate: 0.011,
    insuranceRate: 0.019,
    rentPpsfMonthly: 1.55,
    imageColor: "#2f5b7b",
  },
  {
    id: "austin-tx",
    metro: "Austin",
    state: "TX",
    redfinRegion: "Austin, TX metro area",
    rentcastCity: "Austin",
    rentZip: "78745",
    propertyTaxRate: 0.018,
    insuranceRate: 0.007,
    rentPpsfMonthly: 1.62,
    imageColor: "#4f3b6b",
  },
];

export const METRO_BY_ID: Record<string, MetroConfig> = Object.fromEntries(
  METRO_CONFIGS.map((m) => [m.id, m]),
);
