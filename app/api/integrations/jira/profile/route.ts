import { NextRequest, NextResponse } from "next/server";
import type { ExternalCredential } from "@prisma/client";
import { assertSameOrigin } from "@/lib/csrf";
import { encryptSecret } from "@/lib/crypto";
import { isDatabaseReachable } from "@/lib/database-status";
import {
  deleteLocalJiraProfile,
  getLocalJiraProfile,
  saveLocalJiraProfile
} from "@/lib/local-jira-profile-store";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/api-auth";
import { jiraProfileSchema } from "@/lib/validations";

const JIRA_BASE_URL = process.env.JIRA_API_BASE_URL ?? "https://jira.oraclecorp.com/jira";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) {
    return limited;
  }

  const { response, user } = await requireApiUser();
  if (response) {
    return response;
  }

  if (!(await isDatabaseReachable())) {
    return NextResponse.json({ profile: await getLocalJiraProfile(user.id), storage: "local-file" });
  }

  const credential = await prisma.externalCredential.findUnique({
    where: {
      userId_system: {
        userId: user.id,
        system: "JIRA"
      }
    }
  });

  return NextResponse.json({ profile: serializeJiraProfile(credential) });
}

export async function PUT(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) {
    return limited;
  }

  const csrf = assertSameOrigin(request);
  if (csrf) {
    return csrf;
  }

  const { response, user } = await requireApiUser();
  if (response) {
    return response;
  }

  const body = await request.json();
  const parsed = jiraProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const username = parsed.data.username.trim();
  const personalAccessToken = parsed.data.personalAccessToken?.trim() ?? "";

  if (!(await isDatabaseReachable())) {
    try {
      const profile = await saveLocalJiraProfile({
        userId: user.id,
        username,
        personalAccessToken: personalAccessToken || undefined,
        baseUrl: JIRA_BASE_URL
      });
      return NextResponse.json({ profile, storage: "local-file" });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Jira profile could not be saved" },
        { status: 400 }
      );
    }
  }

  const existing = await prisma.externalCredential.findUnique({
    where: {
      userId_system: {
        userId: user.id,
        system: "JIRA"
      }
    }
  });

  if (!personalAccessToken && !existing?.encryptedAccessToken) {
    return NextResponse.json({ error: "Personal access token is required" }, { status: 400 });
  }

  const encryptedAccessToken = personalAccessToken ? encryptSecret(personalAccessToken) : existing?.encryptedAccessToken;
  const metadata = {
    authType: "personal-access-token",
    baseUrl: JIRA_BASE_URL,
    username,
    lastConfiguredAt: new Date().toISOString()
  };

  const credential = await prisma.externalCredential.upsert({
    where: {
      userId_system: {
        userId: user.id,
        system: "JIRA"
      }
    },
    update: {
      providerAccountId: username,
      ...(personalAccessToken ? { encryptedAccessToken } : {}),
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      scopes: ["jira:read"],
      metadata
    },
    create: {
      userId: user.id,
      system: "JIRA",
      providerAccountId: username,
      encryptedAccessToken,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      scopes: ["jira:read"],
      metadata
    }
  });

  return NextResponse.json({ profile: serializeJiraProfile(credential) });
}

export async function DELETE(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) {
    return limited;
  }

  const csrf = assertSameOrigin(request);
  if (csrf) {
    return csrf;
  }

  const { response, user } = await requireApiUser();
  if (response) {
    return response;
  }

  if (!(await isDatabaseReachable())) {
    return NextResponse.json({ profile: await deleteLocalJiraProfile(user.id), storage: "local-file" });
  }

  await prisma.externalCredential.deleteMany({
    where: {
      userId: user.id,
      system: "JIRA"
    }
  });

  return NextResponse.json({ profile: serializeJiraProfile(null) });
}

function serializeJiraProfile(credential: ExternalCredential | null) {
  const metadata =
    credential?.metadata && typeof credential.metadata === "object" && !Array.isArray(credential.metadata)
      ? credential.metadata
      : {};
  const metadataUsername = typeof metadata.username === "string" ? metadata.username : "";

  return {
    connected: Boolean(credential?.encryptedAccessToken),
    username: credential?.providerAccountId ?? metadataUsername,
    baseUrl: typeof metadata.baseUrl === "string" ? metadata.baseUrl : JIRA_BASE_URL,
    updatedAt: credential?.updatedAt.toISOString() ?? null
  };
}
