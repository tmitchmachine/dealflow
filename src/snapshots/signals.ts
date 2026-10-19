// Per-firm change signals the desk shows on cards: snapshot diffs, plus HVAC
// owner/officer departures, which CSLB's personnel file already dates.

import path from "node:path";
import type { CslbData } from "@/niches/hvac/parse";
import { SOURCES_DIR, readJson, writeJson } from "../web/store";
import type { Change, SnapshotNiche } from "./snapshot";

export interface FirmSignal {
  kind: Change["kind"] | "departure" | "deceased";
  label: string;
  /** When it happened, or the snapshot date it was first seen. */
  date: string;
}

export interface SignalsFile {
  generatedAt: string;
  /** Snapshot dates the diff compares; baseline is null until a second download. */
  baseline: string | null;
  latest: string;
  firms: Record<string, FirmSignal[]>;
}

export const signalsFile = (niche: SnapshotNiche) => path.join(SOURCES_DIR, `signals-${niche}.json`);

export function readSignals(niche: SnapshotNiche): SignalsFile | null {
  return readJson<SignalsFile | null>(signalsFile(niche), null);
}

/** Departure window: older exits say nothing about a sale today. */
export const DEPARTURE_MONTHS = 24;

const monthYear = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function departureSignals(data: CslbData, asOf: Date): Record<string, FirmSignal[]> {
  const since = new Date(asOf);
  since.setUTCMonth(since.getUTCMonth() - DEPARTURE_MONTHS);
  const out: Record<string, FirmSignal[]> = {};
  for (const [license, gone] of data.departuresByLicense) {
    for (const p of gone) {
      const when = p.leftOn;
      if (!when || when < since || when > asOf) continue;
      const titles = [...new Set(p.titles.filter((t) => t && t !== "Deceased"))].join("/") || "Officer";
      (out[license] ??= []).push(
        p.deceased
          ? { kind: "deceased", label: `${titles} deceased (${monthYear(when)})`, date: when.toISOString().slice(0, 10) }
          : { kind: "departure", label: `${titles} left ${monthYear(when)}`, date: when.toISOString().slice(0, 10) },
      );
    }
  }
  return out;
}

export function writeSignals(
  niche: SnapshotNiche,
  baseline: string | null,
  latest: string,
  changes: Change[],
  extra: Record<string, FirmSignal[]> = {},
): SignalsFile {
  const firms: Record<string, FirmSignal[]> = {};
  for (const c of changes) {
    // A brand-new license on a second download is noise for a sell-side index.
    if (c.kind === "new" || c.kind === "principal-joined") continue;
    (firms[c.license] ??= []).push({ kind: c.kind, label: c.detail, date: latest });
  }
  for (const [license, list] of Object.entries(extra)) (firms[license] ??= []).push(...list);
  const file: SignalsFile = { generatedAt: new Date().toISOString(), baseline, latest, firms };
  writeJson(signalsFile(niche), file);
  return file;
}
