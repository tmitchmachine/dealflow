import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

/**
 * One row of the DCA Board of Accountancy licensee file.
 *
 * DCA names the file `Accountancy_Data00.xls`, but it is tab-delimited Latin-1 text.
 * The `School`, `Year Graduated` and `Degree` columns exist but were empty for every
 * record in the Oct 2026 file, so they are not read.
 */
export interface DcaRecord {
  licenseType: string;
  licenseNumber: string;
  isOrg: boolean;
  /** Organization name, or the person's last name. */
  name: string;
  firstName: string;
  middleName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  state: string;
  zip: string;
  issueDate: Date | null;
  expirationDate: Date | null;
  status: string;
}

export const LICENSE_TYPES = {
  individual: "Certified Public Accountant",
  corporation: "Cpa - Corporation",
  partnership: "Cpa - Partnership",
  fictitiousName: "Fictitious Name Registration",
} as const;

const FIRM_TYPES: ReadonlySet<string> = new Set([
  LICENSE_TYPES.corporation,
  LICENSE_TYPES.partnership,
  LICENSE_TYPES.fictitiousName,
]);

export const REQUIRED_COLUMNS = [
  "License Type",
  "License Number",
  "Indiv/Org",
  "Org/Last Name",
  "First Name",
  "Middle Name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "County",
  "State",
  "Zip",
  "Original Issue Date",
  "Expiration Date",
  "License Status",
] as const;

/** Parses DCA's "MM-DD-YYYY" dates; returns null for blanks or anything malformed. */
export function parseDcaDate(value: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
}

export function parseDcaText(text: string): DcaRecord[] {
  const rows: Record<string, string>[] = parse(text, {
    columns: true,
    delimiter: "\t",
    quote: false,
    relax_column_count: true,
    skip_empty_lines: true,
  });
  if (rows.length > 0) {
    const missing = REQUIRED_COLUMNS.filter((c) => !(c in rows[0]));
    if (missing.length > 0) {
      throw new Error(`DCA file is missing columns: ${missing.join(", ")}`);
    }
  }
  return rows.map((r) => ({
    licenseType: r["License Type"].trim(),
    licenseNumber: r["License Number"].trim(),
    isOrg: r["Indiv/Org"].trim().toUpperCase() === "O",
    name: r["Org/Last Name"].trim(),
    firstName: r["First Name"].trim(),
    middleName: r["Middle Name"].trim(),
    addressLine1: r["Address Line 1"].trim(),
    addressLine2: r["Address Line 2"].trim(),
    city: r.City.trim(),
    county: r.County.trim(),
    state: r.State.trim(),
    zip: r.Zip.trim(),
    issueDate: parseDcaDate(r["Original Issue Date"]),
    expirationDate: parseDcaDate(r["Expiration Date"]),
    status: r["License Status"].trim(),
  }));
}

export function readDcaFile(path: string): DcaRecord[] {
  return parseDcaText(readFileSync(path, "latin1"));
}

export const isFirm = (r: DcaRecord) => FIRM_TYPES.has(r.licenseType);
export const isIndividualCpa = (r: DcaRecord) =>
  r.licenseType === LICENSE_TYPES.individual;
export const isActive = (r: DcaRecord) => r.status === "Active";
