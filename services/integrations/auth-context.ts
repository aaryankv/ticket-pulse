import type { ExternalCredential, TicketSystem } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { ExternalAuthContext, IntegrationAuthMode, IntegrationAuthSource } from "@/services/integrations/types";

export class IntegrationAuthRequiredError extends Error {
  constructor(system: TicketSystem) {
    super(`${system} automatic sync requires Oracle SSO or an encrypted service token`);
    this.name = "IntegrationAuthRequiredError";
  }
}

export async function buildIntegrationAuthContext(input: {
  userId: string;
  system: TicketSystem;
  credential?: ExternalCredential | null;
}): Promise<ExternalAuthContext> {
  const externalToken = readExternalCredentialToken(input.credential);
  const oracleSsoToken = externalToken ? null : await readOracleSsoToken(input.userId);
  const accessToken = externalToken ?? oracleSsoToken ?? undefined;
  const authSource: IntegrationAuthSource = externalToken ? "external-credential" : oracleSsoToken ? "oracle-sso" : "none";
  const mode = resolveIntegrationMode(Boolean(accessToken));

  return {
    userId: input.userId,
    system: input.system,
    mode,
    authSource,
    accessToken,
    encryptedAccessToken: input.credential?.encryptedAccessToken,
    scopes: input.credential?.scopes ?? []
  };
}

export function assertLiveIntegrationAuth(context: ExternalAuthContext) {
  if (context.mode === "auth-required" || !context.accessToken) {
    throw new IntegrationAuthRequiredError(context.system);
  }
}

function resolveIntegrationMode(hasAccessToken: boolean): IntegrationAuthMode {
  const configured = process.env.ENTERPRISE_FETCH_MODE ?? "auto";

  if (configured === "mock") {
    return "mock";
  }

  if (hasAccessToken) {
    return "live";
  }

  if (configured === "live" || process.env.DEMO_MODE === "false") {
    return "auth-required";
  }

  return "mock";
}

function readExternalCredentialToken(credential?: ExternalCredential | null) {
  if (!credential?.encryptedAccessToken) {
    return null;
  }

  try {
    return decryptSecret(credential.encryptedAccessToken);
  } catch {
    return null;
  }
}

async function readOracleSsoToken(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "oracle-sso"
    },
    select: {
      access_token: true,
      expires_at: true
    }
  });

  if (!account?.access_token) {
    return null;
  }

  if (account.expires_at && account.expires_at * 1000 <= Date.now()) {
    return null;
  }

  return account.access_token;
}
