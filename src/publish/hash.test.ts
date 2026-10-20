import { describe, expect, it } from "vitest";
import { contentHash, hashableLead, roundLeadForStore } from "./hash";
import type { LeadCardData } from "../books/types";

function lead(partial: Partial<LeadCardData> = {}): LeadCardData {
  return {
    source: "accounting",
    id: "1",
    sourceLabel: "CPA",
    rank: 3,
    score: 80.4,
    investability: 80.4,
    isActionable: true,
    verdict: "pursue",
    verdictReason: "ok",
    name: "Acme",
    subtitle: "",
    idText: "1",
    scoreLabel: "",
    reasons: "",
    factors: [{ id: "y", label: "Years", points: 12.6, max: 40 }],
    facts: [{ label: "Years licensed", value: "12.6" }],
    badges: [],
    link: { href: "https://example.com", label: "x" },
    imageColor: "#000",
    ...partial,
  };
}

describe("contentHash", () => {
  it("excludes rank so position churn does not change the hash", () => {
    const a = roundLeadForStore(lead({ rank: 1 }));
    const b = roundLeadForStore(lead({ rank: 99 }));
    expect(contentHash(a)).toBe(contentHash(b));
    expect(hashableLead(a)).not.toHaveProperty("rank");
  });

  it("stores the same rounded body it hashes", () => {
    const rounded = roundLeadForStore(lead());
    expect(rounded.facts[0].value).toBe("13");
    expect(rounded.score).toBe(80);
    expect(contentHash(rounded)).toBe(contentHash(roundLeadForStore(rounded)));
  });
});
