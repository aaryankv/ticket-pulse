import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(12, "Password must be at least 12 characters")
});

export const ticketCreateSchema = z
  .object({
    supportTicketId: z.string().trim().max(500).optional().or(z.literal("")),
    bugId: z.string().trim().max(500).optional().or(z.literal("")),
    jiraId: z.string().trim().max(500).optional().or(z.literal("")),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "BLOCKER"])
  })
  .refine(
    (value) => Boolean(value.supportTicketId || value.bugId || value.jiraId),
    "At least one ticket identifier is required"
  );

export const notificationPreferenceSchema = z.object({
  frequency: z.enum(["IMMEDIATE", "DAILY", "WEEKLY", "DISABLED"]),
  immediateAlerts: z.boolean(),
  dailyDigest: z.boolean(),
  weeklyDigest: z.boolean(),
  emailNotifications: z.boolean(),
  slackNotifications: z.boolean(),
  email: z.string().email().optional().or(z.literal("")),
  slackWebhookUrl: z.string().url().optional().or(z.literal("")),
  mutedFields: z.array(z.string()).default([])
});

export const jiraProfileSchema = z.object({
  username: z.string().trim().email(),
  personalAccessToken: z.string().trim().optional().or(z.literal(""))
});

export const ticketFilterSchema = z.object({
  query: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  risk: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(10)
});
