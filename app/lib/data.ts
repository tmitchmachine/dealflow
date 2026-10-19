// Listing catalog seam.
//
// Real listings only: with RENTCAST_API_KEY and RENTCAST_LIVE=1 set,
// getListings() pulls live active sale listings from RentCast (MLS/aggregator
// feed). Otherwise it returns no listings plus a note saying why — the desk
// never shows fabricated properties.
//
// Market $/sqft comes from Redfin Data Center via getMarkets() — independent of
// this file.

import { unstable_cache } from "next/cache";
import type { Listing } from "./types";
import {
  fetchRentCastListings,
  hasRentCastKey,
  rentcastLiveEnabled,
} from "./sources/rentcast";

export type ListingsSourceKind = "rentcast" | "none";

export interface ListingsResult {
  listings: Listing[];
  source: ListingsSourceKind;
  /** Why `listings` is empty when source is "none". */
  note?: string;
}

const getCachedRentCastListings = unstable_cache(
  async () => fetchRentCastListings(),
  ["rentcast-sale-listings"],
  // Matches the route revalidate window; a shorter one here would refetch
  // on every regeneration and multiply quota spend.
  { revalidate: 60 * 60 * 24 * 7, tags: ["rentcast-listings"] },
);

/**
 * The single entry point the UI uses to fetch listings.
 * Live RentCast listings when RENTCAST_LIVE=1 and a key is present; else none.
 */
export async function getListings(): Promise<Listing[]> {
  const { listings } = await getListingsWithMeta();
  return listings;
}

export async function getListingsWithMeta(): Promise<ListingsResult> {
  if (!hasRentCastKey()) {
    return {
      listings: [],
      source: "none",
      note: "No RENTCAST_API_KEY in .env.local, so no live property listings.",
    };
  }
  if (!rentcastLiveEnabled()) {
    return {
      listings: [],
      source: "none",
      note: "RentCast key found but RENTCAST_LIVE is not 1, so live listings are off.",
    };
  }
  try {
    const listings = await getCachedRentCastListings();
    return { listings, source: "rentcast" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[data] RentCast listings failed:", message);
    return { listings: [], source: "none", note: `RentCast request failed: ${message}` };
  }
}

export async function getListing(id: string): Promise<Listing | undefined> {
  const listings = await getListings();
  return listings.find((l) => l.id === id);
}
