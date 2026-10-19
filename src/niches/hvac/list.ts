import { type ListQuery, type PointColumns, pointColumns } from "@/core/niche";
import type { CslbData } from "./parse";
import { type FactorId, scoreLicense } from "./score";

/** One CSV row. Column names are what buyers see; the `pts_*` factor columns come last. */
export type HvacRow = {
  rank: number;
  score: number;
  reasons: string;
  business_name: string;
  business_type: string;
  license_number: string;
  classifications: string;
  issued_year: number | "";
  years_licensed: number | "";
  status: string;
  phone: string;
  address: string;
  city: string;
  county: string;
  zip: string;
  workers_comp: string;
  current_principals: number;
  longest_principal_since: number | "";
  newest_principal_since: number | "";
  verify_at: string;
} & PointColumns<FactorId>;

export interface HvacListResult {
  rows: HvacRow[];
  /** Licenses that passed the filters, before the limit. */
  considered: number;
  /** How many of those have current owner/officer records. */
  withPrincipals: number;
}

export const CSLB_LICENSE_CHECK =
  "https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx";

export function buildHvacList(
  data: CslbData,
  query: ListQuery,
): HvacListResult {
  const counties = new Set(query.counties.map((c) => c.trim().toLowerCase()));
  const scored = data.licenses
    .filter((l) => counties.size === 0 || counties.has(l.county.toLowerCase()))
    .filter((l) => query.includeInactive || l.status === "CLEAR")
    .map((license) => {
      const principals =
        data.principalsByLicense.get(license.licenseNumber) ?? [];
      return { license, ...scoreLicense(license, principals, query.asOf) };
    })
    .filter((s) => (s.licenseYears ?? 0) >= query.minYears)
    // Highest score first; ties go to the older license, then license number for stability.
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.licenseYears ?? 0) - (a.licenseYears ?? 0) ||
        a.license.licenseNumber.localeCompare(b.license.licenseNumber),
    );

  const rows = scored.slice(0, query.limit).map((s, i): HvacRow => {
    const l = s.license;
    return {
      rank: i + 1,
      score: s.score,
      reasons: s.reasons.join("; "),
      business_name: l.businessName,
      business_type: l.businessType,
      license_number: l.licenseNumber,
      classifications: l.classifications.join(", "),
      issued_year: l.issueDate?.getUTCFullYear() ?? "",
      years_licensed: s.licenseYears ?? "",
      status: l.status,
      phone: l.phone,
      address: l.address,
      city: l.city,
      county: l.county,
      zip: l.zip.slice(0, 5),
      workers_comp: l.workersComp,
      current_principals: s.principalYears.length,
      longest_principal_since: s.principalYears[0] ?? "",
      newest_principal_since: s.principalYears.at(-1) ?? "",
      verify_at: CSLB_LICENSE_CHECK,
      ...pointColumns(s.factors),
    };
  });

  return {
    rows,
    considered: scored.length,
    withPrincipals: scored.filter((s) => s.principalYears.length > 0).length,
  };
}
