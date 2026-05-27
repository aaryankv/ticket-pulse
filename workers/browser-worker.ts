import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import cron from "node-cron";
import { logger } from "@/lib/logger";
import { refreshDueBrowserJobs } from "@/services/browser-tracker/refresh-ticket";

const intervalMinutes = Number(process.env.BROWSER_WORKER_INTERVAL_MINUTES ?? process.env.POLLING_INTERVAL_MINUTES ?? 30);
const cronExpression = intervalMinutes <= 1 ? "* * * * *" : `*/${intervalMinutes} * * * *`;

logger.info({ cronExpression }, "Ticket Pulse browser tracker worker started");

cron.schedule(cronExpression, async () => {
  try {
    const results = await refreshDueBrowserJobs();
    logger.info({ refreshed: results.length }, "Browser tracker cycle completed");
  } catch (error) {
    logger.error({ error }, "Browser tracker cycle failed");
  }
});

void refreshDueBrowserJobs().catch((error) => {
  logger.error({ error }, "Initial browser tracker cycle failed");
});
