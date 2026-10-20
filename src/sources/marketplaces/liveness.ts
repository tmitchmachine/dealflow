// Phase 2 liveness: gone detection, failed sweeps, reappear rules.

import type { MarketplaceHostState, MarketplaceListing, MarketplaceListingStatus } from "./types";
import { goneAfterDaysFor } from "./hosts";

const MS_DAY = 86_400_000;

export function daysBetween(isoA: string, isoB: string): number {
  return (new Date(isoB).getTime() - new Date(isoA).getTime()) / MS_DAY;
}

/**
 * Mark gone when lastSeenAt ≤ lastSuccessfulSweepAt − goneAfterDays.
 * Failed sweeps must not call this (caller stamps nothing).
 */
export function applyGoneRules(
  listings: MarketplaceListing[],
  hostId: string,
  host: MarketplaceHostState,
  nowIso: string,
): MarketplaceListing[] {
  if (!host.lastSuccessfulSweepAt) return listings;
  const goneDays = goneAfterDaysFor(host);
  const cutoff = new Date(host.lastSuccessfulSweepAt).getTime() - goneDays * MS_DAY;

  return listings.map((l) => {
    if (l.host !== hostId) return l;
    if (l.status === "sold" || l.status === "gone") return l;
    const last = new Date(l.lastSeenAt).getTime();
    if (last <= cutoff) {
      return { ...l, status: "gone" as const };
    }
    return l;
  });
}

/**
 * Failed sweep guard: 0 cards OR card count < 0.5 × previousSuccessfulCardCount.
 */
export function isFailedSweep(cardCount: number, previousSuccessfulCardCount: number): boolean {
  if (cardCount === 0) return true;
  if (previousSuccessfulCardCount > 0 && cardCount < 0.5 * previousSuccessfulCardCount) return true;
  return false;
}

/**
 * Reappear / status merge when a for-sale card is seen.
 * Map URL alone never clears sold — only a for-sale card/detail may.
 */
export function mergeStatusFromCard(
  prev: MarketplaceListingStatus | undefined,
  cardStatus: MarketplaceListingStatus,
  fromForSaleCard: boolean,
): MarketplaceListingStatus {
  if (!fromForSaleCard) {
    // Map-only: may clear gone only together with for-sale — so map alone keeps status
    return prev ?? "active";
  }
  if (cardStatus === "sold" || cardStatus === "under-contract") return cardStatus;
  if (prev === "gone") return "active";
  if (prev === "sold") return "active"; // for-sale card clears sold
  return "active";
}

export function shouldRecheckDetail(listing: MarketplaceListing, now = new Date()): boolean {
  if (listing.status !== "active") return false;
  if (!listing.detailScraped) return true;
  const days = (now.getTime() - new Date(listing.lastSeenAt).getTime()) / MS_DAY;
  return days >= 7;
}
