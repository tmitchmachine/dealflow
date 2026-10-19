"use client";

import { useState } from "react";
import type { BadgeTone, LeadCardData } from "../lib/desk/types";
import { ScoreDial } from "./ScoreDial";
import { VerdictBadge } from "./VerdictBadge";
import { toGrade } from "../lib/opportunity";

const BADGE: Record<BadgeTone, string> = {
  good: "bg-emerald-700/90 text-white",
  warn: "bg-amber-600/90 text-white",
  bad: "bg-red-700/90 text-white",
  neutral: "bg-zinc-700/90 text-white",
};

export function LeadCard({ lead }: { lead: LeadCardData }) {
  const [open, setOpen] = useState(false);
  const grade = toGrade(lead.score);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition hover:border-line-strong hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col text-left"
        aria-expanded={open}
      >
        <div className="relative h-20" style={{ backgroundColor: lead.imageColor }}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
          <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
            <VerdictBadge verdict={lead.verdict} compact />
            {lead.badges.map((b) => (
              <span
                key={b.label}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE[b.tone]}`}
              >
                {b.label}
              </span>
            ))}
          </div>
          <div className="absolute inset-x-3 bottom-2 flex items-baseline justify-between gap-3">
            <span className="truncate text-xs font-medium text-white/90" title={lead.subtitle}>
              {lead.subtitle}
            </span>
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-white/80">
              {lead.sourceLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-fg">{lead.name}</div>
              <div className="text-sm text-muted">{lead.idText}</div>
              <div className="mt-0.5 text-xs text-subtle">{lead.scoreLabel}</div>
            </div>
            <ScoreDial score={lead.score} grade={grade} size={56} />
          </div>

          {!open && <p className="line-clamp-2 text-xs text-muted">{lead.reasons}</p>}
        </div>
      </button>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <p className="text-sm text-muted">{lead.reasons}</p>
          <p className="mt-2 text-xs text-subtle">{lead.verdictReason}</p>

          {lead.factors.some((f) => f.points > 0) && (
            <ul className="mt-3 space-y-1.5">
              {lead.factors.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-muted">{f.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-positive"
                      style={{ width: `${(f.points / f.max) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums text-muted">
                    {f.points}/{f.max}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-3 grid gap-1.5 text-xs">
            {lead.facts.map((fact, i) => (
              <div key={`${fact.label}-${i}`} className="flex gap-2">
                <dt className="w-28 shrink-0 text-subtle">{fact.label}</dt>
                <dd className="min-w-0 break-words text-fg">{fact.value}</dd>
              </div>
            ))}
          </dl>

          <a
            className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
            href={lead.link.href}
            target="_blank"
            rel="noreferrer"
          >
            {lead.link.label} ↗
          </a>
        </div>
      )}
    </article>
  );
}
