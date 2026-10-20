import { describe, expect, it } from "vitest";
import { buildDealBooks, loadPracticeBook, loadTaxDefaultBook } from "./index";
import { PUBLISH_SCOPE } from "../publish/scope";

describe("buildDealBooks", () => {
  it("is wired to the pinned publish scope", () => {
    expect(PUBLISH_SCOPE.counties).toEqual(["Orange"]);
    expect(PUBLISH_SCOPE.nicheLimit).toBe(200);
    expect(PUBLISH_SCOPE.taxDefaultLimit).toBe(1500);
    expect(PUBLISH_SCOPE.bizSaleLimit).toBe(200);
    expect(PUBLISH_SCOPE.snapshotCapPerBook).toBe(50);
    expect(PUBLISH_SCOPE.shrinkGuardRatio).toBe(0.5);
    expect(typeof buildDealBooks).toBe("function");
  });

  it("loads practice and taxdefault books without crashing when sync files are missing", () => {
    const practice = loadPracticeBook();
    const tax = loadTaxDefaultBook(PUBLISH_SCOPE.taxDefaultLimit);
    expect(Array.isArray(practice.cards)).toBe(true);
    expect(Array.isArray(tax.cards)).toBe(true);
  });

  it("source modules do not import from app/ or the old @/src path", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), "src/books");
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(path.join(dir, name), "utf8");
      expect(text).not.toMatch(/from ["'].*app\//);
      expect(text).not.toMatch(/from ["']@\/src\//);
    }
  });
});
