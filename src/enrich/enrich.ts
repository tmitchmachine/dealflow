import type { Card, ListQuery } from "@/core/niche";
import { getNiche } from "@/niches/index";
import { contentHash, writeJson } from "../web/store";
import { enrichmentFile, readEnrichment, type EnrichmentFile, type EnrichNiche, type FirmEnrichment } from "./store";
import { guessDomains } from "./names";
import { findPlace, placesBudget, placesKey, type PlaceMatch } from "./places";

export type { EnrichNiche, FirmEnrichment } from "./store";
import { guessWebsite, probeSite, type SiteFacts } from "./site";

export interface EnrichOptions {
  niche: EnrichNiche;
  counties: string[];
  limit: number;
  /** Re-check firms older than this many days. */
  maxAgeDays: number;
  usePlaces: boolean;
  concurrency: number;
  dataDir: string;
  log?: (msg: string) => void;
}

const cityOf = (card: Card) => card.subtitle.split(",")[0]?.trim() ?? "";
const addressOf = (card: Card) => card.facts.find((f) => f.label === "Address")?.value ?? "";

async function enrichFirm(
  card: Card,
  opts: EnrichOptions,
  places: { key?: string; budget: ReturnType<typeof placesBudget> },
): Promise<FirmEnrichment> {
  const firm = { name: card.name, city: cityOf(card), licenseNumber: card.licenseNumber };
  let place: PlaceMatch | null = null;
  let website: string | null = null;
  let method: FirmEnrichment["method"] = "none";
  let error: string | undefined;

  try {
    if (opts.usePlaces && places.key && places.budget.canSpend()) {
      places.budget.spend();
      place = await findPlace(card.name, addressOf(card), places.key);
      if (place?.website) {
        website = place.website;
        method = "places";
      }
    }
    if (!website) {
      website = await guessWebsite(guessDomains(card.name, opts.niche), firm);
      if (website) method = "guess";
    }
  } catch (err) {
    error = (err as Error).message;
  }

  let site: SiteFacts | null = null;
  if (website) {
    try {
      site = await probeSite(website, opts.niche);
    } catch (err) {
      error = (err as Error).message;
    }
  }

  return {
    licenseNumber: card.licenseNumber,
    name: card.name,
    checkedAt: new Date().toISOString(),
    method,
    place,
    website,
    site,
    ...(error ? { error } : {}),
    hash: contentHash({ place, website, site: site && { ...site, pagesRead: undefined } }),
  };
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export async function enrichFirms(opts: EnrichOptions): Promise<EnrichmentFile> {
  const log = opts.log ?? (() => {});
  const niche = getNiche(opts.niche);
  const query: ListQuery = {
    counties: opts.counties,
    limit: opts.limit,
    minYears: 0,
    includeInactive: false,
    asOf: new Date(),
  };
  const { cards } = niche.list(niche.load(opts.dataDir), query);
  const file = readEnrichment(opts.niche);
  const cutoff = Date.now() - opts.maxAgeDays * 86_400_000;
  const due = cards.filter((c) => {
    const prev = file.firms[c.licenseNumber];
    return !prev || new Date(prev.checkedAt).getTime() < cutoff;
  });

  const key = placesKey();
  const budget = placesBudget();
  log(
    `${cards.length} firms in scope, ${due.length} due. Places: ${
      !opts.usePlaces ? "off (--no-places)" : key ? `on (${budget.used}/${budget.cap} this month)` : "no GOOGLE_MAPS_API_KEY — guessing domains only"
    }.`,
  );

  let done = 0;
  await pool(due, opts.concurrency, async (card) => {
    file.firms[card.licenseNumber] = await enrichFirm(card, opts, { key, budget });
    done += 1;
    if (done % 10 === 0) {
      file.updatedAt = new Date().toISOString();
      writeJson(enrichmentFile(opts.niche), file);
      log(`  ${done}/${due.length}`);
    }
  });
  file.updatedAt = new Date().toISOString();
  writeJson(enrichmentFile(opts.niche), file);

  const checked = cards.map((c) => file.firms[c.licenseNumber]).filter(Boolean);
  const pct = (n: number) => `${n} (${checked.length ? Math.round((n / checked.length) * 100) : 0}%)`;
  const staleBefore = new Date().getFullYear() - 3;
  log(`\nYield for ${checked.length} firms:`);
  log(`  Places match      ${pct(checked.filter((f) => f.place).length)}`);
  log(`  Closed on Google  ${pct(checked.filter((f) => f.place?.businessStatus === "CLOSED_PERMANENTLY").length)}`);
  log(`  Website found     ${pct(checked.filter((f) => f.website).length)}  (places ${checked.filter((f) => f.method === "places").length}, guessed ${checked.filter((f) => f.method === "guess").length})`);
  log(`  Site read         ${pct(checked.filter((f) => f.site).length)}`);
  log(`  Contact email     ${pct(checked.filter((f) => f.site?.emails.length).length)}`);
  log(`  Succession signal ${pct(checked.filter((f) => f.site?.successionSignals.length).length)}`);
  log(`  Stale site (©<${staleBefore}) ${pct(checked.filter((f) => f.site?.copyrightYear && f.site.copyrightYear < staleBefore).length)}`);
  log(`  Parked domain     ${pct(checked.filter((f) => f.site?.parked).length)}`);
  return file;
}
