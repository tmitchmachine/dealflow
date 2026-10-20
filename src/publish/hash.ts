import { createHash } from "node:crypto";
import type { LeadCardData } from "../books/types";

/** Round date-derived years / fractional tenure once so hash matches stored body. */
export function roundLeadForStore(lead: LeadCardData): LeadCardData {
  const facts = lead.facts.map((f) => {
    if (!/year|tenure|yrs?/i.test(f.label)) return f;
    const n = Number.parseFloat(f.value);
    if (!Number.isFinite(n)) return f;
    return { ...f, value: String(Math.round(n)) };
  });
  const factors = lead.factors.map((f) => ({
    ...f,
    points: Math.round(f.points),
    max: Math.round(f.max),
  }));
  return {
    ...lead,
    score: Math.round(lead.score),
    investability: Math.round(lead.investability),
    facts,
    factors,
  };
}

/** Stable content for hashing — no rank, no published_at, no run metadata. */
export function hashableLead(lead: LeadCardData): Omit<LeadCardData, "rank"> {
  const { rank: _rank, ...rest } = lead;
  return rest;
}

export function contentHash(lead: LeadCardData): string {
  const body = hashableLead(lead);
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}
