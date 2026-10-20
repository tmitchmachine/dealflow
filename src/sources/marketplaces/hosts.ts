import type { HostCoverage, MarketplaceHostId, MarketplaceHostState } from "./types";

export interface HostConfig {
  id: MarketplaceHostId;
  label: string;
  hostCoverage: HostCoverage;
  /** Discovery slots per local day (1 full / 2 partial). */
  discoverySlotsPerDay: number;
  /** Initial gone threshold until cycle length is known. */
  defaultGoneAfterDays: number;
  /** Build discovery URLs for this run. pageHint is 1-based deeper page for partial hosts. */
  discoveryUrls: (pageHint: number) => string[];
  waitForMs: number;
}

export const HOSTS: Record<MarketplaceHostId, HostConfig> = {
  empireflippers: {
    id: "empireflippers",
    label: "Empire Flippers",
    hostCoverage: "partial",
    discoverySlotsPerDay: 2,
    defaultGoneAfterDays: 30,
    waitForMs: 4000,
    discoveryUrls: (pageHint) => {
      // SPA — page query is weak; still try page 1 + a deeper attempt for rotation.
      if (pageHint <= 1) return ["https://empireflippers.com/marketplace/"];
      return [`https://empireflippers.com/marketplace/?page=${pageHint}`];
    },
  },
  flippa: {
    id: "flippa",
    label: "Flippa",
    hostCoverage: "partial",
    discoverySlotsPerDay: 2,
    defaultGoneAfterDays: 30,
    waitForMs: 5000,
    discoveryUrls: (pageHint) => {
      const base =
        "https://flippa.com/search?filter[property_type]=website,ecommerce,app,saas&filter[sale_method]=classified,auction,buy_it_now&filter[status]=open&filter[price][min]=5000&sort_order=most_recent";
      return [`${base}&page[number]=${Math.max(1, pageHint)}`];
    },
  },
};

export const HOST_IDS = Object.keys(HOSTS) as MarketplaceHostId[];

export function defaultHostState(id: MarketplaceHostId): MarketplaceHostState {
  const cfg = HOSTS[id];
  return {
    hostCoverage: cfg.hostCoverage,
    lastSuccessfulSweepAt: null,
    previousSuccessfulCardCount: 0,
    rotationPagesSeen: 0,
    cycleLengthDays: null,
    nextRotationPage: 1,
    goneAfterDays: cfg.defaultGoneAfterDays,
  };
}

/** After a full rotation on a partial host, widen gone window. */
export function goneAfterDaysFor(state: MarketplaceHostState): number {
  if (state.hostCoverage === "full") return state.goneAfterDays || 14;
  const cycle = state.cycleLengthDays;
  if (cycle != null) return Math.max(30, 2 * cycle);
  return Math.max(30, state.goneAfterDays || 30);
}
