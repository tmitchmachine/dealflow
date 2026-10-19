import {
  type NormalizedAddress,
  normalizeAddress,
  sameOffice,
} from "@/core/address";
import { type DcaRecord, isActive, isFirm, isIndividualCpa } from "./parse";

export interface Firm {
  record: DcaRecord;
  address: NormalizedAddress;
  /**
   * Active CPAs matched with high confidence: same office (same building, no
   * conflicting suite) AND the CPA's surname appears in the firm's name.
   *
   * DCA does not link CPAs to firms. Address alone matched about half of Orange County
   * firms in Step 0, and most of those joins are untrustworthy (home addresses, shared
   * buildings), so address-only matches are deliberately left out.
   */
  cpas: DcaRecord[];
}

const words = (text: string) =>
  text
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** True when the whole surname appears as a word (or run of words) in the firm name. */
export function surnameInName(surname: string, firmName: string): boolean {
  const s = words(surname).join(" ");
  if (s.length < 2) return false;
  return ` ${words(firmName).join(" ")} `.includes(` ${s} `);
}

export function buildFirms(records: DcaRecord[]): Firm[] {
  const cpasByBuilding = new Map<
    string,
    { cpa: DcaRecord; address: NormalizedAddress }[]
  >();
  for (const cpa of records) {
    if (!isIndividualCpa(cpa) || !isActive(cpa)) continue;
    const address = normalizeAddress(
      cpa.addressLine1,
      cpa.addressLine2,
      cpa.zip,
    );
    const list = cpasByBuilding.get(address.key) ?? [];
    list.push({ cpa, address });
    cpasByBuilding.set(address.key, list);
  }

  return records.filter(isFirm).map((record) => {
    const address = normalizeAddress(
      record.addressLine1,
      record.addressLine2,
      record.zip,
    );
    const cpas = (cpasByBuilding.get(address.key) ?? [])
      .filter(
        (c) =>
          sameOffice(address, c.address) &&
          surnameInName(c.cpa.name, record.name),
      )
      .map((c) => c.cpa);
    return { record, address, cpas };
  });
}
