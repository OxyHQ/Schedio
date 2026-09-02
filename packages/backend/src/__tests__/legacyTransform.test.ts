import { afterEach, describe, expect, it } from "vitest";
import { transformPost, transformSocialAccount, transformUserSettings } from "../db/legacyTransform";

const ID = "507f1f77bcf86cd799439011";
const CREATED = { $date: { $numberLong: "1767225600000" } };
const UPDATED = { $date: "2026-01-02T00:00:00.000Z" };

afterEach(() => {
  delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
});

describe("legacy JSONL transform", () => {
  it("preserves source ids and extended JSON dates", () => {
    const row = transformPost({
      _id: { $oid: ID },
      userId: "oxy-user",
      content: "hello",
      media: ["media-1"],
      platforms: [{ $oid: "507f191e810c19729de860ea" }],
      status: "scheduled",
      scheduledAt: CREATED,
      hashtags: ["release"],
      retryCount: { $numberInt: "2" },
      createdAt: CREATED,
      updatedAt: UPDATED,
    });
    expect(row.id).toBe(ID);
    expect(row.platformIds).toEqual(["507f191e810c19729de860ea"]);
    expect(row.retryCount).toBe(2);
    expect(row.createdAt).toEqual(new Date(1767225600000));
  });

  it("encrypts source social tokens before constructing a row", () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "cd".repeat(32);
    const row = transformSocialAccount({
      _id: { $oid: ID },
      userId: "oxy-user",
      platform: "mastodon",
      platformUserId: "remote-user",
      platformUsername: "nate",
      accessToken: "plaintext-access",
      refreshToken: "plaintext-refresh",
      createdAt: CREATED,
      updatedAt: UPDATED,
    });
    expect(row.accessTokenCiphertext).not.toContain("plaintext-access");
    expect(row.refreshTokenCiphertext).not.toContain("plaintext-refresh");
  });

  it("normalizes the historical allow-allos field only at the import boundary", () => {
    const row = transformUserSettings({
      _id: { $oid: ID },
      oxyUserId: "oxy-user",
      privacy: { allowallos: false },
      createdAt: CREATED,
      updatedAt: UPDATED,
    });
    expect(row.privacyAllowAllos).toBe(false);
  });

  it("rejects invalid closed values instead of silently rewriting them", () => {
    expect(() =>
      transformPost({
        _id: { $oid: ID },
        userId: "oxy-user",
        content: "hello",
        status: "unknown",
        createdAt: CREATED,
        updatedAt: UPDATED,
      }),
    ).toThrow("closed value set");
  });
});
