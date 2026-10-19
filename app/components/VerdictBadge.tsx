import { verdictLabel, verdictTone, type Verdict } from "../lib/opportunity";

const TONE: Record<ReturnType<typeof verdictTone>, string> = {
  good: "bg-emerald-600 text-white",
  warn: "bg-amber-500 text-white",
  neutral: "bg-zinc-500 text-white",
  bad: "bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
};

export function VerdictBadge({
  verdict,
  compact = false,
}: {
  verdict: Verdict;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide ${TONE[verdictTone(verdict)]} ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      {verdictLabel(verdict)}
    </span>
  );
}
