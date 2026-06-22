import cron from "node-cron";
import { logger } from "@/lib/logger";
import { refreshDuePollingJobs } from "@/services/polling/refresh-ticket";
import { generateWeeklyReportsForEligibleUsers } from "@/services/reports/weekly-report";

const intervalMinutes = Number(process.env.POLLING_INTERVAL_MINUTES ?? 60);
const cronExpression = intervalMinutes <= 1 ? "* * * * *" : `*/${intervalMinutes} * * * *`;

logger.info({ cronExpression }, "Ticket Pulse polling worker started");

cron.schedule(cronExpression, async () => {
  try {
    const results = await refreshDuePollingJobs();
    logger.info({ refreshed: results.length }, "Polling cycle completed");
  } catch (error) {
    logger.error({ error }, "Polling cycle failed");
  }
});

cron.schedule("0 9 * * 1", async () => {
  try {
    const reports = await generateWeeklyReportsForEligibleUsers();
    logger.info({ generated: reports.length }, "Weekly reports generated");
  } catch (error) {
    logger.error({ error }, "Weekly report generation failed");
  }
});

void refreshDuePollingJobs().catch((error) => {
  logger.error({ error }, "Initial polling cycle failed");
});
