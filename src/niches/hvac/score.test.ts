import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCslbFiles } from "./parse";
import { FACTORS, scoreLicense, WEIGHTS } from "./score";

const asOf = new Date(Date.UTC(2026, 9, 18));
const fixtures = path.join(__dirname, "__fixtures__");
const data = readCslbFiles(
  path.join(fixtures, "master.csv"),
  path.join(fixtures, "personnel.csv"),
);
const scored = (n: string) => {
  const license = data.licenses.find((l) => l.licenseNumber === n);
  if (!license) throw new Error(`no license ${n}`);
  return scoreLicense(license, data.principalsByLicense.get(n) ?? [], asOf);
};

describe("WEIGHTS", () => {
  it("sums to 100 for the best possible license", () => {
    const { soleEntity: _, ...best } = WEIGHTS;
    expect(Object.values(best).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("FACTORS", () => {
  it("publishes maximums that sum to 100", () => {
    expect(FACTORS.reduce((a, f) => a + f.max, 0)).toBe(100);
  });

  it("gives every license every factor, with points that add up to its score", () => {
    for (const license of data.licenses) {
      const s = scoreLicense(
        license,
        data.principalsByLicense.get(license.licenseNumber) ?? [],
        asOf,
      );
      expect(s.factors.map((f) => f.id)).toEqual(FACTORS.map((f) => f.id));
      expect(s.factors.reduce((a, f) => a + f.points, 0)).toBe(s.score);
      for (const f of s.factors) expect(f.points).toBeLessThanOrEqual(f.max);
    }
  });

  it("gives the leftover point to the larger fraction", () => {
    // 18.67 license years and 13.33 owner tenure: 19 + 13, not 19 + 14 or 18 + 13.
    const points = scored("9000002").factors.map((f) => [f.id, f.points]);
    expect(Object.fromEntries(points)).toEqual({
      license_years: 19,
      entity: 5,
      extra_classifications: 0,
      status: 10,
      owner_tenure: 13,
      no_recent_owner: 15,
    });
  });
});

describe("scoreLicense", () => {
  it("gives full marks to an old corporation with long-tenured current owners", () => {
    // 41 yrs licensed, corporation, extra C10, CLEAR, owners since 1985 and 2001.
    expect(scored("9000001")).toMatchObject({
      score: 100,
      licenseYears: 41,
      principalYears: [1985, 2001],
    });
  });

  it("scales license and owner tenure for a younger sole owner", () => {
    // 35*16/30 + 5 sole + 10 clear + 25*16/30 + 15 (owner joined 16 yrs ago) = 62.
    expect(scored("9000002").score).toBe(62);
  });

  it("scores firm facts only when there is no personnel record", () => {
    // 35 + 10 corporation + 10 clear.
    expect(scored("9000005")).toMatchObject({ score: 55, principalYears: [] });
  });

  it("gives no status points to a suspended license", () => {
    // 35*27/30 + 10 LLC = 41.5, rounded.
    expect(scored("9000004").score).toBe(42);
  });

  it("states facts in the reasons, never ages or intent", () => {
    const reasons = scored("9000001").reasons.join(" | ");
    expect(reasons).toContain("CSLB license issued 1985 (41 years)");
    expect(reasons).toContain("Also licensed for C10");
    expect(reasons).toContain("since 1985, 2001");
    expect(reasons).not.toMatch(/\bage\b|retir|likely to sell/i);
  });
});
