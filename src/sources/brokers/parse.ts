// Parsers for broker listing pages. Both brokers render listings server-side
// with labeled fields, so no headless browser is needed.

import { decodeEntities, htmlToText, parseMoney } from "../../web/html";
import type { BrokerId, ListingStatus, PracticeListing } from "./types";

const US_STATES = new Set(
  "alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada new-hampshire new-jersey new-mexico new-york north-carolina north-dakota ohio oklahoma oregon pennsylvania rhode-island south-carolina south-dakota tennessee texas utah vermont virginia washington west-virginia wisconsin wyoming district-of-columbia"
    .split(" ")
    .map((s) => s.replace(/-/g, " ")),
);
const CA_PROVINCES = new Set([
  "alberta",
  "british columbia",
  "manitoba",
  "new brunswick",
  "newfoundland and labrador",
  "nova scotia",
  "ontario",
  "prince edward island",
  "quebec",
  "saskatchewan",
  "yukon",
  "northwest territories",
  "nunavut",
]);

export function countryOf(location: string): PracticeListing["country"] {
  const l = location.toLowerCase().trim();
  if (US_STATES.has(l) || /\b(usa|united states|washington,? d\.?c\.?)\b/.test(l)) return "US";
  if (CA_PROVINCES.has(l) || /\bcanada\b/.test(l)) return "CA";
  return "other";
}

export function normalizeStatus(text: string): ListingStatus {
  if (/\bsold\b/i.test(text)) return "sold";
  if (/contract|pending|accepted|loi\b/i.test(text)) return "under-contract";
  return "available";
}

const clean = (s: string | undefined) => (s ? decodeEntities(s).replace(/\s+/g, " ").trim() : "");

function multipleOf(revenue: number | null, ask: number | null): number | null {
  return revenue && ask && revenue > 0 ? Math.round((ask / revenue) * 100) / 100 : null;
}

function establishedFrom(text: string): number | null {
  const m = text.match(/(?:established|founded|started|in business since)\D{0,20}((?:19|20)\d{2})/i);
  const year = m ? Number(m[1]) : NaN;
  return year >= 1900 && year <= new Date().getFullYear() ? year : null;
}

function base(broker: BrokerId, url: string, lastmod: string | null) {
  return { broker, url, lastmod };
}

/** accountingpracticesales.com listing page. */
export function parseApsListing(html: string, url: string, lastmod: string | null = null): PracticeListing | null {
  const stats = new Map<string, string>();
  for (const m of html.matchAll(
    /listingstattitle">([\s\S]*?)<\/div>\s*<div class="listingstatinfo">([\s\S]*?)<\/div>/gi,
  )) {
    stats.set(clean(m[1]).toLowerCase(), clean(m[2].replace(/<[^>]+>/g, " ")));
  }
  const listingId = stats.get("listing #");
  if (!listingId) return null;

  const title = clean(html.match(/apslistingitem_lname">([\s\S]*?)<\/div>/i)?.[1]);
  const statusText = clean(html.match(/apslistingitem_lstatus">([\s\S]*?)<\/div>/i)?.[1]);
  const text = htmlToText(html);
  const description = text.split(/\nDescription:\n/i)[1] ?? "";
  const revenue = parseMoney(stats.get("annual revenue"));
  const askingPrice = parseMoney(stats.get("asking price"));
  const location = stats.get("location") ?? "";
  // APS paths start with the country: /united-states/west/california-south/…
  const pathCountry = new URL(url).pathname.split("/")[1]?.toLowerCase();

  return {
    ...base("aps", url, lastmod),
    id: `aps:${listingId}`,
    listingId,
    title,
    status: normalizeStatus(statusText),
    location,
    country: pathCountry === "united-states" ? "US" : pathCountry === "canada" ? "CA" : countryOf(location),
    revenue,
    askingPrice,
    multiple: multipleOf(revenue, askingPrice),
    practiceType: stats.get("type") ?? "",
    reasonForSelling: /retir/i.test(description) ? "Retirement" : "",
    establishedYear: establishedFrom(description),
    summary: description.replace(/\n/g, " ").slice(0, 400),
  };
}

/** poegroupadvisors.com practice page. */
export function parsePoeListing(html: string, url: string, lastmod: string | null = null): PracticeListing | null {
  const field = (cls: string) =>
    clean(html.match(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</p>`, "i"))?.[1]?.replace(/<[^>]+>/g, " "));
  const rows = new Map<string, string>();
  for (const m of html.matchAll(/<p class="label">([\s\S]*?)<\/p>\s*<p class="value">([\s\S]*?)<\/p>/gi)) {
    const key = clean(m[1]).replace(/:$/, "").toLowerCase();
    if (!rows.has(key)) rows.set(key, clean(m[2].replace(/<[^>]+>/g, " ")));
  }
  const listingId = field("specs-listing-id-value");
  if (!listingId) return null;

  const title = clean(html.match(/<div class="specs">\s*<h1>([\s\S]*?)<\/h1>/i)?.[1]);
  const revenue = parseMoney(field("specs-annual-gross-value"));
  const askingPrice = parseMoney(field("specs-asking-price-value"));
  const location = rows.get("location") ?? "";
  const about = htmlToText(html.split(/About This Practice<\/h2>/i)[1] ?? "").split(/\nRequest Full Profile|\nRegister/)[0];

  return {
    ...base("poe", url, lastmod),
    id: `poe:${listingId}`,
    listingId,
    title,
    status: normalizeStatus(rows.get("status") ?? ""),
    location,
    country: countryOf(location),
    revenue,
    askingPrice,
    multiple: multipleOf(revenue, askingPrice),
    practiceType: rows.get("designation") ?? "",
    reasonForSelling: rows.get("reason for selling") ?? "",
    establishedYear: establishedFrom(about),
    summary: about.replace(/\n/g, " ").slice(0, 400),
  };
}

export const PARSERS: Record<BrokerId, typeof parseApsListing> = {
  aps: parseApsListing,
  poe: parsePoeListing,
};
