import { describe, expect, it } from "vitest";
import { chunk, diffNicheListings, snapshotNicheSlice } from "./diff";
import { PUBLISH_SCOPE } from "./scope";

describe("diffNicheListings", () => {
  it("skips matching hashes and deletes missing when guard passes", () => {
    const diff = diffNicheListings({
      prev: [
        { id: "a", contentHash: "1" },
        { id: "b", contentHash: "2" },
      ],
      next: [
        { id: "a", contentHash: "1" },
        { id: "c", contentHash: "3" },
      ],
      shrinkGuardRatio: PUBLISH_SCOPE.shrinkGuardRatio,
      allowShrink: false,
    });
    expect(diff.skipIds).toEqual(["a"]);
    expect(diff.upsertIds).toEqual(["c"]);
    expect(diff.deleteIds).toEqual(["b"]);
    expect(diff.guardTripped).toBe(false);
  });

  it("skips prune when empty or below shrinkGuardRatio", () => {
    const empty = diffNicheListings({
      prev: [
        { id: "a", contentHash: "1" },
        { id: "b", contentHash: "2" },
      ],
      next: [],
      shrinkGuardRatio: 0.5,
      allowShrink: false,
    });
    expect(empty.guardTripped).toBe(true);
    expect(empty.deleteIds).toEqual([]);

    const shrunk = diffNicheListings({
      prev: Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, contentHash: "x" })),
      next: [{ id: "p0", contentHash: "y" }],
      shrinkGuardRatio: 0.5,
      allowShrink: false,
    });
    expect(shrunk.guardTripped).toBe(true);
    expect(shrunk.deleteIds).toEqual([]);
    expect(shrunk.upsertIds).toEqual(["p0"]);
  });

  it("--allow-shrink forces prune", () => {
    const diff = diffNicheListings({
      prev: [
        { id: "a", contentHash: "1" },
        { id: "b", contentHash: "2" },
      ],
      next: [],
      shrinkGuardRatio: 0.5,
      allowShrink: true,
    });
    expect(diff.guardTripped).toBe(false);
    expect(diff.deleteIds).toEqual(["a", "b"]);
  });
});

describe("snapshotNicheSlice", () => {
  const prior = [
    {
      id: "accounting_1",
      nicheId: "accounting",
      name: "Old",
      score: 70,
      investability: 70,
      isActionable: true,
      verdict: "pursue",
      reasons: "",
      verifyUrl: "#",
    },
  ];

  it("carries prior rows and marks stale when guard trips", () => {
    const slice = snapshotNicheSlice({
      nicheId: "accounting",
      guardTripped: true,
      allowShrink: false,
      ranked: [],
      total: 0,
      prevSnapshotId: "2026-10-01",
      prevBook: { total: 1 },
      prevListings: prior,
      cap: 50,
    });
    expect(slice?.book.stale).toBe(true);
    expect(slice?.book.staleFrom).toBe("2026-10-01");
    expect(slice?.listings).toEqual(prior);
  });

  it("inherits staleFrom across two consecutive guard trips", () => {
    const first = snapshotNicheSlice({
      nicheId: "accounting",
      guardTripped: true,
      allowShrink: false,
      ranked: [],
      total: 0,
      prevSnapshotId: "2026-10-01",
      prevBook: { total: 1 },
      prevListings: prior,
      cap: 50,
    })!;
    const second = snapshotNicheSlice({
      nicheId: "accounting",
      guardTripped: true,
      allowShrink: false,
      ranked: [],
      total: 0,
      prevSnapshotId: "2026-10-02",
      prevBook: first.book,
      prevListings: first.listings,
      cap: 50,
    })!;
    expect(second.book.staleFrom).toBe("2026-10-01");
  });

  it("--allow-shrink writes fresh non-stale rows", () => {
    const fresh = [
      {
        id: "accounting_2",
        nicheId: "accounting",
        name: "New",
        score: 1,
        investability: 1,
        isActionable: false,
        verdict: "pass",
        reasons: "",
        verifyUrl: "#",
      },
    ];
    const slice = snapshotNicheSlice({
      nicheId: "accounting",
      guardTripped: true,
      allowShrink: true,
      ranked: fresh,
      total: 1,
      prevSnapshotId: "2026-10-01",
      prevBook: { total: 99, stale: true, staleFrom: "2026-09-01" },
      prevListings: prior,
      cap: 50,
    });
    expect(slice?.book.stale).toBeUndefined();
    expect(slice?.listings).toEqual(fresh);
  });
});

describe("chunk", () => {
  it("respects the 500 batch boundary", () => {
    const items = Array.from({ length: 501 }, (_, i) => i);
    const batches = chunk(items, 500);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(500);
    expect(batches[1]).toHaveLength(1);
  });
});
