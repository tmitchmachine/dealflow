// Firm-name tokens for matching a license record to a web page or a Places hit.

/** Words that say what kind of entity a firm is, not which firm it is. */
const ENTITY_WORDS = new Set(
  (
    "a an and the of co company corp corporation inc incorporated llc llp lp pc pllc ltd limited " +
    "professional accountancy accountants accountant accounting acc accty cpa cpas certified public " +
    "partnership partners group associates assoc services service tax taxes financial firm prof " +
    "heating air conditioning hvac mechanical plumbing contractors contractor construction systems"
  ).split(" "),
);

export function nameTokens(name: string): string[] {
  return [
    ...new Set(
      name
        .toLowerCase()
        .replace(/&/g, " ")
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1 && !ENTITY_WORDS.has(t)),
    ),
  ];
}

/** Share of `wanted` tokens found in `found` (0–1). */
export function tokenOverlap(wanted: string[], found: string[] | string): number {
  if (wanted.length === 0) return 0;
  const hay = typeof found === "string" ? ` ${found.toLowerCase().replace(/[^a-z0-9]+/g, " ")} ` : null;
  const set = Array.isArray(found) ? new Set(found) : null;
  const hits = wanted.filter((t) => (set ? set.has(t) : hay!.includes(` ${t} `))).length;
  return hits / wanted.length;
}

/**
 * Likely domains for a firm, most specific first: "smithjones.com",
 * "smithjonescpa.com", "smithjonescpas.com", then single-name stems with a
 * suffix — the surname too, since "Kathleen C Harney" trades as harneycpa.com.
 * Capped at seven.
 */
export function guessDomains(name: string, kind: "accounting" | "hvac"): string[] {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return [];
  const suffixes = kind === "accounting" ? ["", "cpa", "cpas"] : ["", "hvac", "air"];
  const single = new Set([tokens[0], tokens[tokens.length - 1]]);
  const stems = [tokens.slice(0, 3).join(""), tokens.slice(0, 2).join(""), tokens[tokens.length - 1], tokens[0]];
  const out: string[] = [];
  for (const stem of [...new Set(stems)]) {
    // A lone common word ("pacific.com") is never this firm's site.
    const lone = single.has(stem) && tokens.length > 1;
    for (const suffix of suffixes) {
      if (lone && suffix === "") continue;
      if (stem.length + suffix.length < 6) continue;
      out.push(`${stem}${suffix}.com`);
    }
  }
  return [...new Set(out)].slice(0, 7);
}
