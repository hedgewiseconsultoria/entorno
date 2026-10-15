import "dotenv/config";
import { refreshPublicSources } from "./source-refresh";

async function main() {
  const result = await refreshPublicSources();
  console.log(JSON.stringify(result, null, 2));
  const hasErrors = result.sources.some((source) => source.status === "error");
  process.exit(hasErrors ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
