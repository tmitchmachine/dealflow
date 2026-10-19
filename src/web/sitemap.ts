import { decodeEntities } from "./html";

export interface SitemapEntry {
  url: string;
  lastmod: string | null;
}

/** <url> entries (or <sitemap> entries of an index) with their lastmod. */
export function parseSitemap(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  for (const m of xml.matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/gi)) {
    const loc = m[1].match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    const lastmod = m[1].match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i)?.[1] ?? null;
    out.push({ url: decodeEntities(loc), lastmod });
  }
  return out;
}
