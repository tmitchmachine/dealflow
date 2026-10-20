// Firecrawl scrape client: robots before every URL, injectable fetch + budgets.

import { isAllowedByRobots } from "./robots";
import { USER_AGENT } from "./fetch";
import type { DailyBudget } from "./store";

const FIRECRAWL_API = "https://api.firecrawl.dev/v1/scrape";

export interface FirecrawlResult {
  url: string;
  markdown: string;
  links: string[];
  statusCode?: number;
}

export interface FirecrawlScrapeOptions {
  /** Wait for JS (ms). */
  waitFor?: number;
  formats?: string[];
  /** Spend this budget before calling (detail or discovery). */
  budget?: DailyBudget;
  /** Cost units to charge the budget (default 1). */
  cost?: number;
  fetchImpl?: typeof fetch;
  robotsCheck?: typeof isAllowedByRobots;
  apiKey?: string;
  log?: (msg: string) => void;
}

export class FirecrawlError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function normalizeLinks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && "url" in x ? String((x as { url: unknown }).url) : ""))
    .filter(Boolean);
}

/**
 * Scrape one URL via Firecrawl. Returns null when robots deny or budget is
 * exhausted (no API call). Throws on API/network errors after a call was made.
 */
export async function firecrawlScrape(
  url: string,
  opts: FirecrawlScrapeOptions = {},
): Promise<FirecrawlResult | null> {
  const log = opts.log ?? (() => {});
  const fetchImpl = opts.fetchImpl ?? fetch;
  const robotsCheck = opts.robotsCheck ?? isAllowedByRobots;
  const cost = opts.cost ?? 1;

  const allowed = await robotsCheck(url, USER_AGENT, fetchImpl);
  if (!allowed) {
    log(`robots deny ${url}`);
    return null;
  }

  if (opts.budget && !opts.budget.canSpend(cost)) {
    log(`budget exhausted; skip ${url}`);
    return null;
  }

  const apiKey = opts.apiKey ?? process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new FirecrawlError("FIRECRAWL_API_KEY is not set");

  const res = await fetchImpl(FIRECRAWL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      url,
      formats: opts.formats ?? ["markdown", "links"],
      waitFor: opts.waitFor ?? 3000,
      onlyMainContent: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new FirecrawlError(`Firecrawl ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  // Charge only after a successful response so 429/5xx do not burn the daily cap.
  if (opts.budget) opts.budget.spend(cost);

  const body = (await res.json()) as {
    success?: boolean;
    data?: { markdown?: string; links?: unknown; metadata?: { statusCode?: number } };
    markdown?: string;
    links?: unknown;
  };

  const data = body.data ?? body;
  const markdown = data.markdown ?? "";
  const links = normalizeLinks(data.links);
  const statusCode = body.data?.metadata?.statusCode;

  return { url, markdown, links, statusCode };
}
