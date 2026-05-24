import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function sendSlackMessage(input: {
  webhookUrl?: string | null;
  text: string;
  blocks?: unknown[];
}) {
  const env = getEnv();
  const webhookUrl = input.webhookUrl || env.SLACK_DEFAULT_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.info("Slack message skipped because no webhook is configured");
    return { skipped: true };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: input.text,
      blocks: input.blocks
    })
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed with ${response.status}`);
  }

  return { skipped: false };
}
