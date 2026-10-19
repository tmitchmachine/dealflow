"use client";

import { useEffect, useState } from "react";
import type { ScoredListing } from "../lib/scoring";
import type { NicheBook, NicheFirmCardData } from "../lib/niches/types";
import { DealDesk } from "./DealDesk";

interface NicheBooksResponse {
  accounting: NicheBook;
  hvac: NicheBook;
  error?: string;
}

export function NicheBooksLoader({
  properties,
}: {
  properties: ScoredListing[];
}) {
  const [accounting, setAccounting] = useState<NicheFirmCardData[]>([]);
  const [hvac, setHvac] = useState<NicheFirmCardData[]>([]);
  const [meta, setMeta] = useState<{
    accounting?: NicheBook;
    hvac?: NicheBook;
  }>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError(null);

    fetch("/api/niches?counties=Orange&limit=200", { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as NicheBooksResponse;
        if (!res.ok) throw new Error(body.error ?? "Failed to load niches");
        setAccounting(body.accounting.firms);
        setHvac(body.hvac.firms);
        setMeta({ accounting: body.accounting, hvac: body.hvac });
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load niches");
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {status === "loading" && (
        <p className="text-sm text-zinc-500">
          Loading California license indexes… (first load can take ~30s while CSLB
          files parse; later requests are cached)
        </p>
      )}
      {status === "error" && error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <DealDesk properties={properties} accounting={accounting} hvac={hvac} />
      {status === "ready" && meta.accounting && meta.hvac && (
        <p className="text-xs text-zinc-400">
          Niches:{" "}
          {meta.accounting.source === "raw"
            ? "live DCA license file"
            : "saved accounting list"}{" "}
          ·{" "}
          {meta.hvac.source === "raw"
            ? "live CSLB license files"
            : "saved HVAC list"}{" "}
          · {meta.accounting.considered.toLocaleString()} accounting matched ·{" "}
          {meta.hvac.considered.toLocaleString()} HVAC matched ·{" "}
          {meta.accounting.disclaimer} {meta.hvac.disclaimer}
          {(meta.accounting.source === "cache" || meta.hvac.source === "cache") && (
            <>
              {" "}
              Serving <code>out/*.csv</code> until <code>data/raw/</code> is restored.
            </>
          )}
        </p>
      )}
    </div>
  );
}
