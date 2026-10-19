// Small HTML helpers shared by the web sources. Regex-level on purpose: the
// pages we read are server-rendered, and this keeps the dependency list empty.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Visible text: scripts/styles dropped, block tags become line breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

/** All JSON-LD nodes, flattened through @graph and arrays. Bad blocks are skipped. */
export function extractJsonLd(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const flatten = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(flatten);
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      nodes.push(obj);
      if (obj["@graph"]) flatten(obj["@graph"]);
    }
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      flatten(JSON.parse(m[1].trim()));
    } catch {
      // Hand-written JSON-LD is often invalid; one bad block shouldn't sink the page.
    }
  }
  return nodes;
}

export function jsonLdTypes(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

/** Absolute hrefs with their link text. */
export function extractLinks(html: string, baseUrl: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      out.push({
        href: new URL(decodeEntities(m[1]), baseUrl).toString(),
        text: htmlToText(m[2]).replace(/\n/g, " "),
      });
    } catch {
      // Malformed href (javascript:, broken encoding) — skip.
    }
  }
  return out;
}

const EMAIL_RE = /(?:mailto:)?([a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi;
const JUNK_LOCAL = new Set(["example", "email", "name", "user", "test", "noreply", "no-reply", "donotreply"]);
const JUNK_DOMAINS = new Set(["example.com", "domain.com", "email.com", "yoursite.com", "sentry.io", "wixpress.com", "schema.org"]);

/**
 * Contact emails from mailto links and bare addresses, junk filtered out.
 * Same rules as Heavenya's extractContactEmail.js.
 */
export function extractEmails(html: string): string[] {
  const found = new Set<string>();
  for (const m of decodeEntities(html).matchAll(EMAIL_RE)) {
    const email = m[1].toLowerCase().replace(/\.$/, "");
    const [local, domain] = email.split("@");
    if (JUNK_LOCAL.has(local) || JUNK_DOMAINS.has(domain)) continue;
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(domain)) continue; // image@2x.png
    found.add(email);
  }
  return [...found];
}

/** "$1,234,567" → 1234567; anything unparseable → null. */
export function parseMoney(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)\s*([km])?/i);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.toLowerCase() === "m" ? 1e6 : m[2]?.toLowerCase() === "k" ? 1e3 : 1);
  return Number.isFinite(n) ? n : null;
}
