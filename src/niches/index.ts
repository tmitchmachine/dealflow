import type { Niche, NicheInfo } from "@/core/niche";
import { accounting } from "./accounting";
import { hvac } from "./hvac";

/**
 * Every index the CLI and UI can list. The first one is the default and the only one with
 * stage "selling"; index.test.ts enforces that.
 */
export const NICHES: Niche[] = [accounting as Niche, hvac as Niche];

export function getNiche(id: string): Niche {
  const niche = NICHES.find((n) => n.id === id);
  if (!niche) {
    throw new Error(
      `Unknown index "${id}". Choose one of: ${NICHES.map((n) => n.id).join(", ")}`,
    );
  }
  return niche;
}

export const nicheInfo = (n: Niche): NicheInfo => ({
  id: n.id,
  label: n.label,
  title: n.title,
  lede: n.lede,
  filePrefix: n.filePrefix,
  stage: n.stage,
  disclaimer: n.disclaimer,
  factors: n.factors,
});
