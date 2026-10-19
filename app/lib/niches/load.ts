import path from "node:path";
import { listFromCache } from "@/core/out-cache";
import type { Card, ListQuery, NicheInfo } from "@/core/niche";
import { getNiche } from "@/niches/index";
import type { Verdict } from "../opportunity";
import type { NicheBook, NicheFirmCardData } from "./types";

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
function toFirm(niche: NicheInfo, card: Card): NicheFirmCardData {
  const nicheId = niche.id as "accounting" | "hvac";
  const { verdict, verdictReason, isActionable } = verdictFor(
    niche.stage,
    card.score,
  );
  return {
    nicheId,
    nicheLabel: niche.label,
    stage: niche.stage,
    rank: card.rank,
    score: card.score,
    investability: card.score,
    isActionable,
    verdict,
    verdictReason,
    name: card.name,
    subtitle: card.subtitle,
    licenseNumber: card.licenseNumber,
    reasons: card.reasons,
    factors: [],
    facts: card.facts,
    verifyUrl: card.verifyUrl,
    imageColor: IMAGE_COLORS[nicheId],
  };
}

const DEFAULT_QUERY: Omit<ListQuery, "asOf"> = {
  counties: ["Orange"],
  limit: 200,
  minYears: 0,
  includeInactive: false,
};

function queryKey(
  nicheId: string,
  query: ListQuery,
): string {
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
    // Freeze asOf so cache keys stay stable within a day of scoring.
    asOf: query.asOf ?? new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`),
  };
  const key = queryKey(nicheId, fullQuery);
  const hit = bookByKey.get(key);
  if (hit) return hit;

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
  return book;
}

export function loadNicheBooks(
  query: Partial<ListQuery> = {},
): { accounting: NicheBook; hvac: NicheBook } {
  return {
    accounting: loadNicheBook("accounting", query),
    hvac: loadNicheBook("hvac", query),
  };
}
