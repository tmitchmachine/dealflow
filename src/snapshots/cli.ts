import { parseArgs } from "node:util";
import { accounting } from "@/niches/accounting";
import { hvac } from "@/niches/hvac";
import { departureSignals, writeSignals } from "./signals";
import { diffSnapshots, saveSnapshot, snapshotAccounting, snapshotHvac, type Change } from "./snapshot";

const USAGE = `Usage: npm run snapshot -- [--data-dir data/raw]

Run after downloading fresh state files. Saves a compact snapshot of each
license file to data/snapshots/<niche>/<date>.json.gz (skipped when nothing
changed), diffs it against the previous one, and writes the per-firm signals
the desk shows to data/sources/signals-<niche>.json.`;

const { values } = parseArgs({
  options: {
    "data-dir": { type: "string", default: "data/raw" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const asOf = new Date();
// Local calendar date: a download made Sunday evening in California is Sunday's.
const today = asOf.toLocaleDateString("en-CA");

function summarize(changes: Change[]): string {
  const counts = new Map<string, number>();
  for (const c of changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${n} ${k}`).join(", ") || "no changes";
}

function run(label: string, snap: ReturnType<typeof snapshotAccounting>, extra = {}) {
  const { previous, written } = saveSnapshot(snap);
  const changes = previous ? diffSnapshots(previous, snap) : [];
  const signals = writeSignals(snap.niche, previous?.takenAt ?? null, snap.takenAt, changes, extra);
  console.log(
    `${label}: ${Object.keys(snap.records).length.toLocaleString()} licenses; snapshot ${written ? "saved" : "unchanged"}; ` +
      (previous ? `vs ${previous.takenAt}: ${summarize(changes)}` : "first snapshot (baseline — diffs start with the next download)") +
      `; ${Object.keys(signals.firms).length.toLocaleString()} firms with signals.`,
  );
}

run("Accounting firms", snapshotAccounting(accounting.load(values["data-dir"]), today));
const cslb = hvac.load(values["data-dir"]);
run("HVAC licenses", snapshotHvac(cslb, today), departureSignals(cslb, asOf));
