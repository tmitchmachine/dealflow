import type { LeadCardData } from "./types";

/** Actionable first, then investability, then score (desk default sort). */
export function compareLeads(a: LeadCardData, b: LeadCardData): number {
  if (a.isActionable !== b.isActionable) return a.isActionable ? -1 : 1;
  if (b.investability !== a.investability) return b.investability - a.investability;
  return b.score - a.score;
}

export function rankLeads(leads: LeadCardData[]): LeadCardData[] {
  return [...leads].sort(compareLeads);
}
