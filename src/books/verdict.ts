/** Actionable recommendation shown on cards and detail pages. */
export type Verdict = "pursue" | "negotiate" | "watch" | "pass";

export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "pursue":
      return "Pursue";
    case "negotiate":
      return "Negotiate";
    case "watch":
      return "Watch";
    case "pass":
      return "Pass";
  }
}

export function verdictTone(v: Verdict): "good" | "warn" | "neutral" | "bad" {
  switch (v) {
    case "pursue":
      return "good";
    case "negotiate":
      return "warn";
    case "watch":
      return "neutral";
    case "pass":
      return "bad";
  }
}
