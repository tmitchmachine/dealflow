// Enrichment file shape and reader, kept free of crawler imports so the app
// can read it without bundling DNS/fetch code.

import path from "node:path";
import { SOURCES_DIR, readJson } from "../web/store";
import type { PlaceMatch } from "./places";
import type { SiteFacts } from "./site";

export type EnrichNiche = "accounting" | "hvac";

export interface FirmEnrichment {
  licenseNumber: string;
  name: string;
  checkedAt: string;
  /** How the website was found. */
  method: "places" | "guess" | "none";
  place: PlaceMatch | null;
  website: string | null;
  site: SiteFacts | null;
  error?: string;
  /** Digest of the extracted facts, to tell real changes from re-checks. */
  hash: string;
}

export interface EnrichmentFile {
  updatedAt: string;
  firms: Record<string, FirmEnrichment>;
}

export const enrichmentFile = (niche: EnrichNiche) => path.join(SOURCES_DIR, `enrichment-${niche}.json`);

export function readEnrichment(niche: EnrichNiche): EnrichmentFile {
  return readJson<EnrichmentFile>(enrichmentFile(niche), { updatedAt: "", firms: {} });
}

