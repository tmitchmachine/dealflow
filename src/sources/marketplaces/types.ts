export type MarketplaceHostId = "empireflippers" | "flippa";

/** Active for-sale plus lifecycle states from Phase 2. */
export type MarketplaceListingStatus = "active" | "under-contract" | "sold" | "gone";

export type TrendSource = "measured" | "claim" | "none";
export type TrendDirection = "up" | "flat" | "down" | "unknown";

export type HostCoverage = "full" | "partial";

export interface MarketplaceHostState {
  hostCoverage: HostCoverage;
  lastSuccessfulSweepAt: string | null;
  previousSuccessfulCardCount: number;
  /** Pages successfully rotated on a partial host (for cycle length). */
  rotationPagesSeen: number;
  /** Estimated full-inventory cycle length in days once known. */
  cycleLengthDays: number | null;
  /** Next page index for deeper discovery (1-based page number for Flippa). */
  nextRotationPage: number;
  goneAfterDays: number;
}

export interface MarketplaceListing {
  /** `${host}:${listingId}` */
  id: string;
  host: MarketplaceHostId;
  listingId: string;
  url: string;
  title: string;
  status: MarketplaceListingStatus;
  askingPrice: number | null;
  /** Only when the page says price **+ inventory** (not inventory included). */
  inventoryAddOn: number | null;
  /** ask + inventoryAddOn when set, else ask. Never Flippa live bid. */
  truePrice: number | null;
  monthlyEarnings: number | null;
  annualEarnings: number | null;
  earningsMonths: number | null;
  revenue: number | null;
  margin: number | null;
  trendSource: TrendSource;
  trendDirection: TrendDirection;
  siteAgeMonths: number | null;
  profitMonths: number | null;
  ownerHoursPerWeek: number | null;
  monetizationTypes: string[];
  largestSourceShare: number | null;
  modelClass: string | null;
  verifiedFinancials: boolean;
  detailScraped: boolean;
  /** Public listing / first-seen date used for freshness — never lastSeenAt. */
  listDate: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Last ask we saw (for re-scrape when index shows a new ask). */
  lastAskSeen: number | null;
  factorsKnown: number;
}

export interface MarketplaceInventoryFile {
  syncedAt: string;
  hosts: Record<MarketplaceHostId, MarketplaceHostState>;
  listings: MarketplaceListing[];
  fillRates?: Record<string, string>;
}

/** Card parsed from an index page (for-sale or status badge). */
export interface IndexCard {
  listingId: string;
  url: string;
  title: string;
  status: MarketplaceListingStatus;
  askingPrice: number | null;
  inventoryAddOn: number | null;
  monthlyEarnings: number | null;
  annualEarnings: number | null;
  revenue: number | null;
  siteAgeMonths: number | null;
  monetizationTypes: string[];
  modelClass: string | null;
  verifiedFinancials: boolean;
  ownerHoursPerWeek: number | null;
  listDate: string | null;
}
