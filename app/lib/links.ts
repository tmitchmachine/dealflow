// Outbound links from a listing back to the source website.
//
// A real adapter sets `Listing.url` to the actual listing page, and that is what
// we link to. Mock/demo listings have no such page, so rather than inventing a
// deep link that looks real and 404s, we fall back to an address *search* on
// Zillow and label it as a search — the link never claims to be something it
// isn't. Callers can branch on `isDirect` to word the affordance honestly.

import type { Listing, ListingSource, MarketStats } from "./types";

const SOURCE_LABEL: Record<ListingSource, string> = {
  zillow: "Zillow",
  redfin: "Redfin",
  realtor: "Realtor.com",
  mls: "MLS",
  rentcast: "RentCast",
  mock: "Zillow",
};

export interface ListingLink {
  href: string;
  /** Short label for a compact affordance (e.g. a badge on a card). */
  short: string;
  /** Full label for a button. */
  label: string;
  /** True when `href` is the real listing page; false when it's an address search. */
  isDirect: boolean;
}

/** Full "123 Main St, Cleveland, OH 44109" for search queries. */
export function fullAddress(listing: Listing, market: MarketStats): string {
  return `${listing.address}, ${market.metro}, ${market.state} ${listing.zip}`;
}

export function listingLink(listing: Listing, market: MarketStats): ListingLink {
  const source = SOURCE_LABEL[listing.source];

  if (listing.url) {
    return {
      href: listing.url,
      short: source,
      label: `View on ${source}`,
      isDirect: true,
    };
  }

  // Zillow resolves `/homes/<address>_rb/` as an address search. Strip anything
  // that would need percent-escaping (e.g. "#" in a unit number) so the slug is
  // URL-safe as-is and keeps Zillow's conventional comma-separated form.
  const slug = fullAddress(listing, market)
    .replace(/[^\w\s,.-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return {
    href: `https://www.zillow.com/homes/${slug}_rb/`,
    short: "Search",
    label: "Search this address on Zillow",
    isDirect: false,
  };
}
