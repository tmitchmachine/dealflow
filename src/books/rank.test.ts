import { describe, expect, it } from "vitest";
import { compareLeads, rankLeads } from "./rank";
import type { LeadCardData } from "./types";

function lead(partial: Partial<LeadCardData> & Pick<LeadCardData, "id" | "isActionable" | "investability" | "score">): LeadCardData {
  return {
    source: "hvac",
    sourceLabel: "HVAC",
    rank: 1,
    verdict: "watch",
    verdictReason: "",
    name: partial.id,
    subtitle: "",
    idText: partial.id,
    scoreLabel: "",
    reasons: "",
    factors: [],
    facts: [],
    badges: [],
    link: { href: "#", label: "" },
    imageColor: "#000",
    ...partial,
  };
}

describe("rankLeads", () => {
  it("puts actionable ahead of a higher-scoring comparison lead", () => {
    const comparison = lead({
      id: "comp",
      isActionable: false,
      investability: 100,
      score: 100,
    });
    const actionable = lead({
      id: "act",
      isActionable: true,
      investability: 80,
      score: 80,
    });
    expect(rankLeads([comparison, actionable]).map((l) => l.id)).toEqual(["act", "comp"]);
    expect(compareLeads(actionable, comparison)).toBeLessThan(0);
  });

  it("breaks ties with investability then score", () => {
    const a = lead({ id: "a", isActionable: true, investability: 70, score: 90 });
    const b = lead({ id: "b", isActionable: true, investability: 80, score: 50 });
    expect(rankLeads([a, b]).map((l) => l.id)).toEqual(["b", "a"]);
  });
});
