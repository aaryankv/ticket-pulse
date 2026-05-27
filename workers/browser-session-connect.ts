import { setTimeout as delay } from "node:timers/promises";
import { logger } from "@/lib/logger";
import { getBrowserSessionState, openOracleSsoPortals } from "@/services/browser-tracker/session";

async function main() {
  const keepOpenMinutes = Number(process.env.BROWSER_SESSION_CONNECT_MINUTES ?? 20);
  const state = getBrowserSessionState();

  logger.info({ profileDir: state.profileDir }, "Opening Oracle portals for unified login");
  const connection = await openOracleSsoPortals();

  logger.info(
    { keepOpenMinutes },
    "Complete Oracle unified login in the opened browser. The browser profile will be reused by browser-worker."
  );

  await delay(keepOpenMinutes * 60_000);
  await connection.close();
  logger.info("Oracle browser session connect window closed");
}

main().catch((error) => {
  logger.error({ error }, "Oracle browser session connect failed");
  process.exit(1);
});
