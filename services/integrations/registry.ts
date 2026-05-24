import type { TicketSystem } from "@prisma/client";
import type { TicketAdapter } from "@/services/integrations/types";
import { bugOracleAdapter } from "@/services/bugOracle";
import { jiraAdapter } from "@/services/jira";
import { supportOracleAdapter } from "@/services/supportOracle";

export const integrationAdapters: Record<TicketSystem, TicketAdapter> = {
  SUPPORT_ORACLE: supportOracleAdapter,
  BUG_ORACLE: bugOracleAdapter,
  JIRA: jiraAdapter
};

export function adapterFor(system: TicketSystem) {
  return integrationAdapters[system];
}
