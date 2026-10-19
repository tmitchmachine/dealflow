// Google Places API (New) Text Search: one call returns the website, phone,
// open/closed status and review count for a firm. Spend is capped per month,
// like Heavenya's placesBudget.js. The legacy Places API is closed to new
// Google Cloud projects, so this uses the v1 endpoint.

import { MonthlyBudget } from "../web/store";
import { nameTokens, tokenOverlap } from "./names";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.businessStatus",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
].join(",");

export interface PlaceMatch {
  placeId: string;
  name: string;
  address: string;
  /** OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY */
  businessStatus: string;
  website: string;
  phone: string;
  rating: number | null;
  reviews: number;
  mapsUrl: string;
}

export function placesKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim() || undefined;
}

export function placesBudget(): MonthlyBudget {
  return new MonthlyBudget("places", Number(process.env.PLACES_MONTHLY_CAP ?? 500));
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
}

/**
 * Best place for `name` at `address`, or null when Google's top hit is a
 * different business (name tokens must overlap, or the street number match).
 */
export async function findPlace(
  name: string,
  address: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceMatch | null> {
  const res = await fetchImpl(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: `${name}, ${address}`, maxResultCount: 3 }),
  });
  if (!res.ok) {
    throw new Error(`Places searchText HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const places = ((await res.json()) as { places?: RawPlace[] }).places ?? [];
  const wanted = nameTokens(name);
  const streetNo = address.match(/^\s*(\d+)/)?.[1];
  for (const p of places) {
    const overlap = tokenOverlap(wanted, nameTokens(p.displayName?.text ?? ""));
    const sameStreetNo = Boolean(streetNo && p.formattedAddress?.startsWith(`${streetNo} `));
    if (overlap >= 0.5 || (sameStreetNo && overlap > 0)) {
      return {
        placeId: p.id ?? "",
        name: p.displayName?.text ?? "",
        address: p.formattedAddress ?? "",
        businessStatus: p.businessStatus ?? "",
        website: p.websiteUri ?? "",
        phone: p.nationalPhoneNumber ?? "",
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? 0,
        mapsUrl: p.googleMapsUri ?? "",
      };
    }
  }
  return null;
}
