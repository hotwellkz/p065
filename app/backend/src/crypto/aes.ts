import crypto from "crypto";

const ALGO = "aes-256-gcm";

const secret = process.env.TELEGRAM_SESSION_SECRET ?? "";
const key = Buffer.from(secret, "hex");

if (secret && key.length !== 32) {
  throw new Error(
    "TELEGRAM_SESSION_SECRET must be 32 bytes hex (64 hex chars) for AES-256-GCM"
  );
}

export function encrypt(text: string): string {
  if (!secret) {
    throw new Error("TELEGRAM_SESSION_SECRET is not set");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64")
  ].join(".");
}

export function decrypt(payload: string): string {
  if (!secret) {
    throw new Error("TELEGRAM_SESSION_SECRET is not set");
  }
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}







