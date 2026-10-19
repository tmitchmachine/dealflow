import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildList, type ListOptions } from "./list";
import { readDcaFile } from "./parse";
import { FACTORS } from "./score";

const records = readDcaFile(path.join(__dirname, "__fixtures__", "sample.tsv"));
const defaults: ListOptions = {
  counties: [],
  limit: 100,
  minYears: 0,
  includeInactive: false,
  asOf: new Date(Date.UTC(2026, 9, 18)),
};

describe("buildList", () => {
  it("ranks active firms statewide by score", () => {
    const { rows, considered, withCpaMatch } = buildList(records, defaults);
    expect(rows.map((r) => [r.rank, r.license_number, r.score])).toEqual([
      [1, "900001", 100],
      [2, "900003", 55],
      [3, "900002", 42],
    ]);
    expect(considered).toBe(3);
    expect(withCpaMatch).toBe(1);
  });

  it("fills the CPA columns only for high-confidence matches", () => {
    const [top, , last] = buildList(records, defaults).rows;
    expect(top).toMatchObject({
      cpa_match: "high",
      matched_cpas: 2,
      oldest_cpa_license_year: 1984,
      newest_cpa_license_year: 2002,
    });
    expect(last).toMatchObject({
      cpa_match: "none",
      matched_cpas: 0,
      oldest_cpa_license_year: "",
    });
  });

  it("adds one pts_ column per factor after the existing columns", () => {
    const [top] = buildList(records, defaults).rows;
    const columns = Object.keys(top);
    expect(columns.slice(columns.indexOf("verify_at") + 1)).toEqual(
      FACTORS.map((f) => `pts_${f.id}`),
    );
    expect(top).toMatchObject({
      pts_firm_years: 40,
      pts_entity: 15,
      pts_status: 10,
      pts_senior_cpa: 20,
      pts_no_recent_cpa: 15,
    });
  });

  it("filters by county case-insensitively", () => {
    const { rows } = buildList(records, {
      ...defaults,
      counties: ["los angeles"],
    });
    expect(rows.map((r) => r.license_number)).toEqual(["900003"]);
  });

  it("includes delinquent firms only when asked", () => {
    const { rows } = buildList(records, { ...defaults, includeInactive: true });
    expect(rows.map((r) => r.license_number)).toContain("900004");
  });

  it("applies the minimum registration age and the limit", () => {
    expect(buildList(records, { ...defaults, minYears: 30 }).rows).toHaveLength(
      2,
    );
    expect(buildList(records, { ...defaults, limit: 1 }).rows).toHaveLength(1);
  });
});
