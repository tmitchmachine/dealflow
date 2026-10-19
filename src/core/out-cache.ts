import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { Card, FactorDef, ListQuery, NicheInfo } from "./niche";

export type CachedRow = Record<string, string>;

/** Pick the newest `out/<prefix>-…csv` that best matches the county filter. */
export function findCachedCsv(
  outDir: string,
  filePrefix: string,
  counties: string[],
): string | null {
  let names: string[];
  try {
    names = readdirSync(outDir).filter(
      (n) => n.startsWith(`${filePrefix}-`) && n.endsWith(".csv"),
    );
  } catch {
    return null;
  }
  if (names.length === 0) return null;

  const countySlug = counties
    .map((c) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .join("_");

  const scored = names.map((name) => {
    const body = name.slice(filePrefix.length + 1, -".csv".length); // slug-date
    const dateMatch = body.match(/(\d{4}-\d{2}-\d{2})$/);
    const date = dateMatch?.[1] ?? "";
    const slug = date ? body.slice(0, -(date.length + 1)) : body;
    let fit = 0;
    if (counties.length === 0 && slug === "statewide") fit = 3;
    else if (counties.length > 0 && slug === countySlug) fit = 3;
    else if (slug === "statewide") fit = 1;
    return { name, date, fit };
  });

  scored.sort(
    (a, b) => b.fit - a.fit || b.date.localeCompare(a.date) || a.name.localeCompare(b.name),
  );
  const best = scored[0];
  if (!best || best.fit === 0) return null;
  return path.join(outDir, best.name);
}

export function readCachedCsv(file: string): CachedRow[] {
  const text = readFileSync(file, "utf8");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as CachedRow[];
}

function num(value: string | undefined): number | "" {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

function yearsField(row: CachedRow): number {
  const y = num(row.years_registered) || num(row.years_licensed);
  return typeof y === "number" ? y : 0;
}

/** Filter a cached CSV the same way the live indexes filter raw state files. */
export function filterCachedRows(
  rows: CachedRow[],
  query: ListQuery,
): CachedRow[] {
  const counties = new Set(query.counties.map((c) => c.trim().toLowerCase()));
  return rows
    .filter(
      (r) => counties.size === 0 || counties.has((r.county ?? "").toLowerCase()),
    )
    .filter((r) => {
      if (query.includeInactive) return true;
      const status = (r.status ?? "").toLowerCase();
      return status === "active" || status === "clear";
    })
    .filter((r) => yearsField(r) >= query.minYears)
    .sort(
      (a, b) =>
        Number(b.score || 0) - Number(a.score || 0) ||
        yearsField(b) - yearsField(a) ||
        (a.license_number ?? "").localeCompare(b.license_number ?? ""),
    );
}

function factorPoints(
  defs: readonly FactorDef[],
  row: CachedRow,
): Card["factors"] {
  return defs.map((f) => {
    const raw = row[`pts_${f.id}`];
    const points = raw != null && raw !== "" ? Number(raw) : 0;
    return {
      id: f.id,
      label: f.label,
      points: Number.isFinite(points) ? points : 0,
      max: f.max,
    };
  });
}

export function accountingCardFromCache(
  row: CachedRow,
  rank: number,
  factors: readonly FactorDef[],
): Card {
  const registeredYear = num(row.registered_year);
  const yearsRegistered = num(row.years_registered);
  const matched = Number(row.matched_cpas || 0);
  const oldest = num(row.oldest_cpa_license_year);
  const newest = num(row.newest_cpa_license_year);
  const cpaYears = [oldest, newest]
    .filter((y, i, all) => y !== "" && all.indexOf(y) === i)
    .join("–");
  return {
    rank,
    score: Number(row.score || 0),
    reasons: row.reasons ?? "",
    name: row.firm_name ?? "",
    subtitle: `${row.city}, ${row.county} · ${row.entity_type}`,
    licenseNumber: row.license_number ?? "",
    factors: factorPoints(factors, row),
    facts: [
      {
        label: "Registered",
        value:
          yearsRegistered === ""
            ? "—"
            : `${registeredYear} (${yearsRegistered} yrs)`,
      },
      {
        label: "License",
        value: `${row.license_number} · ${row.status}`,
      },
      {
        label: "Address",
        value: [row.address, row.city, row.zip].filter(Boolean).join(", "),
      },
      {
        label: "CPA match",
        value:
          row.cpa_match === "high"
            ? `High · ${matched} CPA${matched === 1 ? "" : "s"} · licensed ${cpaYears}`
            : "None",
      },
    ],
    verifyUrl: row.verify_at || "https://search.dca.ca.gov",
  };
}

export function hvacCardFromCache(
  row: CachedRow,
  rank: number,
  factors: readonly FactorDef[],
): Card {
  const issuedYear = num(row.issued_year);
  const yearsLicensed = num(row.years_licensed);
  const principals = Number(row.current_principals || 0);
  const longest = num(row.longest_principal_since);
  const newest = num(row.newest_principal_since);
  const since = [longest, newest]
    .filter((y, i, all) => y !== "" && all.indexOf(y) === i)
    .join("–");
  return {
    rank,
    score: Number(row.score || 0),
    reasons: row.reasons ?? "",
    name: row.business_name ?? "",
    subtitle: `${row.city}, ${row.county} · ${row.business_type}`,
    licenseNumber: row.license_number ?? "",
    factors: factorPoints(factors, row),
    facts: [
      {
        label: "Licensed",
        value:
          yearsLicensed === "" ? "—" : `${issuedYear} (${yearsLicensed} yrs)`,
      },
      { label: "License", value: `${row.license_number} · ${row.status}` },
      { label: "Classifications", value: row.classifications || "—" },
      { label: "Phone", value: row.phone || "—" },
      {
        label: "Address",
        value: [row.address, row.city, row.zip].filter(Boolean).join(", "),
      },
      {
        label: "Owners/officers",
        value:
          principals > 0
            ? `${principals} current · since ${since}`
            : "No personnel record",
      },
    ],
    verifyUrl:
      row.verify_at ||
      "https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx",
  };
}

export function listFromCache(
  niche: NicheInfo & { filePrefix: string; factors: readonly FactorDef[] },
  outDir: string,
  query: ListQuery,
): {
  cards: Card[];
  considered: number;
  summary: string;
  cacheFile: string;
} | null {
  const file = findCachedCsv(outDir, niche.filePrefix, query.counties);
  if (!file) return null;
  const filtered = filterCachedRows(readCachedCsv(file), query);
  const limited = filtered.slice(0, query.limit);
  const cards =
    niche.id === "hvac"
      ? limited.map((row, i) => hvacCardFromCache(row, i + 1, niche.factors))
      : limited.map((row, i) =>
          accountingCardFromCache(row, i + 1, niche.factors),
        );
  return {
    cards,
    considered: filtered.length,
    summary: `from saved list ${path.basename(file)} (restore data/raw to rebuild live)`,
    cacheFile: file,
  };
}
