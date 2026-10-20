import type { Verdict } from "./verdict";

/** Every lead source the desk ranks besides live property listings. */
export type LeadSource = "accounting" | "hvac" | "practice" | "taxdefault" | "bizsale";

export type BadgeTone = "good" | "warn" | "bad" | "neutral";

/** One ranked lead, serializable server → client, the same shape for every source. */
export interface LeadCardData {
  source: LeadSource;
  /** Stable within a source; React key is `${source}-${id}`. */
  id: string;
  sourceLabel: string;
  rank: number;
  score: number;
  /** Same ladder key as property investability for unified sorting. */
  investability: number;
  isActionable: boolean;
  verdict: Verdict;
  verdictReason: string;
  name: string;
  subtitle: string;
  /** "License #3438 · rank 1", "Listing CAC6580 · Accounting Practice Sales". */
  idText: string;
  /** What the score measures, shown under the id. */
  scoreLabel: string;
  reasons: string;
  factors: { id: string; label: string; points: number; max: number }[];
  facts: { label: string; value: string }[];
  badges: { label: string; tone: BadgeTone }[];
  link: { href: string; label: string };
  imageColor: string;
  /** Bizsale: how many of 7 score factors have real inputs. */
  factorsKnown?: number;
}

export interface NicheBook {
  nicheId: "accounting" | "hvac";
  label: string;
  stage: "selling" | "comparison";
  disclaimer: string;
  source: "raw" | "cache";
  considered: number;
  summary: string;
  firms: LeadCardData[];
}
