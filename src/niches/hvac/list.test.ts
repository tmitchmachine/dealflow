import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ListQuery } from "@/core/niche";
import { buildHvacList } from "./list";
import { readCslbFiles } from "./parse";
import { FACTORS } from "./score";

const fixtures = path.join(__dirname, "__fixtures__");
const data = readCslbFiles(
  path.join(fixtures, "master.csv"),
  path.join(fixtures, "personnel.csv"),
);
const defaults: ListQuery = {
  counties: [],
  limit: 100,
  minYears: 0,
  includeInactive: false,
  asOf: new Date(Date.UTC(2026, 9, 18)),
};

describe("buildHvacList", () => {
  it("ranks clear C-20 licenses statewide by score", () => {
    const { rows, considered, withPrincipals } = buildHvacList(data, defaults);
    expect(rows.map((r) => [r.rank, r.license_number, r.score])).toEqual([
      [1, "9000001", 100],
      [2, "9000002", 62],
      [3, "9000005", 55],
    ]);
    expect(considered).toBe(3);
    expect(withPrincipals).toBe(2);
  });

  it("fills owner columns only when personnel records exist", () => {
    const [top, , last] = buildHvacList(data, defaults).rows;
    expect(top).toMatchObject({
      current_principals: 2,
      longest_principal_since: 1985,
      newest_principal_since: 2001,
      phone: "(555) 010 0001",
    });
    expect(last).toMatchObject({
      current_principals: 0,
      longest_principal_since: "",
    });
  });

  it("adds one pts_ column per factor after the existing columns", () => {
    const [top] = buildHvacList(data, defaults).rows;
    const columns = Object.keys(top);
    expect(columns.slice(columns.indexOf("verify_at") + 1)).toEqual(
      FACTORS.map((f) => `pts_${f.id}`),
    );
    expect(top).toMatchObject({
      pts_license_years: 35,
      pts_entity: 10,
      pts_extra_classifications: 5,
      pts_status: 10,
      pts_owner_tenure: 25,
      pts_no_recent_owner: 15,
    });
  });

  it("filters by county and includes suspended licenses only when asked", () => {
    expect(
      buildHvacList(data, { ...defaults, counties: ["los angeles"] }).rows.map(
        (r) => r.license_number,
      ),
    ).toEqual(["9000002"]);
    expect(
      buildHvacList(data, { ...defaults, includeInactive: true }).rows.map(
        (r) => r.license_number,
      ),
    ).toContain("9000004");
  });

  it("applies the minimum license age and the limit", () => {
    expect(
      buildHvacList(data, { ...defaults, minYears: 30 }).rows,
    ).toHaveLength(2);
    expect(buildHvacList(data, { ...defaults, limit: 1 }).rows).toHaveLength(1);
  });
});
