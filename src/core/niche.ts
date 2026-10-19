/** Filters every niche understands. */
export interface ListQuery {
  /** County names as the state spells them ("Orange", "Los Angeles"); empty means statewide. */
  counties: string[];
  limit: number;
  /** Minimum years since the firm registered or was licensed. */
  minYears: number;
  /** Also list delinquent, inactive or suspended licenses. */
  includeInactive: boolean;
  asOf: Date;
}

/** One CSV row: every niche starts with these, then adds its own columns. */
export type CsvRow = {
  rank: number;
  score: number;
  reasons: string;
} & Record<string, string | number>;

/** One row of an index's published methodology. An index's maxes sum to 100. */
export interface FactorDef<Id extends string = string> {
  /** Also names the factor's CSV column, `pts_<id>`. */
  id: Id;
  label: string;
  max: number;
  /** How the points are earned, in the words buyers see. */
  rule: string;
}

/** One factor's whole-number points on one business. A business's points sum to its score. */
export interface FactorPoints<Id extends string = string> {
  id: Id;
  label: string;
  points: number;
  max: number;
}

/** What the UI shows for one ranked business, the same shape for every niche. */
export interface Card {
  rank: number;
  score: number;
  reasons: string;
  name: string;
  /** "City, County · entity type" */
  subtitle: string;
  licenseNumber: string;
  factors: FactorPoints[];
  facts: { label: string; value: string }[];
  verifyUrl: string;
}

export interface NicheList {
  rows: CsvRow[];
  cards: Card[];
  /** Businesses that passed the filters, before the limit. */
  considered: number;
  /** One line about data coverage, such as how many rows carry owner facts. */
  summary: string;
}

export interface NicheInfo {
  id: string;
  label: string;
  title: string;
  lede: string;
  /** Prefix for CSV files written by the CLI. */
  filePrefix: string;
  /** Outreach goes to the one "selling" index; a "comparison" index is not for outreach. */
  stage: "selling" | "comparison";
  /** Shown with every list: the data source, and that the rank is not advice. */
  disclaimer: string;
  /** The published methodology, in the order cards and CSV columns show it. */
  factors: readonly FactorDef[];
}

/** One index in the Dealflow family. User-facing copy says "index"; the code says niche. */
export interface Niche<TData = unknown> extends NicheInfo {
  /** Reads this niche's raw files from `data/raw/`; throws with download help if missing. */
  load(dataDir: string): TData;
  list(data: TData, query: ListQuery): NicheList;
}

/**
 * Rounds raw factor points to whole numbers that add up to the rounded total. Each factor
 * gets its floor, and the leftover points go to the largest fractions (the earlier factor
 * on a tie). A factor can only round up to its ceiling, so it never passes its max.
 */
export function roundPoints(raw: number[]): number[] {
  const points = raw.map((r) => Math.floor(r));
  let left =
    Math.round(raw.reduce((a, b) => a + b, 0)) -
    points.reduce((a, b) => a + b, 0);
  const byFraction = raw
    .map((r, i) => ({ i, fraction: r - points[i] }))
    .filter((f) => f.fraction > 0)
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (const { i } of byFraction) {
    if (left <= 0) break;
    points[i] += 1;
    left -= 1;
  }
  return points;
}

/** Rounds an index's raw points per factor and totals them into its 0–100 score. */
export function scoreFactors<Id extends string>(
  defs: readonly FactorDef<Id>[],
  raw: Record<Id, number>,
): { score: number; factors: FactorPoints<Id>[] } {
  const points = roundPoints(defs.map((f) => raw[f.id]));
  return {
    score: points.reduce((a, b) => a + b, 0),
    factors: defs.map((f, i) => ({
      id: f.id,
      label: f.label,
      points: points[i],
      max: f.max,
    })),
  };
}

/** CSV columns for factor points, named `pts_<id>` the same way in every index. */
export type PointColumns<Id extends string> = Record<`pts_${Id}`, number>;

export const pointColumns = <Id extends string>(
  factors: FactorPoints<Id>[],
): PointColumns<Id> =>
  Object.fromEntries(
    factors.map((f) => [`pts_${f.id}`, f.points]),
  ) as PointColumns<Id>;

/** Reads a CSV row's `pts_<id>` columns back into factor points, for the UI card. */
export const factorsFromRow = <Id extends string>(
  defs: readonly FactorDef<Id>[],
  row: PointColumns<Id>,
): FactorPoints<Id>[] =>
  defs.map((f) => ({
    id: f.id,
    label: f.label,
    points: row[`pts_${f.id}` as const],
    max: f.max,
  }));

/** Shared formatting for a percentage of a total, "0%" when the total is zero. */
export const percent = (part: number, whole: number) =>
  `${whole ? Math.round((part / whole) * 100) : 0}%`;
