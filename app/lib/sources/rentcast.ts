// RentCast API adapter — licensed aggregator for active sale listings + optional
// ZIP market rent stats. Requires RENTCAST_API_KEY (server-side only).
// Docs: https://developers.rentcast.io/reference/introduction

import type {
  Condition,
  DistressFlag,
  Listing,
  PriceChange,
  PropertyType,
} from "../types";
import { METRO_CONFIGS, type MetroConfig } from "../metros";

const RENTCAST_BASE = "https://api.rentcast.io/v1";

/** How many active sale listings to pull per metro (keeps free-tier usage low). */
const LISTINGS_PER_METRO = 6;

interface RentCastSaleListing {
  id: string;
  formattedAddress?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  zipCode?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  hoa?: { fee?: number } | null;
  status?: string;
  price?: number;
  listingType?: string;
  listedDate?: string;
  daysOnMarket?: number;
  mlsName?: string;
  mlsNumber?: string;
  history?: Record<
    string,
    {
      event?: string;
      price?: number;
      listingType?: string;
      listedDate?: string;
      daysOnMarket?: number;
    }
  >;
}

interface RentCastMarketResponse {
  zipCode?: string;
  saleData?: {
    medianPricePerSquareFoot?: number;
    averagePricePerSquareFoot?: number;
    medianDaysOnMarket?: number;
    totalListings?: number;
    history?: Record<string, { medianPricePerSquareFoot?: number }>;
  };
  rentalData?: {
    medianRentPerSquareFoot?: number;
    averageRentPerSquareFoot?: number;
  };
}

function apiKey(): string | undefined {
  const key = process.env.RENTCAST_API_KEY?.trim();
  return key || undefined;
}

export function hasRentCastKey(): boolean {
  return Boolean(apiKey());
}

/**
 * Live listings are opt-in per environment, not merely key-present.
 *
 * The free tier is ~50 requests/month and one scan spends five of them (one
 * per metro), so a key sitting in `.env` is not consent for every dev server
 * boot, test run, and `next build` to spend quota. Set RENTCAST_LIVE=1 when
 * you actually want live listings; otherwise the mock catalog is served.
 */
export function rentcastLiveEnabled(): boolean {
  return hasRentCastKey() && process.env.RENTCAST_LIVE === "1";
}

async function rentcastGet<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("RENTCAST_API_KEY is not set");

  const url = new URL(`${RENTCAST_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Api-Key": key },
    next: { revalidate: 60 * 60 * 6 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `RentCast ${path} failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}

function mapPropertyType(raw: string | undefined): PropertyType | null {
  switch (raw) {
    case "Single Family":
      return "single-family";
    case "Condo":
      return "condo";
    case "Townhouse":
      return "townhouse";
    case "Multi-Family":
      return "multi-family";
    default:
      return null;
  }
}

function inferCondition(
  listingType: string | undefined,
  yearBuilt: number,
): Condition {
  const year = new Date().getFullYear();
  if (listingType === "New Construction" || yearBuilt >= year - 3) {
    return "turnkey";
  }
  if (listingType === "Foreclosure" || listingType === "Short Sale") {
    return "fixer";
  }
  const age = year - yearBuilt;
  if (age >= 55) return "dated";
  if (age >= 30) return "average";
  if (age <= 10) return "turnkey";
  return "average";
}

function distressFromListing(
  listingType: string | undefined,
  priceHistory: PriceChange[],
): DistressFlag[] {
  const flags: DistressFlag[] = [];
  if (listingType === "Foreclosure") flags.push("foreclosure");
  if (listingType === "Short Sale") flags.push("short-sale");
  if (priceHistory.length >= 2) {
    const first = priceHistory[0].price;
    const last = priceHistory[priceHistory.length - 1].price;
    if (last < first * 0.98) flags.push("price-reduced");
  }
  return flags;
}

function priceHistoryFrom(
  listing: RentCastSaleListing,
): PriceChange[] {
  const entries: PriceChange[] = [];
  if (listing.history) {
    for (const [date, h] of Object.entries(listing.history)) {
      if (typeof h?.price === "number" && h.price > 0) {
        entries.push({ date: date.slice(0, 10), price: h.price });
      }
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  if (entries.length === 0 && typeof listing.price === "number") {
    const listed = (listing.listedDate ?? new Date().toISOString()).slice(0, 10);
    entries.push({ date: listed, price: listing.price });
  }
  return entries;
}

/** Stable, URL-safe id derived from RentCast's property id. */
function listingId(rawId: string, metroId: string): string {
  const slug = rawId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${metroId}-${slug}`;
}

function streetAddress(listing: RentCastSaleListing): string {
  const line1 = listing.addressLine1?.trim();
  if (line1) {
    const line2 = listing.addressLine2?.trim();
    return line2 ? `${line1} ${line2}` : line1;
  }
  // Fall back to the formatted address' street portion.
  const formatted = listing.formattedAddress ?? listing.id;
  return formatted.split(",")[0]?.trim() || formatted;
}

function toListing(
  raw: RentCastSaleListing,
  metro: MetroConfig,
): Listing | null {
  const propertyType = mapPropertyType(raw.propertyType);
  if (!propertyType) return null;
  if (typeof raw.price !== "number" || raw.price <= 0) return null;
  if (typeof raw.squareFootage !== "number" || raw.squareFootage < 200) return null;
  if (typeof raw.bedrooms !== "number") return null;
  if (typeof raw.bathrooms !== "number") return null;

  const yearBuilt =
    typeof raw.yearBuilt === "number" && raw.yearBuilt > 1800
      ? raw.yearBuilt
      : 1975;
  const history = priceHistoryFrom(raw);
  const listedDate = (raw.listedDate ?? history[0]?.date ?? new Date().toISOString()).slice(
    0,
    10,
  );

  return {
    id: listingId(raw.id, metro.id),
    // RentCast does not return a canonical listing URL; leave `url` unset so
    // listingLink() builds an honest address search rather than a fake deep link.
    source: raw.mlsName ? "mls" : "rentcast",
    address: streetAddress(raw),
    metroId: metro.id,
    zip: raw.zipCode ?? metro.rentZip,
    propertyType,
    condition: inferCondition(raw.listingType, yearBuilt),
    beds: raw.bedrooms,
    baths: raw.bathrooms,
    sqft: Math.round(raw.squareFootage),
    yearBuilt,
    lotSqft: typeof raw.lotSize === "number" ? Math.round(raw.lotSize) : undefined,
    listPrice: Math.round(raw.price),
    priceHistory: history,
    daysOnMarket: Math.max(0, Math.round(raw.daysOnMarket ?? 0)),
    hoaMonthly: Math.max(0, Math.round(raw.hoa?.fee ?? 0)),
    distressFlags: distressFromListing(raw.listingType, history),
    imageColor: metro.imageColor,
    listedDate,
  };
}

async function fetchMetroListings(metro: MetroConfig): Promise<Listing[]> {
  const payload = await rentcastGet<RentCastSaleListing[] | { listings?: RentCastSaleListing[] }>(
    "/listings/sale",
    {
      city: metro.rentcastCity,
      state: metro.state,
      status: "Active",
      limit: LISTINGS_PER_METRO,
      offset: 0,
    },
  );

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.listings)
      ? payload.listings
      : [];

  const out: Listing[] = [];
  for (const row of rows) {
    const mapped = toListing(row, metro);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * Active sale listings across all scan metros from RentCast (MLS aggregator).
 */
export async function fetchRentCastListings(): Promise<Listing[]> {
  if (!hasRentCastKey()) {
    throw new Error("RENTCAST_API_KEY is not set");
  }
  if (!rentcastLiveEnabled()) {
    throw new Error("RENTCAST_LIVE is not set to 1 — refusing to spend quota");
  }

  const batches = await Promise.all(
    METRO_CONFIGS.map(async (metro) => {
      try {
        return await fetchMetroListings(metro);
      } catch (err) {
        console.warn(
          `[rentcast] listings failed for ${metro.id}:`,
          err instanceof Error ? err.message : err,
        );
        return [] as Listing[];
      }
    }),
  );

  const listings = batches.flat();
  if (listings.length === 0) {
    throw new Error("RentCast returned no usable listings for any metro");
  }
  return listings;
}

export async function fetchRentCastListingById(
  id: string,
): Promise<Listing | undefined> {
  const all = await fetchRentCastListings();
  return all.find((l) => l.id === id);
}

/**
 * Optional ZIP rent $/sqft enrichment. Off by default to conserve free-tier
 * quota — set RENTCAST_ENRICH_RENT=1 to enable (one /markets call per metro).
 */
export async function fetchRentCastRentPpsf(
  metro: MetroConfig,
): Promise<number | null> {
  if (!rentcastLiveEnabled()) return null;
  if (process.env.RENTCAST_ENRICH_RENT !== "1") return null;

  try {
    const data = await rentcastGet<RentCastMarketResponse>("/markets", {
      zipCode: metro.rentZip,
      dataType: "Rental",
      historyRange: 1,
    });
    const rent =
      data.rentalData?.medianRentPerSquareFoot ??
      data.rentalData?.averageRentPerSquareFoot ??
      null;
    return typeof rent === "number" && rent > 0 ? rent : null;
  } catch (err) {
    console.warn(
      `[rentcast] market rent failed for ${metro.rentZip}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
