import { existsSync } from "node:fs";
import path from "node:path";
import { type Card, factorsFromRow, type Niche, percent } from "@/core/niche";
import { buildList, type ListRow } from "./list";
import { type DcaRecord, readDcaFile } from "./parse";
import { FACTORS } from "./score";

export const DATA_FILE = "Accountancy_Data00.xls";

function toCard(row: ListRow): Card {
  const cpaYears = [row.oldest_cpa_license_year, row.newest_cpa_license_year]
    .filter((y, i, all) => y !== "" && all.indexOf(y) === i)
    .join("–");
  return {
    rank: row.rank,
    score: row.score,
    reasons: row.reasons,
    name: row.firm_name,
    subtitle: `${row.city}, ${row.county} · ${row.entity_type}`,
    licenseNumber: row.license_number,
    factors: factorsFromRow(FACTORS, row),
    facts: [
      {
        label: "Registered",
        value:
          row.years_registered === ""
            ? "—"
            : `${row.registered_year} (${row.years_registered} yrs)`,
      },
      { label: "License", value: `${row.license_number} · ${row.status}` },
      {
        label: "Address",
        value: [row.address, row.city, row.zip].filter(Boolean).join(", "),
      },
      {
        label: "CPA match",
        value:
          row.cpa_match === "high"
            ? `High · ${row.matched_cpas} CPA${row.matched_cpas === 1 ? "" : "s"} · licensed ${cpaYears}`
            : "None",
      },
    ],
    verifyUrl: row.verify_at,
  };
}

export const accounting: Niche<DcaRecord[]> = {
  id: "accounting",
  label: "Accounting firms",
  title: "Ranked California accounting firms",
  lede: "Ranked by license-tenure factors from the Board of Accountancy, for buyers acquiring CPA, tax and bookkeeping practices.",
  filePrefix: "cpa",
  stage: "selling",
  disclaimer:
    "Public Board of Accountancy license data. A ranked index, not investment advice or a recommendation to buy or sell.",
  factors: FACTORS,
  load(dataDir) {
    const file = path.join(dataDir, DATA_FILE);
    if (!existsSync(file)) {
      throw new Error(
        `Missing ${file}. Download ${DATA_FILE} from DCA's Box folder (Accountancy_0300); see the README.`,
      );
    }
    return readDcaFile(file);
  },
  list(records, query) {
    const result = buildList(records, query);
    return {
      rows: result.rows,
      cards: result.rows.map(toCard),
      considered: result.considered,
      summary: `${result.withCpaMatch.toLocaleString()} (${percent(result.withCpaMatch, result.considered)}) with a high-confidence CPA match`,
    };
  },
};
