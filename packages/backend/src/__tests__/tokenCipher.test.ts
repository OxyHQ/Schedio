import { afterEach, describe, expect, it } from "vitest";
import { decryptSocialToken, encryptSocialToken, validateTokenCipherConfiguration } from "../utils/tokenCipher";

const KEY = "ab".repeat(32);
const ACCESS = { accountId: "account-1", kind: "access" } as const;

afterEach(() => {
  delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
});

describe("social token encryption", () => {
  it("round-trips without deterministic ciphertext", () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = KEY;
    const first = encryptSocialToken("secret-value", ACCESS);
    const second = encryptSocialToken("secret-value", ACCESS);
    expect(first).not.toBe(second);
    expect(decryptSocialToken(first, ACCESS)).toBe("secret-value");
    expect(first.startsWith("v1:")).toBe(true);
  });

  it("fails closed without an exact 256-bit key", () => {
    expect(() => validateTokenCipherConfiguration()).toThrow("SOCIAL_TOKEN_ENCRYPTION_KEY is required");
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "short";
    expect(() => validateTokenCipherConfiguration()).toThrow("64 hexadecimal characters");
  });

  it("rejects tampered ciphertext", () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = KEY;
    const encrypted = encryptSocialToken("secret-value", ACCESS);
    const parts = encrypted.split(":");
    parts[2] = Buffer.alloc(16, 255).toString("base64url");
    expect(() => decryptSocialToken(parts.join(":"), ACCESS)).toThrow();
    expect(() => decryptSocialToken(`${encrypted}:`, ACCESS)).toThrow("Invalid social token ciphertext");
  });

  it("binds ciphertext to the exact account id and token kind", () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = KEY;
    const encrypted = encryptSocialToken("secret-value", ACCESS);
    expect(() =>
      decryptSocialToken(encrypted, { accountId: "account-2", kind: "access" }),
    ).toThrow();
    expect(() =>
      decryptSocialToken(encrypted, { accountId: "account-1", kind: "refresh" }),
    ).toThrow();
    expect(() =>
      decryptSocialToken(encrypted, { accountId: "", kind: "access" }),
    ).toThrow("Social token accountId is required");
    expect(() =>
      decryptSocialToken(encrypted, { accountId: "account-1", kind: "other" as "access" }),
    ).toThrow("Social token kind is invalid");
  });
});
