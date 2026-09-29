import "dotenv/config";
import { refreshPublicSources } from "./source-refresh";

async function main() {
  const result = await refreshPublicSources();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
