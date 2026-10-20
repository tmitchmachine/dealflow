import { existsSync } from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "../../web/store";
import { syncMarketplaces } from "./sync";

const PAUSE_FILE = path.join(CACHE_DIR, "marketplace-sync.paused");

async function main() {
  if (process.env.MARKETPLACE_SYNC_PAUSED === "1" || existsSync(PAUSE_FILE)) {
    console.log(
      "Marketplace sync paused (remove data/cache/marketplace-sync.paused or unset MARKETPLACE_SYNC_PAUSED).",
    );
    process.exit(0);
  }
  if (!process.env.FIRECRAWL_API_KEY) {
    console.error("Set FIRECRAWL_API_KEY (e.g. tsx --env-file=.env …)");
    process.exit(1);
  }
  await syncMarketplaces({ log: console.log });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
