import { z } from "zod";

const envSchema = z
  .object({
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    APP_ENV: z.enum(["development", "test", "production"]).default("development"),
    AUTH_SECRET: z.string().min(16).optional(),
    DATABASE_URL: z.string().min(1).optional(),
    DEMO_MODE: z
      .string()
      .optional()
      .transform((value) => value !== "false"),
    ENTERPRISE_FETCH_MODE: z.enum(["auto", "live", "mock"]).default("auto"),
    EXTERNAL_TOKEN_ENCRYPTION_KEY: z.string().optional(),
    NEXTAUTH_SECRET: z.string().min(16).optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    ORACLE_SSO_CLIENT_ID: z.string().optional(),
    ORACLE_SSO_CLIENT_SECRET: z.string().optional(),
    ORACLE_SSO_ISSUER: z.string().url().optional().or(z.literal("")),
    POLLING_INTERVAL_MINUTES: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    REDIS_URL: z.string().url().optional(),
    SLACK_DEFAULT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
    SMTP_FROM: z.string().default("Ticket Pulse <ticket-pulse@example.com>"),
    SMTP_HOST: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional()
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === "production" && !env.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required in production"
      });
    }

    if (env.APP_ENV === "production" && !env.AUTH_SECRET && !env.NEXTAUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_SECRET"],
        message: "AUTH_SECRET or NEXTAUTH_SECRET is required in production"
      });
    }
  });

export type ServerEnv = z.infer<typeof envSchema>;

export function getEnv(): ServerEnv {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    throw new Error(`Invalid environment: ${result.error.message}`);
  }

  return result.data;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function isDemoMode() {
  return process.env.DEMO_MODE !== "false";
}


