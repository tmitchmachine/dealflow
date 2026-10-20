#!/usr/bin/env node
import { getFirestore } from "./firebase";
import { publishDeals } from "./publish";

async function main() {
  const allowShrink = process.argv.includes("--allow-shrink");
  const db = getFirestore();
  console.log(`Publishing deals${allowShrink ? " (--allow-shrink)" : ""}…`);
  const stats = await publishDeals({ db, allowShrink });
  console.log(
    JSON.stringify(
      {
        snapshot: stats.dateId,
        upserts: stats.upserts,
        skips: stats.skips,
        deletes: stats.deletes,
        guardTripped: stats.guardTripped,
        snapshotListings: stats.snapshotListings,
      },
      null,
      2,
    ),
  );
  if (stats.guardTripped.length) {
    console.warn(
      `Shrink guard skipped prune for: ${stats.guardTripped.join(", ")}. ` +
        `Re-run with --allow-shrink to force prune and write fresh (non-stale) snapshot rows.`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
