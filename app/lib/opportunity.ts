// Cross-asset opportunity layer.
//
// Dealflow ranks both real-estate and business deals by whether a buyer (or a
// seller we are helping) should actually act — not just by a blended aesthetic
// score. Every opportunity gets a verdict, a primary strategy, and an
// investability rank used for the unified desk.

export type AssetKind = "property" | "business";

/** Actionable recommendation shown on cards and detail pages. */
export type Verdict = "pursue" | "negotiate" | "watch" | "pass";

export type PropertyStrategy = "buy-hold" | "fix-flip" | "negotiate-hold" | "pass";
export type BusinessStrategy =
  | "buy-operate"
  | "buy-semi-absentee"
  | "help-sell"
  | "negotiate"
  | "pass";

export interface OpportunityMeta {
  verdict: Verdict;
  /** Short plain-English why this verdict. */
  verdictReason: string;
  /** 0–100 investability — risk-adjusted, strategy-aware rank key. */
  investability: number;
  /** True when the deal clears hard investability gates (not just a nice score). */
  isActionable: boolean;
}

export function toGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 68) return "B";
  if (score >= 55) return "C";
  if (score >= 42) return "D";
  return "F";
}

export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "pursue":
      return "Pursue";
    case "negotiate":
      return "Negotiate";
    case "watch":
      return "Watch";
    case "pass":
      return "Pass";
  }
}

export function verdictTone(v: Verdict): "good" | "warn" | "neutral" | "bad" {
  switch (v) {
    case "pursue":
      return "good";
    case "negotiate":
      return "warn";
    case "watch":
      return "neutral";
    case "pass":
      return "bad";
  }
}

/** Soften a raw score for high-risk / low-confidence deals so they don't rank as investable. */
export function riskAdjustScore(
  rawScore: number,
  opts: { highRisks: number; mediumRisks: number; confidence: number },
): number {
  const riskPenalty = opts.highRisks * 8 + opts.mediumRisks * 3;
  const confFactor = 0.7 + 0.3 * opts.confidence; // low confidence compresses upside
  return Math.max(0, Math.min(100, Math.round((rawScore - riskPenalty) * confFactor)));
}
