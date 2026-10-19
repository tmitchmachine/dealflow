import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFirms, surnameInName } from "./firms";
import { readDcaFile } from "./parse";

const records = readDcaFile(path.join(__dirname, "__fixtures__", "sample.tsv"));
const firms = buildFirms(records);
const byNumber = (n: string) => {
  const firm = firms.find((f) => f.record.licenseNumber === n);
  if (!firm) throw new Error(`no firm ${n}`);
  return firm;
};

describe("buildFirms", () => {
  it("returns only firm records", () => {
    expect(firms.map((f) => f.record.licenseNumber).sort()).toEqual([
      "900001",
      "900002",
      "900003",
      "900004",
    ]);
  });

  it("matches CPAs in the same office whose surname is in the firm name", () => {
    // Alice: same suite. Bob: same building, no suite on his record.
    expect(
      byNumber("900001")
        .cpas.map((c) => c.licenseNumber)
        .sort(),
    ).toEqual(["800001", "800002"]);
  });

  it("ignores a same-suite CPA whose surname is not in the firm name", () => {
    expect(byNumber("900001").cpas.map((c) => c.licenseNumber)).not.toContain(
      "800003",
    );
  });

  it("ignores a same-surname CPA in a different suite of the same building", () => {
    expect(byNumber("900001").cpas.map((c) => c.licenseNumber)).not.toContain(
      "800004",
    );
  });

  it("leaves firms with no trustworthy match empty", () => {
    expect(byNumber("900002").cpas).toEqual([]);
  });
});

describe("surnameInName", () => {
  it("matches whole words only", () => {
    expect(surnameInName("Lee", "Lee & Associates Cpas")).toBe(true);
    expect(surnameInName("Lee", "Leeway Tax Group")).toBe(false);
  });

  it("handles multi-word and punctuated surnames", () => {
    expect(surnameInName("De La Cruz", "De La Cruz Accountancy Corp")).toBe(
      true,
    );
    expect(surnameInName("O'Brien", "O'Brien, Smith & Co")).toBe(true);
  });
});
