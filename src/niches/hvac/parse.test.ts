import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMasterText, parsePersonnelText, readCslbFiles } from "./parse";

const fixtures = path.join(__dirname, "__fixtures__");
const data = readCslbFiles(
  path.join(fixtures, "master.csv"),
  path.join(fixtures, "personnel.csv"),
);

describe("readCslbFiles", () => {
  it("keeps only C-20 licenses", () => {
    expect(data.licenses.map((l) => l.licenseNumber)).toEqual([
      "9000001",
      "9000002",
      "9000004",
      "9000005",
    ]);
  });

  it("reads typed license fields", () => {
    expect(data.licenses[0]).toMatchObject({
      businessName: "FAKE COOL AIR INC",
      businessType: "Corporation",
      county: "Orange",
      status: "CLEAR",
      classifications: ["C20", "C10"],
    });
    expect(data.licenses[0].issueDate?.toISOString().slice(0, 10)).toBe(
      "1985-01-15",
    );
  });

  it("prefers the full business name", () => {
    expect(data.licenses[1].businessName).toBe("SAM TESTER HEATING");
  });

  it("keeps current, living principals with their earliest start date", () => {
    const principals = data.principalsByLicense.get("9000001") ?? [];
    expect(principals.map((p) => p.since?.getUTCFullYear()).sort()).toEqual([
      1985, 2001,
    ]);
  });

  it("has no principals for licenses without personnel rows", () => {
    expect(data.principalsByLicense.get("9000005")).toBeUndefined();
  });
});

describe("parsePersonnelText", () => {
  it("skips business-entity rows and other licenses", () => {
    const text = [
      "LIC-NO,Name-TP,Name,EMP-Titl-CDE,ASSN-DT,DIS-ASSN-DT",
      "1, Business, X CO, Officer, 01/01/2000,",
      "2, Principal, Y, Officer, 01/01/2000,",
    ].join("\n");
    expect(parsePersonnelText(text, new Set(["1"]))).toEqual([]);
  });
});

describe("parseMasterText", () => {
  it("fails loudly when CSLB changes the columns", () => {
    expect(() => parseMasterText("LicenseNo,Other\n1,x\n")).toThrow(
      /missing columns/,
    );
  });

  it("explains a cut-off download instead of a raw CSV error", () => {
    const text = readFileSync(path.join(fixtures, "master.csv"), "utf8");
    const truncated = text.slice(0, text.lastIndexOf(",C20,"));
    expect(() => parseMasterText(truncated)).toThrow(/looks truncated/);
  });
});
