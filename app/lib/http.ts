import { gzipSync } from "node:zlib";

/**
 * JSON response, gzipped when the client accepts it. Route handlers aren't
 * compressed by `next start`, and desk books run to megabytes of JSON.
 */
export function jsonResponse(req: Request, data: unknown, status = 200): Response {
  const json = JSON.stringify(data);
  if (req.headers.get("accept-encoding")?.includes("gzip")) {
    return new Response(gzipSync(json), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        Vary: "Accept-Encoding",
      },
    });
  }
  return new Response(json, { status, headers: { "Content-Type": "application/json" } });
}
