import { yearsBetween } from "@/core/dates";
import { type FactorDef, type FactorPoints, scoreFactors } from "@/core/niche";
import {
  type CslbLicense,
  type CslbPrincipal,
  HVAC_CLASSIFICATION,
} from "./parse";

/**
 * Points per signal; they sum to 100. Every signal is a license or tenure fact used as a
 * proxy. None measures anyone's age or intent to sell, and the reasons state only facts.
 *
 * Workers' comp earns no points: California requires HVAC (C-20) license holders to carry
 * it whether or not they have employees, so 99.6% of active C-20 licenses show it and it
 * says nothing about size. It is still shown as a column.
 */
export const WEIGHTS = {
  /** Scales linearly with years since the license was issued, full at FULL_YEARS. */
  licenseYears: 35,
  /** Scales with the longest-serving current owner/officer's tenure, full at FULL_YEARS. */
  principalTenure: 25,
  /** Every current owner/officer joined at least RECENT_PRINCIPAL_YEARS ago. */
  noRecentPrincipal: 15,
  /** Corporation, LLC, partnership or joint venture; a sole owner earns soleEntity. */
  multiOwnerEntity: 10,
  soleEntity: 5,
  /** Licensed for more than C-20 alone. */
  extraClassifications: 5,
  clearStatus: 10,
} as const;

export const FULL_YEARS = 30;
export const RECENT_PRINCIPAL_YEARS = 15;

/**
 * The published methodology, built from WEIGHTS. The README's methodology table repeats
 * these rows, and a test keeps the two in step. The order is also the order the points
 * are added in, which keeps every score exactly what it was before factors were published.
 */
export const FACTORS = [
  {
    id: "license_years",
    label: "Years licensed",
    max: WEIGHTS.licenseYears,
    rule: `Years since the CSLB license was issued; full points at ${FULL_YEARS} years`,
  },
  {
    id: "entity",
    label: "Business type",
    max: WEIGHTS.multiOwnerEntity,
    rule: `Corporation, LLC, partnership or joint venture ${WEIGHTS.multiOwnerEntity}; sole owner ${WEIGHTS.soleEntity}`,
  },
  {
    id: "extra_classifications",
    label: "Extra trades",
    max: WEIGHTS.extraClassifications,
    rule: "Licensed for more than C-20 alone",
  },
  {
    id: "status",
    label: "License status",
    max: WEIGHTS.clearStatus,
    rule: "CLEAR license status",
  },
  {
    id: "owner_tenure",
    label: "Owner tenure",
    max: WEIGHTS.principalTenure,
    rule: `Longest-serving current owner/officer's years on the license; full points at ${FULL_YEARS} years`,
  },
  {
    id: "no_recent_owner",
    label: "No recent owner",
    max: WEIGHTS.noRecentPrincipal,
    rule: `Every current owner/officer joined ${RECENT_PRINCIPAL_YEARS}+ years ago`,
  },
] as const satisfies readonly FactorDef[];

export type FactorId = (typeof FACTORS)[number]["id"];

export interface HvacScored {
  score: number;
  /** Whole-number points for every factor, in FACTORS order; they add up to `score`. */
  factors: FactorPoints<FactorId>[];
  reasons: string[];
  licenseYears: number | null;
  /** Join years of current owners/officers, earliest first. */
  principalYears: number[];
}

export function scoreLicense(
  license: CslbLicense,
  principals: CslbPrincipal[],
  asOf: Date,
): HvacScored {
  const raw: Record<FactorId, number> = {
    license_years: 0,
    entity: 0,
    extra_classifications: 0,
    status: 0,
    owner_tenure: 0,
    no_recent_owner: 0,
  };
  const reasons: string[] = [];

  let licenseYears: number | null = null;
  if (license.issueDate) {
    licenseYears = Math.max(0, yearsBetween(license.issueDate, asOf));
    raw.license_years =
      WEIGHTS.licenseYears * Math.min(1, licenseYears / FULL_YEARS);
    reasons.push(
      `CSLB license issued ${license.issueDate.getUTCFullYear()} (${licenseYears} years)`,
    );
  }

  raw.entity =
    license.businessType === "Sole Owner"
      ? WEIGHTS.soleEntity
      : WEIGHTS.multiOwnerEntity;
  reasons.push(license.businessType || "Unknown business type");

  const extra = license.classifications.filter(
    (c) => c !== HVAC_CLASSIFICATION,
  );
  if (extra.length > 0) {
    raw.extra_classifications = WEIGHTS.extraClassifications;
    reasons.push(`Also licensed for ${extra.join(", ")}`);
  }

  if (license.status === "CLEAR") raw.status = WEIGHTS.clearStatus;
  reasons.push(`License status: ${license.status}`);

  const joined = principals
    .map((p) => p.since)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (joined.length > 0) {
    const tenures = joined.map((d) => yearsBetween(d, asOf));
    raw.owner_tenure =
      WEIGHTS.principalTenure * Math.min(1, tenures[0] / FULL_YEARS);
    if (Math.min(...tenures) >= RECENT_PRINCIPAL_YEARS) {
      raw.no_recent_owner = WEIGHTS.noRecentPrincipal;
    }
    const years = joined.map((d) => d.getUTCFullYear());
    reasons.push(
      years.length === 1
        ? `Current owner/officer on the license since ${years[0]}`
        : `Current owners/officers on the license since ${years.join(", ")}`,
    );
  }

  return {
    ...scoreFactors(FACTORS, raw),
    reasons,
    licenseYears,
    principalYears: joined.map((d) => d.getUTCFullYear()),
  };
}
