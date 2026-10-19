import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterCachedRows,
  findCachedCsv,
  listFromCache,
  readCachedCsv,
} from "./out-cache";

const OUT = path.resolve("out");

describe("out-cache", () => {
  it("finds the Orange County accounting export", () => {
    const file = findCachedCsv(OUT, "cpa", ["Orange"]);
    expect(file).toMatch(/cpa-orange-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("filters and lists hundreds of real firms from the saved CSV", () => {
    const niche = {
      id: "accounting",
      label: "Accounting firms",
      title: "Ranked California accounting firms",
      lede: "",
      filePrefix: "cpa",
      stage: "selling" as const,
      disclaimer: "",
      factors: [
        {
          id: "firm_years",
          label: "Years registered",
          max: 40,
          rule: "test",
        },
      ],
    };
    const result = listFromCache(niche, OUT, {
      counties: ["Orange"],
      limit: 200,
      minYears: 0,
      includeInactive: false,
      asOf: new Date("2026-10-18"),
    });
    expect(result).not.toBeNull();
    expect(result!.considered).toBeGreaterThan(100);
    expect(result!.cards.length).toBe(200);
    expect(result!.cards[0].name.length).toBeGreaterThan(0);
    expect(result!.cards[0].score).toBeGreaterThan(0);
  });

  it("reads statewide HVAC rows", () => {
    const file = findCachedCsv(OUT, "hvac", []);
    expect(file).toBeTruthy();
    const rows = readCachedCsv(file!);
    const filtered = filterCachedRows(rows, {
      counties: [],
      limit: 500,
      minYears: 0,
      includeInactive: false,
      asOf: new Date("2026-10-18"),
    });
    expect(filtered.length).toBeGreaterThan(100);
  });
});
