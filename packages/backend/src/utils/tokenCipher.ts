import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_HEX_LENGTH = 64;

export type SocialTokenKind = "access" | "refresh";

export interface SocialTokenContext {
  readonly accountId: string;
  readonly kind: SocialTokenKind;
}

function key(): Buffer {
  const value = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!value) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is required");
  }
  if (value.length !== KEY_HEX_LENGTH || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY must be exactly 64 hexadecimal characters");
  }
  return Buffer.from(value, "hex");
}

export function validateTokenCipherConfiguration(): void {
  key();
}

function additionalAuthenticatedData(context: SocialTokenContext): Buffer {
  if (!context.accountId) {
    throw new Error("Social token accountId is required");
  }
  if (context.kind !== "access" && context.kind !== "refresh") {
    throw new Error("Social token kind is invalid");
  }
  return Buffer.from(JSON.stringify(["schedio-social-token", 1, context.accountId, context.kind]));
}

export function encryptSocialToken(plaintext: string, context: SocialTokenContext): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalAuthenticatedData(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSocialToken(envelope: string, context: SocialTokenContext): string {
  const parts = envelope.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid social token ciphertext");
  }
  const [version, ivValue, tagValue, ciphertextValue] = parts;
  if (version !== "v1" || !ivValue || !tagValue || ciphertextValue === undefined) {
    throw new Error("Invalid social token ciphertext");
  }
  const iv = Buffer.from(ivValue, "base64url");
  const tag = Buffer.from(tagValue, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Invalid social token ciphertext");
  }
  const decipher = createDecipheriv(ALGORITHM, key(), iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(additionalAuthenticatedData(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
