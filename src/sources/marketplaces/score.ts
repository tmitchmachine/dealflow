// Acquire screen score: public data room gate (sum 100). See EVAL.md + plan.

import { scoreFactors, type FactorDef, type FactorPoints } from "@/core/niche";
import type { Verdict } from "@/books/verdict";
import type { MarketplaceListing, TrendDirection, TrendSource } from "./types";
import { countFactorsKnown } from "./parse";

export const BIZSALE_FACTORS = [
  {
    id: "price",
    label: "Price vs earnings (true price)",
    max: 25,
    rule: "multiple = truePrice / annualEarnings; bandTop 6 saas / 4 else; full 25 at ratio≤1, 0 at ratio=2; unknown 8; earningsMonths<6 → unknown",
  },
  {
    id: "trend",
    label: "Trend (measured)",
    max: 15,
    rule: "Measured P&L/chart only: up 15, flat(±10%) 8, down 2, unknown 4; claim≠measured; earningsMonths<6 → unknown",
  },
  {
    id: "size",
    label: "Earnings size",
    max: 15,
    rule: "Log annual $: 0 at $12k/yr → 15 at $240k/yr",
  },
  {
    id: "concentration",
    label: "Concentration / diversity",
    max: 15,
    rule: "largestSourceShare ≤40%→15, ≥80%→0 linear; else ≥3 types 12, 2→8, 1→3; recurring +1 step; unknown 5",
  },
  {
    id: "track",
    label: "Track record",
    max: 10,
    rule: "Linear siteAgeMonths 12→60; if profitMonths present take min of age and profit scores",
  },
  {
    id: "owner",
    label: "Owner hours",
    max: 10,
    rule: "≤10h→10, 20→5, ≥40→0 linear; unknown 3",
  },
  {
    id: "fresh",
    label: "Freshness",
    max: 10,
    rule: "listDate or firstSeenAt; first cycle without listDate → mid 5; never lastSeenAt",
  },
] as const satisfies readonly FactorDef[];

type FactorId = (typeof BIZSALE_FACTORS)[number]["id"];

export interface ScoredBizSale {
  listing: MarketplaceListing;
  score: number;
  factors: FactorPoints<FactorId>[];
  reasons: string[];
  verdict: Verdict;
  verdictReason: string;
  isActionable: boolean;
  badges: { label: string; tone: "good" | "warn" | "bad" | "neutral" }[];
  multiple: number | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function isSaas(listing: MarketplaceListing): boolean {
  const blob = `${listing.modelClass ?? ""} ${listing.monetizationTypes.join(" ")}`.toLowerCase();
  return /\bsaas\b|software as a service|subscription software/.test(blob);
}

function monthsLinear(months: number | null, maxPts: number): number | null {
  if (months == null) return null;
  if (months < 12) return 0;
  return maxPts * clamp01((months - 12) / (60 - 12));
}

function trendPoints(source: TrendSource, direction: TrendDirection, thinEarnings: boolean): number {
  if (thinEarnings) return 4;
  if (source !== "measured") return 4;
  switch (direction) {
    case "up":
      return 15;
    case "flat":
      return 8;
    case "down":
      return 2;
    default:
      return 4;
  }
}

function concentrationPoints(listing: MarketplaceListing): number {
  if (listing.largestSourceShare != null) {
    const s = listing.largestSourceShare;
    if (s <= 0.4) return 15;
    if (s >= 0.8) return 0;
    return 15 * clamp01((0.8 - s) / 0.4);
  }
  const n = listing.monetizationTypes.length;
  if (n === 0) return 5;
  let base = n >= 3 ? 12 : n === 2 ? 8 : 3;
  const recurring = listing.monetizationTypes.some((t) => /subscription|saas|recurring/i.test(t));
  if (recurring) base = Math.min(15, base + 3);
  return base;
}

function ownerPoints(hours: number | null): number {
  if (hours == null) return 3;
  if (hours <= 10) return 10;
  if (hours >= 40) return 0;
  if (hours <= 20) return 10 - ((hours - 10) / 10) * 5;
  return 5 - ((hours - 20) / 20) * 5;
}

function freshPoints(listing: MarketplaceListing, now: Date): number {
  const ref = listing.listDate ?? listing.firstSeenAt;
  if (!listing.listDate) return 5; // first cycle / no listDate → mid
  const days = (now.getTime() - new Date(ref).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 5;
  if (days <= 14) return 10;
  if (days <= 45) return 7;
  if (days <= 90) return 4;
  return 1;
}

function ladderVerdict(score: number): Verdict {
  if (score >= 65) return "pursue";
  if (score >= 50) return "negotiate";
  if (score >= 35) return "watch";
  return "pass";
}

const VERDICT_RANK: Record<Verdict, number> = { pass: 0, watch: 1, negotiate: 2, pursue: 3 };

function capVerdict(v: Verdict, max: Verdict): Verdict {
  return VERDICT_RANK[v] <= VERDICT_RANK[max] ? v : max;
}

export function applyVerdictCaps(
  score: number,
  listing: MarketplaceListing,
  multiple: number | null,
): { verdict: Verdict; verdictReason: string; isActionable: boolean } {
  let verdict = ladderVerdict(score);
  let verdictReason = `Score ${score}`;
  let isActionable = true;

  const annual = listing.annualEarnings;
  if (listing.truePrice == null || annual == null || !(annual > 0)) {
    verdict = capVerdict(verdict, "watch");
    isActionable = false;
    verdictReason = "Missing ask or annual earnings — not actionable";
  }

  if (verdict === "pursue" && listing.trendSource !== "measured") {
    verdict = "negotiate";
    verdictReason = "Pursue requires measured trend";
  }

  if (!listing.detailScraped) {
    verdict = capVerdict(verdict, "negotiate");
    verdictReason = "No detail scrape yet — at most negotiate";
  }

  const cheap = multiple != null && multiple < 1;
  // EF vetted = Verified badge → verifiedFinancials; otherwise cap at Watch
  if (cheap && !listing.verifiedFinancials) {
    verdict = capVerdict(verdict, "watch");
    verdictReason = "Cheap <1× — verify earnings";
  }

  return {
    verdict,
    verdictReason,
    isActionable: isActionable && (verdict === "pursue" || verdict === "negotiate"),
  };
}

export function scoreBizSale(
  listing: MarketplaceListing,
  opts: { now?: Date } = {},
): ScoredBizSale {
  const now = opts.now ?? new Date();
  const reasons: string[] = [];
  const badges: ScoredBizSale["badges"] = [];

  const thinEarnings = listing.earningsMonths != null && listing.earningsMonths < 6;
  const annual = listing.annualEarnings;
  const truePrice = listing.truePrice;
  const multiple =
    truePrice != null && annual != null && annual > 0 ? truePrice / annual : null;

  let earningsForPrice = annual;
  if (annual != null && listing.revenue != null && annual > listing.revenue) {
    badges.push({ label: "Bad data: profit > revenue", tone: "bad" });
    earningsForPrice = null;
    reasons.push("Reported profit exceeds revenue — treat earnings as unknown");
  }

  let pricePts = 8;
  if (thinEarnings || earningsForPrice == null || !(earningsForPrice > 0) || truePrice == null) {
    pricePts = 8;
    if (thinEarnings) reasons.push("Earnings history < 6 months — price unknown");
  } else {
    const bandTop = isSaas(listing) ? 6 : 4;
    const r = multiple! / bandTop;
    pricePts = 25 * clamp01((2 - r) / 1);
    reasons.push(`True price ${multiple!.toFixed(2)}× annual vs ${bandTop}× band`);
  }

  const trendPts = trendPoints(listing.trendSource, listing.trendDirection, thinEarnings);
  if (listing.trendSource === "claim") reasons.push("Trend is seller claim only — not measured");
  else if (listing.trendSource === "measured") reasons.push(`Measured trend: ${listing.trendDirection}`);

  const sizePts =
    annual != null && annual > 0
      ? 15 * clamp01(Math.log(annual / 12_000) / Math.log(240_000 / 12_000))
      : 0;

  const concPts = concentrationPoints(listing);

  const ageScore = monthsLinear(listing.siteAgeMonths, 10);
  const profitScore = monthsLinear(listing.profitMonths, 10);
  let trackPts = 0;
  if (ageScore != null && profitScore != null) trackPts = Math.min(ageScore, profitScore);
  else if (ageScore != null) trackPts = ageScore;
  else if (profitScore != null) trackPts = profitScore;

  const ownerPts = ownerPoints(listing.ownerHoursPerWeek);
  const freshPts = freshPoints(listing, now);

  const { score, factors } = scoreFactors(BIZSALE_FACTORS, {
    price: pricePts,
    trend: trendPts,
    size: sizePts,
    concentration: concPts,
    track: trackPts,
    owner: ownerPts,
    fresh: freshPts,
  });

  if (multiple != null && multiple < 1) {
    badges.push({ label: "Verify earnings", tone: "warn" });
    reasons.push("Suspiciously cheap (<1× annual)");
  }

  listing.factorsKnown = countFactorsKnown(listing);
  const caps = applyVerdictCaps(score, listing, multiple);

  return {
    listing,
    score,
    factors,
    reasons,
    ...caps,
    badges,
    multiple,
  };
}
