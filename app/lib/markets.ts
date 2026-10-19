// Market-level statistics by metro.
//
// Sale $/sqft, YoY, and days-on-market come from Redfin's free Data Center
// metro tracker. Tax/insurance baselines live in metros.ts. Rent $/sqft uses
// the metro baseline, optionally enriched from RentCast ZIP market stats when
// RENTCAST_LIVE=1 (plus a key) and RENTCAST_ENRICH_RENT=1.

import type { MarketStats } from "./types";
import { METRO_CONFIGS } from "./metros";
import snapshot from "./data/redfin-metro-snapshot.json";
import { fetchRedfinMetroStats } from "./sources/redfin-markets";
import {
  fetchRentCastRentPpsf,
  rentcastLiveEnabled,
} from "./sources/rentcast";

/** Dispersion shrinks as the sold-comp sample grows. */
function dispersionFromSample(homesSold: number): number {
  if (homesSold <= 0) return 0.2;
  return Math.min(0.25, Math.max(0.08, 0.08 + 40 / homesSold));
}

function buildMarket(
  metroId: string,
  sale: {
    medianPpsf: number;
    ppsfYoY: number;
    medianDaysOnMarket: number;
    homesSold: number;
  },
  rentPpsfMonthly: number,
): MarketStats {
  const cfg = METRO_CONFIGS.find((m) => m.id === metroId)!;
  return {
    id: cfg.id,
    metro: cfg.metro,
    state: cfg.state,
    medianPpsf: Math.round(sale.medianPpsf * 10) / 10,
    ppsfYoY: sale.ppsfYoY,
    ppsfDispersion: dispersionFromSample(sale.homesSold),
    compSampleSize: Math.max(1, Math.round(sale.homesSold)),
    rentPpsfMonthly,
    medianDaysOnMarket: sale.medianDaysOnMarket,
    propertyTaxRate: cfg.propertyTaxRate,
    insuranceRate: cfg.insuranceRate,
  };
}

export interface MarketsResult {
  markets: Record<string, MarketStats>;
  /** True when sale stats came from a live Redfin download this process. */
  redfinLive: boolean;
  periodBegin: string;
  /** True when rent $/sqft was enriched from RentCast for at least one metro. */
  rentcastRent: boolean;
}

/**
 * Resolve market stats for scoring. Always prefers Redfin (live or snapshot)
 * for sale metrics; optionally overlays RentCast rent $/sqft.
 */
export async function getMarkets(): Promise<MarketsResult> {
  const { rows, live, periodBegin } = await fetchRedfinMetroStats();

  let rentcastRent = false;
  const markets: Record<string, MarketStats> = {};

  for (const cfg of METRO_CONFIGS) {
    const sale = rows[cfg.id];
    let rent = cfg.rentPpsfMonthly;

    if (rentcastLiveEnabled()) {
      const liveRent = await fetchRentCastRentPpsf(cfg);
      if (liveRent != null) {
        rent = liveRent;
        rentcastRent = true;
      }
    }

    if (sale) {
      markets[cfg.id] = buildMarket(cfg.id, sale, rent);
    } else {
      // Should be rare — snapshot covers every configured metro.
      markets[cfg.id] = MARKETS[cfg.id];
      if (rent !== markets[cfg.id].rentPpsfMonthly) {
        markets[cfg.id] = { ...markets[cfg.id], rentPpsfMonthly: rent };
      }
    }
  }

  return { markets, redfinLive: live, periodBegin, rentcastRent };
}

/**
 * Synchronous market table from the committed Redfin snapshot + metro
 * baselines. Prefer `getMarkets()` in Server Components for a live refresh.
 */
export const MARKETS: Record<string, MarketStats> = Object.fromEntries(
  METRO_CONFIGS.map((cfg) => {
    const row = snapshot.metros[cfg.id as keyof typeof snapshot.metros];
    const homesSold = row?.homesSold ?? 40;
    return [
      cfg.id,
      {
        id: cfg.id,
        metro: cfg.metro,
        state: cfg.state,
        medianPpsf: row ? Math.round(row.medianPpsf * 10) / 10 : 150,
        ppsfYoY: row?.ppsfYoY ?? 0.03,
        ppsfDispersion: dispersionFromSample(homesSold),
        compSampleSize: Math.max(1, homesSold),
        rentPpsfMonthly: cfg.rentPpsfMonthly,
        medianDaysOnMarket: row?.medianDaysOnMarket ?? 30,
        propertyTaxRate: cfg.propertyTaxRate,
        insuranceRate: cfg.insuranceRate,
      } satisfies MarketStats,
    ];
  }),
);
