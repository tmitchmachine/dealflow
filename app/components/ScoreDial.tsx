import { scoreColor } from "../lib/format";

/** A compact circular score dial (0–100) with the letter grade in the center. */
export function ScoreDial({
  score,
  grade,
  size = 72,
}: {
  score: number;
  grade: string;
  size?: number;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  const colors = scoreColor(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-zinc-200 dark:text-zinc-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={colors.bar.replace("bg-", "text-")}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className={`text-lg font-bold ${colors.text}`}>{score}</span>
        <span className="text-[10px] font-semibold text-zinc-500">{grade}</span>
      </div>
    </div>
  );
}
