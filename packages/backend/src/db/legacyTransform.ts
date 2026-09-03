import {
  POST_STATUSES,
  PROFILE_VISIBILITIES,
  SOCIAL_PLATFORMS,
  THEME_MODES,
  type PostStatus,
  type ProfileVisibility,
  type SocialPlatform,
  type ThemeMode,
  blocks,
  postAnalytics,
  posts,
  publishingSchedules,
  restricts,
  socialAccounts,
  userBehaviors,
  userSettings,
} from "./schema";
import { encryptSocialToken } from "../utils/tokenCipher";

type Document = Record<string, unknown>;

function document(value: unknown, field: string): Document {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Document;
}

function optionalDocument(value: unknown): Document {
  return value === undefined || value === null ? {} : document(value, "embedded value");
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

function objectId(value: unknown, field: string): string {
  if (typeof value === "string") return text(value, field);
  const valueDocument = document(value, field);
  return text(valueDocument.$oid, `${field}.$oid`);
}

function date(value: unknown, field: string): Date {
  let raw = value;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const dateDocument = raw as Document;
    raw = dateDocument.$date;
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      raw = (raw as Document).$numberLong;
    }
  }
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new Error(`${field} must be an extended JSON date`);
  }
  const parsed = new Date(typeof raw === "string" && /^-?\d+$/.test(raw) ? Number(raw) : raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} is not a valid date`);
  return parsed;
}

function optionalDate(value: unknown, field: string): Date | undefined {
  return value === undefined || value === null ? undefined : date(value, field);
}

function numberValue(value: unknown, field: string, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  let raw = value;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const valueDocument = raw as Document;
    raw = valueDocument.$numberInt ?? valueDocument.$numberLong ?? valueDocument.$numberDouble;
  }
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} must be a safe integer`);
  return parsed;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item, index) => text(item, `${field}[${index}]`));
}

function objectIdArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item, index) => objectId(item, `${field}[${index}]`));
}

function closedValue<T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
  fallback?: T,
): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new Error(`${field} is outside its closed value set`);
  }
  return value as T;
}

function timestamps(source: Document) {
  return {
    createdAt: date(source.createdAt, "createdAt"),
    updatedAt: date(source.updatedAt, "updatedAt"),
  };
}

export function transformBlock(value: unknown): typeof blocks.$inferInsert {
  const source = document(value, "block");
  return {
    id: objectId(source._id, "_id"),
    userId: text(source.userId, "userId"),
    blockedId: text(source.blockedId, "blockedId"),
    ...timestamps(source),
  };
}

export function transformRestrict(value: unknown): typeof restricts.$inferInsert {
  const source = document(value, "restrict");
  return {
    id: objectId(source._id, "_id"),
    userId: text(source.userId, "userId"),
    restrictedId: text(source.restrictedId, "restrictedId"),
    ...timestamps(source),
  };
}

export function transformPost(value: unknown): typeof posts.$inferInsert {
  const source = document(value, "post");
  return {
    id: objectId(source._id, "_id"),
    userId: text(source.userId, "userId"),
    content: text(source.content, "content"),
    media: stringArray(source.media, "media"),
    platformIds: objectIdArray(source.platforms, "platforms"),
    status: closedValue<PostStatus>(source.status, "status", POST_STATUSES, "draft"),
    scheduledAt: optionalDate(source.scheduledAt, "scheduledAt"),
    publishedAt: optionalDate(source.publishedAt, "publishedAt"),
    hashtags: stringArray(source.hashtags, "hashtags"),
    retryCount: numberValue(source.retryCount, "retryCount"),
    ...timestamps(source),
  };
}

export function transformPostAnalytics(value: unknown): typeof postAnalytics.$inferInsert {
  const source = document(value, "post analytics");
  const metrics = optionalDocument(source.metrics);
  return {
    id: objectId(source._id, "_id"),
    postId: objectId(source.postId, "postId"),
    platform: text(source.platform, "platform"),
    likes: numberValue(metrics.likes, "metrics.likes"),
    shares: numberValue(metrics.shares, "metrics.shares"),
    comments: numberValue(metrics.comments, "metrics.comments"),
    impressions: numberValue(metrics.impressions, "metrics.impressions"),
    reach: numberValue(metrics.reach, "metrics.reach"),
    clicks: numberValue(metrics.clicks, "metrics.clicks"),
    ...timestamps(source),
  };
}

export function transformPublishingSchedule(
  value: unknown,
): typeof publishingSchedules.$inferInsert {
  const source = document(value, "publishing schedule");
  const slotsValue = source.slots ?? [];
  if (!Array.isArray(slotsValue)) throw new Error("slots must be an array");
  const slots = slotsValue.map((slot, index) => {
    const slotDocument = document(slot, `slots[${index}]`);
    const dayOfWeek = numberValue(slotDocument.dayOfWeek, `slots[${index}].dayOfWeek`);
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      throw new Error(`slots[${index}].dayOfWeek must be between 0 and 6`);
    }
    return { dayOfWeek, time: text(slotDocument.time, `slots[${index}].time`) };
  });
  return {
    id: objectId(source._id, "_id"),
    userId: text(source.userId, "userId"),
    name: text(source.name, "name"),
    slots,
    timezone: optionalText(source.timezone, "timezone") ?? "UTC",
    isDefault: booleanValue(source.isDefault, false),
    ...timestamps(source),
  };
}

export function transformSocialAccount(value: unknown): typeof socialAccounts.$inferInsert {
  const source = document(value, "social account");
  const created = timestamps(source);
  const id = objectId(source._id, "_id");
  const refreshToken = optionalText(source.refreshToken, "refreshToken");
  return {
    id,
    userId: text(source.userId, "userId"),
    platform: closedValue<SocialPlatform>(source.platform, "platform", SOCIAL_PLATFORMS),
    platformUserId: text(source.platformUserId, "platformUserId"),
    platformUsername: text(source.platformUsername, "platformUsername"),
    accessTokenCiphertext: encryptSocialToken(text(source.accessToken, "accessToken"), {
      accountId: id,
      kind: "access",
    }),
    refreshTokenCiphertext:
      refreshToken === undefined
        ? undefined
        : encryptSocialToken(refreshToken, { accountId: id, kind: "refresh" }),
    tokenExpiresAt: optionalDate(source.tokenExpiresAt, "tokenExpiresAt"),
    profileImageUrl: optionalText(source.profileImageUrl, "profileImageUrl"),
    isActive: booleanValue(source.isActive, true),
    connectedAt: optionalDate(source.connectedAt, "connectedAt") ?? created.createdAt,
    ...created,
  };
}

export function transformUserBehavior(value: unknown): typeof userBehaviors.$inferInsert {
  const source = document(value, "user behavior");
  return {
    id: objectId(source._id, "_id"),
    oxyUserId: text(source.oxyUserId, "oxyUserId"),
    preferences: optionalDocument(source.preferences),
    ...timestamps(source),
  };
}

export function transformUserSettings(value: unknown): typeof userSettings.$inferInsert {
  const source = document(value, "user settings");
  const appearance = optionalDocument(source.appearance);
  const privacy = optionalDocument(source.privacy);
  const profile = optionalDocument(source.profileCustomization);
  return {
    id: objectId(source._id, "_id"),
    oxyUserId: text(source.oxyUserId, "oxyUserId"),
    appearanceThemeMode: closedValue<ThemeMode>(
      appearance.themeMode,
      "appearance.themeMode",
      THEME_MODES,
      "system",
    ),
    appearancePrimaryColor: optionalText(appearance.primaryColor, "appearance.primaryColor"),
    profileHeaderImage: optionalText(source.profileHeaderImage, "profileHeaderImage"),
    privacyProfileVisibility: closedValue<ProfileVisibility>(
      privacy.profileVisibility,
      "privacy.profileVisibility",
      PROFILE_VISIBILITIES,
      "public",
    ),
    privacyShowContactInfo: booleanValue(privacy.showContactInfo, true),
    privacyAllowTags: booleanValue(privacy.allowTags, true),
    privacyAllowAllos: booleanValue(privacy.allowAllos ?? privacy.allowallos ?? privacy.allowMentions, true),
    privacyShowOnlineStatus: booleanValue(privacy.showOnlineStatus, true),
    privacyHideLikeCounts: booleanValue(privacy.hideLikeCounts, false),
    privacyHideShareCounts: booleanValue(privacy.hideShareCounts, false),
    privacyHideReplyCounts: booleanValue(privacy.hideReplyCounts, false),
    privacyHideSaveCounts: booleanValue(privacy.hideSaveCounts, false),
    privacyHiddenWords: stringArray(privacy.hiddenWords, "privacy.hiddenWords"),
    privacyRestrictedUsers: stringArray(privacy.restrictedUsers, "privacy.restrictedUsers"),
    privacyBlockedUsers: stringArray(privacy.blockedUsers, "privacy.blockedUsers"),
    profileCoverPhotoEnabled: booleanValue(profile.coverPhotoEnabled, true),
    profileMinimalistMode: booleanValue(profile.minimalistMode, false),
    profileDisplayName: optionalText(profile.displayName, "profileCustomization.displayName"),
    profileCoverImage: optionalText(profile.coverImage, "profileCustomization.coverImage"),
    ...timestamps(source),
  };
}
