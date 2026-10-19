import { describe, expect, it } from "vitest";
import type { CslbData, CslbLicense, CslbPrincipal } from "@/niches/hvac/parse";
import { departureSignals } from "./signals";
import { diffSnapshots, snapshotHvac, type Snapshot } from "./snapshot";

const license = (n: string, status = "CLEAR"): CslbLicense => ({
  licenseNumber: n,
  businessName: `Biz ${n}`,
  businessType: "Corporation",
  address: "",
  city: "",
  county: "Orange",
  zip: "",
  phone: "",
  issueDate: null,
  status,
  classifications: ["C20"],
  workersComp: "",
});

const principal = (n: string, over: Partial<CslbPrincipal> = {}): CslbPrincipal => ({
  licenseNumber: n,
  titles: ["President"],
  since: new Date("2000-01-01"),
  current: true,
  leftOn: null,
  deceased: false,
  ...over,
});

describe("snapshot diffs", () => {
  const before: CslbData = {
    licenses: [license("1"), license("2"), license("3")],
    principalsByLicense: new Map([
      ["1", [principal("1"), principal("1", { titles: ["Officer"], since: new Date("2010-05-01") })]],
    ]),
    departuresByLicense: new Map(),
  };
  const after: CslbData = {
    licenses: [license("1"), license("2", "Expired"), license("4")],
    principalsByLicense: new Map([["1", [principal("1")]]]),
    departuresByLicense: new Map(),
  };

  it("finds status changes, departures, and licenses that appear or vanish", () => {
    const changes = diffSnapshots(snapshotHvac(before, "2026-09-01"), snapshotHvac(after, "2026-10-01"));
    expect(changes.map((c) => `${c.license}:${c.kind}`).sort()).toEqual([
      "1:principal-left",
      "2:status",
      "3:gone",
      "4:new",
    ]);
    expect(changes.find((c) => c.kind === "status")?.detail).toBe("Status CLEAR → Expired");
  });

  it("gives identical data the same hash", () => {
    const a: Snapshot = snapshotHvac(before, "2026-09-01");
    const b: Snapshot = snapshotHvac(before, "2026-10-01");
    expect(a.sourceHash).toBe(b.sourceHash);
  });
});

describe("departure signals", () => {
  it("keeps exits and deaths inside the 24-month window", () => {
    const data: CslbData = {
      licenses: [],
      principalsByLicense: new Map(),
      departuresByLicense: new Map([
        ["1", [principal("1", { current: false, leftOn: new Date("2026-03-15"), titles: ["Officer", "Officer"] })]],
        ["2", [principal("2", { current: false, leftOn: new Date("2019-01-01") })]],
        ["3", [principal("3", { deceased: true, leftOn: new Date("2026-01-10"), titles: ["Deceased", "President"] })]],
      ]),
    };
    const signals = departureSignals(data, new Date("2026-10-18"));
    expect(signals["1"]).toEqual([{ kind: "departure", label: "Officer left Mar 2026", date: "2026-03-15" }]);
    expect(signals["2"]).toBeUndefined();
    expect(signals["3"]?.[0]).toMatchObject({ kind: "deceased", label: "President deceased (Jan 2026)" });
  });
});
