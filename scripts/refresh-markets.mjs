#!/usr/bin/env node
/**
 * Refreshes app/lib/data/redfin-metro-snapshot.json from Redfin's Data Center
 * metro tracker.
 *
 * The app serves this snapshot instantly on a cold start and swaps in live rows
 * once the background refresh lands, so keeping it current is what makes the
 * first page view accurate. Redfin republishes weekly.
 *
 * Runs in plain Node — no Next, no render context — which is why it costs ~4s
 * and ~75MB here versus ~500MB inside the server.
 *
 *   npm run refresh:markets
 *   npm run refresh:markets -- --dry-run
 */

import { createGunzip } from "zlib";
import { Readable } from "stream";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "app/lib/data/redfin-metro-snapshot.json");

const REDFIN_URL =
  "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/redfin_metro_market_tracker.tsv000.gz";

/** Must stay in sync with METRO_CONFIGS in app/lib/metros.ts. */
const TARGETS = {
  "Cleveland, OH metro area": "cleveland-oh",
  "Indianapolis, IN metro area": "indianapolis-in",
  "Memphis, TN metro area": "memphis-tn",
  "Tampa, FL metro area": "tampa-fl",
  "Austin, TX metro area": "austin-tx",
};

const stripQuotes = (v) => {
  if (!v) return "";
  const t = v.trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
};

const parseNum = (v) => {
  const s = stripQuotes(v);
  if (!s || s === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

async function fetchLatestRows() {
  const res = await fetch(REDFIN_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Redfin download failed: HTTP ${res.status}`);
  }

  const wanted = new Set(Object.keys(TARGETS));
  const best = {};
  let headers = null;
  let carry = "";

  const consume = (line) => {
    if (!headers) {
      headers = line.split("\t").map(stripQuotes);
      return;
    }
    let hits = false;
    for (const region of wanted) {
      if (line.includes(region)) {
        hits = true;
        break;
      }
    }
    if (!hits) return;

    const cols = line.split("\t");
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] ?? "";

    const region = stripQuotes(row.REGION);
    if (!wanted.has(region)) return;
    if (stripQuotes(row.PROPERTY_TYPE) !== "All Residential") return;
    if (stripQuotes(row.IS_SEASONALLY_ADJUSTED) === "true") return;

    const begin = stripQuotes(row.PERIOD_BEGIN);
    if (best[region] && begin <= best[region].periodBegin) return;

    const medianPpsf = parseNum(row.MEDIAN_PPSF);
    const ppsfYoY = parseNum(row.MEDIAN_PPSF_YOY);
    if (medianPpsf == null || ppsfYoY == null) return;

    best[region] = {
      region,
      medianPpsf,
      ppsfYoY,
      medianDaysOnMarket: Math.round(parseNum(row.MEDIAN_DOM) ?? 30),
      homesSold: Math.round(parseNum(row.HOMES_SOLD) ?? 0),
      medianSalePrice: parseNum(row.MEDIAN_SALE_PRICE),
      periodBegin: begin,
    };
  };

  // Chunk iteration, not per-line — same reason as the app-side adapter.
  for await (const chunk of Readable.fromWeb(res.body).pipe(createGunzip())) {
    const text = carry + chunk.toString("utf8");
    const lines = text.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  if (carry) consume(carry);

  return best;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const started = Date.now();

  console.log("Refreshing Redfin metro snapshot ...");
  const best = await fetchLatestRows();

  const missing = Object.keys(TARGETS).filter((r) => !best[r]);
  if (missing.length) {
    throw new Error(`no rows found for: ${missing.join(", ")}`);
  }

  const metros = {};
  let periodBegin = "";
  for (const [region, id] of Object.entries(TARGETS)) {
    metros[id] = best[region];
    if (best[region].periodBegin > periodBegin) periodBegin = best[region].periodBegin;
  }

  const previous = JSON.parse(readFileSync(OUT, "utf8"));
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    source: REDFIN_URL,
    periodBegin,
    metros,
  };

  for (const [id, m] of Object.entries(metros)) {
    const was = previous.metros?.[id]?.medianPpsf;
    const delta =
      typeof was === "number" ? ` (was $${was.toFixed(1)})` : "";
    console.log(
      `  ${id.padEnd(16)} $${m.medianPpsf.toFixed(1)}/sqft  ${(m.ppsfYoY * 100).toFixed(1)}% YoY  DOM ${m.medianDaysOnMarket}${delta}`,
    );
  }

  if (previous.periodBegin === periodBegin) {
    console.log(`\nRedfin has not published past ${periodBegin} yet.`);
  }

  if (dryRun) {
    console.log("\n--dry-run: snapshot not written.");
    return;
  }

  writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(
    `\nWrote ${OUT.replace(ROOT + "/", "")} — period ${periodBegin}, ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main().catch((err) => {
  console.error(`\nrefresh:markets failed — snapshot left unchanged.\n${err.message}`);
  process.exit(1);
});
