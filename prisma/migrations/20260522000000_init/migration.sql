CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "TicketSystem" AS ENUM ('SUPPORT_ORACLE', 'BUG_ORACLE', 'JIRA');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'BLOCKER');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "PollingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FAILED');
CREATE TYPE "DigestFrequency" AS ENUM ('IMMEDIATE', 'DAILY', 'WEEKLY', 'DISABLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT NOT NULL,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "passwordHash" TEXT,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ExternalCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "system" "TicketSystem" NOT NULL,
  "providerAccountId" TEXT,
  "encryptedAccessToken" TEXT,
  "encryptedRefreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrackedTicket" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "supportTicketId" TEXT,
  "bugId" TEXT,
  "jiraId" TEXT,
  "title" TEXT,
  "notes" TEXT,
  "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "assignee" TEXT,
  "resolution" TEXT,
  "slaDueAt" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "currentRisk" "RiskLevel" NOT NULL DEFAULT 'LOW',
  "lastSyncedAt" TIMESTAMP(3),
  "externalLinks" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrackedTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketSnapshot" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "system" "TicketSystem" NOT NULL,
  "payload" JSONB NOT NULL,
  "normalized" JSONB NOT NULL,
  "status" TEXT,
  "priority" TEXT,
  "assignee" TEXT,
  "resolution" TEXT,
  "commentsHash" TEXT,
  "slaDueAt" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketEvent" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "system" "TicketSystem",
  "eventType" TEXT NOT NULL,
  "changedField" TEXT NOT NULL,
  "previousValue" TEXT,
  "newValue" TEXT,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "frequency" "DigestFrequency" NOT NULL DEFAULT 'IMMEDIATE',
  "immediateAlerts" BOOLEAN NOT NULL DEFAULT true,
  "dailyDigest" BOOLEAN NOT NULL DEFAULT false,
  "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
  "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
  "slackNotifications" BOOLEAN NOT NULL DEFAULT false,
  "email" TEXT,
  "slackWebhookUrl" TEXT,
  "mutedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PollingJob" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "jobKey" TEXT NOT NULL,
  "intervalMinutes" INTEGER NOT NULL DEFAULT 30,
  "status" "PollingStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastRunAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PollingJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyReport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "weekEnd" TIMESTAMP(3) NOT NULL,
  "summary" JSONB NOT NULL,
  "html" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

CREATE UNIQUE INDEX "ExternalCredential_userId_system_key" ON "ExternalCredential"("userId", "system");
CREATE INDEX "ExternalCredential_system_idx" ON "ExternalCredential"("system");

CREATE INDEX "TrackedTicket_ownerId_updatedAt_idx" ON "TrackedTicket"("ownerId", "updatedAt");
CREATE INDEX "TrackedTicket_supportTicketId_idx" ON "TrackedTicket"("supportTicketId");
CREATE INDEX "TrackedTicket_bugId_idx" ON "TrackedTicket"("bugId");
CREATE INDEX "TrackedTicket_jiraId_idx" ON "TrackedTicket"("jiraId");
CREATE INDEX "TrackedTicket_status_idx" ON "TrackedTicket"("status");
CREATE INDEX "TrackedTicket_priority_idx" ON "TrackedTicket"("priority");
CREATE INDEX "TrackedTicket_currentRisk_idx" ON "TrackedTicket"("currentRisk");

CREATE INDEX "TicketSnapshot_ticketId_system_fetchedAt_idx" ON "TicketSnapshot"("ticketId", "system", "fetchedAt");
CREATE INDEX "TicketSnapshot_system_fetchedAt_idx" ON "TicketSnapshot"("system", "fetchedAt");

CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");
CREATE INDEX "TicketEvent_eventType_idx" ON "TicketEvent"("eventType");
CREATE INDEX "TicketEvent_system_idx" ON "TicketEvent"("system");

CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

CREATE UNIQUE INDEX "PollingJob_jobKey_key" ON "PollingJob"("jobKey");
CREATE INDEX "PollingJob_ticketId_idx" ON "PollingJob"("ticketId");
CREATE INDEX "PollingJob_status_nextRunAt_idx" ON "PollingJob"("status", "nextRunAt");

CREATE UNIQUE INDEX "WeeklyReport_userId_weekStart_key" ON "WeeklyReport"("userId", "weekStart");
CREATE INDEX "WeeklyReport_weekStart_weekEnd_idx" ON "WeeklyReport"("weekStart", "weekEnd");

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalCredential" ADD CONSTRAINT "ExternalCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackedTicket" ADD CONSTRAINT "TrackedTicket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketSnapshot" ADD CONSTRAINT "TicketSnapshot_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "TrackedTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "TrackedTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollingJob" ADD CONSTRAINT "PollingJob_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "TrackedTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
