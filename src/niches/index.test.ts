import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getNiche, NICHES, nicheInfo } from "@/niches";

describe("NICHES", () => {
  it("has exactly one selling index, and it is the default", () => {
    expect(
      NICHES.filter((n) => n.stage === "selling").map((n) => n.id),
    ).toEqual([NICHES[0].id]);
  });

  it("gives every index a disclaimer that says the rank is not advice", () => {
    for (const n of NICHES) {
      expect(n.disclaimer).toContain(
        "not investment advice or a recommendation to buy or sell",
      );
    }
  });

  it("matches the README methodology tables to each index's factors", () => {
    const readme = readFileSync(
      path.join(__dirname, "..", "..", "README.md"),
      "utf8",
    );
    for (const n of NICHES) {
      for (const f of n.factors) {
        expect(readme).toContain(
          `| ${f.label} | \`pts_${f.id}\` | ${f.max} | ${f.rule} |`,
        );
      }
    }
  });

  it("sends the UI the stage, disclaimer and factors", () => {
    for (const n of NICHES) {
      expect(nicheInfo(n)).toMatchObject({
        stage: n.stage,
        disclaimer: n.disclaimer,
        factors: n.factors,
      });
    }
  });

  it("calls an unknown id an index", () => {
    expect(() => getNiche("nope")).toThrow('Unknown index "nope"');
  });
});
