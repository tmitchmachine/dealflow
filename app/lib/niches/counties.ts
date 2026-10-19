// County scopes the desk can load license indexes for. Names match how the
// state files spell them, which is what /api/niches?counties= filters on.

/** "" is statewide; the rest are the counties with the most active firms. */
export const COUNTIES = [
  "",
  "Los Angeles",
  "Orange",
  "San Diego",
  "Riverside",
  "San Bernardino",
  "Santa Clara",
  "Sacramento",
  "Alameda",
  "Contra Costa",
] as const;
export type County = (typeof COUNTIES)[number];

export const countyLabel = (county: County) =>
  county ? `${county} County` : "Statewide";
