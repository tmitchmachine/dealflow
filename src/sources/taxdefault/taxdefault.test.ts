import { describe, expect, it } from "vitest";
import { aggregateParcels, MIN_AMOUNT_DUE, scoreParcel } from "./aggregate";
import { COUNTY_FEEDS } from "./counties";
import { fetchCountyRows } from "./sync";

const sonoma = COUNTY_FEEDS.find((f) => f.id === "sonoma-ca")!;

const sonomaRow = (over: Record<string, string>) => ({
  assessment_number: "001",
  taxyear: "2021",
  base_tax_amount: "5000",
  ten_percent_penality_amount: "500",
  cost_charge: "20",
  paid_amount: "0",
  billednetvalue: "400000",
  location_address: "12 OAK ST",
  location_city_state: "SANTA ROSA* CA",
  mailaddress1: "99 ELM AVE",
  mailaddress2: "SACRAMENTO CA 95829",
  default_date: "06/30/2022",
  defaultamt: "18000",
  existsbankruptcy: "No",
  ...over,
});

describe("tax-default aggregation", () => {
  const rows = [
    sonoma.mapRow(sonomaRow({ taxyear: "2021" }))!,
    sonoma.mapRow(sonomaRow({ taxyear: "2022" }))!,
    sonoma.mapRow(sonomaRow({ assessment_number: "002", redeemed_date: "2025-01-01" }))!,
    sonoma.mapRow(sonomaRow({ assessment_number: "003", base_tax_amount: "100", defaultamt: "120" }))!,
  ];
  const parcels = aggregateParcels(sonoma, rows);

  it("rolls tax years up per parcel, dropping redeemed and tiny debts", () => {
    expect(parcels).toHaveLength(1);
    expect(parcels[0]).toMatchObject({
      id: "sonoma-ca:001",
      situsAddress: "12 Oak St",
      situsCity: "Santa Rosa",
      taxYears: [2021, 2022],
      firstYear: 2021,
      amountDue: 18000, // the county's own parcel total wins over summed rows
      absentee: true,
      value: 400000,
      defaultDate: "2022-06-30",
    });
    expect(MIN_AMOUNT_DUE).toBeGreaterThan(120);
  });

  it("doesn't call a PO box owner absentee", () => {
    const [p] = aggregateParcels(sonoma, [sonoma.mapRow(sonomaRow({ mailaddress1: "PO BOX 12" }))!]);
    expect(p.absentee).toBeNull();
  });

  it("scores with factors that add up, full years at 5", () => {
    const s = scoreParcel(parcels[0], new Date("2026-10-18"));
    expect(s.yearsBehind).toBe(5);
    expect(s.factors.find((f) => f.id === "years")?.points).toBe(35);
    expect(s.factors.find((f) => f.id === "absentee")?.points).toBe(15);
    expect(s.factors.reduce((a, f) => a + f.points, 0)).toBe(s.score);
  });

  it("pages through Socrata until a short page", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify([sonomaRow({})]), { status: 200 });
    }) as unknown as typeof fetch;
    const rows = await fetchCountyRows(sonoma, fetchImpl);
    expect(rows).toHaveLength(1);
    expect(calls[0]).toContain("/resource/bp8v-uax7.json?%24limit=50000&%24offset=0");
  });
});
