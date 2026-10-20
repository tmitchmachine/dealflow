// Markdown parsers for Empire Flippers + Flippa index/detail scrapes.

import { parseMoney } from "../../web/html";
import type {
  IndexCard,
  MarketplaceHostId,
  MarketplaceListingStatus,
  TrendDirection,
  TrendSource,
} from "./types";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Parse "$1.2M", "USD $26.3K", "£840,000". */
export function parseMarketplaceMoney(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/USD|AUD|GBP|EUR|CAD|HKD|SGD|JPY|NOK|SEK|CHF/gi, "").trim();
  return parseMoney(cleaned) ?? parseMoney(cleaned.replace(/[^\d.kmKM$,]/g, ""));
}

function yearsToMonths(years: number): number {
  return Math.round(years * 12);
}

export function parseAgeToMonths(text: string): number | null {
  const ym = text.match(/(\d+)\s*years?\s*(\d+)?\s*months?/i);
  if (ym) return Number(ym[1]) * 12 + (ym[2] ? Number(ym[2]) : 0);
  const y = text.match(/(\d+(?:\.\d+)?)\s*years?/i);
  if (y) return yearsToMonths(Number(y[1]));
  const m = text.match(/(\d+)\s*months?/i);
  if (m) return Number(m[1]);
  return null;
}

/** Owner hours from explicit number or keyword band. */
export function parseOwnerHours(text: string): number | null {
  const range = text.match(/(\d+)\s*[–-]\s*(\d+)\s*hrs?(?:\/|\s*per\s*)?wk/i);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const single = text.match(/(\d+)\s*hrs?(?:\/|\s*per\s*)?wk/i);
  if (single) return Number(single[1]);
  if (/passive|fully\s+automated|almost\s+passive/i.test(text)) return 5;
  if (/part[- ]?time/i.test(text)) return 20;
  if (/full[- ]?time|40\s*\+?\s*hours/i.test(text)) return 40;
  return null;
}

/** Inventory add-on only when page says price **+ inventory** (extra cost). */
export function parseInventoryAddOn(text: string): number | null {
  const m = text.match(
    /\+\s*(?:USD\s*)?\$?\s*([\d,.]+[km]?)\s*(?:of\s+)?inventory\b|\binventory\s*[:+]\s*(?:USD\s*)?\$?\s*([\d,.]+[km]?)/i,
  );
  if (!m) return null;
  if (/inventory\s+included|includes?\s+inventory|with\s+inventory\s+included/i.test(text)) return null;
  return parseMarketplaceMoney(m[1] || m[2]);
}

/**
 * Measured trend from a numeric series (profit preferred over traffic).
 * Flat = change within ±10%.
 */
export function measuredTrendFromSeries(
  values: number[],
  kind: "profit" | "traffic" = "profit",
): { source: TrendSource; direction: TrendDirection } {
  if (values.length < 2) return { source: "none", direction: "unknown" };
  const first = values[0];
  const last = values[values.length - 1];
  if (!(first > 0) && !(last > 0)) return { source: "none", direction: "unknown" };
  const base = Math.max(Math.abs(first), Math.abs(last), 1);
  const change = (last - first) / base;
  const direction: TrendDirection =
    Math.abs(change) <= 0.1 ? "flat" : change > 0 ? "up" : "down";
  void kind;
  return { source: "measured", direction };
}

/** Prefer profit series when both exist and disagree. */
export function resolveTrend(opts: {
  profitSeries?: number[];
  trafficSeries?: number[];
  claimText?: string;
}): { source: TrendSource; direction: TrendDirection } {
  const profit = opts.profitSeries?.length
    ? measuredTrendFromSeries(opts.profitSeries, "profit")
    : null;
  const traffic = opts.trafficSeries?.length
    ? measuredTrendFromSeries(opts.trafficSeries, "traffic")
    : null;
  if (profit?.source === "measured" && traffic?.source === "measured") {
    if (profit.direction !== traffic.direction) return profit;
    return profit;
  }
  if (profit?.source === "measured") return profit;
  if (traffic?.source === "measured") return traffic;
  if (opts.claimText && /\b(growing|growth|up\s+\d|yo[uy]|increasing|declining|down\s+\d)/i.test(opts.claimText)) {
    const down = /declin|down\s+\d|falling|dropping/i.test(opts.claimText);
    return { source: "claim", direction: down ? "down" : "up" };
  }
  return { source: "none", direction: "unknown" };
}

function statusFromBadge(text: string): MarketplaceListingStatus {
  if (/under\s*(offer|contract)|pending/i.test(text)) return "under-contract";
  if (/\bsold\b/i.test(text)) return "sold";
  return "active";
}

function uniqTypes(types: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of types.map((x) => x.trim()).filter(Boolean)) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// --- Empire Flippers ---

const EF_LISTING_RE = /https?:\/\/(?:www\.)?empireflippers\.com\/listing\/(\d+)\/?/i;

export function empireFlippersListingId(url: string): string | null {
  const m = url.match(EF_LISTING_RE);
  return m ? m[1] : null;
}

export function parseEmpireFlippersIndex(markdown: string, links: string[]): IndexCard[] {
  const byId = new Map<string, IndexCard>();

  for (const link of links) {
    const id = empireFlippersListingId(link);
    if (!id) continue;
    const url = `https://empireflippers.com/listing/${id}/`;
    if (!byId.has(id)) {
      byId.set(id, {
        listingId: id,
        url,
        title: `Listing #${id}`,
        status: "active",
        askingPrice: null,
        inventoryAddOn: null,
        monthlyEarnings: null,
        annualEarnings: null,
        revenue: null,
        siteAgeMonths: null,
        monetizationTypes: [],
        modelClass: null,
        verifiedFinancials: false,
        ownerHoursPerWeek: null,
        listDate: null,
      });
    }
  }

  // Card blocks: #97464 … until next #id or Load More
  const re = /#(\d+)\s*\n([\s\S]*?)(?=\n#\d+\s*\n|\nLoad More|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const id = m[1];
    const body = m[2];
    const card =
      byId.get(id) ??
      ({
        listingId: id,
        url: `https://empireflippers.com/listing/${id}/`,
        title: `Listing #${id}`,
        status: "active" as const,
        askingPrice: null,
        inventoryAddOn: null,
        monthlyEarnings: null,
        annualEarnings: null,
        revenue: null,
        siteAgeMonths: null,
        monetizationTypes: [],
        modelClass: null,
        verifiedFinancials: false,
        ownerHoursPerWeek: null,
        listDate: null,
      } satisfies IndexCard);

    card.status = statusFromBadge(body);
    const priceM = body.match(/Price\s*\n\s*(\$[^\n]+)/i) || body.match(/\$([\d,]+(?:\.\d+)?)/);
    if (priceM) card.askingPrice = parseMarketplaceMoney(priceM[1].startsWith("$") ? priceM[1] : `$${priceM[1]}`);
    const profitM = body.match(/Net Profit\s*\n\s*(\$[^\n]+)/i);
    if (profitM) card.annualEarnings = parseMarketplaceMoney(profitM[1]);
    const revM = body.match(/Revenue\s*\n\s*(\$[^\n]+)/i);
    if (revM) card.revenue = parseMarketplaceMoney(revM[1]);
    const yearM = body.match(/First Made Money\s*\n\s*(\d{4})/i);
    if (yearM) {
      const years = new Date().getFullYear() - Number(yearM[1]);
      card.siteAgeMonths = Math.max(0, yearsToMonths(years));
    }
    const mon = body.match(/Monetization\s*\n\s*([^\n]+)/i);
    if (mon) {
      card.monetizationTypes = uniqTypes(mon[1].split(/,/));
      card.modelClass = card.monetizationTypes[0] ?? null;
    }
    // Title: first non-empty niche-like line before Monetization
    const titleLine = body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !/^New Listing|^Sold|^Monetization|^Price|^Net|^Revenue|^Multiple|^First|^Unlock|^View|^\$/i.test(l) && !l.startsWith("["));
    if (titleLine) card.title = titleLine;
    if (/New Listing/i.test(body)) card.listDate = new Date().toISOString().slice(0, 10);
    card.inventoryAddOn = parseInventoryAddOn(body);
    card.ownerHoursPerWeek = parseOwnerHours(body);
    byId.set(id, card);
  }

  return [...byId.values()].filter((c) => c.status === "active" || c.status === "under-contract" || c.status === "sold");
}

export function parseEmpireFlippersDetail(
  markdown: string,
  url: string,
): Partial<IndexCard> & {
  margin: number | null;
  trendSource: TrendSource;
  trendDirection: TrendDirection;
  largestSourceShare: number | null;
  profitMonths: number | null;
  earningsMonths: number | null;
  verifiedFinancials: boolean;
  status: MarketplaceListingStatus;
  notFound: boolean;
} {
  const notFound = /listing was not found|404|no longer available/i.test(markdown);
  const status = notFound ? ("gone" as const) : statusFromBadge(markdown.slice(0, 4000));
  const askingPrice =
    parseMarketplaceMoney(markdown.match(/Listing Price\s*\n\s*(\$[^\n]+)/i)?.[1] ?? null) ??
    parseMarketplaceMoney(markdown.match(/Price\s*\n\s*(\$[^\n]+)/i)?.[1] ?? null);
  const annualEarnings = parseMarketplaceMoney(markdown.match(/Net Profit\s*\$?\s*([^\n]+)/i)?.[1] ?? null);
  const revenue = parseMarketplaceMoney(markdown.match(/Revenue\s*\$?\s*([^\n]+)/i)?.[1] ?? null);
  const marginM = markdown.match(/Profit Margin\s*(\d+(?:\.\d+)?)\s*%/i);
  const margin = marginM ? Number(marginM[1]) / 100 : null;
  const ageBlock = markdown.match(/First Made Money[\s\S]{0,120}?(\d+\s*years?[^\n)]*)/i);
  const siteAgeMonths = ageBlock ? parseAgeToMonths(ageBlock[1]) : null;
  const shareM = markdown.match(/Approximately\s+(\d+)\s*%\s+of the business is driven through/i);
  const largestSourceShare = shareM ? Number(shareM[1]) / 100 : null;
  const mon = markdown.match(/Monetization:\s*([^\n]+)/i);
  const monetizationTypes = mon ? uniqTypes(mon[1].split(/,/)) : [];
  const trend = resolveTrend({ claimText: markdown.slice(0, 8000) });
  // No public monthly table on probe — claims only.
  const verifiedFinancials = /\bVerified\b/i.test(markdown.slice(0, 5000));

  return {
    listingId: empireFlippersListingId(url) ?? "",
    url,
    title: markdown.match(/# Niche:\s*([^\n]+)/i)?.[1]?.trim() ?? `Listing`,
    status,
    askingPrice,
    inventoryAddOn: parseInventoryAddOn(markdown),
    annualEarnings,
    monthlyEarnings: null,
    revenue,
    margin,
    siteAgeMonths,
    monetizationTypes,
    modelClass: monetizationTypes[0] ?? null,
    verifiedFinancials,
    ownerHoursPerWeek: parseOwnerHours(markdown),
    listDate: null,
    trendSource: trend.source === "measured" ? "measured" : trend.source === "claim" ? "claim" : "none",
    trendDirection: trend.source === "claim" ? "flat" : trend.direction, // claim → flat at best for scoring
    largestSourceShare,
    profitMonths: null,
    earningsMonths: null,
    notFound,
  };
}

// --- Flippa ---

const FLIPPA_LISTING_RE = /https?:\/\/(?:www\.)?flippa\.com\/(\d+)(?:-[^\s)"']*)?/i;

export function flippaListingId(url: string): string | null {
  const m = url.match(FLIPPA_LISTING_RE);
  return m ? m[1] : null;
}

export function parseFlippaIndex(markdown: string, links: string[]): IndexCard[] {
  const byId = new Map<string, { url: string; titleHint: string }>();
  for (const link of links) {
    const id = flippaListingId(link);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, { url: link.split("?")[0], titleHint: "" });
  }

  const cards: IndexCard[] = [];
  // Split on "View Listing" anchors / Asking price blocks
  const chunks = markdown.split(/\n(?=####\s*\[)/);
  for (const chunk of chunks) {
    const linkM = chunk.match(/flippa\.com\/(\d+)(?:-[^\s)\]]*)?/i);
    if (!linkM) continue;
    const id = linkM[1];
    const meta = byId.get(id) ?? { url: `https://flippa.com/${id}`, titleHint: "" };
    const title =
      chunk.match(/####\s*\[([^\]]+)\]/)?.[1]?.trim() ||
      chunk.match(/Fast-growing[^\n]+|Solar[^\n]+|UK's[^\n]+|Established[^\n]+|Profitable[^\n]+|DTC[^\n]+|High-margin[^\n]+/i)?.[0]?.trim() ||
      `Flippa #${id}`;

    // Prefer Asking price — never current bid
    let askingPrice: number | null = null;
    const askM = chunk.match(/Asking price\s*\n+\s*(?:USD\s*)?\$?\s*([\d,.]+[kmKM]?)/i);
    if (askM) askingPrice = parseMarketplaceMoney(`$${askM[1]}`);
    // Ignore "Current bid" if present
    const bidOnly = /Current bid/i.test(chunk) && !askM;
    if (bidOnly) askingPrice = null;

    const monthlyProfit = parseMarketplaceMoney(
      chunk.match(/Monthly Profit\s*\n+\s*(?:USD\s*)?\$?\s*([\d,.]+[kmKM]?)/i)?.[1]
        ? `$${chunk.match(/Monthly Profit\s*\n+\s*(?:USD\s*)?\$?\s*([\d,.]+[kmKM]?)/i)![1]}`
        : null,
    );
    const monthlyRevenue = parseMarketplaceMoney(
      chunk.match(/Monthly Revenue\s*\n+\s*(?:USD\s*)?\$?\s*([\d,.]+[kmKM]?)/i)?.[1]
        ? `$${chunk.match(/Monthly Revenue\s*\n+\s*(?:USD\s*)?\$?\s*([\d,.]+[kmKM]?)/i)![1]}`
        : null,
    );
    const ageM = chunk.match(/Age\s*\n+\s*([^\n]+)/i);
    const siteAgeMonths = ageM ? parseAgeToMonths(ageM[1]) : null;
    const typeM = chunk.match(/Type\s*\n+\s*([^\n]+)/i);
    const modelClass = typeM?.[1]?.trim() ?? null;
    const verifiedFinancials = /Data Verified|Verified Listing|Vetted Listing/i.test(chunk);
    const ownerHoursPerWeek = parseOwnerHours(chunk);
    const inventoryAddOn = parseInventoryAddOn(chunk);
    const status = statusFromBadge(chunk.slice(0, 500));

    cards.push({
      listingId: id,
      url: meta.url,
      title,
      status: status === "sold" ? "sold" : status === "under-contract" ? "under-contract" : "active",
      askingPrice,
      inventoryAddOn,
      monthlyEarnings: monthlyProfit,
      annualEarnings: monthlyProfit != null ? monthlyProfit * 12 : null,
      revenue: monthlyRevenue != null ? monthlyRevenue * 12 : null,
      siteAgeMonths,
      monetizationTypes: modelClass ? [modelClass] : [],
      modelClass,
      verifiedFinancials,
      ownerHoursPerWeek,
      listDate: null,
    });
    byId.delete(id);
  }

  // Any link-only leftovers with no card body
  for (const [id, meta] of byId) {
    if (cards.some((c) => c.listingId === id)) continue;
    cards.push({
      listingId: id,
      url: meta.url,
      title: `Flippa #${id}`,
      status: "active",
      askingPrice: null,
      inventoryAddOn: null,
      monthlyEarnings: null,
      annualEarnings: null,
      revenue: null,
      siteAgeMonths: null,
      monetizationTypes: [],
      modelClass: null,
      verifiedFinancials: false,
      ownerHoursPerWeek: null,
      listDate: null,
    });
  }

  return cards;
}

export function parseFlippaDetail(
  markdown: string,
  url: string,
): ReturnType<typeof parseEmpireFlippersDetail> {
  const notFound = /404|listing (is )?(not found|no longer|ended|removed)/i.test(markdown);
  const status = notFound
    ? ("gone" as const)
    : /\bsold\b/i.test(markdown.slice(0, 3000))
      ? ("sold" as const)
      : statusFromBadge(markdown.slice(0, 3000));

  // Prefer classified / BIN ask; take last "Asking Price" USD amount when price-drop shows two
  const askBlocks = [...markdown.matchAll(/Asking Price[^\n]*\n+(?:#####\s*)?(?:USD\s*)?\$?\s*([\d,.]+)/gi)];
  let askingPrice: number | null = null;
  if (askBlocks.length) {
    const amounts = askBlocks.map((x) => parseMarketplaceMoney(`$${x[1]}`)).filter((n): n is number => n != null);
    // Current ask is typically the lower reduced price when two amounts appear
    askingPrice = amounts.length ? Math.min(...amounts) : null;
  }
  if (!askingPrice) {
    const bin = markdown.match(/Buy It Now[^\n]*\n+(?:#####\s*)?(?:USD\s*)?\$?\s*([\d,.]+)/i);
    if (bin) askingPrice = parseMarketplaceMoney(`$${bin[1]}`);
  }

  const monthly =
    parseMarketplaceMoney(
      markdown.match(/Monthly Profit\s*\n+(?:USD\s*)?\$?\s*([\d,.]+)/i)?.[1]
        ? `$${markdown.match(/Monthly Profit\s*\n+(?:USD\s*)?\$?\s*([\d,.]+)/i)![1]}`
        : null,
    ) ?? null;
  const ageM = markdown.match(/(?:App )?Age\s*\n+([^\n]+)/i);
  const siteAgeMonths = ageM ? parseAgeToMonths(ageM[1]) : null;
  const marginM = markdown.match(/Profit Margin\s*\n+(\d+(?:\.\d+)?)\s*%/i);
  const margin = marginM ? Number(marginM[1]) / 100 : null;
  const trend = resolveTrend({ claimText: markdown.slice(0, 10_000) });
  const verifiedFinancials = /Verified Listing|Vetted Listing|Data Verified/i.test(markdown);

  return {
    listingId: flippaListingId(url) ?? "",
    url,
    title: markdown.match(/^([^\n]{10,120})$/m)?.[1] ?? `Flippa listing`,
    status,
    askingPrice,
    inventoryAddOn: parseInventoryAddOn(markdown),
    annualEarnings: monthly != null ? monthly * 12 : null,
    monthlyEarnings: monthly,
    revenue: null,
    margin,
    siteAgeMonths,
    monetizationTypes: [],
    modelClass: null,
    verifiedFinancials,
    ownerHoursPerWeek: parseOwnerHours(markdown),
    listDate: null,
    trendSource: trend.source === "measured" ? "measured" : trend.source === "claim" ? "claim" : "none",
    trendDirection: trend.source === "claim" ? "flat" : trend.direction,
    largestSourceShare: null,
    profitMonths: null,
    earningsMonths: null,
    notFound,
  };
}

export function parseIndex(host: MarketplaceHostId, markdown: string, links: string[]): IndexCard[] {
  return host === "empireflippers"
    ? parseEmpireFlippersIndex(markdown, links)
    : parseFlippaIndex(markdown, links);
}

export function parseDetail(host: MarketplaceHostId, markdown: string, url: string) {
  return host === "empireflippers"
    ? parseEmpireFlippersDetail(markdown, url)
    : parseFlippaDetail(markdown, url);
}

export function truePriceOf(askingPrice: number | null, inventoryAddOn: number | null): number | null {
  if (askingPrice == null) return null;
  return askingPrice + (inventoryAddOn ?? 0);
}

export function annualizeEarnings(monthly: number | null, annual: number | null): number | null {
  if (annual != null && annual > 0) return annual;
  if (monthly != null && monthly > 0) return monthly * 12;
  return null;
}

/** How many of the 7 score factors have real inputs (not pure unknown defaults). */
export function countFactorsKnown(l: {
  truePrice: number | null;
  annualEarnings: number | null;
  earningsMonths: number | null;
  trendSource: TrendSource;
  largestSourceShare: number | null;
  monetizationTypes: string[];
  siteAgeMonths: number | null;
  profitMonths: number | null;
  ownerHoursPerWeek: number | null;
  listDate: string | null;
  firstSeenAt: string;
}): number {
  let n = 0;
  const thinEarnings = l.earningsMonths != null && l.earningsMonths < 6;
  if (l.truePrice != null && l.annualEarnings != null && l.annualEarnings > 0 && !thinEarnings) n += 1;
  if (l.trendSource === "measured") n += 1;
  if (l.annualEarnings != null && l.annualEarnings > 0) n += 1;
  if (l.largestSourceShare != null || l.monetizationTypes.length > 0) n += 1;
  if (l.siteAgeMonths != null || l.profitMonths != null) n += 1;
  if (l.ownerHoursPerWeek != null) n += 1;
  if (l.listDate || l.firstSeenAt) n += 1;
  return n;
}

void clamp01;
