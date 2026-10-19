// County open-data feeds of delinquent / tax-defaulted parcels (Socrata SODA
// API — public, no key). Each county publishes its own columns, so each maps
// its rows onto one shape; aggregate.ts rolls rows up to parcels.

export interface TaxRow {
  parcel: string;
  /** Tax year the unpaid bill belongs to (or the year it was certified delinquent). */
  taxYear: number | null;
  situsAddress: string;
  situsCity: string;
  ownerName: string;
  mailingAddress: string;
  /** Assessed or appraised value, when the county publishes it. */
  value: number | null;
  /** Amount owed on this row. */
  amount: number;
  /** County's total for the parcel when it publishes one (Sonoma's defaultamt). */
  parcelTotal: number | null;
  defaultDate: string | null;
  saleNoticeDate: string | null;
  bankruptcy: boolean;
  landUse: string;
  /** Paid off / redeemed rows are dropped before aggregation. */
  redeemed: boolean;
}

export interface CountyFeed {
  id: string;
  label: string;
  state: string;
  domain: string;
  dataset: string;
  /** Human page for the dataset, linked from cards. */
  pageUrl: string;
  mapRow: (r: Record<string, string>) => TaxRow | null;
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const year = (v: string | undefined) => {
  const n = num(v);
  return n && n > 1900 ? n : null;
};
/** "06/30/2025" or ISO → YYYY-MM-DD. */
const isoDate = (v: string | undefined): string | null => {
  if (!v) return null;
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const join = (...parts: (string | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(", ");

export const COUNTY_FEEDS: CountyFeed[] = [
  {
    id: "sonoma-ca",
    label: "Sonoma County, CA",
    state: "CA",
    domain: "data.sonomacounty.ca.gov",
    dataset: "bp8v-uax7",
    pageUrl: "https://data.sonomacounty.ca.gov/d/bp8v-uax7",
    mapRow: (r) => {
      const parcel = r.assessment_number?.trim();
      if (!parcel) return null;
      const amount =
        (num(r.base_tax_amount) ?? 0) + (num(r.ten_percent_penality_amount) ?? 0) + (num(r.cost_charge) ?? 0) - (num(r.paid_amount) ?? 0);
      return {
        parcel,
        taxYear: year(r.taxyear),
        situsAddress: titleCase(r.location_address ?? ""),
        situsCity: titleCase((r.location_city_state ?? "").replace(/\*?\s+CA$/i, "").replace(/\*$/, "")),
        ownerName: "",
        mailingAddress: join(r.mailaddress1, r.mailaddress2, r.mailaddress3, r.mailaddress4),
        value: num(r.billednetvalue),
        amount: Math.max(0, amount),
        parcelTotal: num(r.defaultamt),
        defaultDate: isoDate(r.default_date),
        saleNoticeDate: isoDate(r.salenoticedate),
        bankruptcy: /^y/i.test(r.existsbankruptcy ?? ""),
        landUse: "",
        redeemed: Boolean(r.redeemed_date) || (num(r.fullredemptionpaid) ?? 0) > 0,
      };
    },
  },
  {
    id: "norfolk-va",
    label: "Norfolk, VA",
    state: "VA",
    domain: "data.norfolk.gov",
    dataset: "7qie-z5gv",
    pageUrl: "https://data.norfolk.gov/d/7qie-z5gv",
    mapRow: (r) => {
      const parcel = r.account?.trim();
      if (!parcel) return null;
      return {
        parcel,
        taxYear: year(r.bwtaxyear),
        situsAddress: titleCase(r.address ?? ""),
        situsCity: "Norfolk",
        ownerName: titleCase(r.owner_name ?? ""),
        mailingAddress: "",
        value: null,
        amount: num(r.total) ?? 0,
        parcelTotal: null,
        defaultDate: null,
        saleNoticeDate: null,
        bankruptcy: false,
        landUse: "",
        redeemed: false,
      };
    },
  },
  {
    id: "clermont-oh",
    label: "Clermont County, OH",
    state: "OH",
    domain: "internal.opendata.clermontauditor.org",
    dataset: "q52y-wzm4",
    pageUrl: "https://internal.opendata.clermontauditor.org/d/q52y-wzm4",
    mapRow: (r) => {
      const parcel = r.parid?.trim().replace(/\.$/, "");
      if (!parcel) return null;
      return {
        parcel,
        taxYear: year(r.certdlqyr),
        situsAddress: titleCase([r.adrno, r.adrstr, r.adrsuf].filter(Boolean).join(" ")),
        situsCity: titleCase(r.distname ?? ""),
        ownerName: titleCase(r.own1 ?? ""),
        mailingAddress: join(r.mailaddr1, r.mailaddr2, r.mailaddr3),
        value: num(r.valapr3),
        amount: num(r.netdelq) ?? 0,
        parcelTotal: null,
        defaultDate: null,
        saleNoticeDate: null,
        bankruptcy: false,
        landUse: r.land_use_code_description ?? r.class_description ?? "",
        redeemed: false,
      };
    },
  },
];
