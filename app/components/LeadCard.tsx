"use client";

import { useState } from "react";
import type { NicheFirmCardData } from "../lib/niches/types";
import { ScoreDial } from "./ScoreDial";
import { VerdictBadge } from "./VerdictBadge";
import { toGrade } from "../lib/opportunity";

export function NicheFirmCard({ firm }: { firm: NicheFirmCardData }) {
  const [open, setOpen] = useState(false);
  const grade = toGrade(firm.score);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col text-left"
        aria-expanded={open}
      >
        <div className="relative h-28" style={{ backgroundColor: firm.imageColor }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <VerdictBadge verdict={firm.verdict} compact />
            {firm.stage === "comparison" && (
              <span className="rounded-full bg-zinc-700/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Comparison
              </span>
            )}
            {firm.stage === "selling" && (
              <span className="rounded-full bg-emerald-700/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Selling index
              </span>
            )}
          </div>
          <span className="absolute bottom-2 left-3 text-xs font-medium text-white/90">
            {firm.subtitle}
          </span>
          <span className="absolute bottom-2 right-3 text-[10px] font-medium uppercase tracking-wide text-white/80">
            {firm.nicheLabel}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {firm.name}
              </div>
              <div className="text-sm text-zinc-500">
                License #{firm.licenseNumber} · rank {firm.rank}
              </div>
              <div className="mt-0.5 text-xs text-zinc-400">
                Investability {firm.investability} · license-tenure score
              </div>
            </div>
            <ScoreDial score={firm.score} grade={grade} size={56} />
          </div>

          <p className="line-clamp-2 text-xs text-zinc-500">{firm.reasons}</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{firm.reasons}</p>
          <p className="mt-2 text-xs text-zinc-400">{firm.verdictReason}</p>

          {firm.factors.some((f) => f.points > 0) && (
            <ul className="mt-3 space-y-1.5">
              {firm.factors.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-zinc-500">{f.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${(f.points / f.max) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-zinc-500">
                    {f.points}/{f.max}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-3 grid gap-1.5 text-xs">
            {firm.facts.map((fact) => (
              <div key={fact.label} className="flex gap-2">
                <dt className="w-28 shrink-0 text-zinc-400">{fact.label}</dt>
                <dd className="text-zinc-700 dark:text-zinc-200">{fact.value}</dd>
              </div>
            ))}
          </dl>

          <a
            className="mt-3 inline-block text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            href={firm.verifyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Verify license #{firm.licenseNumber}
          </a>
        </div>
      )}
    </article>
  );
}
