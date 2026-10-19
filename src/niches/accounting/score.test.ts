import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFirms } from "./firms";
import { readDcaFile } from "./parse";
import { FACTORS, scoreFirm, WEIGHTS } from "./score";

const asOf = new Date(Date.UTC(2026, 9, 18));
const firms = buildFirms(
  readDcaFile(path.join(__dirname, "__fixtures__", "sample.tsv")),
);
const scored = (n: string) => {
  const firm = firms.find((f) => f.record.licenseNumber === n);
  if (!firm) throw new Error(`no firm ${n}`);
  return scoreFirm(firm, asOf);
};

describe("WEIGHTS", () => {
  it("sums to 100 for the best possible firm", () => {
    const { soleEntity: _, ...best } = WEIGHTS;
    expect(Object.values(best).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("FACTORS", () => {
  it("publishes maximums that sum to 100", () => {
    expect(FACTORS.reduce((a, f) => a + f.max, 0)).toBe(100);
  });

  it("gives every firm every factor, with points that add up to its score", () => {
    for (const firm of firms) {
      const s = scoreFirm(firm, asOf);
      expect(s.factors.map((f) => f.id)).toEqual(FACTORS.map((f) => f.id));
      expect(s.factors.reduce((a, f) => a + f.points, 0)).toBe(s.score);
      for (const f of s.factors) expect(f.points).toBeLessThanOrEqual(f.max);
    }
  });

  it("breaks a young partnership's score down by factor", () => {
    // 40 * 13/30 = 17.33 shows as 17; 17 + 15 + 10 = 42, the same score as before.
    const points = scored("900002").factors.map((f) => [f.id, f.points]);
    expect(Object.fromEntries(points)).toEqual({
      firm_years: 17,
      entity: 15,
      status: 10,
      senior_cpa: 0,
      no_recent_cpa: 0,
    });
  });
});

describe("scoreFirm", () => {
  it("gives full marks to an old, active corporation with long-tenured named CPAs", () => {
    // Registered 1988 (38 yrs), corporation, active, CPAs licensed 1984 and 2002.
    expect(scored("900001")).toMatchObject({
      score: 100,
      firmYears: 38,
      principalYears: [1984, 2002],
    });
  });

  it("scores a young partnership without CPA facts on firm signals only", () => {
    // Registered Nov 2012 -> 13 years: 40 * 13/30 = 17.33, + 15 entity + 10 active.
    const s = scored("900002");
    expect(s.score).toBe(42);
    expect(s.principalYears).toEqual([]);
  });

  it("scores a sole-practice name lower than a corporation of similar age", () => {
    // Registered 1995 (31 yrs): 40 + 5 sole + 10 active.
    expect(scored("900003").score).toBe(55);
  });

  it("does not award the active points to a delinquent firm", () => {
    // Registered 1979: 40 + 15, no active points.
    expect(scored("900004").score).toBe(55);
  });

  it("states facts in the reasons, never ages or intent", () => {
    const reasons = scored("900001").reasons.join(" | ");
    expect(reasons).toContain(
      "Registered with the CA Board of Accountancy in 1988 (38 years)",
    );
    expect(reasons).toContain("licensed 1984, 2002");
    expect(reasons).not.toMatch(/\bage\b|retir|likely to sell/i);
  });
});
