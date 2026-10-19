// Polite HTTP for every web source: one identified user agent, a timeout,
// robots.txt, and per-host pacing with 429/503 backoff. Ported from
// Heavenya's crawler (functions/crawled/fetchPages.js + hostFetchGate.js).

import { isAllowedByRobots } from "./robots";

export const USER_AGENT =
  "DealflowBot/0.1 (+https://github.com/tmitchmachine/dealflow; off-market deal index)";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MIN_GAP_MS = 1_500;
const MAX_JITTER_MS = 500;
const MAX_RETRIES = 3;

export interface FetchOptions {
  timeoutMs?: number;
  /** Minimum gap between request starts on the same host. */
  minGapMs?: number;
  /** Skip the robots.txt check (APIs that publish no robots file for their data paths). */
  skipRobots?: boolean;
  headers?: Record<string, string>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export interface FetchedPage {
  url: string;
  status: number;
  body: string;
}

export class FetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const hostState = new Map<string, { chain: Promise<unknown>; lastStartedAt: number }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

/** Serialize requests per host with a minimum gap plus jitter between starts. */
export function withHostGate<T>(url: string, minGapMs: number, fn: () => Promise<T>): Promise<T> {
  const host = hostOf(url);
  let state = hostState.get(host);
  if (!state) {
    state = { chain: Promise.resolve(), lastStartedAt: 0 };
    hostState.set(host, state);
  }
  const s = state;
  const run = s.chain.then(async () => {
    const gap = minGapMs + Math.floor(Math.random() * (MAX_JITTER_MS + 1));
    const wait = s.lastStartedAt + gap - Date.now();
    if (wait > 0) await sleep(wait);
    s.lastStartedAt = Date.now();
    return fn();
  });
  // Keep the chain alive even if this call rejects.
  s.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Seconds from a Retry-After header, else exponential backoff. */
function backoffMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 120) * 1000;
  return 2 ** attempt * 2_000;
}

/**
 * GET a URL as text. Throws FetchError on robots disallow, non-2xx, or timeout.
 */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!options.skipRobots && !(await isAllowedByRobots(url, USER_AGENT, fetchImpl))) {
    throw new FetchError(`robots.txt disallows ${url}`);
  }
  const minGapMs = options.minGapMs ?? DEFAULT_MIN_GAP_MS;

  for (let attempt = 0; ; attempt += 1) {
    const res = await withHostGate(url, minGapMs, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        return await fetchImpl(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "User-Agent": USER_AGENT,
            ...options.headers,
          },
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") throw new FetchError(`Timed out fetching ${url}`);
        throw new FetchError(`${(err as Error).message} fetching ${url}`);
      } finally {
        clearTimeout(timer);
      }
    });

    if ((res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
      await sleep(backoffMs(res, attempt));
      continue;
    }
    if (!res.ok) throw new FetchError(`HTTP ${res.status} fetching ${url}`, res.status);
    return { url: res.url || url, status: res.status, body: await res.text() };
  }
}
