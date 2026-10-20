import { readJson } from "../web/store";
import { INVENTORY_FILE } from "../sources/marketplaces/sync";
import { scoreBizSale } from "../sources/marketplaces/score";
import { HOSTS } from "../sources/marketplaces/hosts";
import type { MarketplaceInventoryFile } from "../sources/marketplaces/types";
import { usd } from "./format";
import type { LeadCardData } from "./types";

export interface BizSaleBook {
  syncedAt: string | null;
  active: number;
  cards: LeadCardData[];
}

export function loadBizSaleBook(limit = 200): BizSaleBook {
  const file = readJson<MarketplaceInventoryFile | null>(INVENTORY_FILE, null);
  if (!file) return { syncedAt: null, active: 0, cards: [] };

  const forSale = file.listings.filter((l) => l.status === "active" || l.status === "under-contract");
  const scored = forSale.map((l) => scoreBizSale(l)).sort((a, b) => b.score - a.score);

  const cards = scored.slice(0, limit).map(({ listing: l, score, factors, reasons, verdict, verdictReason, isActionable, badges, multiple }, i): LeadCardData => {
    const hostLabel = HOSTS[l.host].label;
    const factRows: LeadCardData["facts"] = [
      { label: "True price", value: l.truePrice != null ? usd(l.truePrice) : "—" },
      { label: "Annual earnings", value: l.annualEarnings != null ? usd(l.annualEarnings) : "—" },
      { label: "Multiple", value: multiple != null ? `${multiple.toFixed(2)}×` : "—" },
      { label: "Trend", value: `${l.trendSource}/${l.trendDirection}` },
      { label: "Factors known", value: `${l.factorsKnown} of 7` },
      { label: "Model", value: l.modelClass ?? (l.monetizationTypes.join(", ") || "—") },
      { label: "Age", value: l.siteAgeMonths != null ? `${Math.round(l.siteAgeMonths / 12)} yr` : "—" },
      { label: "Owner hours", value: l.ownerHoursPerWeek != null ? `${l.ownerHoursPerWeek}/wk` : "—" },
      { label: "Detail", value: l.detailScraped ? "Scraped" : "Index only" },
      { label: "Verified", value: l.verifiedFinancials ? "Yes" : "No" },
    ];
    // Never include lastSeenAt in facts (hash stability).

    const cardBadges: LeadCardData["badges"] = [
      { label: l.status === "under-contract" ? "Under offer" : "For sale", tone: l.status === "under-contract" ? "warn" : "good" },
      { label: `${l.factorsKnown}/7 factors`, tone: "neutral" },
      ...badges,
    ];

    return {
      source: "bizsale",
      id: l.id,
      sourceLabel: "Business for sale",
      rank: i + 1,
      score,
      investability: score,
      isActionable,
      verdict,
      verdictReason,
      name: l.title,
      subtitle: `${hostLabel}${l.modelClass ? ` · ${l.modelClass}` : ""}`,
      idText: `${l.listingId} · ${hostLabel}`,
      scoreLabel: `${l.factorsKnown} of 7 factors known`,
      reasons: reasons.join("; "),
      factors,
      facts: factRows,
      badges: cardBadges,
      link: { href: l.url, label: `View on ${hostLabel}` },
      imageColor: l.host === "empireflippers" ? "#1a5f4a" : "#2c4a6e",
      factorsKnown: l.factorsKnown,
    };
  });

  return {
    syncedAt: file.syncedAt,
    active: forSale.length,
    cards,
  };
}
