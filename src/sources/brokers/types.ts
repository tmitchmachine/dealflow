export type BrokerId = "aps" | "poe";

export type ListingStatus = "available" | "under-contract" | "sold";

/** One accounting practice a broker lists for sale (or sold — those are comps). */
export interface PracticeListing {
  /** `${broker}:${listingId}` */
  id: string;
  broker: BrokerId;
  listingId: string;
  url: string;
  title: string;
  status: ListingStatus;
  /** State or province as the broker writes it ("California"). */
  location: string;
  country: "US" | "CA" | "other";
  /** Gross annual revenue in USD (or CAD for Canadian listings). */
  revenue: number | null;
  askingPrice: number | null;
  /** askingPrice / revenue, rounded to 2 places. */
  multiple: number | null;
  practiceType: string;
  reasonForSelling: string;
  establishedYear: number | null;
  /** First ~400 characters of the broker's description. */
  summary: string;
  /** Sitemap lastmod — the broker's own "last changed" date. */
  lastmod: string | null;
}

export interface PracticeListingsFile {
  syncedAt: string;
  /** Per-broker counts from the last sync. */
  brokers: Record<BrokerId, { listed: number; sold: number; fetched: number; errors: number }>;
  listings: PracticeListing[];
}

export const BROKER_LABEL: Record<BrokerId, string> = {
  aps: "Accounting Practice Sales",
  poe: "Poe Group Advisors",
};
