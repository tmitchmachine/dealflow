#!/usr/bin/env node
/**
 * Verifies live data adapters without a full Jest/Vitest harness.
 *
 * 1) Streams Redfin Data Center metro tracker and asserts our five metros.
 * 2) Boots assertions against a running Next server (optional — pass --http).
 * 3) Confirms there is no demo listing catalog (real listings only).
 *
 * Usage:
 *   node scripts/verify-data.mjs
 *   node scripts/verify-data.mjs --http http://127.0.0.1:3000
 */

import { createGunzip } from "zlib";
import { createInterface } from "readline";
import { Readable } from "stream";
import { existsSync, readFileSync } from "fs";
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

function verifyNoMockCatalog() {
  console.log("\n[3] Real listings only (no demo catalog)");
  const src = readFileSync(join(ROOT, "app/lib/data.ts"), "utf8");
  assert(!src.includes("MOCK_LISTINGS"), "MOCK_LISTINGS removed");
  assert(!src.includes('source: "mock"'), "no mock-tagged listings");
  assert(src.includes("hasRentCastKey"), "RentCast key gate present");
  assert(src.includes("rentcastLiveEnabled"), "RentCast opt-in gate present");
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
    html.includes("Redfin Data Center"),
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
    html.includes("RENTCAST") || html.includes("live RentCast"),
    "listing source status visible",
  );

  // Old demo ids must not resolve now that only real listings are served.
  const demo = await fetch(`${baseUrl}/property/cle-1842-clark`);
  assert(demo.status === 404, `GET /property/cle-1842-clark → HTTP ${demo.status} (demo id gone)`);
}

/** Synced web sources, when present: shape checks that catch a broker template change or a county schema change. */
function verifyWebSources() {
  console.log("\n[6] Synced web sources (data/sources/)");
  const read = (name) => {
    const file = join(ROOT, "data/sources", name);
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  };

  const brokers = read("practice-listings.json");
  if (!brokers) console.log("  – practice-listings.json not synced (npm run sync:brokers)");
  else {
    const forSale = brokers.listings.filter((l) => l.status !== "sold");
    assert(forSale.length > 0, `${forSale.length} practices for sale`);
    const priced = forSale.filter((l) => l.revenue && l.askingPrice).length;
    assert(priced / forSale.length > 0.8, `${priced}/${forSale.length} listings parsed revenue + asking price`);
    assert(brokers.listings.some((l) => l.status === "sold"), "sold comps present");
  }

  const tax = read("tax-default.json");
  if (!tax) console.log("  – tax-default.json not synced (npm run sync:taxdefault)");
  else {
    for (const [id, c] of Object.entries(tax.counties)) {
      assert(!c.error && c.parcels > 0, `${id}: ${c.parcels} parcels${c.error ? ` (${c.error})` : ""}`);
    }
    assert(tax.parcels.every((p) => p.amountDue >= 500 && p.parcel), "every parcel has an id and owes $500+");
  }

  for (const niche of ["accounting", "hvac"]) {
    const e = read(`enrichment-${niche}.json`);
    if (!e) continue;
    const firms = Object.values(e.firms);
    assert(firms.every((f) => f.licenseNumber && f.checkedAt), `enrichment-${niche}: ${firms.length} firms well-formed`);
  }
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
  verifyNoMockCatalog();
  verifyRentCastAdapterShape();
  verifyWebSources();
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
