import { yearsBetween } from "@/core/dates";
import { type FactorDef, type FactorPoints, scoreFactors } from "@/core/niche";
import type { Firm } from "./firms";
import { LICENSE_TYPES } from "./parse";

/**
 * Points per signal; they sum to 100. Every signal is a license-tenure or registration
 * fact used as a proxy. None measures anyone's age or intent to sell, and the reasons
 * shown to buyers state only the underlying facts.
 */
export const WEIGHTS = {
  /** Scales linearly with years since the firm registered, full at FULL_FIRM_YEARS. */
  firmYears: 40,
  /** CPA corporation or partnership; a registered firm name usually means a sole practice. */
  multiOwnerEntity: 15,
  soleEntity: 5,
  activeStatus: 10,
  /** Only on firms with a high-confidence CPA match (see `Firm.cpas`). */
  seniorPrincipal: 20,
  noRecentPrincipal: 15,
} as const;

export const FULL_FIRM_YEARS = 30;
export const SENIOR_PRINCIPAL_YEARS = 30;
export const RECENT_PRINCIPAL_YEARS = 15;

/**
 * The published methodology, built from WEIGHTS. The README's methodology table repeats
 * these rows, and a test keeps the two in step. The order is also the order the points
 * are added in, which keeps every score exactly what it was before factors were published.
 */
export const FACTORS = [
  {
    id: "firm_years",
    label: "Years registered",
    max: WEIGHTS.firmYears,
    rule: `Years since the firm registered with the Board; full points at ${FULL_FIRM_YEARS} years`,
  },
  {
    id: "entity",
    label: "Entity type",
    max: WEIGHTS.multiOwnerEntity,
    rule: `CPA corporation or partnership ${WEIGHTS.multiOwnerEntity}; registered firm name (typically a sole practice) ${WEIGHTS.soleEntity}`,
  },
  {
    id: "status",
    label: "License status",
    max: WEIGHTS.activeStatus,
    rule: "Active license",
  },
  {
    id: "senior_cpa",
    label: "Senior CPA",
    max: WEIGHTS.seniorPrincipal,
    rule: `A matched CPA licensed ${SENIOR_PRINCIPAL_YEARS}+ years (needs a high-confidence CPA match)`,
  },
  {
    id: "no_recent_cpa",
    label: "No recent CPA",
    max: WEIGHTS.noRecentPrincipal,
    rule: `Every matched CPA licensed ${RECENT_PRINCIPAL_YEARS}+ years (needs a high-confidence CPA match)`,
  },
] as const satisfies readonly FactorDef[];

export type FactorId = (typeof FACTORS)[number]["id"];

export interface Scored {
  score: number;
  /** Whole-number points for every factor, in FACTORS order; they add up to `score`. */
  factors: FactorPoints<FactorId>[];
  reasons: string[];
  firmYears: number | null;
  /** License years of the matched CPAs, oldest first. */
  principalYears: number[];
}

const ENTITY_LABEL: Record<string, string> = {
  [LICENSE_TYPES.corporation]: "CPA corporation",
  [LICENSE_TYPES.partnership]: "CPA partnership",
  [LICENSE_TYPES.fictitiousName]:
    "Registered firm name (typically a sole practice)",
};

export function scoreFirm(firm: Firm, asOf: Date): Scored {
  const { record } = firm;
  const raw: Record<FactorId, number> = {
    firm_years: 0,
    entity: 0,
    status: 0,
    senior_cpa: 0,
    no_recent_cpa: 0,
  };
  const reasons: string[] = [];

  let firmYears: number | null = null;
  if (record.issueDate) {
    firmYears = Math.max(0, yearsBetween(record.issueDate, asOf));
    raw.firm_years =
      WEIGHTS.firmYears * Math.min(1, firmYears / FULL_FIRM_YEARS);
    reasons.push(
      `Registered with the CA Board of Accountancy in ${record.issueDate.getUTCFullYear()} (${firmYears} years)`,
    );
  }

  const entity = ENTITY_LABEL[record.licenseType] ?? record.licenseType;
  raw.entity =
    record.licenseType === LICENSE_TYPES.fictitiousName
      ? WEIGHTS.soleEntity
      : WEIGHTS.multiOwnerEntity;
  reasons.push(entity);

  if (record.status === "Active") raw.status = WEIGHTS.activeStatus;
  reasons.push(`License status: ${record.status}`);

  const principalYears = firm.cpas
    .map((c) => c.issueDate)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (principalYears.length > 0) {
    const tenures = principalYears.map((d) => yearsBetween(d, asOf));
    if (tenures[0] >= SENIOR_PRINCIPAL_YEARS) {
      raw.senior_cpa = WEIGHTS.seniorPrincipal;
    }
    if (Math.min(...tenures) >= RECENT_PRINCIPAL_YEARS) {
      raw.no_recent_cpa = WEIGHTS.noRecentPrincipal;
    }
    reasons.push(
      `CPAs at this office whose surnames are in the firm name: licensed ${principalYears
        .map((d) => d.getUTCFullYear())
        .join(", ")}`,
    );
  }

  return {
    ...scoreFactors(FACTORS, raw),
    reasons,
    firmYears,
    principalYears: principalYears.map((d) => d.getUTCFullYear()),
  };
}
