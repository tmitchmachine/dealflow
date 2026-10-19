#!/usr/bin/env node
/**
 * Verifies live data adapters without a full Jest/Vitest harness.
 *
 * 1) Streams Redfin Data Center metro tracker and asserts our five metros.
 * 2) Boots assertions against a running Next server (optional — pass --http).
 * 3) Confirms mock listing fallback when RENTCAST_API_KEY is unset.
 *
 * Usage:
 *   node scripts/verify-data.mjs
 *   node scripts/verify-data.mjs --http http://127.0.0.1:3000
 */

import { createGunzip } from "zlib";
import { createInterface } from "readline";
import { Readable } from "stream";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const REDFIN_URL =
  "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_market_tracker/redfin_metro_market_tracker.tsv000.gz";

const TARGETS = {
  "Cleveland, OH metro area": "cleveland-oh",
  "Indianapolis, IN metro area": "indianapolis-in",
  "Memphis, TN metro area": "memphis-tn",
  "Tampa, FL metro area": "tampa-fl",
  "Austin, TX metro area": "austin-tx",
};

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function stripQuotes(value) {
  if (!value) return "";
  const t = value.trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

function parseNum(value) {
  const v = stripQuotes(value);
  if (!v || v === "NA") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function verifyRedfinStream() {
  console.log("\n[1] Redfin Data Center metro tracker (live stream)");
  const res = await fetch(REDFIN_URL);
  assert(res.ok, `HTTP ${res.status} from Redfin S3`);
  assert(Boolean(res.body), "response has a body stream");

  const nodeBody = Readable.fromWeb(res.body);
  const rl = createInterface({ input: nodeBody.pipe(createGunzip()) });

  let headers = null;
  const best = {};
  const wanted = new Set(Object.keys(TARGETS));

  for await (const line of rl) {
    if (!headers) {
      headers = line.split("\t").map(stripQuotes);
      continue;
    }
    let hits = false;
    for (const region of wanted) {
      if (line.includes(region)) {
        hits = true;
        break;
      }
    }
    if (!hits) continue;

    const cols = line.split("\t");
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i] ?? "";

    const region = stripQuotes(row.REGION);
    if (!wanted.has(region)) continue;
    if (stripQuotes(row.PROPERTY_TYPE) !== "All Residential") continue;
    if (stripQuotes(row.IS_SEASONALLY_ADJUSTED) === "true") continue;

    const begin = stripQuotes(row.PERIOD_BEGIN);
    const prev = best[region];
    if (prev && begin <= prev.begin) continue;

    const medianPpsf = parseNum(row.MEDIAN_PPSF);
    const ppsfYoY = parseNum(row.MEDIAN_PPSF_YOY);
    const dom = parseNum(row.MEDIAN_DOM);
    const sold = parseNum(row.HOMES_SOLD);
    if (medianPpsf == null || ppsfYoY == null) continue;

    best[region] = {
      begin,
      medianPpsf,
      ppsfYoY,
      dom: Math.round(dom ?? 0),
      sold: Math.round(sold ?? 0),
    };
  }

  for (const [region, id] of Object.entries(TARGETS)) {
    const row = best[region];
    assert(Boolean(row), `${id}: found latest All Residential row`);
    if (!row) continue;
    assert(row.medianPpsf > 50 && row.medianPpsf < 1000, `${id}: medianPpsf=${row.medianPpsf} in sane range`);
    assert(row.ppsfYoY > -0.5 && row.ppsfYoY < 0.5, `${id}: ppsfYoY=${row.ppsfYoY} in sane range`);
    assert(row.dom > 0 && row.dom < 365, `${id}: DOM=${row.dom}`);
    assert(row.sold > 10, `${id}: homesSold=${row.sold}`);
    console.log(
      `      → ${id}: $${row.medianPpsf.toFixed(1)}/sqft, ${(row.ppsfYoY * 100).toFixed(1)}% YoY, DOM ${row.dom}, period ${row.begin}`,
    );
  }

  return best;
}

function verifySnapshot() {
  console.log("\n[2] Committed Redfin snapshot fallback");
  const snap = JSON.parse(
    readFileSync(join(ROOT, "app/lib/data/redfin-metro-snapshot.json"), "utf8"),
  );
  assert(Boolean(snap.periodBegin), `snapshot periodBegin=${snap.periodBegin}`);
  for (const id of Object.values(TARGETS)) {
    const m = snap.metros[id];
    assert(Boolean(m), `snapshot has ${id}`);
    assert(m.medianPpsf > 50, `${id} snapshot medianPpsf=${m.medianPpsf}`);
  }
}

function verifyMockCatalog() {
  console.log("\n[3] Mock listing catalog (fallback without API key)");
  const src = readFileSync(join(ROOT, "app/lib/data.ts"), "utf8");
  assert(src.includes("MOCK_LISTINGS"), "MOCK_LISTINGS still present");
  assert(src.includes("hasRentCastKey"), "RentCast key gate present");
  assert(src.includes("rentcastLiveEnabled"), "RentCast opt-in gate present");
  assert(src.includes('source: "mock"'), "mock listings source tagged");
  assert(
    process.env.RENTCAST_LIVE !== "1",
    "RENTCAST_LIVE is not 1 → mock path expected (a key alone spends no quota)",
  );
}

function verifyRentCastAdapterShape() {
  console.log("\n[4] RentCast adapter wiring");
  const src = readFileSync(join(ROOT, "app/lib/sources/rentcast.ts"), "utf8");
  assert(src.includes("api.rentcast.io/v1"), "RentCast base URL configured");
  assert(src.includes("/listings/sale"), "sale listings endpoint used");
  assert(src.includes("X-Api-Key"), "API key header set");
  assert(src.includes("LISTINGS_PER_METRO"), "per-metro limit configured");
}

async function verifyHttp(baseUrl) {
  console.log(`\n[5] HTTP smoke against ${baseUrl}`);
  const res = await fetch(baseUrl, {
    headers: { Accept: "text/html" },
  });
  assert(res.ok, `GET / → HTTP ${res.status}`);
  const html = await res.text();

  assert(
    html.includes("Redfin Data Center") || html.includes("demo listings"),
    "home page mentions data source",
  );
  assert(
    /167\.5|161\.1|154\.2|227\.5|215\.8/.test(html) ||
      html.includes("median $167") ||
      html.includes("live Redfin") ||
      html.includes("Redfin Data Center snapshot") ||
      html.includes("live Redfin Data Center"),
    "page payload reflects Redfin-derived market stats or live/snapshot label",
  );
  assert(
    html.includes("RENTCAST_API_KEY") || html.includes("live RentCast") || html.includes("demo listings"),
    "listing source status visible",
  );

  // Property detail from mock catalog should resolve.
  const detail = await fetch(`${baseUrl}/property/cle-1842-clark`);
  assert(detail.ok, `GET /property/cle-1842-clark → HTTP ${detail.status}`);
  const detailHtml = await detail.text();
  assert(detailHtml.includes("1842 Clark") || detailHtml.includes("Clark Ave"), "detail page shows address");
  assert(detailHtml.includes("Our value opinion") || detailHtml.includes("Independent value"), "detail page shows valuation");
}

async function main() {
  console.log("Dealflow — live property data verification");
  const httpIdx = process.argv.indexOf("--http");
  const httpBase =
    httpIdx >= 0
      ? process.argv[httpIdx + 1]
      : process.env.VERIFY_BASE_URL || null;

  await verifyRedfinStream();
  verifySnapshot();
  verifyMockCatalog();
  verifyRentCastAdapterShape();
  if (httpBase) {
    await verifyHttp(httpBase.replace(/\/$/, ""));
  } else {
    console.log("\n[5] HTTP smoke skipped (pass --http http://127.0.0.1:3000)");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
