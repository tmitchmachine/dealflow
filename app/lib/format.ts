// Small presentation helpers shared across the UI.

export const usd = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    ...opts,
  }).format(n);

export const pct = (ratio: number, digits = 1) =>
  `${(ratio * 100).toFixed(digits)}%`;

export const signedUsd = (n: number) =>
  `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;

/** Tailwind classes for a 0–100 score, used for badges and bars. */
export function scoreColor(score: number): { text: string; bg: string; bar: string } {
  if (score >= 80) return { text: "text-emerald-700", bg: "bg-emerald-100", bar: "bg-emerald-500" };
  if (score >= 68) return { text: "text-lime-700", bg: "bg-lime-100", bar: "bg-lime-500" };
  if (score >= 55) return { text: "text-amber-700", bg: "bg-amber-100", bar: "bg-amber-500" };
  if (score >= 42) return { text: "text-orange-700", bg: "bg-orange-100", bar: "bg-orange-500" };
  return { text: "text-red-700", bg: "bg-red-100", bar: "bg-red-500" };
}

export const gradeColor: Record<string, string> = {
  A: "bg-emerald-600",
  B: "bg-lime-600",
  C: "bg-amber-500",
  D: "bg-orange-500",
  F: "bg-red-600",
};
