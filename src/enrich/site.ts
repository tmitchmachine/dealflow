// Read a firm's own website, HTTP-first like Heavenya's resolveEventsPage.js:
// homepage plus at most two about/team/services pages, no rendering.

import { promises as dns } from "node:dns";
import { fetchText } from "../web/fetch";
import { extractEmails, extractJsonLd, extractLinks, extractTitle, htmlToText, jsonLdTypes } from "../web/html";
import { nameTokens, tokenOverlap } from "./names";

export interface SiteFacts {
  url: string;
  title: string;
  emails: string[];
  /** Phrases that suggest the owner is leaving or the firm is changing hands. */
  successionSignals: string[];
  services: string[];
  /** Latest "© 2019"-style year on the site; an old one suggests a neglected site. */
  copyrightYear: number | null;
  foundingYear: number | null;
  employees: number | null;
  parked: boolean;
  pagesRead: number;
}

const FOLLOW_RE = /\b(about|team|our[- ]people|staff|professionals|who we are|services|leadership|partners)\b/i;

const SUCCESSION_PATTERNS: [RegExp, string][] = [
  [/\bretir(?:e|es|ed|ing|ement)\b/i, "mentions retirement"],
  [/\b(?:joined|joining|joins) forces\b/i, "joined forces"],
  [/\bmerg(?:ed|er|ing) with\b/i, "merged with another firm"],
  [/\b(?:now|has become) (?:a )?part of\b/i, "now part of another firm"],
  [/\bacquired by\b/i, "acquired by another firm"],
  [/\bsuccession\b/i, "mentions succession"],
  [/\b(?:has|have) (?:sold|transitioned) (?:the|our|my) (?:practice|firm|business)\b/i, "practice sold"],
];

const SERVICE_WORDS: Record<"accounting" | "hvac", [RegExp, string][]> = {
  accounting: [
    [/\btax (?:preparation|planning|returns?)\b/i, "tax"],
    [/\bbookkeeping\b/i, "bookkeeping"],
    [/\bpayroll\b/i, "payroll"],
    [/\baudit(?:s|ing)?\b/i, "audit"],
    [/\b(?:advisory|consulting)\b/i, "advisory"],
    [/\b(?:fractional |outsourced )?cfo\b/i, "CFO"],
    [/\bestate (?:planning|tax)|trusts?\b/i, "estate & trust"],
    [/\bquickbooks\b/i, "QuickBooks"],
  ],
  hvac: [
    [/\binstall(?:ation|s)?\b/i, "installation"],
    [/\brepair\b/i, "repair"],
    [/\bmaintenance (?:plan|agreement|program)s?\b/i, "maintenance plans"],
    [/\bcommercial\b/i, "commercial"],
    [/\bheat pumps?\b/i, "heat pumps"],
    [/\bduct(?:work| cleaning)\b/i, "ducts"],
  ],
};

export async function domainResolves(domain: string): Promise<boolean> {
  try {
    const addrs = await dns.resolve4(domain);
    return addrs.length > 0;
  } catch {
    return false;
  }
}

function siteFacts(url: string, pages: { html: string; text: string }[], kind: "accounting" | "hvac"): SiteFacts {
  const allText = pages.map((p) => p.text).join("\n");
  const host = new URL(url).hostname.replace(/^www\./, "");
  const emails = [...new Set(pages.flatMap((p) => extractEmails(p.html)))]
    // Same-domain addresses first; they're the firm's own.
    .sort((a, b) => Number(b.endsWith(host)) - Number(a.endsWith(host)))
    .slice(0, 5);

  let foundingYear: number | null = null;
  let employees: number | null = null;
  for (const node of pages.flatMap((p) => extractJsonLd(p.html))) {
    if (!jsonLdTypes(node).some((t) => /Organization|LocalBusiness|AccountingService|HVACBusiness|ProfessionalService/.test(t))) continue;
    const founded = String(node.foundingDate ?? "").match(/(?:19|20)\d{2}/)?.[0];
    if (founded) foundingYear = Number(founded);
    const emp = node.numberOfEmployees as { value?: number } | number | undefined;
    const n = typeof emp === "number" ? emp : emp?.value;
    if (typeof n === "number") employees = n;
  }

  const years = [...allText.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));

  return {
    url,
    title: extractTitle(pages[0]?.html ?? ""),
    emails,
    successionSignals: SUCCESSION_PATTERNS.filter(([re]) => re.test(allText)).map(([, label]) => label),
    services: SERVICE_WORDS[kind].filter(([re]) => re.test(allText)).map(([, label]) => label),
    copyrightYear: years.length ? Math.max(...years) : null,
    foundingYear,
    employees,
    parked: /\b(?:domain (?:is )?for sale|buy this domain|this domain (?:name )?(?:may be|is) for sale|parked (?:free|domain))\b/i.test(allText),
    pagesRead: pages.length,
  };
}

/** Read homepage + up to two same-site about/team/services pages. */
export async function probeSite(url: string, kind: "accounting" | "hvac"): Promise<SiteFacts> {
  const home = await fetchText(url, { timeoutMs: 15_000 });
  const pages = [{ html: home.body, text: htmlToText(home.body) }];
  const host = new URL(home.url).hostname;
  const follow = extractLinks(home.body, home.url)
    .filter((l) => new URL(l.href).hostname === host && FOLLOW_RE.test(`${l.text} ${new URL(l.href).pathname}`))
    .map((l) => l.href.split("#")[0]);
  for (const next of [...new Set(follow)].slice(0, 2)) {
    try {
      const page = await fetchText(next, { timeoutMs: 15_000 });
      pages.push({ html: page.body, text: htmlToText(page.body) });
    } catch {
      // A broken about page shouldn't lose what the homepage gave us.
    }
  }
  return siteFacts(home.url, pages, kind);
}

/**
 * Is this page this firm's site? The firm's distinctive name tokens must
 * appear, plus its city or license number — a same-name firm in another
 * state fails the second check.
 */
export function pageMatchesFirm(
  text: string,
  firm: { name: string; city: string; licenseNumber: string },
): boolean {
  const tokens = nameTokens(firm.name);
  const needed = tokens.length <= 1 ? 1 : 0.6;
  if (tokenOverlap(tokens, text) < needed) return false;
  const lower = text.toLowerCase();
  return (
    (firm.city.length > 2 && lower.includes(firm.city.toLowerCase())) ||
    (firm.licenseNumber.length > 3 && lower.includes(firm.licenseNumber))
  );
}

/**
 * No-key fallback: try a handful of guessed domains, keep the first whose
 * homepage verifiably belongs to this firm.
 */
export async function guessWebsite(
  domains: string[],
  firm: { name: string; city: string; licenseNumber: string },
): Promise<string | null> {
  for (const domain of domains) {
    if (!(await domainResolves(domain))) continue;
    // Small-firm sites still sometimes lack a working certificate.
    for (const scheme of ["https", "http"]) {
      try {
        const page = await fetchText(`${scheme}://${domain}/`, { timeoutMs: 10_000, minGapMs: 0 });
        if (pageMatchesFirm(htmlToText(page.body), firm)) return page.url;
        break;
      } catch {
        // Dead or blocked — try plain HTTP once, then the next guess.
      }
    }
  }
  return null;
}
