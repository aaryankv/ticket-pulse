import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { logger } from "@/lib/logger";
import { refreshTrackedTicketWithBrowser } from "@/services/browser-tracker/refresh-ticket";

async function main() {
  const ticketId = process.argv[2];

  if (!ticketId) {
    throw new Error("Usage: npm run browser:refresh -- <tracked-ticket-id>");
  }

  const result = await refreshTrackedTicketWithBrowser(ticketId);
  logger.info({ ticketId, changes: result.changes.length, failures: result.failures.length }, "Browser refresh completed");
}

main().catch((error) => {
  logger.error({ error }, "Browser refresh failed");
  process.exit(1);
});
