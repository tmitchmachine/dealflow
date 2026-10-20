import type { PublishScope } from "./scope";

export type ExistingListing = { id: string; contentHash: string };

export type DiffResult = {
  upsertIds: string[];
  skipIds: string[];
  deleteIds: string[];
  guardTripped: boolean;
};

/**
 * Decide upserts / skips / deletes for one niche.
 * When the shrink guard trips (and allowShrink is false), deletes are empty.
 */
export function diffNicheListings(opts: {
  prev: ExistingListing[];
  next: { id: string; contentHash: string }[];
  shrinkGuardRatio: number;
  allowShrink: boolean;
}): DiffResult {
  const prevById = new Map(opts.prev.map((p) => [p.id, p.contentHash]));
  const nextIds = new Set(opts.next.map((n) => n.id));
  const prevCount = opts.prev.length;
  const newCount = opts.next.length;

  const shrink =
    newCount === 0 ||
    (prevCount > 0 && newCount < prevCount * opts.shrinkGuardRatio);
  const guardTripped = shrink && !opts.allowShrink;

  const upsertIds: string[] = [];
  const skipIds: string[] = [];
  for (const n of opts.next) {
    const old = prevById.get(n.id);
    if (old === n.contentHash) skipIds.push(n.id);
    else upsertIds.push(n.id);
  }

  const deleteIds: string[] = [];
  if (!guardTripped) {
    for (const p of opts.prev) {
      if (!nextIds.has(p.id)) deleteIds.push(p.id);
    }
  }

  return { upsertIds, skipIds, deleteIds, guardTripped };
}

export type SnapshotBookMeta = {
  total: number;
  stale?: boolean;
  staleFrom?: string;
};

export type SlimListing = {
  id: string;
  nicheId: string;
  name: string;
  score: number;
  factorsKnown?: number;
  investability: number;
  isActionable: boolean;
  verdict: string;
  reasons: string;
  verifyUrl: string;
  stage?: string;
};

export type SnapshotDoc = {
  published_at: string;
  scope: PublishScope;
  books: Record<string, SnapshotBookMeta>;
  listings: SlimListing[];
};

/**
 * Build one niche's contribution to today's snapshot.
 * When guard tripped, carry prior rows and inherit staleFrom across consecutive stales.
 */
export function snapshotNicheSlice(opts: {
  nicheId: string;
  guardTripped: boolean;
  allowShrink: boolean;
  ranked: SlimListing[];
  total: number;
  prevSnapshotId: string | null;
  prevBook: SnapshotBookMeta | undefined;
  prevListings: SlimListing[];
  cap: number;
}): { book: SnapshotBookMeta; listings: SlimListing[] } | null {
  const treatFresh = !opts.guardTripped || opts.allowShrink;
  if (treatFresh) {
    return {
      book: { total: opts.total },
      listings: opts.ranked.slice(0, opts.cap),
    };
  }

  const prior = opts.prevListings.filter((l) => l.nicheId === opts.nicheId);
  if (prior.length === 0 && !opts.prevBook) return null;

  const staleFrom =
    opts.prevBook?.stale && opts.prevBook.staleFrom
      ? opts.prevBook.staleFrom
      : (opts.prevSnapshotId ?? undefined);

  return {
    book: {
      total: opts.prevBook?.total ?? prior.length,
      stale: true,
      ...(staleFrom ? { staleFrom } : {}),
    },
    listings: prior.slice(0, opts.cap),
  };
}

/** Chunk an array into batches of at most `size` (Firestore limit 500). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
