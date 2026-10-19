// Practice-for-sale score: published factors summing to 100, like the license
// indexes. Price is judged against real sold comps from the same brokers.

import { scoreFactors, type FactorDef, type FactorPoints } from "@/core/niche";
import type { PracticeListing } from "./types";

export const PRACTICE_FACTORS = [
  { id: "price", label: "Price vs sold comps", max: 40, rule: "Asking multiple ≤ 0.8× the median sold multiple 40, sliding to 0 at 1.3×; unknown 15" },
  { id: "size", label: "Revenue size", max: 20, rule: "$150k revenue 0, sliding to 20 at $2M (log scale)" },
  { id: "transition", label: "Seller transition", max: 15, rule: "Retirement or seller assisting transition 10; established 20+ years 5" },
  { id: "fresh", label: "Freshness", max: 15, rule: "Updated within 30 days 15, within 90 days 8" },
  { id: "location", label: "California", max: 10, rule: "California practice 10" },
] as const satisfies readonly FactorDef[];

type FactorId = (typeof PRACTICE_FACTORS)[number]["id"];

export interface ScoredPractice {
  listing: PracticeListing;
  score: number;
  factors: FactorPoints<FactorId>[];
  reasons: string[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median asking multiple of sold listings with sane numbers. */
export function compMultiple(listings: PracticeListing[]): { multiple: number | null; count: number } {
  const sold = listings
    .filter((l) => l.status === "sold" && l.multiple !== null && l.multiple > 0.3 && l.multiple < 4)
    .map((l) => l.multiple as number);
  return { multiple: median(sold), count: sold.length };
}

export function scorePractice(
  listing: PracticeListing,
  comps: number | null,
  now = new Date(),
): ScoredPractice {
  const reasons: string[] = [];

  let price = 15;
  if (listing.multiple !== null && comps) {
    const ratio = listing.multiple / comps;
    price = 40 * clamp01((1.3 - ratio) / 0.5);
    reasons.push(`Asking ${listing.multiple.toFixed(2)}× revenue vs ${comps.toFixed(2)}× median sold`);
  } else {
    reasons.push("No price/revenue to compare");
  }

  const size = listing.revenue
    ? 20 * clamp01(Math.log(listing.revenue / 150_000) / Math.log(2_000_000 / 150_000))
    : 0;

  const retiring = /retir/i.test(listing.reasonForSelling) || /retir|transition/i.test(listing.summary);
  const age = listing.establishedYear ? now.getFullYear() - listing.establishedYear : 0;
  const transition = (retiring ? 10 : 0) + (age >= 20 ? 5 : 0);
  if (retiring) reasons.push("Seller retiring or assisting transition");
  if (listing.establishedYear) reasons.push(`Established ${listing.establishedYear}`);

  const days = listing.lastmod ? (now.getTime() - new Date(listing.lastmod).getTime()) / 86_400_000 : Infinity;
  const fresh = days <= 30 ? 15 : days <= 90 ? 8 : 0;

  const location = /california/i.test(listing.location) ? 10 : 0;

  const { score, factors } = scoreFactors(PRACTICE_FACTORS, { price, size, transition, fresh, location });
  return { listing, score, factors, reasons };
}
