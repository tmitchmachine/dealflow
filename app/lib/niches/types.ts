import type { Verdict } from "../opportunity";

/** Serializable niche firm for the DealDesk (server → client). */
export interface NicheFirmCardData {
  nicheId: "accounting" | "hvac";
  nicheLabel: string;
  stage: "selling" | "comparison";
  rank: number;
  score: number;
  /** Same ladder key as property investability for unified sorting. */
  investability: number;
  isActionable: boolean;
  verdict: Verdict;
  verdictReason: string;
  name: string;
  subtitle: string;
  licenseNumber: string;
  reasons: string;
  factors: { id: string; label: string; points: number; max: number }[];
  facts: { label: string; value: string }[];
  verifyUrl: string;
  imageColor: string;
}

export interface NicheBook {
  nicheId: "accounting" | "hvac";
  label: string;
  stage: "selling" | "comparison";
  disclaimer: string;
  source: "raw" | "cache";
  considered: number;
  summary: string;
  firms: NicheFirmCardData[];
}
