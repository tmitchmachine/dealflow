import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { parseUsDate } from "@/core/dates";

/** CSLB classification code for Warm-Air Heating, Ventilating and Air-Conditioning. */
export const HVAC_CLASSIFICATION = "C20";

/** One license from CSLB's `MasterLicenseData.csv`. */
export interface CslbLicense {
  licenseNumber: string;
  businessName: string;
  /** "Corporation", "Sole Owner", "Limited Liability", "Partnership", "JointVenture". */
  businessType: string;
  address: string;
  city: string;
  county: string;
  zip: string;
  phone: string;
  issueDate: Date | null;
  /** "CLEAR" for a license in good standing; otherwise a suspension reason. */
  status: string;
  classifications: string[];
  workersComp: string;
}

/** One person on a license, from CSLB's `PersonnelData.csv`. */
export interface CslbPrincipal {
  licenseNumber: string;
  titles: string[];
  /** Earliest association with this license across all of the person's titles. */
  since: Date | null;
  /** Still associated: at least one title has no disassociation date. */
  current: boolean;
  /** Latest disassociation date when no longer associated. */
  leftOn: Date | null;
  deceased: boolean;
}

export const MASTER_COLUMNS = [
  "LicenseNo",
  "BusinessName",
  "FullBusinessName",
  "MailingAddress",
  "City",
  "County",
  "ZIPCode",
  "BusinessPhone",
  "BusinessType",
  "IssueDate",
  "PrimaryStatus",
  "Classifications(s)",
  "WorkersCompCoverageType",
] as const;

export const PERSONNEL_COLUMNS = [
  "LIC-NO",
  "Name-TP",
  "EMP-Titl-CDE",
  "ASSN-DT",
  "DIS-ASSN-DT",
] as const;

type Row = Record<string, string>;

/**
 * Parses a CSLB CSV, checking its columns on the first row and keeping only rows that
 * `keep` accepts. Filtering while parsing matters: the statewide master list is ~245k
 * licenses and C-20 is ~12k.
 */
function parseCslbCsv(
  text: string,
  file: string,
  required: readonly string[],
  keep: (row: Row) => boolean,
): Row[] {
  let checked = false;
  try {
    return parse(text, {
      columns: true,
      relax_quotes: true,
      skip_empty_lines: true,
      on_record: (row: Row) => {
        if (!checked) {
          const missing = required.filter((c) => !(c in row));
          if (missing.length > 0) {
            throw new Error(
              `${file} is missing columns: ${missing.join(", ")}`,
            );
          }
          checked = true;
        }
        return keep(row) ? row : null;
      },
    });
  } catch (err) {
    // A short row almost always means the download was cut off part-way.
    if ((err as { code?: string }).code === "CSV_RECORD_INCONSISTENT_COLUMNS") {
      throw new Error(
        `${file} looks truncated (${(err as Error).message}). Download it again from the CSLB Data Portal.`,
      );
    }
    throw err;
  }
}

/** CSLB packs multi-valued fields into one cell: " Officer| Officer". */
const splitPipes = (value: string) => value.split("|").map((v) => v.trim());

/** Parses the master list, keeping only licenses that carry `classification`. */
export function parseMasterText(
  text: string,
  classification = HVAC_CLASSIFICATION,
): CslbLicense[] {
  const rows = parseCslbCsv(
    text,
    "MasterLicenseData.csv",
    MASTER_COLUMNS,
    (r) => splitPipes(r["Classifications(s)"]).includes(classification),
  );
  return rows.map((r) => ({
    licenseNumber: r.LicenseNo.trim(),
    businessName: (r.FullBusinessName || r.BusinessName).trim(),
    businessType: r.BusinessType.trim(),
    address: r.MailingAddress.trim(),
    city: r.City.trim(),
    county: r.County.trim(),
    zip: r.ZIPCode.trim(),
    phone: r.BusinessPhone.trim(),
    issueDate: parseUsDate(r.IssueDate),
    status: r.PrimaryStatus.trim(),
    classifications: splitPipes(r["Classifications(s)"]).filter(Boolean),
    workersComp: r.WorkersCompCoverageType.trim(),
  }));
}

/** Parses personnel rows for the given licenses. Business-entity rows are skipped. */
export function parsePersonnelText(
  text: string,
  licenseNumbers: ReadonlySet<string>,
): CslbPrincipal[] {
  const rows = parseCslbCsv(
    text,
    "PersonnelData.csv",
    PERSONNEL_COLUMNS,
    (r) =>
      licenseNumbers.has(r["LIC-NO"].trim()) &&
      r["Name-TP"].includes("Principal"),
  );
  return rows.map((r) => {
    const titles = splitPipes(r["EMP-Titl-CDE"]);
    const starts = splitPipes(r["ASSN-DT"]).map(parseUsDate);
    const ends = splitPipes(r["DIS-ASSN-DT"]);
    const dated = starts.filter((d): d is Date => d !== null);
    const current = starts.some((start, i) => start !== null && !ends[i]);
    const endDates = ends.map(parseUsDate).filter((d): d is Date => d !== null);
    return {
      licenseNumber: r["LIC-NO"].trim(),
      titles,
      since: dated.length
        ? new Date(Math.min(...dated.map((d) => d.getTime())))
        : null,
      current,
      leftOn:
        !current && endDates.length
          ? new Date(Math.max(...endDates.map((d) => d.getTime())))
          : null,
      deceased: titles.includes("Deceased"),
    };
  });
}

export interface CslbData {
  licenses: CslbLicense[];
  /** Current, living principals, keyed by license number. */
  principalsByLicense: Map<string, CslbPrincipal[]>;
  /** Principals who left the license or died, keyed by license number. */
  departuresByLicense: Map<string, CslbPrincipal[]>;
}

export function readCslbFiles(
  masterPath: string,
  personnelPath: string,
): CslbData {
  const licenses = parseMasterText(readFileSync(masterPath, "latin1"));
  const numbers = new Set(licenses.map((l) => l.licenseNumber));
  const principalsByLicense = new Map<string, CslbPrincipal[]>();
  const departuresByLicense = new Map<string, CslbPrincipal[]>();
  for (const p of parsePersonnelText(
    readFileSync(personnelPath, "latin1"),
    numbers,
  )) {
    const target =
      p.current && !p.deceased ? principalsByLicense : departuresByLicense;
    const list = target.get(p.licenseNumber) ?? [];
    list.push(p);
    target.set(p.licenseNumber, list);
  }
  return { licenses, principalsByLicense, departuresByLicense };
}
