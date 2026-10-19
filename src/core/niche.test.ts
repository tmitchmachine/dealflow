import { describe, expect, it } from "vitest";
import { roundPoints } from "./niche";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("roundPoints", () => {
  it("leaves whole points alone", () => {
    expect(roundPoints([40, 15, 10, 0, 0])).toEqual([40, 15, 10, 0, 0]);
  });

  it("gives the leftover point to the largest fraction", () => {
    // 18.67 + 5 + 10 + 13.33 + 15 = 62; flooring both years factors would give 61.
    expect(roundPoints([(35 * 16) / 30, 5, 10, (25 * 16) / 30, 15])).toEqual([
      19, 5, 10, 13, 15,
    ]);
  });

  it("rounds a half up, like Math.round on the total", () => {
    expect(roundPoints([31.5, 10])).toEqual([32, 10]);
  });

  it("rounds down when the fractions add up to less than a half", () => {
    expect(roundPoints([(40 * 13) / 30, 15, 10])).toEqual([17, 15, 10]);
  });

  it("gives a tie to the earlier factor", () => {
    expect(roundPoints([0.5, 0.5])).toEqual([1, 0]);
  });

  it("always adds up to the rounded total and rounds each factor only to its floor or ceiling", () => {
    for (let years = 0; years <= 45; years++) {
      const raw = [
        35 * Math.min(1, years / 30),
        10,
        5,
        25 * Math.min(1, (years * 0.7) / 30),
        40 * Math.min(1, (years * 1.3) / 30),
      ];
      const points = roundPoints(raw);
      expect(sum(points)).toBe(Math.round(sum(raw)));
      for (const [i, p] of points.entries()) {
        expect([Math.floor(raw[i]), Math.ceil(raw[i])]).toContain(p);
      }
    }
  });
});
