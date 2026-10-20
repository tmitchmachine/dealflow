import { syncMarketplaces } from "./sync";

async function main() {
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
