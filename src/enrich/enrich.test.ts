import { describe, expect, it } from "vitest";
import { guessDomains, nameTokens, tokenOverlap } from "./names";
import { pageMatchesFirm } from "./site";
import { findPlace } from "./places";

describe("firm names", () => {
  it("drops entity words", () => {
    expect(nameTokens("Rusell B Goodwin Cpa, An Acc Corp")).toEqual(["rusell", "goodwin"]);
    expect(nameTokens("Peasley Aldinger & Obymachow An Accty Corp")).toEqual(["peasley", "aldinger", "obymachow"]);
  });

  it("guesses surname domains for person-named firms", () => {
    const d = guessDomains("Kathleen C Harney Acc Corp", "accounting");
    expect(d).toContain("harneycpa.com");
    expect(d).toContain("kathleenharney.com");
    expect(d).not.toContain("harney.com"); // a lone common word is never enough
    expect(d.length).toBeLessThanOrEqual(7);
  });

  it("measures token overlap against text", () => {
    expect(tokenOverlap(["smith", "jones"], "Welcome to Smith & Jones CPAs")).toBe(1);
    expect(tokenOverlap(["smith", "jones"], "Smithers")).toBe(0);
  });
});

describe("pageMatchesFirm", () => {
  const firm = { name: "Templeman, Michael S. Inc", city: "Irvine", licenseNumber: "5555" };

  it("needs the name and the city or license", () => {
    expect(pageMatchesFirm("Michael Templeman CPA · 1 Park Plaza, Irvine, CA", firm)).toBe(true);
    expect(pageMatchesFirm("Michael Templeman CPA · Austin, Texas", firm)).toBe(false);
    expect(pageMatchesFirm("Irvine tax services", firm)).toBe(false);
  });
});

describe("findPlace", () => {
  const reply = (places: unknown[]) =>
    (async () => new Response(JSON.stringify({ places }), { status: 200 })) as unknown as typeof fetch;

  it("accepts a hit whose name matches", async () => {
    const hit = await findPlace(
      "Harney Kathleen C Acc Corp",
      "100 Main St, Yorba Linda, 92886",
      "key",
      reply([{ id: "p1", displayName: { text: "Kathleen Harney CPA" }, websiteUri: "https://harneycpa.com", businessStatus: "OPERATIONAL", userRatingCount: 12 }]),
    );
    expect(hit).toMatchObject({ placeId: "p1", website: "https://harneycpa.com", reviews: 12 });
  });

  it("rejects Google's top hit when it's another business", async () => {
    const hit = await findPlace(
      "Harney Kathleen C Acc Corp",
      "100 Main St, Yorba Linda, 92886",
      "key",
      reply([{ id: "p2", displayName: { text: "Yorba Linda Dental" }, formattedAddress: "200 Main St" }]),
    );
    expect(hit).toBeNull();
  });
});
