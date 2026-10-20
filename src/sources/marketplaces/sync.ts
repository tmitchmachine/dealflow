// Marketplace sync: discovery + detail scrapes + Phase 2 liveness.

import path from "node:path";
import { firecrawlScrape, type FirecrawlResult } from "../../web/firecrawl";
import { DailyBudget, SOURCES_DIR, CACHE_DIR, readJson, writeJson } from "../../web/store";
import { HOSTS, HOST_IDS, defaultHostState, goneAfterDaysFor } from "./hosts";
import {
  applyGoneRules,
  isFailedSweep,
  mergeStatusFromCard,
  shouldRecheckDetail,
} from "./liveness";
import {
  annualizeEarnings,
  countFactorsKnown,
  parseDetail,
  parseIndex,
  truePriceOf,
} from "./parse";
import type {
  IndexCard,
  MarketplaceHostId,
  MarketplaceInventoryFile,
  MarketplaceListing,
} from "./types";

export const INVENTORY_FILE = path.join(SOURCES_DIR, "biz-for-sale.json");

export const DETAIL_SCRAPES_PER_DAY = 10;
/** ~3 of 10 detail slots reserved for stale rechecks on partial hosts. */
export const RECHECK_DETAIL_SLOTS = 3;

export interface SyncDeps {
  scrape?: typeof firecrawlScrape;
  detailBudget?: DailyBudget;
  discoveryBudget?: (host: MarketplaceHostId) => DailyBudget;
  now?: Date;
  log?: (msg: string) => void;
  inventoryPath?: string;
  cacheDir?: string;
  /** Cap detail scrapes this run (still respects daily budget). */
  maxDetailThisRun?: number;
}

function emptyFile(now: Date): MarketplaceInventoryFile {
  return {
    syncedAt: now.toISOString(),
    hosts: {
      empireflippers: defaultHostState("empireflippers"),
      flippa: defaultHostState("flippa"),
    },
    listings: [],
  };
}

function cardToPartial(card: IndexCard, host: MarketplaceHostId, nowIso: string, prev?: MarketplaceListing): MarketplaceListing {
  const monthly = card.monthlyEarnings;
  const annual = annualizeEarnings(monthly, card.annualEarnings);
  const truePrice = truePriceOf(card.askingPrice, card.inventoryAddOn);
  const status = mergeStatusFromCard(prev?.status, card.status, true);
  const listing: MarketplaceListing = {
    id: `${host}:${card.listingId}`,
    host,
    listingId: card.listingId,
    url: card.url,
    title: card.title || prev?.title || `Listing ${card.listingId}`,
    status,
    askingPrice: card.askingPrice ?? prev?.askingPrice ?? null,
    inventoryAddOn: card.inventoryAddOn ?? prev?.inventoryAddOn ?? null,
    truePrice: truePrice ?? (prev ? truePriceOf(prev.askingPrice, prev.inventoryAddOn) : null),
    monthlyEarnings: monthly ?? prev?.monthlyEarnings ?? null,
    annualEarnings: annual ?? prev?.annualEarnings ?? null,
    earningsMonths: prev?.earningsMonths ?? null,
    revenue: card.revenue ?? prev?.revenue ?? null,
    margin: prev?.margin ?? null,
    trendSource: prev?.trendSource ?? "none",
    trendDirection: prev?.trendDirection ?? "unknown",
    siteAgeMonths: card.siteAgeMonths ?? prev?.siteAgeMonths ?? null,
    profitMonths: prev?.profitMonths ?? null,
    ownerHoursPerWeek: card.ownerHoursPerWeek ?? prev?.ownerHoursPerWeek ?? null,
    monetizationTypes: card.monetizationTypes.length ? card.monetizationTypes : prev?.monetizationTypes ?? [],
    largestSourceShare: prev?.largestSourceShare ?? null,
    modelClass: card.modelClass ?? prev?.modelClass ?? null,
    verifiedFinancials: card.verifiedFinancials || Boolean(prev?.verifiedFinancials),
    detailScraped: prev?.detailScraped ?? false,
    listDate: card.listDate ?? prev?.listDate ?? null,
    firstSeenAt: prev?.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso,
    lastAskSeen: card.askingPrice ?? prev?.lastAskSeen ?? null,
    factorsKnown: 0,
  };
  listing.factorsKnown = countFactorsKnown(listing);
  return listing;
}

function applyDetail(
  listing: MarketplaceListing,
  detail: ReturnType<typeof parseDetail>,
  nowIso: string,
): MarketplaceListing {
  if (detail.notFound) {
    return { ...listing, status: detail.status === "sold" ? "sold" : "gone", lastSeenAt: nowIso, detailScraped: true };
  }
  const annual = annualizeEarnings(detail.monthlyEarnings ?? null, detail.annualEarnings ?? null);
  const asking = detail.askingPrice ?? listing.askingPrice;
  const inv = detail.inventoryAddOn ?? listing.inventoryAddOn;
  const next: MarketplaceListing = {
    ...listing,
    status:
      detail.status === "sold" || detail.status === "under-contract" || detail.status === "gone"
        ? detail.status
        : listing.status === "gone" || listing.status === "sold"
          ? "active"
          : listing.status,
    title: detail.title && detail.title.length > 3 ? detail.title : listing.title,
    askingPrice: asking,
    inventoryAddOn: inv,
    truePrice: truePriceOf(asking, inv),
    monthlyEarnings: detail.monthlyEarnings ?? listing.monthlyEarnings,
    annualEarnings: annual ?? listing.annualEarnings,
    earningsMonths: detail.earningsMonths ?? listing.earningsMonths,
    revenue: detail.revenue ?? listing.revenue,
    margin: detail.margin ?? listing.margin,
    trendSource: detail.trendSource !== "none" ? detail.trendSource : listing.trendSource,
    trendDirection:
      detail.trendSource === "measured"
        ? detail.trendDirection
        : detail.trendSource === "claim"
          ? "flat"
          : listing.trendDirection,
    siteAgeMonths: detail.siteAgeMonths ?? listing.siteAgeMonths,
    profitMonths: detail.profitMonths ?? listing.profitMonths,
    ownerHoursPerWeek: detail.ownerHoursPerWeek ?? listing.ownerHoursPerWeek,
    monetizationTypes: detail.monetizationTypes?.length ? detail.monetizationTypes : listing.monetizationTypes,
    largestSourceShare: detail.largestSourceShare ?? listing.largestSourceShare,
    modelClass: detail.modelClass ?? listing.modelClass,
    verifiedFinancials: detail.verifiedFinancials || listing.verifiedFinancials,
    detailScraped: true,
    lastAskSeen: asking ?? listing.lastAskSeen,
    lastSeenAt: nowIso,
    factorsKnown: 0,
  };
  next.factorsKnown = countFactorsKnown(next);
  return next;
}

function fillRateReport(listings: MarketplaceListing[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const host of HOST_IDS) {
    const xs = listings.filter((l) => l.host === host && l.status === "active");
    const n = xs.length || 1;
    const measured = xs.filter((l) => l.trendSource === "measured").length;
    const trueP = xs.filter((l) => l.truePrice != null).length;
    const track = xs.filter((l) => l.siteAgeMonths != null || l.profitMonths != null).length;
    const hours = xs.filter((l) => l.ownerHoursPerWeek != null).length;
    const verified = xs.filter((l) => l.verifiedFinancials).length;
    out[host] =
      `active=${xs.length}; trend measured: ${measured}/${xs.length}; truePrice ${trueP}/${xs.length}; ` +
      `track ${track}/${xs.length}; ownerHours ${hours}/${xs.length}; verified ${verified}/${xs.length}`;
    void n;
  }
  return out;
}

export async function syncMarketplaces(deps: SyncDeps = {}): Promise<MarketplaceInventoryFile> {
  const now = deps.now ?? new Date();
  const nowIso = now.toISOString();
  const log = deps.log ?? console.log;
  const scrape = deps.scrape ?? firecrawlScrape;
  const cacheDir = deps.cacheDir ?? CACHE_DIR;
  const inventoryPath = deps.inventoryPath ?? INVENTORY_FILE;

  const detailBudget =
    deps.detailBudget ?? new DailyBudget("firecrawl-detail", DETAIL_SCRAPES_PER_DAY, now, cacheDir);
  const discoveryBudget =
    deps.discoveryBudget ??
    ((host: MarketplaceHostId) =>
      new DailyBudget(`firecrawl-discovery-${host}`, HOSTS[host].discoverySlotsPerDay, now, cacheDir));

  const file = readJson<MarketplaceInventoryFile>(inventoryPath, emptyFile(now));
  for (const id of HOST_IDS) {
    if (!file.hosts[id]) file.hosts[id] = defaultHostState(id);
  }

  let byId = new Map(file.listings.map((l) => [l.id, l]));

  for (const hostId of HOST_IDS) {
    const cfg = HOSTS[hostId];
    const hostState = file.hosts[hostId];
    const dBudget = discoveryBudget(hostId);

    const urls: string[] = [];
    // Slot 1: newest / page 1
    if (dBudget.canSpend(1)) {
      urls.push(...cfg.discoveryUrls(1));
    }
    // Slot 2 (partial): rotating deeper page
    if (cfg.hostCoverage === "partial" && dBudget.canSpend(1) && urls.length < cfg.discoverySlotsPerDay) {
      const page = Math.max(2, hostState.nextRotationPage || 2);
      urls.push(...cfg.discoveryUrls(page));
    }

    if (urls.length === 0) {
      log(`${cfg.label}: no discovery budget left today`);
      continue;
    }

    const cards: IndexCard[] = [];
    let anySuccess = false;
    for (const url of urls) {
      try {
        const result = await scrape(url, {
          waitFor: cfg.waitForMs,
          budget: dBudget,
          log,
        });
        if (!result) continue;
        anySuccess = true;
        const parsed = parseIndex(hostId, result.markdown, result.links);
        log(`${cfg.label}: ${parsed.length} cards from ${url}`);
        cards.push(...parsed);
      } catch (err) {
        log(`${cfg.label}: discovery error ${url}: ${(err as Error).message}`);
      }
    }

    // Dedupe cards by listingId (prefer richer fields)
    const cardMap = new Map<string, IndexCard>();
    for (const c of cards) {
      const prev = cardMap.get(c.listingId);
      if (!prev || (c.askingPrice != null && prev.askingPrice == null)) cardMap.set(c.listingId, c);
      else if (!prev) cardMap.set(c.listingId, c);
      else cardMap.set(c.listingId, { ...prev, ...c, askingPrice: c.askingPrice ?? prev.askingPrice });
    }
    const uniqueCards = [...cardMap.values()];
    const forSaleCards = uniqueCards.filter((c) => c.status === "active" || c.status === "under-contract");

    if (!anySuccess || isFailedSweep(forSaleCards.length, hostState.previousSuccessfulCardCount)) {
      log(
        `${cfg.label}: FAILED sweep (cards=${forSaleCards.length}, prev=${hostState.previousSuccessfulCardCount}) — stamp nothing`,
      );
      continue;
    }

    // Success: upsert for-sale cards; also mark sold from page badges
    for (const card of uniqueCards) {
      const id = `${hostId}:${card.listingId}`;
      const prev = byId.get(id);
      if (card.status === "sold") {
        if (prev) {
          byId.set(id, { ...prev, status: "sold", lastSeenAt: nowIso });
        } else {
          byId.set(id, cardToPartial(card, hostId, nowIso));
        }
        continue;
      }
      byId.set(id, cardToPartial(card, hostId, nowIso, prev));
    }

    hostState.lastSuccessfulSweepAt = nowIso;
    hostState.previousSuccessfulCardCount = forSaleCards.length;
    hostState.rotationPagesSeen += urls.length;
    // Advance rotation page for next run
    const usedDeep = urls.length > 1;
    if (usedDeep) {
      hostState.nextRotationPage = (hostState.nextRotationPage || 2) + 1;
      // Flippa ~102 pages; wrap
      if (hostId === "flippa" && hostState.nextRotationPage > 120) {
        hostState.cycleLengthDays = hostState.cycleLengthDays ?? Math.max(30, Math.ceil(hostState.rotationPagesSeen / 2));
        hostState.nextRotationPage = 2;
        hostState.goneAfterDays = goneAfterDaysFor(hostState);
      }
    } else {
      hostState.nextRotationPage = Math.max(2, hostState.nextRotationPage || 2);
    }

    file.hosts[hostId] = hostState;
    byId = new Map(applyGoneRules([...byId.values()], hostId, hostState, nowIso).map((l) => [l.id, l]));
  }

  // Detail scrapes
  let detailLeft = Math.min(detailBudget.remaining, deps.maxDetailThisRun ?? DETAIL_SCRAPES_PER_DAY);
  const actives = [...byId.values()].filter((l) => l.status === "active");

  const needDetail = actives
    .filter((l) => {
      if (!l.detailScraped) return true;
      if (l.lastAskSeen != null && l.askingPrice != null && l.askingPrice !== l.lastAskSeen) return true;
      return false;
    })
    .sort((a, b) => (b.annualEarnings ?? 0) - (a.annualEarnings ?? 0));

  const recheck = actives
    .filter((l) => l.detailScraped && shouldRecheckDetail(l, now))
    .sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt));

  const detailQueue: MarketplaceListing[] = [];
  const recheckSlots = Math.min(RECHECK_DETAIL_SLOTS, detailLeft);
  detailQueue.push(...recheck.slice(0, recheckSlots));
  detailLeft -= detailQueue.length;
  for (const l of needDetail) {
    if (detailLeft <= 0) break;
    if (detailQueue.some((x) => x.id === l.id)) continue;
    detailQueue.push(l);
    detailLeft -= 1;
  }

  for (const listing of detailQueue) {
    if (!detailBudget.canSpend(1)) break;
    const cfg = HOSTS[listing.host];
    try {
      const result: FirecrawlResult | null = await scrape(listing.url, {
        waitFor: cfg.waitForMs,
        budget: detailBudget,
        log,
      });
      if (!result) continue;
      if (result.statusCode === 404) {
        byId.set(listing.id, { ...listing, status: "gone", detailScraped: true, lastSeenAt: nowIso });
        continue;
      }
      const detail = parseDetail(listing.host, result.markdown, listing.url);
      byId.set(listing.id, applyDetail(listing, detail, nowIso));
      log(`${cfg.label}: detail scraped ${listing.listingId}`);
      // Soft pacing — Firecrawl free tier is ~10 req/min
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      log(`${cfg.label}: detail error ${listing.url}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const listings = [...byId.values()];
  const fillRates = fillRateReport(listings);
  for (const [host, line] of Object.entries(fillRates)) {
    log(`fill-rate ${host}: ${line}`);
  }

  const out: MarketplaceInventoryFile = {
    syncedAt: nowIso,
    hosts: file.hosts,
    listings,
    fillRates,
  };
  writeJson(inventoryPath, out);
  log(`Wrote ${listings.length} listings → ${inventoryPath}`);
  return out;
}
