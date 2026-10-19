// Listing catalog seam.
//
// With RENTCAST_API_KEY set, getListings() pulls live active sale listings from
// RentCast (MLS/aggregator feed). Without a key, the curated MOCK_LISTINGS
// catalog is used so the UI still works offline / in demos.
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

export const MOCK_LISTINGS: Listing[] = [
  // ---- Cleveland, OH (118 $/sqft, +6.2% YoY) -----------------------------
  {
    id: "cle-1842-clark",
    source: "mock",
    address: "1842 Clark Ave",
    metroId: "cleveland-oh",
    zip: "44109",
    propertyType: "single-family",
    condition: "dated",
    beds: 3,
    baths: 2,
    sqft: 1480,
    yearBuilt: 1998,
    lotSqft: 5200,
    listPrice: 152000,
    priceHistory: [
      { date: "2026-04-02", price: 179900 },
      { date: "2026-05-10", price: 169000 },
      { date: "2026-06-05", price: 152000 },
    ],
    daysOnMarket: 77,
    hoaMonthly: 0,
    thirdPartyEstimate: 171000,
    distressFlags: ["price-reduced", "estate-sale"],
    imageColor: "#2f6b4f",
    listedDate: "2026-04-02",
  },
  {
    id: "cle-330-detroit",
    source: "mock",
    address: "330 Detroit Ave",
    metroId: "cleveland-oh",
    zip: "44113",
    propertyType: "multi-family",
    condition: "average",
    beds: 6,
    baths: 4,
    sqft: 2980,
    yearBuilt: 1965,
    lotSqft: 6800,
    listPrice: 289000,
    priceHistory: [{ date: "2026-05-22", price: 289000 }],
    daysOnMarket: 27,
    hoaMonthly: 0,
    thirdPartyEstimate: 305000,
    distressFlags: [],
    imageColor: "#3b6b5b",
    listedDate: "2026-05-22",
  },
  {
    id: "cle-77-shaker",
    source: "mock",
    address: "77 Shaker Blvd",
    metroId: "cleveland-oh",
    zip: "44120",
    propertyType: "single-family",
    condition: "fixer",
    beds: 4,
    baths: 2,
    sqft: 2100,
    yearBuilt: 1942,
    lotSqft: 7000,
    listPrice: 132000,
    priceHistory: [
      { date: "2026-03-01", price: 159000 },
      { date: "2026-05-15", price: 132000 },
    ],
    daysOnMarket: 109,
    hoaMonthly: 0,
    thirdPartyEstimate: 168000,
    distressFlags: ["foreclosure", "price-reduced"],
    imageColor: "#5b5b3b",
    listedDate: "2026-03-01",
  },
  {
    id: "cle-9-edgewater",
    source: "mock",
    address: "9 Edgewater Dr",
    metroId: "cleveland-oh",
    zip: "44102",
    propertyType: "townhouse",
    condition: "turnkey",
    beds: 3,
    baths: 3,
    sqft: 1720,
    yearBuilt: 2019,
    lotSqft: 1800,
    listPrice: 268000,
    priceHistory: [{ date: "2026-06-07", price: 268000 }],
    daysOnMarket: 12,
    hoaMonthly: 120,
    thirdPartyEstimate: 252000,
    distressFlags: [],
    imageColor: "#2f5b6b",
    listedDate: "2026-06-07",
  },

  // ---- Indianapolis, IN (138 $/sqft, +7.1% YoY) --------------------------
  {
    id: "ind-55-laurel",
    source: "mock",
    address: "55 Laurel St",
    metroId: "indianapolis-in",
    zip: "46201",
    propertyType: "single-family",
    condition: "average",
    beds: 4,
    baths: 2,
    sqft: 1820,
    yearBuilt: 2005,
    lotSqft: 6400,
    listPrice: 234000,
    priceHistory: [{ date: "2026-05-28", price: 234000 }],
    daysOnMarket: 21,
    hoaMonthly: 0,
    thirdPartyEstimate: 251000,
    distressFlags: [],
    imageColor: "#3b5b8c",
    listedDate: "2026-05-28",
  },
  {
    id: "ind-1209-fountain",
    source: "mock",
    address: "1209 Fountain Sq",
    metroId: "indianapolis-in",
    zip: "46203",
    propertyType: "single-family",
    condition: "dated",
    beds: 3,
    baths: 1,
    sqft: 1360,
    yearBuilt: 1955,
    lotSqft: 4900,
    listPrice: 168000,
    priceHistory: [
      { date: "2026-04-20", price: 184000 },
      { date: "2026-06-02", price: 168000 },
    ],
    daysOnMarket: 59,
    hoaMonthly: 0,
    thirdPartyEstimate: 179000,
    distressFlags: ["price-reduced"],
    imageColor: "#4f6b3b",
    listedDate: "2026-04-20",
  },
  {
    id: "ind-88-broadripple",
    source: "mock",
    address: "88 Broad Ripple Ave",
    metroId: "indianapolis-in",
    zip: "46220",
    propertyType: "condo",
    condition: "turnkey",
    beds: 2,
    baths: 2,
    sqft: 1140,
    yearBuilt: 2017,
    listPrice: 215000,
    priceHistory: [{ date: "2026-06-10", price: 215000 }],
    daysOnMarket: 9,
    hoaMonthly: 240,
    thirdPartyEstimate: 209000,
    distressFlags: [],
    imageColor: "#6b3b6b",
    listedDate: "2026-06-10",
  },
  {
    id: "ind-415-irvington",
    source: "mock",
    address: "415 Irvington Pl",
    metroId: "indianapolis-in",
    zip: "46219",
    propertyType: "multi-family",
    condition: "average",
    beds: 4,
    baths: 4,
    sqft: 2480,
    yearBuilt: 1978,
    lotSqft: 5800,
    listPrice: 268000,
    priceHistory: [
      { date: "2026-04-08", price: 289000 },
      { date: "2026-05-25", price: 268000 },
    ],
    daysOnMarket: 71,
    hoaMonthly: 0,
    thirdPartyEstimate: 296000,
    distressFlags: ["price-reduced"],
    imageColor: "#3b8c6b",
    listedDate: "2026-04-08",
  },

  // ---- Memphis, TN (109 $/sqft, +4.1% YoY, thin comps) -------------------
  {
    id: "mem-204-cooper",
    source: "mock",
    address: "204 Cooper St",
    metroId: "memphis-tn",
    zip: "38104",
    propertyType: "multi-family",
    condition: "dated",
    beds: 4,
    baths: 4,
    sqft: 2600,
    yearBuilt: 1965,
    lotSqft: 6000,
    listPrice: 198000,
    priceHistory: [
      { date: "2026-03-22", price: 225000 },
      { date: "2026-05-18", price: 198000 },
    ],
    daysOnMarket: 88,
    hoaMonthly: 0,
    thirdPartyEstimate: 232000,
    distressFlags: ["price-reduced", "short-sale"],
    imageColor: "#6b3b8c",
    listedDate: "2026-03-22",
  },
  {
    id: "mem-3310-vernon",
    source: "mock",
    address: "3310 Vernon Ave",
    metroId: "memphis-tn",
    zip: "38108",
    propertyType: "single-family",
    condition: "fixer",
    beds: 3,
    baths: 1,
    sqft: 1240,
    yearBuilt: 1948,
    lotSqft: 4200,
    listPrice: 74000,
    priceHistory: [
      { date: "2026-02-10", price: 99000 },
      { date: "2026-04-12", price: 84000 },
      { date: "2026-05-25", price: 74000 },
    ],
    daysOnMarket: 128,
    hoaMonthly: 0,
    thirdPartyEstimate: 108000,
    distressFlags: ["foreclosure", "price-reduced"],
    imageColor: "#5b5b5b",
    listedDate: "2026-02-10",
  },
  {
    id: "mem-12-harbor",
    source: "mock",
    address: "12 Harbor Town Sq",
    metroId: "memphis-tn",
    zip: "38103",
    propertyType: "condo",
    condition: "turnkey",
    beds: 2,
    baths: 2,
    sqft: 1280,
    yearBuilt: 2014,
    listPrice: 219000,
    priceHistory: [{ date: "2026-05-30", price: 219000 }],
    daysOnMarket: 24,
    hoaMonthly: 310,
    thirdPartyEstimate: 214000,
    distressFlags: [],
    imageColor: "#3b5b6b",
    listedDate: "2026-05-30",
  },

  // ---- Tampa, FL (286 $/sqft, +1.8% YoY, high insurance) -----------------
  {
    id: "tpa-44-bayshore",
    source: "mock",
    address: "44 Bayshore Loop",
    metroId: "tampa-fl",
    zip: "33611",
    propertyType: "condo",
    condition: "average",
    beds: 2,
    baths: 2,
    sqft: 1150,
    yearBuilt: 2008,
    listPrice: 389000,
    priceHistory: [
      { date: "2026-04-18", price: 399000 },
      { date: "2026-05-30", price: 389000 },
    ],
    daysOnMarket: 61,
    hoaMonthly: 540,
    thirdPartyEstimate: 372000,
    distressFlags: ["price-reduced"],
    imageColor: "#2f8c8c",
    listedDate: "2026-04-18",
  },
  {
    id: "tpa-820-seminole",
    source: "mock",
    address: "820 Seminole Heights",
    metroId: "tampa-fl",
    zip: "33603",
    propertyType: "single-family",
    condition: "dated",
    beds: 3,
    baths: 2,
    sqft: 1560,
    yearBuilt: 1959,
    lotSqft: 5400,
    listPrice: 372000,
    priceHistory: [
      { date: "2026-03-30", price: 419000 },
      { date: "2026-05-20", price: 372000 },
    ],
    daysOnMarket: 96,
    hoaMonthly: 0,
    thirdPartyEstimate: 405000,
    distressFlags: ["price-reduced", "estate-sale"],
    imageColor: "#8c6b2f",
    listedDate: "2026-03-30",
  },
  {
    id: "tpa-19-harbour",
    source: "mock",
    address: "19 Harbour Island Blvd",
    metroId: "tampa-fl",
    zip: "33602",
    propertyType: "townhouse",
    condition: "turnkey",
    beds: 3,
    baths: 3,
    sqft: 1820,
    yearBuilt: 2021,
    lotSqft: 1600,
    listPrice: 565000,
    priceHistory: [{ date: "2026-06-05", price: 565000 }],
    daysOnMarket: 18,
    hoaMonthly: 380,
    thirdPartyEstimate: 548000,
    distressFlags: [],
    imageColor: "#2f6b8c",
    listedDate: "2026-06-05",
  },

  // ---- Austin, TX (312 $/sqft, -1.4% YoY, softening) ---------------------
  {
    id: "aus-barton-springs",
    source: "mock",
    address: "19 Barton Springs Rd",
    metroId: "austin-tx",
    zip: "78704",
    propertyType: "condo",
    condition: "turnkey",
    beds: 2,
    baths: 2,
    sqft: 1080,
    yearBuilt: 2016,
    listPrice: 545000,
    priceHistory: [{ date: "2026-05-12", price: 545000 }],
    daysOnMarket: 37,
    hoaMonthly: 420,
    thirdPartyEstimate: 512000,
    distressFlags: [],
    imageColor: "#8c3b5b",
    listedDate: "2026-05-12",
  },
  {
    id: "aus-east-cesar",
    source: "mock",
    address: "412 E Cesar Chavez",
    metroId: "austin-tx",
    zip: "78702",
    propertyType: "single-family",
    condition: "average",
    beds: 3,
    baths: 2,
    sqft: 1640,
    yearBuilt: 2009,
    lotSqft: 5000,
    listPrice: 489000,
    priceHistory: [
      { date: "2026-03-10", price: 539000 },
      { date: "2026-04-28", price: 515000 },
      { date: "2026-06-01", price: 489000 },
    ],
    daysOnMarket: 100,
    hoaMonthly: 0,
    thirdPartyEstimate: 508000,
    distressFlags: ["price-reduced"],
    imageColor: "#6b5b8c",
    listedDate: "2026-03-10",
  },
  {
    id: "aus-mueller-row",
    source: "mock",
    address: "77 Mueller Row",
    metroId: "austin-tx",
    zip: "78723",
    propertyType: "townhouse",
    condition: "turnkey",
    beds: 3,
    baths: 3,
    sqft: 1900,
    yearBuilt: 2022,
    lotSqft: 1500,
    listPrice: 612000,
    priceHistory: [{ date: "2026-06-09", price: 612000 }],
    daysOnMarket: 22,
    hoaMonthly: 210,
    thirdPartyEstimate: 624000,
    distressFlags: [],
    imageColor: "#3b4f8c",
    listedDate: "2026-06-09",
  },
];

export type ListingsSourceKind = "rentcast" | "mock";

export interface ListingsResult {
  listings: Listing[];
  source: ListingsSourceKind;
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
 * Prefers RentCast when RENTCAST_LIVE=1 and a key is present; else mock data.
 */
export async function getListings(): Promise<Listing[]> {
  const { listings } = await getListingsWithMeta();
  return listings;
}

export async function getListingsWithMeta(): Promise<ListingsResult> {
  if (!rentcastLiveEnabled()) {
    if (hasRentCastKey()) {
      console.info(
        "[data] RentCast key present but RENTCAST_LIVE is not 1 — serving mock listings.",
      );
    }
    return { listings: MOCK_LISTINGS, source: "mock" };
  }
  try {
    const listings = await getCachedRentCastListings();
    return { listings, source: "rentcast" };
  } catch (err) {
    console.warn(
      "[data] RentCast listings failed, falling back to mock:",
      err instanceof Error ? err.message : err,
    );
    return { listings: MOCK_LISTINGS, source: "mock" };
  }
}

export async function getListing(id: string): Promise<Listing | undefined> {
  const listings = await getListings();
  return listings.find((l) => l.id === id);
}
