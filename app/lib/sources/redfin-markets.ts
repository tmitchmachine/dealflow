// Live metro market stats from Redfin's free Data Center bulk download.
// https://www.redfin.com/news/data-center/
//
// Streams the gzipped metro tracker TSV and keeps only our scan metros —
// never loads the full ~106MB file into a string. Results are cached for a
// week (Redfin refreshes weekly). Falls back to the committed snapshot JSON
// when the download fails.
//
// A cold pull costs ~6s and ~500MB resident, so it never runs inside a render
// and never runs twice at once — see scheduleRefresh() below.

import { createGunzip } from "zlib";
import { Readable } from "stream";
import { after } from "next/server";
import { METRO_CONFIGS } from "../metros";
import snapshot from "../data/redfin-metro-snapshot.json";

const REDFIN_METRO_TSV_URL =
  "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/redfin_metro_market_tracker.tsv000.gz";

/** A healthy pull finishes in ~6s; well past that the socket is wedged. */
const REDFIN_TIMEOUT_MS = 90_000;

export interface RedfinMetroRow {
  region: string;
  medianPpsf: number;
  ppsfYoY: number;
  medianDaysOnMarket: number;
  homesSold: number;
  medianSalePrice: number | null;
  periodBegin: string;
}

function stripQuotes(value: string | undefined): string {
  if (!value) return "";
  const t = value.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

function parseNum(value: string | undefined): number | null {
  const v = stripQuotes(value);
  if (!v || v === "NA") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parse one TSV line into a field map given the header. */
function parseRow(line: string, headers: string[]): Record<string, string> {
  const cols = line.split("\t");
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = cols[i] ?? "";
  }
  return row;
}

async function streamLatestMetroRows(): Promise<Record<string, RedfinMetroRow>> {
  const regionToId = Object.fromEntries(
    METRO_CONFIGS.map((m) => [m.redfinRegion, m.id]),
  );
  const wanted = new Set(Object.keys(regionToId));

  // Must stay uncached at the fetch layer. Next's fetch cache clones the
  // response and base64-buffers the whole body to store it, and the data cache
  // rejects entries over 2MB anyway — so a 106MB body is pure overhead there.
  // The parsed five rows are cached in-process instead (see scheduleRefresh).
  // Bound the read too: a half-open S3 socket previously stalled this until
  // undici gave up with UND_ERR_SOCKET.
  const res = await fetch(REDFIN_METRO_TSV_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(REDFIN_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Redfin download failed: HTTP ${res.status}`);
  }

  // Node streams from the Web ReadableStream (Next/Node runtime).
  const nodeBody = Readable.fromWeb(res.body as import("stream/web").ReadableStream);

  let headers: string[] | null = null;
  const best: Record<string, RedfinMetroRow & { _begin: string }> = {};

  const consume = (line: string) => {
    if (!headers) {
      headers = line.split("\t").map(stripQuotes);
      return;
    }
    // Cheap pre-filter before full parse: skip lines that can't match a target.
    let hits = false;
    for (const region of wanted) {
      if (line.includes(region)) {
        hits = true;
        break;
      }
    }
    if (!hits) return;

    const row = parseRow(line, headers);
    const region = stripQuotes(row.REGION);
    if (!wanted.has(region)) return;
    if (stripQuotes(row.PROPERTY_TYPE) !== "All Residential") return;
    if (stripQuotes(row.IS_SEASONALLY_ADJUSTED) === "true") return;

    const begin = stripQuotes(row.PERIOD_BEGIN);
    const prev = best[region];
    if (prev && begin <= prev._begin) return;

    const medianPpsf = parseNum(row.MEDIAN_PPSF);
    const ppsfYoY = parseNum(row.MEDIAN_PPSF_YOY);
    const dom = parseNum(row.MEDIAN_DOM);
    const sold = parseNum(row.HOMES_SOLD);
    if (medianPpsf == null || ppsfYoY == null) return;

    best[region] = {
      region,
      medianPpsf,
      ppsfYoY,
      medianDaysOnMarket: Math.round(dom ?? 30),
      homesSold: Math.round(sold ?? 0),
      medianSalePrice: parseNum(row.MEDIAN_SALE_PRICE),
      periodBegin: begin,
      _begin: begin,
    };
  };

  // Iterate gunzip *chunks*, not lines. readline would yield ~580k times, and
  // every one of those awaits is instrumented when this runs inside a Server
  // Component render — enough to push the dev server past 2GB and wedge it.
  // Chunks cut the await count ~100x and cost the same to parse.
  let carry = "";
  for await (const chunk of nodeBody.pipe(createGunzip())) {
    const text = carry + (chunk as Buffer).toString("utf8");
    const lines = text.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  if (carry) consume(carry);

  const out: Record<string, RedfinMetroRow> = {};
  for (const [region, row] of Object.entries(best)) {
    const id = regionToId[region];
    if (!id) continue;
    out[id] = {
      region: row.region,
      medianPpsf: row.medianPpsf,
      ppsfYoY: row.ppsfYoY,
      medianDaysOnMarket: row.medianDaysOnMarket,
      homesSold: row.homesSold,
      medianSalePrice: row.medianSalePrice,
      periodBegin: row.periodBegin,
    };
  }

  if (Object.keys(out).length === 0) {
    throw new Error("Redfin stream produced no matching metro rows");
  }
  return out;
}

function snapshotAsRows(): Record<string, RedfinMetroRow> {
  const out: Record<string, RedfinMetroRow> = {};
  for (const [id, m] of Object.entries(snapshot.metros)) {
    out[id] = {
      region: m.region,
      medianPpsf: m.medianPpsf,
      ppsfYoY: m.ppsfYoY,
      medianDaysOnMarket: m.medianDaysOnMarket,
      homesSold: m.homesSold,
      medianSalePrice: m.medianSalePrice ?? null,
      periodBegin: m.periodBegin ?? snapshot.periodBegin,
    };
  }
  return out;
}

/**
 * The parse must never run inside a Server Component render.
 *
 * React's dev-only owner-stack machinery (`fakeJSXCallSite` /
 * `initializeDebugChunk`) does work proportional to the await chain a render
 * accumulates. Awaiting this ~20k-chunk stream inside the page render turned a
 * 9s parse into a 208s render — measured; the identical call from a route
 * handler took 6.4s, and production builds never run that code path at all.
 *
 * So requests are never blocked on the download. They are served from the
 * in-process rows if warm, otherwise from the committed snapshot, and the
 * refresh runs detached. The next request picks up the live numbers.
 */
const REFRESH_MS = 60 * 60 * 24 * 7 * 1000;

/** `next build` prerenders many pages; none of them should download 106MB. */
const PHASE_PRODUCTION_BUILD = "phase-production-build";

let cached: { rows: Record<string, RedfinMetroRow>; at: number } | null = null;
let refreshing: Promise<void> | null = null;

/** Single-flight: concurrent callers share one download. */
function warm(): Promise<void> {
  refreshing ??= streamLatestMetroRows()
    .then((rows) => {
      cached = { rows, at: Date.now() };
    })
    .catch((err) => {
      console.warn(
        "[redfin] refresh failed, staying on snapshot:",
        err instanceof Error ? err.message : err,
      );
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function scheduleRefresh(): void {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;
  // On Vercel each invocation is a short-lived instance, so warmed rows are
  // never read back, and a 106MB download inside `after` can outlive the
  // function's duration limit. The committed snapshot is the source of truth
  // there — keep it current with `npm run refresh:markets`.
  if (process.env.VERCEL) return;
  if (refreshing) return;
  if (cached && Date.now() - cached.at < REFRESH_MS) return;

  // `after` runs the download once the response is flushed, so it lands
  // outside the render — which is the whole point (see the note above) — and,
  // unlike a bare detached fetch, it does not mark the route dynamic.
  try {
    after(warm);
  } catch {
    // Not in a request scope (scripts, tests): just detach it.
    void warm();
  }
}

/**
 * Latest All-Residential metro stats for our scan markets.
 * Prefers a live Redfin Data Center pull; falls back to the committed snapshot.
 */
export async function fetchRedfinMetroStats(): Promise<{
  rows: Record<string, RedfinMetroRow>;
  live: boolean;
  periodBegin: string;
}> {
  scheduleRefresh();

  if (cached) {
    const rows = cached.rows;
    const periodBegin =
      Object.values(rows)[0]?.periodBegin ?? snapshot.periodBegin;
    return { rows, live: true, periodBegin };
  }

  return {
    rows: snapshotAsRows(),
    live: false,
    periodBegin: snapshot.periodBegin,
  };
}
