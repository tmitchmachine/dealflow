import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isActive,
  isFirm,
  isIndividualCpa,
  parseDcaDate,
  parseDcaText,
  readDcaFile,
} from "./parse";

const fixture = path.join(__dirname, "__fixtures__", "sample.tsv");

describe("readDcaFile", () => {
  const records = readDcaFile(fixture);

  it("reads every row with typed fields", () => {
    expect(records).toHaveLength(8);
    const firm = records[0];
    expect(firm).toMatchObject({
      licenseType: "Cpa - Corporation",
      licenseNumber: "900001",
      isOrg: true,
      name: "Fakename & Testwell Cpas Inc",
      county: "Orange",
      zip: "926121234",
      status: "Active",
    });
    expect(firm.issueDate?.toISOString().slice(0, 10)).toBe("1988-03-15");
  });

  it("classifies firms, individuals and status", () => {
    expect(records.filter(isFirm)).toHaveLength(4);
    expect(records.filter(isIndividualCpa)).toHaveLength(4);
    expect(records.filter(isActive)).toHaveLength(7);
  });
});

describe("parseDcaText", () => {
  it("fails loudly when DCA changes the columns", () => {
    expect(() => parseDcaText("License Type\tSomething Else\nx\ty\n")).toThrow(
      /missing columns/,
    );
  });
});

describe("parseDcaDate", () => {
  it("parses MM-DD-YYYY and rejects anything else", () => {
    expect(parseDcaDate("07-27-1971")?.getUTCFullYear()).toBe(1971);
    expect(parseDcaDate("")).toBeNull();
    expect(parseDcaDate("1971-07-27")).toBeNull();
  });
});
