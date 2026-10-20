import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DailyBudget, localDayKey } from "../../web/store";
import { firecrawlScrape } from "../../web/firecrawl";
import {
  annualizeEarnings,
  countFactorsKnown,
  measuredTrendFromSeries,
  parseEmpireFlippersIndex,
  parseFlippaIndex,
  parseInventoryAddOn,
  resolveTrend,
  truePriceOf,
} from "./parse";
import { applyVerdictCaps, scoreBizSale } from "./score";
import { applyGoneRules, isFailedSweep, mergeStatusFromCard } from "./liveness";
import { syncMarketplaces } from "./sync";
import type { MarketplaceListing } from "./types";
import { defaultHostState } from "./hosts";

const FIX = path.join(__dirname, "fixtures");

function loadMd(name: string): { markdown: string; links: string[] } {
  const j = JSON.parse(readFileSync(path.join(FIX, name), "utf8")) as {
    markdown: string;
    links?: string[];
  };
  return { markdown: j.markdown, links: j.links ?? [] };
}

function baseListing(over: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    id: "flippa:1",
    host: "flippa",
    listingId: "1",
    url: "https://flippa.com/1",
    title: "Test",
    status: "active",
    askingPrice: 100_000,
    inventoryAddOn: null,
    truePrice: 100_000,
    monthlyEarnings: 5_000,
    annualEarnings: 60_000,
    earningsMonths: 12,
    revenue: 120_000,
    margin: 0.5,
    trendSource: "measured",
    trendDirection: "up",
    siteAgeMonths: 36,
    profitMonths: 36,
    ownerHoursPerWeek: 10,
    monetizationTypes: ["SaaS", "Subscription"],
    largestSourceShare: 0.35,
    modelClass: "SaaS",
    verifiedFinancials: false,
    detailScraped: true,
    listDate: "2026-10-01",
    firstSeenAt: "2026-10-01T00:00:00.000Z",
    lastSeenAt: "2026-10-19T00:00:00.000Z",
    lastAskSeen: 100_000,
    factorsKnown: 7,
    ...over,
  };
}

describe("marketplace parsers (fixtures)", () => {
  it("parses Empire Flippers index cards", () => {
    const { markdown, links } = loadMd("empireflippers-index.json");
    const cards = parseEmpireFlippersIndex(markdown, links);
    expect(cards.length).toBeGreaterThanOrEqual(10);
    const withPrice = cards.filter((c) => c.askingPrice != null);
    expect(withPrice.length).toBeGreaterThan(5);
    expect(cards.some((c) => c.annualEarnings != null)).toBe(true);
  });

  it("parses Flippa index cards with asking price (not bid)", () => {
    const { markdown, links } = loadMd("flippa-index.json");
    const cards = parseFlippaIndex(markdown, links);
    expect(cards.length).toBeGreaterThanOrEqual(20);
    const priced = cards.filter((c) => c.askingPrice != null);
    expect(priced.length).toBeGreaterThan(5);
    expect(cards.some((c) => c.monthlyEarnings != null)).toBe(true);
  });
});

describe("truePrice / annualize / inventory", () => {
  it("adds inventory only for + inventory phrasing", () => {
    expect(parseInventoryAddOn("Price $100,000 + $20,000 inventory")).toBe(20_000);
    expect(parseInventoryAddOn("Price $100,000 includes inventory")).toBeNull();
    expect(truePriceOf(100_000, 20_000)).toBe(120_000);
    expect(truePriceOf(100_000, null)).toBe(100_000);
  });

  it("annualizes monthly earnings", () => {
    expect(annualizeEarnings(10_000, null)).toBe(120_000);
    expect(annualizeEarnings(null, 50_000)).toBe(50_000);
  });
});

describe("trend rules", () => {
  it("flat is ±10%, profit wins over traffic, claim is not measured", () => {
    expect(measuredTrendFromSeries([100, 105]).direction).toBe("flat");
    expect(measuredTrendFromSeries([100, 120]).direction).toBe("up");
    expect(measuredTrendFromSeries([100, 80]).direction).toBe("down");
    const resolved = resolveTrend({
      profitSeries: [100, 80],
      trafficSeries: [100, 130],
    });
    expect(resolved.source).toBe("measured");
    expect(resolved.direction).toBe("down");
    const claim = resolveTrend({ claimText: "Growing 50% YoY with strong traction" });
    expect(claim.source).toBe("claim");
  });
});

describe("acquire score", () => {
  it("scores concentration, track record, and thin earnings", () => {
    const rich = scoreBizSale(baseListing());
    expect(rich.score).toBeGreaterThan(50);
    expect(rich.factors.find((f) => f.id === "concentration")!.points).toBeGreaterThan(10);

    const young = scoreBizSale(baseListing({ siteAgeMonths: 6, profitMonths: null }));
    expect(young.factors.find((f) => f.id === "track")!.points).toBe(0);

    const thin = scoreBizSale(baseListing({ earningsMonths: 3, trendSource: "measured", trendDirection: "up" }));
    expect(thin.factors.find((f) => f.id === "price")!.points).toBe(8);
    expect(thin.factors.find((f) => f.id === "trend")!.points).toBe(4);
  });

  it("claim trend does not unlock Pursue; cheap <1× → Watch unless verified", () => {
    const claimHigh = scoreBizSale(
      baseListing({
        trendSource: "claim",
        trendDirection: "up",
        askingPrice: 50_000,
        truePrice: 50_000,
        annualEarnings: 80_000,
        detailScraped: true,
      }),
    );
    // Even with high raw score, pursue requires measured
    if (claimHigh.score >= 65) expect(claimHigh.verdict).not.toBe("pursue");

    const cheap = applyVerdictCaps(70, baseListing({ truePrice: 40_000, annualEarnings: 80_000, verifiedFinancials: false, trendSource: "measured", detailScraped: true }), 0.5);
    expect(cheap.verdict).toBe("watch");

    const vetted = applyVerdictCaps(70, baseListing({ truePrice: 40_000, annualEarnings: 80_000, verifiedFinancials: true, trendSource: "measured", detailScraped: true }), 0.5);
    expect(vetted.verdict).toBe("pursue");
  });

  it("no detail scrape caps at negotiate; freshness mid without listDate", () => {
    const noDetail = applyVerdictCaps(80, baseListing({ detailScraped: false, trendSource: "measured" }), 2);
    expect(noDetail.verdict).toBe("negotiate");

    const fresh = scoreBizSale(baseListing({ listDate: null, firstSeenAt: "2026-10-19T00:00:00.000Z" }));
    expect(fresh.factors.find((f) => f.id === "fresh")!.points).toBe(5);
  });

  it("counts factorsKnown and never requires lastSeenAt in facts", () => {
    const n = countFactorsKnown(baseListing());
    expect(n).toBe(7);
  });
});

describe("liveness", () => {
  it("failed sweep when 0 cards or half previous", () => {
    expect(isFailedSweep(0, 10)).toBe(true);
    expect(isFailedSweep(4, 10)).toBe(true);
    expect(isFailedSweep(6, 10)).toBe(false);
  });

  it("gone uses lastSeenAt ≤ lastSuccessfulSweepAt − goneAfterDays", () => {
    const host = defaultHostState("flippa");
    host.lastSuccessfulSweepAt = "2026-10-19T00:00:00.000Z";
    host.goneAfterDays = 30;
    const listings = [
      baseListing({
        id: "flippa:old",
        host: "flippa",
        lastSeenAt: "2026-09-01T00:00:00.000Z",
        status: "active",
      }),
      baseListing({
        id: "flippa:new",
        host: "flippa",
        lastSeenAt: "2026-10-18T00:00:00.000Z",
        status: "active",
      }),
    ];
    const out = applyGoneRules(listings, "flippa", host, "2026-10-19T00:00:00.000Z");
    expect(out.find((l) => l.id === "flippa:old")!.status).toBe("gone");
    expect(out.find((l) => l.id === "flippa:new")!.status).toBe("active");
  });

  it("reappear from gone → active; map does not unsell", () => {
    expect(mergeStatusFromCard("gone", "active", true)).toBe("active");
    expect(mergeStatusFromCard("sold", "active", false)).toBe("sold");
    expect(mergeStatusFromCard("sold", "active", true)).toBe("active");
  });
});

describe("DailyBudget + firecrawl robots", () => {
  it("keys by local day and respects remaining quota", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "df-budget-"));
    const now = new Date();
    const b = new DailyBudget("test-detail", 10, now, dir);
    expect(localDayKey(now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.canSpend(10)).toBe(true);
    b.spend(7);
    const b2 = new DailyBudget("test-detail", 10, now, dir);
    expect(b2.remaining).toBe(3);
    expect(b2.canSpend(4)).toBe(false);
  });

  it("never calls Firecrawl when robots deny", async () => {
    let called = false;
    const result = await firecrawlScrape("https://example.com/secret", {
      budget: new DailyBudget("x", 10, new Date(), mkdtempSync(path.join(tmpdir(), "df-b-"))),
      apiKey: "test",
      robotsCheck: async () => false,
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as typeof fetch,
    });
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it("discovery slots differ by coverage (2 for partial hosts in sync)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "df-sync-"));
    const inventoryPath = path.join(dir, "biz.json");
    const calls: string[] = [];
    const { markdown: efMd, links: efLinks } = loadMd("empireflippers-index.json");
    const { markdown: flMd, links: flLinks } = loadMd("flippa-index.json");

    await syncMarketplaces({
      inventoryPath,
      cacheDir: dir,
      maxDetailThisRun: 0,
      detailBudget: new DailyBudget("firecrawl-detail", 10, new Date(), dir),
      discoveryBudget: (host) =>
        new DailyBudget(`firecrawl-discovery-${host}`, host === "flippa" || host === "empireflippers" ? 2 : 1, new Date(), dir),
      scrape: async (url, opts) => {
        calls.push(url);
        opts?.budget?.spend(opts.cost ?? 1);
        if (url.includes("empireflippers")) return { url, markdown: efMd, links: efLinks };
        return { url, markdown: flMd, links: flLinks };
      },
      log: () => {},
    });

    expect(calls.filter((u) => u.includes("empireflippers")).length).toBe(2);
    expect(calls.filter((u) => u.includes("flippa")).length).toBe(2);
  });
});
