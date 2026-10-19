import type { LeadCardData } from "../desk/types";

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
