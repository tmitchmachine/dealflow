export const PUBLISH_SCOPE = {
  counties: ["Orange"] as const,
  nicheLimit: 200,
  taxDefaultLimit: 1500,
  bizSaleLimit: 200,
  snapshotCapPerBook: 50,
  snapshotRetainDays: 30,
  shrinkGuardRatio: 0.5,
} as const;

export type PublishScope = typeof PUBLISH_SCOPE;
