// Roll county rows up to parcels and score them. A tax-defaulted parcel is an
// off-market lead: the owner is behind, and the longer and larger the debt,
// the more pressure to sell before the county does.

import { scoreFactors, type FactorDef, type FactorPoints } from "@/core/niche";
import type { CountyFeed, TaxRow } from "./counties";

export interface TaxDefaultParcel {
  /** `${countyId}:${parcel}` */
  id: string;
  countyId: string;
  countyLabel: string;
  state: string;
  parcel: string;
  situsAddress: string;
  situsCity: string;
  ownerName: string;
  mailingAddress: string;
  /** Mailing address differs from the property — the owner likely lives elsewhere. Null when unknown. */
  absentee: boolean | null;
  value: number | null;
  amountDue: number;
  /** Earliest unpaid tax year. */
  firstYear: number | null;
  taxYears: number[];
  defaultDate: string | null;
  saleNoticeDate: string | null;
  bankruptcy: boolean;
  landUse: string;
  sourceUrl: string;
}

export const TAX_DEFAULT_FACTORS = [
  { id: "years", label: "Years delinquent", max: 35, rule: "7 points per year behind, full at 5 years (California's power-to-sell threshold)" },
  { id: "equity", label: "Equity left", max: 25, rule: "Debt ≤ 2% of value 25, sliding to 0 at 25%; value unknown 10" },
  { id: "pressure", label: "Amount owed", max: 15, rule: "$1k owed 0, sliding to 15 at $50k (log scale)" },
  { id: "absentee", label: "Absentee owner", max: 15, rule: "Mailing address differs from the property 15; unknown 5" },
  { id: "sale", label: "Tax-sale stage", max: 10, rule: "County sale notice sent, or 5+ years behind, 10" },
] as const satisfies readonly FactorDef[];

type FactorId = (typeof TAX_DEFAULT_FACTORS)[number]["id"];

/** Parcels owing less than this are noise (late fees, a missed installment). */
export const MIN_AMOUNT_DUE = 500;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const streetKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|court|ct|way|place|pl|circle|cir|cr)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function aggregateParcels(feed: CountyFeed, rows: TaxRow[]): TaxDefaultParcel[] {
  const byParcel = new Map<string, TaxRow[]>();
  for (const row of rows) {
    if (row.redeemed) continue;
    const list = byParcel.get(row.parcel) ?? [];
    list.push(row);
    byParcel.set(row.parcel, list);
  }

  const out: TaxDefaultParcel[] = [];
  for (const [parcel, list] of byParcel) {
    const first = list[0];
    const years = [...new Set(list.map((r) => r.taxYear).filter((y): y is number => y !== null))].sort();
    const totals = list.map((r) => r.parcelTotal).filter((t): t is number => t !== null);
    const amountDue = Math.round(totals.length ? Math.max(...totals) : list.reduce((s, r) => s + r.amount, 0));
    if (amountDue < MIN_AMOUNT_DUE) continue;

    const mailing = list.find((r) => r.mailingAddress)?.mailingAddress ?? "";
    const situs = list.find((r) => r.situsAddress)?.situsAddress ?? "";
    // A PO box says nothing about where the owner lives (rural owners use them locally).
    const poBox = /^p\.?\s*o\.?\s*box\b/i.test(mailing);
    const absentee = mailing && situs && !poBox ? !streetKey(mailing).startsWith(streetKey(situs)) : null;
    const values = list.map((r) => r.value).filter((v): v is number => v !== null && v > 0);

    out.push({
      id: `${feed.id}:${parcel}`,
      countyId: feed.id,
      countyLabel: feed.label,
      state: feed.state,
      parcel,
      situsAddress: situs,
      situsCity: first.situsCity,
      ownerName: list.find((r) => r.ownerName)?.ownerName ?? "",
      mailingAddress: mailing,
      absentee,
      value: values.length ? Math.max(...values) : null,
      amountDue,
      firstYear: years[0] ?? null,
      taxYears: years,
      defaultDate: list.map((r) => r.defaultDate).filter(Boolean).sort()[0] ?? null,
      saleNoticeDate: list.map((r) => r.saleNoticeDate).filter(Boolean).sort().at(-1) ?? null,
      bankruptcy: list.some((r) => r.bankruptcy),
      landUse: first.landUse,
      sourceUrl: feed.pageUrl,
    });
  }
  return out;
}

export interface ScoredParcel {
  parcel: TaxDefaultParcel;
  score: number;
  factors: FactorPoints<FactorId>[];
  reasons: string[];
  yearsBehind: number;
}

export function scoreParcel(p: TaxDefaultParcel, now = new Date()): ScoredParcel {
  const reasons: string[] = [];
  const yearsBehind = p.firstYear ? Math.max(1, now.getFullYear() - p.firstYear) : 1;
  reasons.push(`${yearsBehind} year${yearsBehind > 1 ? "s" : ""} delinquent (since ${p.firstYear ?? "unknown"})`);
  reasons.push(`$${p.amountDue.toLocaleString()} owed`);

  const years = 35 * clamp01(yearsBehind / 5);

  let equity = 10;
  if (p.value) {
    const ratio = p.amountDue / p.value;
    equity = 25 * clamp01((0.25 - ratio) / 0.23);
    reasons.push(`Debt is ${(ratio * 100).toFixed(1)}% of the $${p.value.toLocaleString()} assessed value`);
  }

  const pressure = 15 * clamp01(Math.log(p.amountDue / 1_000) / Math.log(50));
  const absentee = p.absentee === null ? 5 : p.absentee ? 15 : 0;
  if (p.absentee) reasons.push("Absentee owner (mails elsewhere)");
  const sale = p.saleNoticeDate || yearsBehind >= 5 ? 10 : 0;
  if (p.saleNoticeDate) reasons.push(`Tax-sale notice ${p.saleNoticeDate}`);
  if (p.bankruptcy) reasons.push("Owner in bankruptcy — automatic stay applies");

  const { score, factors } = scoreFactors(TAX_DEFAULT_FACTORS, { years, equity, pressure, absentee, sale });
  return { parcel: p, score, factors, reasons, yearsBehind };
}
