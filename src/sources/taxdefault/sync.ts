import path from "node:path";
import { fetchText } from "../../web/fetch";
import { SOURCES_DIR, writeJson } from "../../web/store";
import { aggregateParcels, type TaxDefaultParcel } from "./aggregate";
import { COUNTY_FEEDS, type CountyFeed, type TaxRow } from "./counties";

export const TAX_DEFAULT_FILE = path.join(SOURCES_DIR, "tax-default.json");

/** Socrata caps one page at 50k rows. */
const PAGE = 50_000;

export interface TaxDefaultFile {
  syncedAt: string;
  counties: Record<string, { label: string; rows: number; parcels: number; pageUrl: string; error?: string }>;
  parcels: TaxDefaultParcel[];
}

export async function fetchCountyRows(feed: CountyFeed, fetchImpl?: typeof fetch): Promise<TaxRow[]> {
  const rows: TaxRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({ $limit: String(PAGE), $offset: String(offset), $order: ":id" });
    const page = await fetchText(`https://${feed.domain}/resource/${feed.dataset}.json?${params}`, {
      // SODA is an API meant for programs; portal robots.txt files only govern the HTML site.
      skipRobots: true,
      minGapMs: 1_000,
      timeoutMs: 120_000,
      fetchImpl,
    });
    const batch = JSON.parse(page.body) as Record<string, string>[];
    for (const r of batch) {
      const mapped = feed.mapRow(r);
      if (mapped) rows.push(mapped);
    }
    if (batch.length < PAGE) return rows;
  }
}

export async function syncTaxDefault(
  feeds: CountyFeed[] = COUNTY_FEEDS,
  log: (msg: string) => void = () => {},
): Promise<TaxDefaultFile> {
  const file: TaxDefaultFile = { syncedAt: new Date().toISOString(), counties: {}, parcels: [] };
  for (const feed of feeds) {
    try {
      const rows = await fetchCountyRows(feed);
      const parcels = aggregateParcels(feed, rows);
      file.parcels.push(...parcels);
      file.counties[feed.id] = { label: feed.label, rows: rows.length, parcels: parcels.length, pageUrl: feed.pageUrl };
      log(`${feed.label}: ${rows.length.toLocaleString()} rows → ${parcels.length.toLocaleString()} parcels`);
    } catch (err) {
      file.counties[feed.id] = { label: feed.label, rows: 0, parcels: 0, pageUrl: feed.pageUrl, error: (err as Error).message };
      log(`${feed.label}: failed — ${(err as Error).message}`);
    }
  }
  writeJson(TAX_DEFAULT_FILE, file);
  log(`Wrote ${file.parcels.length.toLocaleString()} parcels to ${path.relative(process.cwd(), TAX_DEFAULT_FILE)}`);
  return file;
}
