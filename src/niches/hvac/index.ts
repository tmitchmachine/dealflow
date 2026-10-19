import { existsSync } from "node:fs";
import path from "node:path";
import { type Card, factorsFromRow, type Niche, percent } from "@/core/niche";
import { buildHvacList, type HvacRow } from "./list";
import { type CslbData, readCslbFiles } from "./parse";
import { FACTORS } from "./score";

export const MASTER_FILE = "cslb/MasterLicenseData.csv";
export const PERSONNEL_FILE = "cslb/PersonnelData.csv";

function toCard(row: HvacRow): Card {
  const since = [row.longest_principal_since, row.newest_principal_since]
    .filter((y, i, all) => y !== "" && all.indexOf(y) === i)
    .join("–");
  return {
    rank: row.rank,
    score: row.score,
    reasons: row.reasons,
    name: row.business_name,
    subtitle: `${row.city}, ${row.county} · ${row.business_type}`,
    licenseNumber: row.license_number,
    factors: factorsFromRow(FACTORS, row),
    facts: [
      {
        label: "Licensed",
        value:
          row.years_licensed === ""
            ? "—"
            : `${row.issued_year} (${row.years_licensed} yrs)`,
      },
      { label: "License", value: `${row.license_number} · ${row.status}` },
      { label: "Classifications", value: row.classifications },
      { label: "Phone", value: row.phone || "—" },
      {
        label: "Address",
        value: [row.address, row.city, row.zip].filter(Boolean).join(", "),
      },
      {
        label: "Owners/officers",
        value:
          row.current_principals > 0
            ? `${row.current_principals} current · since ${since}`
            : "No personnel record",
      },
    ],
    verifyUrl: row.verify_at,
  };
}

export const hvac: Niche<CslbData> = {
  id: "hvac",
  label: "HVAC contractors",
  title: "Ranked California HVAC contractors",
  lede: "Ranked by license and owner-tenure factors from the Contractors State License Board, for buyers acquiring heating and air-conditioning businesses.",
  filePrefix: "hvac",
  stage: "comparison",
  disclaimer:
    "Public Contractors State License Board (CSLB) license data. A ranked index, not investment advice or a recommendation to buy or sell.",
  factors: FACTORS,
  load(dataDir) {
    const master = path.join(dataDir, MASTER_FILE);
    const personnel = path.join(dataDir, PERSONNEL_FILE);
    for (const file of [master, personnel]) {
      if (!existsSync(file)) {
        throw new Error(
          `Missing ${file}. Download the CSLB master list and personnel CSVs from the CSLB Data Portal; see the README.`,
        );
      }
    }
    return readCslbFiles(master, personnel);
  },
  list(data, query) {
    const result = buildHvacList(data, query);
    return {
      rows: result.rows,
      cards: result.rows.map(toCard),
      considered: result.considered,
      summary: `${result.withPrincipals.toLocaleString()} (${percent(result.withPrincipals, result.considered)}) with owner/officer tenure records`,
    };
  },
};
