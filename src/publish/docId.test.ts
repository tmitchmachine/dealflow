import { describe, expect, it } from "vitest";
import { listingDocId, sanitizeDocId } from "./docId";

describe("sanitizeDocId", () => {
  it("strips slashes and illegal characters", () => {
    expect(sanitizeDocId("accounting_12/34")).toBe("accounting_12_34");
    expect(sanitizeDocId("taxdefault_foo/bar/baz")).toBe("taxdefault_foo_bar_baz");
    expect(listingDocId("hvac", "abc/def")).toBe("hvac_abc_def");
  });
});
