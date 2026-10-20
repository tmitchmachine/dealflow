import { statSync } from "node:fs";
import path from "node:path";
import { listFromCache } from "../core/out-cache";
import type { Card, ListQuery, NicheInfo } from "../core/niche";
import { getNiche } from "../niches/index";
import { enrichmentFile, readEnrichment, type EnrichmentFile } from "../enrich/store";
import { readSignals, signalsFile, type SignalsFile } from "../snapshots/signals";
import type { Verdict } from "./verdict";
import type { LeadCardData, NicheBook } from "./types";

const DATA_DIR = path.resolve(process.cwd(), "data/raw");
const OUT_DIR = path.resolve(process.cwd(), "out");

/** Parsed state files stay warm across requests in one Node process. */
const rawByNiche = new Map<string, unknown>();
/** Listed books keyed by niche + query fingerprint. */
const bookByKey = new Map<string, NicheBook>();

const IMAGE_COLORS: Record<"accounting" | "hvac", string> = {
  accounting: "#1f4d3a",
  hvac: "#2a4a5c",
};

function verdictFor(
  stage: "selling" | "comparison",
  score: number,
): { verdict: Verdict; verdictReason: string; isActionable: boolean } {
  if (stage === "comparison") {
    return {
      verdict: "watch",
      verdictReason: "Comparison index only — not for outreach.",
      isActionable: false,
    };
  }
  if (score >= 80) {
    return {
      verdict: "pursue",
      verdictReason: "High license-tenure score on the selling index.",
      isActionable: true,
    };
  }
  if (score >= 65) {
    return {
      verdict: "negotiate",
      verdictReason: "Solid tenure profile; dig into fit and price.",
      isActionable: true,
    };
  }
  if (score >= 50) {
    return {
      verdict: "watch",
      verdictReason: "Mid-pack tenure; watch or pass unless a strong angle.",
      isActionable: false,
    };
  }
  return {
    verdict: "pass",
    verdictReason: "Weak license-tenure profile for outreach.",
    isActionable: false,
  };
}

/** Desk payload: skip factor bars (reasons already explain the score). */
function toFirm(niche: NicheInfo, card: Card): LeadCardData {
  const nicheId = niche.id as "accounting" | "hvac";
  const { verdict, verdictReason, isActionable } = verdictFor(niche.stage, card.score);
  return {
    source: nicheId,
    id: card.licenseNumber,
    sourceLabel: niche.label,
    rank: card.rank,
    score: card.score,
    investability: card.score,
    isActionable,
    verdict,
    verdictReason,
    name: card.name,
    subtitle: card.subtitle,
    idText: `License #${card.licenseNumber} · rank ${card.rank}`,
    scoreLabel: "License-tenure score",
    reasons: card.reasons,
    factors: [],
    facts: card.facts,
    badges:
      niche.stage === "comparison"
        ? [{ label: "Comparison", tone: "neutral" }]
        : [{ label: "Selling index", tone: "good" }],
    link: { href: card.verifyUrl, label: `Verify license #${card.licenseNumber}` },
    imageColor: IMAGE_COLORS[nicheId],
  };
}

/** Re-read a source file only when it changes on disk. */
function byMtime<T>(file: string, read: () => T): () => T {
  let seen = -1;
  let value: T;
  return () => {
    let mtime = 0;
    try {
      mtime = statSync(file).mtimeMs;
    } catch {
      // Missing file reads as empty; the reader supplies its own fallback.
    }
    if (mtime !== seen) {
      seen = mtime;
      value = read();
    }
    return value;
  };
}

const overlays = {
  accounting: {
    enrichment: byMtime(enrichmentFile("accounting"), () => readEnrichment("accounting")),
    signals: byMtime(signalsFile("accounting"), () => readSignals("accounting")),
  },
  hvac: {
    enrichment: byMtime(enrichmentFile("hvac"), () => readEnrichment("hvac")),
    signals: byMtime(signalsFile("hvac"), () => readSignals("hvac")),
  },
};

const thisYear = () => new Date().getFullYear();

/**
 * Add what the web and the license diffs know about a firm: its website,
 * Google status, contact email, succession language, and license changes.
 * A firm Google lists as permanently closed is not a deal.
 */
function overlayFirm(
  firm: LeadCardData,
  enrichment: EnrichmentFile,
  signals: SignalsFile | null,
): LeadCardData {
  const e = enrichment.firms[firm.id];
  const changes = signals?.firms[firm.id] ?? [];
  if (!e && changes.length === 0) return firm;

  const facts = [...firm.facts];
  const badges = [...firm.badges];
  let { verdict, verdictReason, isActionable } = firm;

  if (e?.website)
    facts.push({
      label: "Website",
      value: e.website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    });
  if (e?.site?.emails.length)
    facts.push({ label: "Email", value: e.site.emails.slice(0, 2).join(", ") });
  if (e?.place) {
    const p = e.place;
    facts.push({
      label: "Google",
      value: [
        p.businessStatus === "OPERATIONAL"
          ? "Open"
          : p.businessStatus.replace(/_/g, " ").toLowerCase(),
        p.rating ? `${p.rating}★ (${p.reviews} reviews)` : `${p.reviews} reviews`,
      ].join(" · "),
    });
    if (p.businessStatus === "CLOSED_PERMANENTLY") {
      badges.push({ label: "Closed on Google", tone: "bad" });
      verdict = "pass";
      verdictReason = "Google lists this business as permanently closed.";
      isActionable = false;
    }
  }
  if (e?.site?.services.length)
    facts.push({ label: "Services", value: e.site.services.join(", ") });
  if (e?.site?.successionSignals.length) {
    badges.push({ label: "Succession signal", tone: "good" });
    facts.push({ label: "Site says", value: e.site.successionSignals.join("; ") });
  }
  if (e?.site?.copyrightYear && e.site.copyrightYear < thisYear() - 3) {
    badges.push({ label: `Site stale (©${e.site.copyrightYear})`, tone: "warn" });
  }
  if (e?.site?.parked) badges.push({ label: "Domain parked", tone: "bad" });

  for (const c of changes) {
    facts.push({
      label: c.kind === "status" || c.kind === "gone" ? "License change" : "Owner change",
      value: `${c.label} (${c.date})`,
    });
  }
  if (changes.some((c) => c.kind === "departure" || c.kind === "deceased" || c.kind === "principal-left")) {
    badges.push({ label: "Owner change", tone: "good" });
  }
  if (changes.some((c) => c.kind === "status" || c.kind === "gone")) {
    badges.push({ label: "License changed", tone: "warn" });
  }

  return { ...firm, facts, badges, verdict, verdictReason, isActionable };
}

function withOverlays(book: NicheBook): NicheBook {
  const o = overlays[book.nicheId];
  const enrichment = o.enrichment();
  const signals = o.signals();
  return { ...book, firms: book.firms.map((f) => overlayFirm(f, enrichment, signals)) };
}

const DEFAULT_QUERY: Omit<ListQuery, "asOf"> = {
  counties: ["Orange"],
  limit: 200,
  minYears: 0,
  includeInactive: false,
};

function queryKey(nicheId: string, query: ListQuery): string {
  return [
    nicheId,
    query.counties.join(","),
    query.limit,
    query.minYears,
    query.includeInactive ? "1" : "0",
  ].join("|");
}

function loadRaw(nicheId: string): unknown {
  if (rawByNiche.has(nicheId)) return rawByNiche.get(nicheId);
  const niche = getNiche(nicheId);
  const data = niche.load(DATA_DIR);
  rawByNiche.set(nicheId, data);
  return data;
}

/**
 * Load one niche book: prefer live `data/raw/` state files, else saved `out/*.csv`.
 * Raw parses and finished books are memoized in-process (CSLB parse is ~30s).
 */
export function loadNicheBook(
  nicheId: "accounting" | "hvac",
  query: Partial<ListQuery> = {},
): NicheBook {
  const niche = getNiche(nicheId);
  const fullQuery: ListQuery = {
    ...DEFAULT_QUERY,
    ...query,
    asOf: query.asOf ?? new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`),
  };
  const key = queryKey(nicheId, fullQuery);
  const hit = bookByKey.get(key);
  if (hit) return withOverlays(hit);

  let book: NicheBook;
  try {
    const data = loadRaw(nicheId);
    const { cards, considered, summary } = niche.list(data, fullQuery);
    book = {
      nicheId,
      label: niche.label,
      stage: niche.stage,
      disclaimer: niche.disclaimer,
      source: "raw",
      considered,
      summary,
      firms: cards.map((c) => toFirm(niche, c)),
    };
  } catch {
    const cached = listFromCache(niche, OUT_DIR, fullQuery);
    if (!cached) {
      book = {
        nicheId,
        label: niche.label,
        stage: niche.stage,
        disclaimer: niche.disclaimer,
        source: "cache",
        considered: 0,
        summary: "No raw data/raw files and no matching out/*.csv cache",
        firms: [],
      };
    } else {
      book = {
        nicheId,
        label: niche.label,
        stage: niche.stage,
        disclaimer: niche.disclaimer,
        source: "cache",
        considered: cached.considered,
        summary: cached.summary,
        firms: cached.cards.map((c) => toFirm(niche, c)),
      };
    }
  }

  bookByKey.set(key, book);
  return withOverlays(book);
}

export function loadNicheBooks(
  query: Partial<ListQuery> = {},
): { accounting: NicheBook; hvac: NicheBook } {
  return {
    accounting: loadNicheBook("accounting", query),
    hvac: loadNicheBook("hvac", query),
  };
}
