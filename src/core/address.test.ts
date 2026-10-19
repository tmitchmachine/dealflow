import { describe, expect, it } from "vitest";
import { normalizeAddress, sameOffice } from "./address";

describe("normalizeAddress", () => {
  it("splits a trailing suite off line 1 and abbreviates street words", () => {
    const a = normalizeAddress(
      "35 North Lake Avenue, Suite 710",
      "",
      "911013748",
    );
    expect(a).toEqual({
      street: "35 N LAKE AVE",
      unit: "710",
      zip5: "91101",
      key: "91101|35 N LAKE AVE",
    });
  });

  it("reads the unit from line 2", () => {
    expect(normalizeAddress("100 Main St", "Ste 200", "92612").unit).toBe(
      "200",
    );
    expect(normalizeAddress("100 Main St", "200", "92612").unit).toBe("200");
  });

  it("treats # and STE as the same marker", () => {
    const a = normalizeAddress("100 Main St #200", "", "92612");
    const b = normalizeAddress("100 Main Street", "Ste. 200", "92612");
    expect(a.key).toBe(b.key);
    expect(a.unit).toBe(b.unit);
  });
});

describe("sameOffice", () => {
  const firm = normalizeAddress("100 Main St Ste 200", "", "92612");

  it("matches the same suite", () => {
    expect(
      sameOffice(firm, normalizeAddress("100 Main St", "Suite 200", "92612")),
    ).toBe(true);
  });

  it("matches when one side has no suite", () => {
    expect(sameOffice(firm, normalizeAddress("100 Main St", "", "92612"))).toBe(
      true,
    );
  });

  it("rejects a different suite in the same building", () => {
    expect(
      sameOffice(firm, normalizeAddress("100 Main St", "Ste 450", "92612")),
    ).toBe(false);
  });

  it("rejects the same street in a different ZIP", () => {
    expect(
      sameOffice(firm, normalizeAddress("100 Main St Ste 200", "", "92614")),
    ).toBe(false);
  });
});
