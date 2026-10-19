// Minimal robots.txt support: the group for our user agent (else `*`),
// longest-match Allow/Disallow. Cached per origin for the process.

interface Rule {
  allow: boolean;
  path: string;
}

const cache = new Map<string, Promise<Rule[]>>();

/** Parse the rules that apply to `userAgent` (falls back to the `*` group). */
export function parseRobots(text: string, userAgent: string): Rule[] {
  const ua = userAgent.toLowerCase();
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      // An empty Disallow allows everything; it adds no rule.
      if (current && value) current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }

  const token = ua.split("/")[0];
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  return (specific ?? groups.find((g) => g.agents.includes("*")))?.rules ?? [];
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith("$");
  const pattern = rulePath
    .replace(/\$$/, "")
    .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

export function isPathAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

export async function isAllowedByRobots(
  url: string,
  userAgent: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const u = new URL(url);
  let rules = cache.get(u.origin);
  if (!rules) {
    rules = fetchImpl(`${u.origin}/robots.txt`, { headers: { "User-Agent": userAgent } })
      .then(async (res) => {
        // A missing robots.txt allows everything; a 401/403 on it means "stay out".
        if (res.status === 401 || res.status === 403) return [{ allow: false, path: "/" }];
        if (!res.ok) return [];
        return parseRobots(await res.text(), userAgent);
      })
      .catch(() => [] as Rule[]);
    cache.set(u.origin, rules);
  }
  return isPathAllowed(await rules, u.pathname + u.search);
}
