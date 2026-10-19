import { describe, expect, it } from "vitest";
import { countryOf, normalizeStatus, parseApsListing, parsePoeListing } from "./parse";
import { compMultiple, scorePractice } from "./score";
import type { PracticeListing } from "./types";

// Markup mirrors each broker's listing template (Oct 2026); text is invented.
const APS_PAGE = `
<div class="apslistingitem_lstatus">SOLD</div><div class="apslistingitem_lname">Inland Empire CPA Practice</div>
<div class="listingstatscontainer"><div class="listingstat first"><div class="listingstattitle">Listing&nbsp;#</div><div class="listingstatinfo">CAS9001</div></div>
<div class="listingstat"><div class="listingstattitle">Location</div><div class="listingstatinfo">California</div></div>
<div class="listingstat"><div class="listingstattitle">Annual&nbsp;Revenue</div><div class="listingstatinfo">$800,000</div></div>
<div class="listingstat"><div class="listingstattitle">Asking&nbsp;Price</div><div class="listingstatinfo">$1,000,000</div></div>
<div class="listingstat"><div class="listingstattitle">Type</div><div class="listingstatinfo">CPA TAX </div></div></div>
<p>Description:</p><p>Owner is retiring. This practice was established in 1992 and has 400 clients.</p>`;

const POE_PAGE = `
<div class="specs"> <h1>Bay Area Tax Firm &amp; Bookkeeping</h1>
<p class="specs-listing-id-value">CA3100</p>
<p class="specs-annual-gross-value">$500,000</p>
<p class="specs-asking-price-value">$550,000</p>
<div class="spec-row"> <p class="label">Status:</p> <p class="value"><span>Under Contract</span></p> </div>
<div class="spec-row"> <p class="label">Designation:</p> <p class="value">Accounting Firm</p> </div>
<div class="spec-row"> <p class="label">Location:</p> <p class="value"> California </p> </div>
<div class="spec-row"> <p class="label">Reason for Selling:</p> <p class="value">Retirement</p> </div>
</div>
<h2 class="accordion-header">About This Practice</h2><div><p>Founded in 2001, the firm serves small businesses.</p></div>
<a>Request Full Profile</a>`;

describe("broker parsers", () => {
  it("reads an APS listing", () => {
    const l = parseApsListing(APS_PAGE, "https://accountingpracticesales.com/united-states/west/california-south/9001-x/", "2026-10-01");
    expect(l).toMatchObject({
      id: "aps:CAS9001",
      title: "Inland Empire CPA Practice",
      status: "sold",
      country: "US",
      revenue: 800_000,
      askingPrice: 1_000_000,
      multiple: 1.25,
      practiceType: "CPA TAX",
      reasonForSelling: "Retirement",
      establishedYear: 1992,
      lastmod: "2026-10-01",
    });
  });

  it("reads a Poe listing", () => {
    const l = parsePoeListing(POE_PAGE, "https://poegroupadvisors.com/practice/bay-area/");
    expect(l).toMatchObject({
      id: "poe:CA3100",
      title: "Bay Area Tax Firm & Bookkeeping",
      status: "under-contract",
      location: "California",
      country: "US",
      multiple: 1.1,
      reasonForSelling: "Retirement",
      establishedYear: 2001,
    });
  });

  it("returns null for pages that aren't listings", () => {
    expect(parseApsListing("<html>Not found</html>", "https://accountingpracticesales.com/x/")).toBeNull();
    expect(parsePoeListing("<html>Not found</html>", "https://poegroupadvisors.com/x/")).toBeNull();
  });

  it("normalizes status and country", () => {
    expect(normalizeStatus("SOLD")).toBe("sold");
    expect(normalizeStatus("Pending")).toBe("under-contract");
    expect(normalizeStatus("New")).toBe("available");
    expect(countryOf("Alberta")).toBe("CA");
    expect(countryOf("New York")).toBe("US");
    expect(countryOf("Washington DC")).toBe("US");
    expect(countryOf("Cloud Firm")).toBe("other");
  });
});

describe("practice score", () => {
  const listing = (over: Partial<PracticeListing>): PracticeListing => ({
    id: "aps:x",
    broker: "aps",
    listingId: "x",
    url: "",
    title: "",
    status: "available",
    location: "California",
    country: "US",
    revenue: 600_000,
    askingPrice: 600_000,
    multiple: 1,
    practiceType: "",
    reasonForSelling: "",
    establishedYear: null,
    summary: "",
    lastmod: "2026-10-10",
    ...over,
  });

  it("takes the median sold multiple, ignoring nonsense", () => {
    const comps = [1.0, 1.2, 1.4, 9, 0.1].map((multiple) => listing({ status: "sold", multiple }));
    expect(compMultiple(comps)).toEqual({ multiple: 1.2, count: 3 });
  });

  it("scores a cheap, fresh, retiring California practice above a pricey stale one", () => {
    const now = new Date("2026-10-18");
    const cheap = scorePractice(listing({ multiple: 0.9, reasonForSelling: "Retirement" }), 1.2, now);
    const pricey = scorePractice(listing({ multiple: 1.6, lastmod: "2025-01-01", location: "Texas" }), 1.2, now);
    expect(cheap.score).toBeGreaterThan(pricey.score);
    expect(cheap.factors.reduce((s, f) => s + f.points, 0)).toBe(cheap.score);
    expect(cheap.factors.find((f) => f.id === "price")?.points).toBe(40);
    expect(pricey.factors.find((f) => f.id === "price")?.points).toBe(0);
  });
});
