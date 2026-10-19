// Broker sync: sitemap → changed listing pages → parsed listings.
//
// Incremental like Heavenya's crawl feeds: a page is refetched only when its
// sitemap lastmod changes, and each run fetches at most `maxFetch` pages, so
// the first sync can be spread over several runs.

import path from "node:path";
import { fetchText } from "../../web/fetch";
import { parseSitemap, type SitemapEntry } from "../../web/sitemap";
import { CACHE_DIR, SOURCES_DIR, readJson, writeJson } from "../../web/store";
import { countryOf, PARSERS } from "./parse";
import type { BrokerId, PracticeListing, PracticeListingsFile } from "./types";

export const LISTINGS_FILE = path.join(SOURCES_DIR, "practice-listings.json");
const PAGE_CACHE_FILE = path.join(CACHE_DIR, "broker-pages.json");

interface CachedPage {
  lastmod: string | null;
  fetchedAt: string;
  listing: PracticeListing | null;
  error?: string;
}

type Queue = { broker: BrokerId; entry: SitemapEntry; kind: "active" | "sold" | "mixed" }[];

export interface SyncOptions {
  /** Most listing pages to fetch this run. */
  maxFetch: number;
  /** Regex on the URL path selecting which APS sold listings to fetch as comps. */
  compsPath: RegExp;
  /** Only fetch sold comps whose sitemap lastmod is on/after this date. */
  compsSince: string;
  log?: (msg: string) => void;
}

export const DEFAULT_SYNC: SyncOptions = {
  maxFetch: 300,
  compsPath: /\/united-states\/west\/california-/,
  compsSince: "2025-01-01",
};

async function sitemap(url: string): Promise<SitemapEntry[]> {
  return parseSitemap((await fetchText(url)).body);
}

const newestFirst = (a: SitemapEntry, b: SitemapEntry) => (b.lastmod ?? "").localeCompare(a.lastmod ?? "");

async function buildQueue(opts: SyncOptions): Promise<Queue> {
  const aps = "https://accountingpracticesales.com";
  const poe = "https://poegroupadvisors.com";

  const apsActive = (await sitemap(`${aps}/listing-sitemap.xml`)).filter((e) =>
    new URL(e.url).pathname.startsWith("/united-states/"),
  );
  const apsSold = [
    ...(await sitemap(`${aps}/listing-sitemap-sold.xml`)),
    ...(await sitemap(`${aps}/listing-sitemap-sold2.xml`).catch(() => [])),
  ].filter((e) => opts.compsPath.test(new URL(e.url).pathname) && (e.lastmod ?? "") >= opts.compsSince);
  // Poe's practice sitemap mixes active and sold, and paths carry no location,
  // so every page is read once; lastmod keeps later runs cheap.
  const poeAll = (await sitemap(`${poe}/practice-sitemap.xml`)).filter((e) => e.url.includes("/practice/"));

  return [
    ...apsActive.sort(newestFirst).map((entry) => ({ broker: "aps" as const, entry, kind: "active" as const })),
    ...poeAll.sort(newestFirst).map((entry) => ({ broker: "poe" as const, entry, kind: "mixed" as const })),
    ...apsSold.sort(newestFirst).map((entry) => ({ broker: "aps" as const, entry, kind: "sold" as const })),
  ];
}

export async function syncBrokers(opts: SyncOptions = DEFAULT_SYNC): Promise<PracticeListingsFile> {
  const log = opts.log ?? (() => {});
  const cache = readJson<Record<string, CachedPage>>(PAGE_CACHE_FILE, {});
  const queue = await buildQueue(opts);
  const stale = queue.filter(({ entry }) => {
    const hit = cache[entry.url];
    return !hit || hit.lastmod !== entry.lastmod;
  });
  log(`${queue.length} listing pages in sitemaps; ${stale.length} new or changed; fetching up to ${opts.maxFetch}.`);

  const counts: PracticeListingsFile["brokers"] = {
    aps: { listed: 0, sold: 0, fetched: 0, errors: 0 },
    poe: { listed: 0, sold: 0, fetched: 0, errors: 0 },
  };

  let n = 0;
  for (const { broker, entry } of stale.slice(0, opts.maxFetch)) {
    n += 1;
    try {
      const page = await fetchText(entry.url);
      const listing = PARSERS[broker](page.body, entry.url, entry.lastmod);
      cache[entry.url] = {
        lastmod: entry.lastmod,
        fetchedAt: new Date().toISOString(),
        listing,
        // Brokers leave taken-down listings in the sitemap ("This listing was not found").
        ...(listing ? {} : { error: "no listing on page" }),
      };
      counts[broker].fetched += 1;
    } catch (err) {
      counts[broker].errors += 1;
      // Keep the old listing if we had one; a transient error shouldn't delist it.
      cache[entry.url] = {
        ...(cache[entry.url] ?? { listing: null }),
        lastmod: cache[entry.url]?.lastmod ?? null,
        fetchedAt: new Date().toISOString(),
        error: (err as Error).message,
      };
    }
    if (n % 20 === 0) {
      writeJson(PAGE_CACHE_FILE, cache);
      log(`  ${n}/${Math.min(stale.length, opts.maxFetch)} fetched`);
    }
  }
  writeJson(PAGE_CACHE_FILE, cache);

  // Only listings still in a sitemap make it out, so delisted pages drop off.
  const listings: PracticeListing[] = [];
  const seen = new Set<string>();
  for (const { broker, entry } of queue) {
    const cached = cache[entry.url]?.listing;
    if (!cached) continue;
    // Re-derive Poe's country so location-rule fixes reach already-cached pages.
    const listing = broker === "poe" ? { ...cached, country: countryOf(cached.location) } : cached;
    if (listing.country !== "US" || seen.has(listing.id)) continue;
    seen.add(listing.id);
    listings.push(listing);
    if (listing.status === "sold") counts[broker].sold += 1;
    else counts[broker].listed += 1;
  }

  const file: PracticeListingsFile = { syncedAt: new Date().toISOString(), brokers: counts, listings };
  writeJson(LISTINGS_FILE, file);
  const remaining = Math.max(0, stale.length - opts.maxFetch);
  log(
    `Wrote ${listings.length} US listings to ${path.relative(process.cwd(), LISTINGS_FILE)}` +
      (remaining ? ` (${remaining} pages left — run again to continue).` : "."),
  );
  return file;
}
