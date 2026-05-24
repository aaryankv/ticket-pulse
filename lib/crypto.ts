import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function getKey() {
  const configured =
    process.env.EXTERNAL_TOKEN_ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!configured) {
    throw new Error("Missing EXTERNAL_TOKEN_ENCRYPTION_KEY or auth secret for token encryption");
  }

  return createHash("sha256").update(configured).digest();
}

export function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(payload: string) {
  const [ivText, tagText, encryptedText] = payload.split(".");

  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Encrypted payload is malformed");
  }

  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
