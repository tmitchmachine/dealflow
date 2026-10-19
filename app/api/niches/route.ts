import { NextResponse } from "next/server";
import { jsonResponse } from "../../lib/http";
import { loadNicheBooks } from "../../lib/niches/load";

export const runtime = "nodejs";

/** Enough for every active firm in the biggest county (LA: ~2,900 HVAC). */
const MAX_LIMIT = 3000;

/** Niche desk payload — kept off the RSC flight so the homepage stays small. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // An empty `counties=` means statewide.
  const counties = (url.searchParams.get("counties") ?? "Orange")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "200", 10);
  const minYears = Number.parseInt(url.searchParams.get("minYears") ?? "0", 10);

  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  }
  if (!Number.isFinite(minYears) || minYears < 0) {
    return NextResponse.json({ error: "Invalid minYears" }, { status: 400 });
  }

  const books = loadNicheBooks({
    counties,
    limit,
    minYears,
    includeInactive: url.searchParams.get("includeInactive") === "1",
  });

  return jsonResponse(req, books);
}
