import { NextResponse } from "next/server";
import { loadPracticeBook } from "../../lib/desk/practices";
import { loadTaxDefaultBook } from "../../lib/desk/taxdefault";
import { jsonResponse } from "../../lib/http";

export const runtime = "nodejs";

const MAX_TAX_DEFAULT = 3000;

/**
 * Web-sourced leads: broker practices for sale and county tax-default parcels.
 * Both read files the sync CLIs write (npm run sync:brokers / sync:taxdefault).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number.parseInt(url.searchParams.get("taxLimit") ?? "1500", 10);
  if (!Number.isFinite(limit) || limit < 0 || limit > MAX_TAX_DEFAULT) {
    return NextResponse.json({ error: "Invalid taxLimit" }, { status: 400 });
  }
  return jsonResponse(req, {
    practices: loadPracticeBook(),
    taxDefault: loadTaxDefaultBook(limit),
  });
}
