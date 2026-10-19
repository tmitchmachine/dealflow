// License-file snapshots and diffs. The state boards publish only "now", so
// change history only exists if we keep each download's state ourselves: a
// license going inactive, an office moving, an owner leaving.

import { gunzipSync, gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isFirm, type DcaRecord } from "@/niches/accounting/parse";
import type { CslbData } from "@/niches/hvac/parse";
import { contentHash } from "../web/store";

export type SnapshotNiche = "accounting" | "hvac";

export interface SnapshotRecord {
  /** Name */
  n: string;
  /** Status */
  s: string;
  /** Address key (accounting) */
  a?: string;
  /** Current principal keys, "titles@since" (hvac) */
  p?: string[];
}

export interface Snapshot {
  niche: SnapshotNiche;
  takenAt: string;
  sourceHash: string;
  records: Record<string, SnapshotRecord>;
}

export interface Change {
  license: string;
  name: string;
  kind: "new" | "gone" | "status" | "moved" | "principal-left" | "principal-joined";
  detail: string;
}

export const SNAPSHOT_DIR = path.resolve(process.cwd(), "data/snapshots");

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "?");

export function snapshotAccounting(records: DcaRecord[], takenAt: string): Snapshot {
  const out: Record<string, SnapshotRecord> = {};
  for (const r of records) {
    if (!isFirm(r)) continue;
    out[r.licenseNumber] = {
      n: r.name,
      s: r.status,
      a: `${r.addressLine1} ${r.city}`.toLowerCase().replace(/\s+/g, " ").trim(),
    };
  }
  return { niche: "accounting", takenAt, sourceHash: contentHash(out), records: out };
}

export function snapshotHvac(data: CslbData, takenAt: string): Snapshot {
  const out: Record<string, SnapshotRecord> = {};
  for (const l of data.licenses) {
    out[l.licenseNumber] = {
      n: l.businessName,
      s: l.status,
      p: (data.principalsByLicense.get(l.licenseNumber) ?? [])
        .map((p) => `${[...p.titles].sort().join("+")}@${isoDay(p.since)}`)
        .sort(),
    };
  }
  return { niche: "hvac", takenAt, sourceHash: contentHash(out), records: out };
}

export function diffSnapshots(prev: Snapshot, curr: Snapshot): Change[] {
  const changes: Change[] = [];
  for (const [license, now] of Object.entries(curr.records)) {
    const was = prev.records[license];
    if (!was) {
      changes.push({ license, name: now.n, kind: "new", detail: `New license (${now.s})` });
      continue;
    }
    if (was.s !== now.s) {
      changes.push({ license, name: now.n, kind: "status", detail: `Status ${was.s} → ${now.s}` });
    }
    if (was.a && now.a && was.a !== now.a) {
      changes.push({ license, name: now.n, kind: "moved", detail: "Office address changed" });
    }
    const before = new Set(was.p ?? []);
    const after = new Set(now.p ?? []);
    for (const key of before) {
      if (!after.has(key)) changes.push({ license, name: now.n, kind: "principal-left", detail: `Officer left (${key.split("@")[0]})` });
    }
    for (const key of after) {
      if (!before.has(key)) changes.push({ license, name: now.n, kind: "principal-joined", detail: `Officer joined (${key.split("@")[0]})` });
    }
  }
  for (const [license, was] of Object.entries(prev.records)) {
    if (!curr.records[license]) changes.push({ license, name: was.n, kind: "gone", detail: "License no longer in the state file" });
  }
  return changes;
}

const dirFor = (niche: SnapshotNiche) => path.join(SNAPSHOT_DIR, niche);

/** Saved snapshot dates for a niche, oldest first. */
export function listSnapshots(niche: SnapshotNiche): string[] {
  const dir = dirFor(niche);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort();
}

export function readSnapshot(niche: SnapshotNiche, date: string): Snapshot {
  return JSON.parse(gunzipSync(readFileSync(path.join(dirFor(niche), `${date}.json.gz`))).toString("utf8"));
}

/**
 * Save `snap` unless the newest saved snapshot has the same content.
 * Returns the previous snapshot (to diff against) and whether a file was written.
 */
export function saveSnapshot(snap: Snapshot): { previous: Snapshot | null; written: boolean } {
  const dates = listSnapshots(snap.niche).filter((d) => d !== snap.takenAt);
  const previous = dates.length ? readSnapshot(snap.niche, dates[dates.length - 1]) : null;
  if (previous?.sourceHash === snap.sourceHash) return { previous, written: false };
  mkdirSync(dirFor(snap.niche), { recursive: true });
  writeFileSync(path.join(dirFor(snap.niche), `${snap.takenAt}.json.gz`), gzipSync(JSON.stringify(snap)));
  return { previous, written: true };
}
