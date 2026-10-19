import { type ListQuery, type PointColumns, pointColumns } from "@/core/niche";
import { buildFirms } from "./firms";
import type { DcaRecord } from "./parse";
import { type FactorId, scoreFirm } from "./score";

export type ListOptions = ListQuery;

/** One CSV row. Column names are what buyers see; the `pts_*` factor columns come last. */
export type ListRow = {
  rank: number;
  score: number;
  reasons: string;
  firm_name: string;
  entity_type: string;
  license_number: string;
  registered_year: number | "";
  years_registered: number | "";
  status: string;
  address: string;
  city: string;
  county: string;
  zip: string;
  cpa_match: "high" | "none";
  matched_cpas: number;
  oldest_cpa_license_year: number | "";
  newest_cpa_license_year: number | "";
  verify_at: string;
} & PointColumns<FactorId>;

export interface ListResult {
  rows: ListRow[];
  /** Firms that passed the filters, before the limit. */
  considered: number;
  /** How many of those have a high-confidence CPA match. */
  withCpaMatch: number;
}

export function buildList(
  records: DcaRecord[],
  options: ListOptions,
): ListResult {
  const counties = new Set(options.counties.map((c) => c.trim().toLowerCase()));
  const scored = buildFirms(records)
    .filter(
      (f) => counties.size === 0 || counties.has(f.record.county.toLowerCase()),
    )
    .filter((f) => options.includeInactive || f.record.status === "Active")
    .map((firm) => ({ firm, ...scoreFirm(firm, options.asOf) }))
    .filter((s) => (s.firmYears ?? 0) >= options.minYears)
    // Highest score first; ties go to the older registration, then license number for stability.
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.firmYears ?? 0) - (a.firmYears ?? 0) ||
        a.firm.record.licenseNumber.localeCompare(b.firm.record.licenseNumber),
    );

  const rows = scored.slice(0, options.limit).map((s, i): ListRow => {
    const r = s.firm.record;
    return {
      rank: i + 1,
      score: s.score,
      reasons: s.reasons.join("; "),
      firm_name: r.name,
      entity_type: r.licenseType,
      license_number: r.licenseNumber,
      registered_year: r.issueDate?.getUTCFullYear() ?? "",
      years_registered: s.firmYears ?? "",
      status: r.status,
      address: [r.addressLine1, r.addressLine2].filter(Boolean).join(", "),
      city: r.city,
      county: r.county,
      zip: r.zip.slice(0, 5),
      cpa_match: s.principalYears.length > 0 ? "high" : "none",
      matched_cpas: s.principalYears.length,
      oldest_cpa_license_year: s.principalYears[0] ?? "",
      newest_cpa_license_year: s.principalYears.at(-1) ?? "",
      verify_at: "https://search.dca.ca.gov",
      ...pointColumns(s.factors),
    };
  });

  return {
    rows,
    considered: scored.length,
    withCpaMatch: scored.filter((s) => s.principalYears.length > 0).length,
  };
}
