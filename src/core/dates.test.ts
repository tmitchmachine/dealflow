import { describe, expect, it } from "vitest";
import { parseUsDate, yearsBetween } from "./dates";

describe("yearsBetween", () => {
  it("counts whole years, not calendar years", () => {
    const asOf = new Date(Date.UTC(2026, 9, 18));
    expect(yearsBetween(new Date(Date.UTC(2000, 11, 31)), asOf)).toBe(25);
    expect(yearsBetween(new Date(Date.UTC(2000, 0, 1)), asOf)).toBe(26);
  });
});

describe("parseUsDate", () => {
  it("accepts dashes or slashes and surrounding spaces", () => {
    expect(parseUsDate("07-27-1971")?.toISOString().slice(0, 10)).toBe(
      "1971-07-27",
    );
    expect(parseUsDate(" 01/10/2015")?.toISOString().slice(0, 10)).toBe(
      "2015-01-10",
    );
  });

  it("rejects blanks and other formats", () => {
    expect(parseUsDate("")).toBeNull();
    expect(parseUsDate("1971-07-27")).toBeNull();
  });
});
