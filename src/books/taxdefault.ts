import { readJson } from "../web/store";
import { scoreParcel } from "../sources/taxdefault/aggregate";
import { TAX_DEFAULT_FILE, type TaxDefaultFile } from "../sources/taxdefault/sync";
import { usd } from "./format";
import type { Verdict } from "./verdict";
import type { LeadCardData } from "./types";

export interface TaxDefaultBook {
  syncedAt: string | null;
  counties: { id: string; label: string; parcels: number; error?: string }[];
  total: number;
  cards: LeadCardData[];
}

function verdictFor(
  score: number,
  bankruptcy: boolean,
): { verdict: Verdict; reason: string; actionable: boolean } {
  if (bankruptcy)
    return {
      verdict: "watch",
      reason: "Owner is in bankruptcy; the automatic stay blocks a deal for now.",
      actionable: false,
    };
  if (score >= 70)
    return {
      verdict: "pursue",
      reason: "Years behind with equity left — strong motivated-seller profile.",
      actionable: true,
    };
  if (score >= 55)
    return {
      verdict: "negotiate",
      reason: "Real pressure on the owner; check title and condition.",
      actionable: true,
    };
  if (score >= 40)
    return {
      verdict: "watch",
      reason: "Early or small delinquency; may resolve on its own.",
      actionable: false,
    };
  return { verdict: "pass", reason: "Little pressure or little equity.", actionable: false };
}

let memo: { mtimeKey: string; book: TaxDefaultBook } | null = null;

/** Top `limit` parcels by score across every synced county. */
export function loadTaxDefaultBook(limit: number): TaxDefaultBook {
  const file = readJson<TaxDefaultFile | null>(TAX_DEFAULT_FILE, null);
  if (!file) return { syncedAt: null, counties: [], total: 0, cards: [] };
  const key = `${file.syncedAt}|${limit}`;
  if (memo?.mtimeKey === key) return memo.book;

  const scored = file.parcels
    .map((p) => scoreParcel(p))
    .sort((a, b) => b.score - a.score || b.parcel.amountDue - a.parcel.amountDue);
  const cards = scored.slice(0, limit).map(({ parcel: p, score, factors, reasons, yearsBehind }, i): LeadCardData => {
    const { verdict, reason, actionable } = verdictFor(score, p.bankruptcy);
    const badges: LeadCardData["badges"] = [
      { label: `${yearsBehind}y delinquent`, tone: yearsBehind >= 5 ? "bad" : "warn" },
    ];
    if (p.absentee) badges.push({ label: "Absentee owner", tone: "neutral" });
    if (p.saleNoticeDate) badges.push({ label: "Sale notice", tone: "bad" });
    return {
      source: "taxdefault",
      id: p.id,
      sourceLabel: "Tax-default parcel",
      rank: i + 1,
      score,
      investability: score,
      isActionable: actionable,
      verdict,
      verdictReason: reason,
      name: p.situsAddress || `Parcel ${p.parcel}`,
      subtitle: `${p.situsCity ? `${p.situsCity}, ` : ""}${p.countyLabel}`,
      idText: `APN ${p.parcel} · ${usd(p.amountDue)} owed`,
      scoreLabel: "Owner-distress score",
      reasons: reasons.join("; "),
      factors,
      facts: [
        { label: "Owed", value: usd(p.amountDue) },
        { label: "Value", value: p.value ? `${usd(p.value)} assessed` : "Not published" },
        { label: "Tax years", value: p.taxYears.join(", ") || "—" },
        ...(p.ownerName ? [{ label: "Owner", value: p.ownerName }] : []),
        ...(p.mailingAddress ? [{ label: "Mailing", value: p.mailingAddress }] : []),
        ...(p.defaultDate ? [{ label: "Defaulted", value: p.defaultDate }] : []),
        ...(p.saleNoticeDate ? [{ label: "Sale notice", value: p.saleNoticeDate }] : []),
        ...(p.landUse ? [{ label: "Land use", value: p.landUse }] : []),
        { label: "Parcel", value: p.parcel },
      ],
      badges,
      link: { href: p.sourceUrl, label: `Open the ${p.countyLabel} dataset` },
      imageColor: "#6b3f1f",
    };
  });

  const book: TaxDefaultBook = {
    syncedAt: file.syncedAt,
    counties: Object.entries(file.counties).map(([id, c]) => ({
      id,
      label: c.label,
      parcels: c.parcels,
      ...(c.error ? { error: c.error } : {}),
    })),
    total: file.parcels.length,
    cards,
  };
  memo = { mtimeKey: key, book };
  return book;
}
