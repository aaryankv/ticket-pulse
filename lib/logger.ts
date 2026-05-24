import pino from "pino";

export const logger = pino({
  name: "ticket-pulse",
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "accessToken",
      "refreshToken",
      "encryptedAccessToken",
      "encryptedRefreshToken",
      "headers.authorization"
    ],
    censor: "[redacted]"
  }
});
