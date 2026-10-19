/** A postal address reduced to comparable parts. */
export interface NormalizedAddress {
  /** Street line without the unit, upper-case, punctuation and common words abbreviated. */
  street: string;
  /** Suite, unit or room identifier, or "" when the record has none. */
  unit: string;
  zip5: string;
  /** Building-level key: same ZIP and same street line. Units are compared separately. */
  key: string;
}

const ABBREVIATIONS: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  ROAD: "RD",
  DRIVE: "DR",
  LANE: "LN",
  COURT: "CT",
  PLACE: "PL",
  PARKWAY: "PKWY",
  HIGHWAY: "HWY",
  CIRCLE: "CIR",
  CENTER: "CTR",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
};

// A trailing unit marker: "#710", "STE 200", "SUITE B-3", "UNIT 4", "FL 2".
const TRAILING_UNIT =
  /\s*(?:#|\bSTE\b|\bSUITE\b|\bUNIT\b|\bRM\b|\bROOM\b|\bFL\b|\bFLOOR\b|\bAPT\b|\bBLDG\b)\s*-?\s*([A-Z0-9-]+)\s*$/;

function clean(text: string): string {
  return text
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ABBREVIATIONS[word] ?? word)
    .join(" ");
}

export function normalizeAddress(
  line1: string,
  line2: string,
  zip: string,
): NormalizedAddress {
  let street = clean(line1);
  let unit = "";
  const inLine1 = TRAILING_UNIT.exec(street);
  if (inLine1) {
    unit = inLine1[1];
    street = street.slice(0, inLine1.index).trim();
  }
  const second = clean(line2);
  if (second && !unit) {
    // Line 2 is usually just the unit ("Suite 200" or "200").
    const inLine2 = TRAILING_UNIT.exec(second);
    unit = inLine2 ? inLine2[1] : second;
  }
  const zip5 = zip.trim().slice(0, 5);
  return { street, unit, zip5, key: `${zip5}|${street}` };
}

/** Two addresses can be the same office: same building, and no conflicting units. */
export function sameOffice(
  a: NormalizedAddress,
  b: NormalizedAddress,
): boolean {
  if (!a.street || a.key !== b.key) return false;
  return !a.unit || !b.unit || a.unit === b.unit;
}
