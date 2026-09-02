import { afterEach, describe, expect, it } from "vitest";
import { decryptSocialToken, encryptSocialToken, validateTokenCipherConfiguration } from "../utils/tokenCipher";

const KEY = "ab".repeat(32);

afterEach(() => {
  delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
});

describe("social token encryption", () => {
  it("round-trips without deterministic ciphertext", () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = KEY;
    const first = encryptSocialToken("secret-value");
    const second = encryptSocialToken("secret-value");
    expect(first).not.toBe(second);
    expect(decryptSocialToken(first)).toBe("secret-value");
    expect(first.startsWith("v1:")).toBe(true);
  });

  it("fails closed without an exact 256-bit key", () => {
    expect(() => validateTokenCipherConfiguration()).toThrow("SOCIAL_TOKEN_ENCRYPTION_KEY is required");
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "short";
    expect(() => validateTokenCipherConfiguration()).toThrow("64 hexadecimal characters");
  });

  it("rejects tampered ciphertext", () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = KEY;
    const encrypted = encryptSocialToken("secret-value");
    const parts = encrypted.split(":");
    parts[2] = Buffer.alloc(16, 255).toString("base64url");
    expect(() => decryptSocialToken(parts.join(":"))).toThrow();
    expect(() => decryptSocialToken(`${encrypted}:`)).toThrow("Invalid social token ciphertext");
  });
});
