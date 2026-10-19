import type { BusinessIndustry, IndustryBenchmark } from "./types";

/** Mid-market SDE multiple baselines — starting points, not gospel. */
export const INDUSTRY_BENCHMARKS: Record<BusinessIndustry, IndustryBenchmark> = {
  "hvac-plumbing": {
    industry: "hvac-plumbing",
    label: "HVAC / Plumbing",
    sdeMultiple: 3.0,
    multipleDispersion: 0.45,
    expectedGrowth: 0.05,
  },
  landscaping: {
    industry: "landscaping",
    label: "Landscaping",
    sdeMultiple: 2.6,
    multipleDispersion: 0.4,
    expectedGrowth: 0.04,
  },
  restaurant: {
    industry: "restaurant",
    label: "Restaurant / Food",
    sdeMultiple: 2.0,
    multipleDispersion: 0.5,
    expectedGrowth: 0.02,
  },
  retail: {
    industry: "retail",
    label: "Brick & Mortar Retail",
    sdeMultiple: 2.1,
    multipleDispersion: 0.45,
    expectedGrowth: 0.01,
  },
  ecommerce: {
    industry: "ecommerce",
    label: "E-commerce",
    sdeMultiple: 2.8,
    multipleDispersion: 0.55,
    expectedGrowth: 0.08,
  },
  healthcare: {
    industry: "healthcare",
    label: "Healthcare / Dental",
    sdeMultiple: 3.4,
    multipleDispersion: 0.4,
    expectedGrowth: 0.04,
  },
  saas: {
    industry: "saas",
    label: "SaaS / Software",
    sdeMultiple: 4.2,
    multipleDispersion: 0.7,
    expectedGrowth: 0.15,
  },
  manufacturing: {
    industry: "manufacturing",
    label: "Light Manufacturing",
    sdeMultiple: 3.2,
    multipleDispersion: 0.5,
    expectedGrowth: 0.03,
  },
  "auto-services": {
    industry: "auto-services",
    label: "Auto Services",
    sdeMultiple: 2.7,
    multipleDispersion: 0.4,
    expectedGrowth: 0.03,
  },
  cleaning: {
    industry: "cleaning",
    label: "Commercial Cleaning",
    sdeMultiple: 2.5,
    multipleDispersion: 0.35,
    expectedGrowth: 0.04,
  },
  laundry: {
    industry: "laundry",
    label: "Laundromat / Car Wash",
    sdeMultiple: 3.0,
    multipleDispersion: 0.45,
    expectedGrowth: 0.02,
  },
  "professional-services": {
    industry: "professional-services",
    label: "Professional Services",
    sdeMultiple: 2.8,
    multipleDispersion: 0.5,
    expectedGrowth: 0.05,
  },
};

export function industryLabel(industry: BusinessIndustry): string {
  return INDUSTRY_BENCHMARKS[industry].label;
}
