import { CheckCircle2, KeyRound, Plug, ShieldCheck, TriangleAlert } from "lucide-react";
import { BrowserSessionPanel } from "@/components/settings/browser-session-panel";
import { JiraProfileForm, type JiraProfileState } from "@/components/settings/jira-profile-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { isDatabaseReachable } from "@/lib/database-status";
import { getLocalJiraProfile } from "@/lib/local-jira-profile-store";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const session = await auth();
  const [connection, jiraProfile] = await Promise.all([
    getConnectionStatus(session?.user.id),
    getJiraProfile(session?.user.id)
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Workspace configuration</p>
        <h2 className="text-2xl font-semibold">Settings</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SettingCard
          icon={ShieldCheck}
          title="Authentication"
          description="Local credentials remain available for development. Configure Oracle OIDC values to enable the Oracle SSO button in NextAuth."
        />
        <SettingCard
          icon={KeyRound}
          title="External tokens"
          description="Jira uses an encrypted personal access token for REST API refreshes. Oracle SSO tokens can still support other delegated polling."
        />
        <SettingCard
          icon={Plug}
          title="Automatic checks"
          description="Polling now attempts live Oracle Support, Jira, and Bug Oracle fetches when an Oracle SSO/API token is available. Otherwise it records an auth-required event."
        />
      </div>
      <JiraProfileForm initialProfile={jiraProfile} />
      <BrowserSessionPanel />
      <Card>
        <CardHeader>
          <CardTitle>Integration connection</CardTitle>
          <CardDescription>Automatic status checks need a delegated Oracle SSO token or encrypted per-system API token.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <ConnectionItem label="Oracle SSO" connected={connection.oracleSsoConnected} detail="Used as the fallback delegated token." />
          <ConnectionItem label="Oracle Support" connected={connection.supportOracleConnected} detail="SR activity page polling." />
          <ConnectionItem label="Bug Oracle" connected={connection.bugOracleConnected} detail="Bug detail page polling." />
          <ConnectionItem label="Oracle Jira" connected={connection.jiraConnected} detail="Jira REST API with personal access token." />
        </CardContent>
      </Card>
    </div>
  );
}

function SettingCard({
  icon: Icon,
  title,
  description
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-primary">
          <Icon className="size-5" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">Managed through environment and database-backed preferences.</CardContent>
    </Card>
  );
}

function ConnectionItem({ label, connected, detail }: { label: string; connected: boolean; detail: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2">
        {connected ? <CheckCircle2 className="size-4 text-emerald-600" /> : <TriangleAlert className="size-4 text-amber-600" />}
        <p className="font-medium">{label}</p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{connected ? "Connected" : "Connection needed"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

async function getConnectionStatus(userId?: string) {
  if (!userId) {
    return {
      oracleSsoConnected: false,
      supportOracleConnected: false,
      bugOracleConnected: false,
      jiraConnected: false
    };
  }

  if (!(await isDatabaseReachable())) {
    const jiraProfile = await getLocalJiraProfile(userId);
    return {
      oracleSsoConnected: false,
      supportOracleConnected: false,
      bugOracleConnected: false,
      jiraConnected: jiraProfile.connected
    };
  }

  try {
    const [oracleAccount, credentials] = await Promise.all([
      prisma.account.findFirst({
        where: {
          userId,
          provider: "oracle-sso",
          access_token: { not: null }
        },
        select: { id: true }
      }),
      prisma.externalCredential.findMany({
        where: { userId },
        select: { system: true, encryptedAccessToken: true }
      })
    ]);

    const oracleSsoConnected = Boolean(oracleAccount);
    const connectedSystems = new Set(credentials.filter((item) => item.encryptedAccessToken).map((item) => item.system));

    return {
      oracleSsoConnected,
      supportOracleConnected: oracleSsoConnected || connectedSystems.has("SUPPORT_ORACLE"),
      bugOracleConnected: oracleSsoConnected || connectedSystems.has("BUG_ORACLE"),
      jiraConnected: connectedSystems.has("JIRA")
    };
  } catch {
    return {
      oracleSsoConnected: false,
      supportOracleConnected: false,
      bugOracleConnected: false,
      jiraConnected: false
    };
  }
}

async function getJiraProfile(userId?: string): Promise<JiraProfileState> {
  const fallback = {
    connected: false,
    username: "",
    baseUrl: process.env.JIRA_API_BASE_URL ?? "https://jira.oraclecorp.com/jira",
    updatedAt: null
  };

  if (!userId) {
    return fallback;
  }

  if (!(await isDatabaseReachable())) {
    return getLocalJiraProfile(userId);
  }

  try {
    const credential = await prisma.externalCredential.findUnique({
      where: {
        userId_system: {
          userId,
          system: "JIRA"
        }
      }
    });

    if (!credential) {
      return fallback;
    }

    const metadata =
      credential.metadata && typeof credential.metadata === "object" && !Array.isArray(credential.metadata)
        ? credential.metadata
        : {};
    const metadataUsername = typeof metadata.username === "string" ? metadata.username : "";
    const metadataBaseUrl = typeof metadata.baseUrl === "string" ? metadata.baseUrl : fallback.baseUrl;

    return {
      connected: Boolean(credential.encryptedAccessToken),
      username: credential.providerAccountId ?? metadataUsername,
      baseUrl: metadataBaseUrl,
      updatedAt: credential.updatedAt.toISOString()
    };
  } catch {
    return fallback;
  }
}

