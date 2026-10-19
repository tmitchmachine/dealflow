// JSON files on disk for synced sources and their caches. Synced outputs live
// in data/sources/ (small, safe to commit); HTTP caches and spend counters live
// in data/cache/ (gitignored).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SOURCES_DIR = path.resolve(process.cwd(), "data/sources");
export const CACHE_DIR = path.resolve(process.cwd(), "data/cache");

export function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Write via a temp file so a crash mid-write never leaves half a JSON file. */
export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 1)}\n`);
  renameSync(tmp, file);
}

/** Stable digest of extracted fields (never raw HTML), for change detection. */
export function contentHash(value: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
          )
        : v;
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").slice(0, 16);
}

/**
 * Monthly spend counter for a paid API, like Heavenya's placesBudget.js.
 * A cap of 0 disables the API.
 */
export class MonthlyBudget {
  private file: string;
  private state: { month: string; used: number };

  constructor(
    name: string,
    readonly cap: number,
    now = new Date(),
  ) {
    this.file = path.join(CACHE_DIR, `budget-${name}.json`);
    const month = now.toISOString().slice(0, 7);
    const saved = readJson(this.file, { month, used: 0 });
    this.state = saved.month === month ? saved : { month, used: 0 };
  }

  get used(): number {
    return this.state.used;
  }

  canSpend(n = 1): boolean {
    return this.state.used + n <= this.cap;
  }

  spend(n = 1): void {
    this.state.used += n;
    writeJson(this.file, this.state);
  }
}
