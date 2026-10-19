import { readJson } from "@/src/web/store";
import { LISTINGS_FILE } from "@/src/sources/brokers/sync";
import { compMultiple, scorePractice } from "@/src/sources/brokers/score";
import { BROKER_LABEL, type PracticeListingsFile } from "@/src/sources/brokers/types";
import { usd } from "../format";
import type { Verdict } from "../opportunity";
import type { LeadCardData } from "./types";

export interface PracticeBook {
  syncedAt: string | null;
  listed: number;
  sold: number;
  compMultiple: number | null;
  compCount: number;
  cards: LeadCardData[];
}

function verdictFor(score: number, underContract: boolean): { verdict: Verdict; reason: string; actionable: boolean } {
  if (underContract) return { verdict: "watch", reason: "Under contract — backup offers only.", actionable: false };
  if (score >= 65) return { verdict: "pursue", reason: "Priced at or below sold comps with a solid profile.", actionable: true };
  if (score >= 50) return { verdict: "negotiate", reason: "Workable; push the price toward sold comps.", actionable: true };
  if (score >= 35) return { verdict: "watch", reason: "Priced above comps or thin on details.", actionable: false };
  return { verdict: "pass", reason: "Priced well above comps.", actionable: false };
}

export function loadPracticeBook(): PracticeBook {
  const file = readJson<PracticeListingsFile | null>(LISTINGS_FILE, null);
  if (!file) return { syncedAt: null, listed: 0, sold: 0, compMultiple: null, compCount: 0, cards: [] };

  const { multiple: comps, count } = compMultiple(file.listings);
  const forSale = file.listings.filter((l) => l.status !== "sold");
  const scored = forSale.map((l) => scorePractice(l, comps)).sort((a, b) => b.score - a.score);

  const cards = scored.map(({ listing: l, score, factors, reasons }, i): LeadCardData => {
    const { verdict, reason, actionable } = verdictFor(score, l.status === "under-contract");
    const badges: LeadCardData["badges"] = [{ label: "For sale", tone: "good" }];
    if (l.status === "under-contract") badges.push({ label: "Under contract", tone: "warn" });
    if (/retir/i.test(l.reasonForSelling)) badges.push({ label: "Retiring", tone: "neutral" });
    return {
      source: "practice",
      id: l.id,
      sourceLabel: "Practice for sale",
      rank: i + 1,
      score,
      investability: score,
      isActionable: actionable,
      verdict,
      verdictReason: reason,
      name: l.title,
      subtitle: `${l.location} · ${l.practiceType || "Accounting practice"}`,
      idText: `Listing ${l.listingId} · ${BROKER_LABEL[l.broker]}`,
      scoreLabel: comps ? `Price vs ${count} sold comps (${comps.toFixed(2)}× median)` : "Broker listing score",
      reasons: reasons.join("; "),
      factors,
      facts: [
        { label: "Revenue", value: l.revenue ? usd(l.revenue) : "—" },
        { label: "Asking", value: l.askingPrice ? usd(l.askingPrice) : "—" },
        { label: "Multiple", value: l.multiple ? `${l.multiple.toFixed(2)}× revenue` : "—" },
        { label: "Status", value: l.status === "under-contract" ? "Under contract" : "Available" },
        ...(l.establishedYear ? [{ label: "Established", value: String(l.establishedYear) }] : []),
        ...(l.reasonForSelling ? [{ label: "Reason", value: l.reasonForSelling }] : []),
        { label: "Updated", value: l.lastmod?.slice(0, 10) ?? "—" },
        ...(l.summary ? [{ label: "Summary", value: `${l.summary}…` }] : []),
      ],
      badges,
      link: { href: l.url, label: `View listing at ${BROKER_LABEL[l.broker]}` },
      imageColor: "#3a3a7a",
    };
  });

  return {
    syncedAt: file.syncedAt,
    listed: forSale.length,
    sold: file.listings.length - forSale.length,
    compMultiple: comps,
    compCount: count,
    cards,
  };
}
