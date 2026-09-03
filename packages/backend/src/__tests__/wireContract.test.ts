import { describe, expect, it } from "vitest";
import { toUserSettingsDto } from "../utils/userSettings";
import { toPostDto } from "../utils/postDto";

const CREATED_AT = new Date("2026-09-01T10:00:00.000Z");

describe("PostgreSQL API wire contract", () => {
  it("uses the exact post id and public platforms key without Mongo aliases", () => {
    const dto = toPostDto({
      id: "507f1f77bcf86cd799439011",
      userId: "oxy-user",
      content: "hello",
      media: [],
      platformIds: ["507f191e810c19729de860ea"],
      status: "scheduled",
      scheduledAt: null,
      publishedAt: null,
      hashtags: [],
      retryCount: 0,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });

    expect(dto.id).toBe("507f1f77bcf86cd799439011");
    expect(dto.platforms).toEqual(["507f191e810c19729de860ea"]);
    expect(dto).not.toHaveProperty("_id");
    expect(dto).not.toHaveProperty("platformIds");
  });

  it("uses the canonical allowAllos setting without Mongo aliases", () => {
    const dto = toUserSettingsDto({
      id: "507f1f77bcf86cd799439012",
      oxyUserId: "oxy-user",
      appearanceThemeMode: "system",
      appearancePrimaryColor: null,
      profileHeaderImage: null,
      privacyProfileVisibility: "public",
      privacyShowContactInfo: true,
      privacyAllowTags: true,
      privacyAllowAllos: false,
      privacyShowOnlineStatus: true,
      privacyHideLikeCounts: false,
      privacyHideShareCounts: false,
      privacyHideReplyCounts: false,
      privacyHideSaveCounts: false,
      privacyHiddenWords: [],
      privacyRestrictedUsers: [],
      privacyBlockedUsers: [],
      profileCoverPhotoEnabled: true,
      profileMinimalistMode: false,
      profileDisplayName: null,
      profileCoverImage: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });

    expect(dto.id).toBe("507f1f77bcf86cd799439012");
    expect(dto.privacy.allowAllos).toBe(false);
    expect(dto).not.toHaveProperty("_id");
    expect(dto.privacy).not.toHaveProperty("allowallos");
  });
});
