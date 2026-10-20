import type { Firestore } from "firebase-admin/firestore";
import { buildDealBooks, type DealBookId } from "../books";
import type { LeadCardData } from "../books/types";
import { contentHash, roundLeadForStore } from "./hash";
import { listingDocId } from "./docId";
import {
  chunk,
  diffNicheListings,
  snapshotNicheSlice,
  type ExistingListing,
  type SlimListing,
  type SnapshotDoc,
} from "./diff";
import { PUBLISH_SCOPE, type PublishScope } from "./scope";

const BOOK_IDS: DealBookId[] = ["accounting", "hvac", "practice", "taxdefault", "bizsale"];

function slimFromLead(nicheId: string, lead: LeadCardData, stage?: string): SlimListing {
  return {
    id: listingDocId(nicheId, lead.id),
    nicheId,
    name: lead.name,
    score: lead.score,
    investability: lead.investability,
    isActionable: lead.isActionable,
    verdict: lead.verdict,
    reasons: lead.reasons.slice(0, 240),
    verifyUrl: lead.link.href,
    ...(stage ? { stage } : {}),
    ...(lead.factorsKnown != null ? { factorsKnown: lead.factorsKnown } : {}),
  };
}

function leadsForBook(books: ReturnType<typeof buildDealBooks>, id: DealBookId): LeadCardData[] {
  return books.rankedByBook[id];
}

function stageFor(books: ReturnType<typeof buildDealBooks>, id: DealBookId): string | undefined {
  if (id === "accounting") return books.accounting.stage;
  if (id === "hvac") return books.hvac.stage;
  return undefined;
}

export type PublishStats = {
  dateId: string;
  upserts: number;
  skips: number;
  deletes: number;
  guardTripped: DealBookId[];
  snapshotListings: number;
};

export async function publishDeals(opts: {
  db: Firestore;
  scope?: PublishScope;
  allowShrink?: boolean;
  now?: Date;
  books?: ReturnType<typeof buildDealBooks>;
}): Promise<PublishStats> {
  const scope = opts.scope ?? PUBLISH_SCOPE;
  const allowShrink = opts.allowShrink ?? false;
  const now = opts.now ?? new Date();
  const dateId = now.toISOString().slice(0, 10);
  const published_at = now.toISOString();
  const books = opts.books ?? buildDealBooks(scope);

  const prevSnap = await loadPreviousSnapshot(opts.db, dateId);

  let upserts = 0;
  let skips = 0;
  let deletes = 0;
  const guardTripped: DealBookId[] = [];

  const snapshotBooks: SnapshotDoc["books"] = {};
  const snapshotListings: SlimListing[] = [];

  for (const nicheId of BOOK_IDS) {
    const ranked = leadsForBook(books, nicheId).map(roundLeadForStore);
    const next = ranked.map((lead) => {
      const id = listingDocId(nicheId, lead.id);
      return { id, contentHash: contentHash(lead), lead };
    });

    const existing = await queryExisting(opts.db, nicheId);
    const diff = diffNicheListings({
      prev: existing,
      next: next.map((n) => ({ id: n.id, contentHash: n.contentHash })),
      shrinkGuardRatio: scope.shrinkGuardRatio,
      allowShrink,
    });

    if (diff.guardTripped) guardTripped.push(nicheId);

    const byId = new Map(next.map((n) => [n.id, n]));
    const writes: { id: string; data: Record<string, unknown> }[] = [];
    for (const id of diff.upsertIds) {
      const row = byId.get(id)!;
      const { rank: _r, ...withoutRank } = row.lead;
      writes.push({
        id,
        data: {
          ...withoutRank,
          nicheId,
          contentHash: row.contentHash,
        },
      });
    }

    for (const batchRows of chunk(writes, 500)) {
      const batch = opts.db.batch();
      for (const w of batchRows) {
        batch.set(opts.db.collection("deal_listings").doc(w.id), w.data);
      }
      await batch.commit();
    }
    for (const batchIds of chunk(diff.deleteIds, 500)) {
      const batch = opts.db.batch();
      for (const id of batchIds) {
        batch.delete(opts.db.collection("deal_listings").doc(id));
      }
      await batch.commit();
    }

    upserts += diff.upsertIds.length;
    skips += diff.skipIds.length;
    deletes += diff.deleteIds.length;

    const stage = stageFor(books, nicheId);
    const slim = ranked.map((l) => slimFromLead(nicheId, l, stage));
    const slice = snapshotNicheSlice({
      nicheId,
      guardTripped: diff.guardTripped,
      allowShrink,
      ranked: slim,
      total: ranked.length,
      prevSnapshotId: prevSnap?.id ?? null,
      prevBook: prevSnap?.data.books?.[nicheId],
      prevListings: prevSnap?.data.listings ?? [],
      cap: scope.snapshotCapPerBook,
    });
    if (slice) {
      snapshotBooks[nicheId] = slice.book;
      snapshotListings.push(...slice.listings);
    }
  }

  const snapshot: SnapshotDoc = {
    published_at,
    scope,
    books: snapshotBooks,
    listings: snapshotListings,
  };
  await opts.db.collection("deal_snapshots").doc(dateId).set(snapshot);

  await pruneOldSnapshots(opts.db, dateId, scope.snapshotRetainDays);

  return {
    dateId,
    upserts,
    skips,
    deletes,
    guardTripped,
    snapshotListings: snapshotListings.length,
  };
}

async function queryExisting(db: Firestore, nicheId: string): Promise<ExistingListing[]> {
  const snap = await db.collection("deal_listings").where("nicheId", "==", nicheId).select("contentHash").get();
  return snap.docs.map((d) => ({
    id: d.id,
    contentHash: String(d.data().contentHash ?? ""),
  }));
}

/** Snapshot ids are YYYY-MM-DD — few docs, sort in memory (no composite index). */
async function loadPreviousSnapshot(
  db: Firestore,
  todayId: string,
): Promise<{ id: string; data: SnapshotDoc } | null> {
  const snap = await db.collection("deal_snapshots").get();
  const sorted = [...snap.docs].sort((a, b) => b.id.localeCompare(a.id));
  for (const d of sorted) {
    if (d.id === todayId) continue;
    return { id: d.id, data: d.data() as SnapshotDoc };
  }
  return null;
}

async function pruneOldSnapshots(db: Firestore, todayId: string, retainDays: number): Promise<void> {
  const cutoff = new Date(`${todayId}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - retainDays);
  const cutoffId = cutoff.toISOString().slice(0, 10);
  const snap = await db.collection("deal_snapshots").get();
  const toDelete = snap.docs.filter((d) => d.id < cutoffId).map((d) => d.id);
  for (const batchIds of chunk(toDelete, 500)) {
    const batch = db.batch();
    for (const id of batchIds) batch.delete(db.collection("deal_snapshots").doc(id));
    await batch.commit();
  }
}
