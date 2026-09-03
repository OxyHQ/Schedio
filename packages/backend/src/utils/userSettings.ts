import { uuidv7 } from "@oxyhq/db";
import { eq } from "drizzle-orm";
import { getDb, type SchedioDatabase } from "../db";
import {
  PROFILE_VISIBILITIES,
  THEME_MODES,
  userSettings,
  type ProfileVisibility,
  type ThemeMode,
} from "../db/schema";

/**
 * Default profile customization settings
 */
export const DEFAULT_PROFILE_CUSTOMIZATION = {
  coverPhotoEnabled: true,
  minimalistMode: false,
} as const;

export interface UserSettingsDto {
  readonly id: string;
  readonly oxyUserId: string;
  readonly appearance: {
    readonly themeMode: ThemeMode;
    readonly primaryColor?: string;
  };
  readonly profileHeaderImage?: string;
  readonly privacy: {
    readonly profileVisibility: ProfileVisibility;
    readonly showContactInfo: boolean;
    readonly allowTags: boolean;
    readonly allowAllos: boolean;
    readonly showOnlineStatus: boolean;
    readonly hideLikeCounts: boolean;
    readonly hideShareCounts: boolean;
    readonly hideReplyCounts: boolean;
    readonly hideSaveCounts: boolean;
    readonly hiddenWords: string[];
    readonly restrictedUsers: string[];
    readonly blockedUsers: string[];
  };
  readonly profileCustomization: {
    readonly coverPhotoEnabled: boolean;
    readonly minimalistMode: boolean;
    readonly displayName?: string;
    readonly coverImage?: string;
  };
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

type UserSettingsRow = typeof userSettings.$inferSelect;

function optional(value: string | null): string | undefined {
  return value ?? undefined;
}

export function toUserSettingsDto(row: UserSettingsRow): UserSettingsDto {
  return {
    id: row.id,
    oxyUserId: row.oxyUserId,
    appearance: {
      themeMode: row.appearanceThemeMode,
      primaryColor: optional(row.appearancePrimaryColor),
    },
    profileHeaderImage: optional(row.profileHeaderImage),
    privacy: {
      profileVisibility: row.privacyProfileVisibility,
      showContactInfo: row.privacyShowContactInfo,
      allowTags: row.privacyAllowTags,
      allowAllos: row.privacyAllowAllos,
      showOnlineStatus: row.privacyShowOnlineStatus,
      hideLikeCounts: row.privacyHideLikeCounts,
      hideShareCounts: row.privacyHideShareCounts,
      hideReplyCounts: row.privacyHideReplyCounts,
      hideSaveCounts: row.privacyHideSaveCounts,
      hiddenWords: row.privacyHiddenWords,
      restrictedUsers: row.privacyRestrictedUsers,
      blockedUsers: row.privacyBlockedUsers,
    },
    profileCustomization: {
      coverPhotoEnabled: row.profileCoverPhotoEnabled,
      minimalistMode: row.profileMinimalistMode,
      displayName: optional(row.profileDisplayName),
      coverImage: optional(row.profileCoverImage),
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Ensures a UserSettings document exists for a user
 * Creates with defaults if missing, updates if missing profileCustomization
 */
export async function ensureUserSettings(
  oxyUserId: string,
  db: SchedioDatabase = getDb(),
): Promise<UserSettingsDto> {
  const inserted = await db
    .insert(userSettings)
    .values({ id: uuidv7(), oxyUserId })
    .onConflictDoNothing({ target: userSettings.oxyUserId })
    .returning();
  const created = inserted[0];
  if (created) return toUserSettingsDto(created);

  const existing = await db.query.userSettings.findFirst({
    where: eq(userSettings.oxyUserId, oxyUserId),
  });
  if (!existing) {
    throw new Error("User settings insert conflicted but no row exists");
  }
  return toUserSettingsDto(existing);
}

export interface UserSettingsPatch {
  readonly appearanceThemeMode?: ThemeMode;
  readonly appearancePrimaryColor?: string | null;
  readonly profileHeaderImage?: string | null;
  readonly privacyProfileVisibility?: ProfileVisibility;
  readonly privacyShowContactInfo?: boolean;
  readonly privacyAllowTags?: boolean;
  readonly privacyAllowAllos?: boolean;
  readonly privacyShowOnlineStatus?: boolean;
  readonly privacyHideLikeCounts?: boolean;
  readonly privacyHideShareCounts?: boolean;
  readonly privacyHideReplyCounts?: boolean;
  readonly privacyHideSaveCounts?: boolean;
  readonly privacyHiddenWords?: string[];
  readonly privacyRestrictedUsers?: string[];
  readonly privacyBlockedUsers?: string[];
  readonly profileCoverPhotoEnabled?: boolean;
  readonly profileMinimalistMode?: boolean;
  readonly profileDisplayName?: string | null;
  readonly profileCoverImage?: string | null;
}

export async function updateUserSettings(
  oxyUserId: string,
  patch: UserSettingsPatch,
  db: SchedioDatabase = getDb(),
): Promise<UserSettingsDto> {
  if (Object.keys(patch).length === 0) return ensureUserSettings(oxyUserId, db);
  const rows = await db
    .insert(userSettings)
    .values({ id: uuidv7(), oxyUserId, ...patch })
    .onConflictDoUpdate({
      target: userSettings.oxyUserId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("User settings upsert returned no row");
  return toUserSettingsDto(row);
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return [...value];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function settingsPatchFromBody(body: unknown): UserSettingsPatch {
  const input = record(body) ?? {};
  const appearance = record(input.appearance);
  const privacy = record(input.privacy);
  const customization = record(input.profileCustomization);
  const patch: Record<string, unknown> = {};

  if (
    appearance &&
    typeof appearance.themeMode === "string" &&
    (THEME_MODES as readonly string[]).includes(appearance.themeMode)
  ) {
    patch.appearanceThemeMode = appearance.themeMode;
  }
  if (appearance && appearance.primaryColor === null) patch.appearancePrimaryColor = null;
  if (appearance && typeof appearance.primaryColor === "string") {
    patch.appearancePrimaryColor = appearance.primaryColor.trim() || null;
  }
  if (input.profileHeaderImage === null) patch.profileHeaderImage = null;
  if (typeof input.profileHeaderImage === "string") {
    patch.profileHeaderImage = input.profileHeaderImage.trim() || null;
  }

  if (
    privacy &&
    typeof privacy.profileVisibility === "string" &&
    (PROFILE_VISIBILITIES as readonly string[]).includes(privacy.profileVisibility)
  ) {
    patch.privacyProfileVisibility = privacy.profileVisibility;
  }
  const privacyBooleans = {
    showContactInfo: "privacyShowContactInfo",
    allowTags: "privacyAllowTags",
    allowAllos: "privacyAllowAllos",
    showOnlineStatus: "privacyShowOnlineStatus",
    hideLikeCounts: "privacyHideLikeCounts",
    hideShareCounts: "privacyHideShareCounts",
    hideReplyCounts: "privacyHideReplyCounts",
    hideSaveCounts: "privacyHideSaveCounts",
  } as const;
  if (privacy) {
    for (const [inputKey, column] of Object.entries(privacyBooleans)) {
      const value = privacy[inputKey];
      if (typeof value === "boolean") patch[column] = value;
    }
    const hiddenWords = strings(privacy.hiddenWords);
    const restrictedUsers = strings(privacy.restrictedUsers);
    const blockedUsers = strings(privacy.blockedUsers);
    if (hiddenWords) patch.privacyHiddenWords = hiddenWords;
    if (restrictedUsers) patch.privacyRestrictedUsers = restrictedUsers;
    if (blockedUsers) patch.privacyBlockedUsers = blockedUsers;
  }

  if (customization) {
    if (typeof customization.coverPhotoEnabled === "boolean") {
      patch.profileCoverPhotoEnabled = customization.coverPhotoEnabled;
    }
    if (typeof customization.minimalistMode === "boolean") {
      patch.profileMinimalistMode = customization.minimalistMode;
    }
    if (customization.displayName === null) patch.profileDisplayName = null;
    if (typeof customization.displayName === "string") {
      patch.profileDisplayName = customization.displayName.trim() || null;
    }
    if (customization.coverImage === null) patch.profileCoverImage = null;
    if (typeof customization.coverImage === "string") {
      patch.profileCoverImage = customization.coverImage.trim() || null;
    }
  }

  return patch as UserSettingsPatch;
}

/**
 * Extracts public profile design data from UserSettings document
 */
export function extractPublicProfileData(
  doc: UserSettingsDto,
  userId: string
) {
  return {
    oxyUserId: userId,
    appearance: doc.appearance.primaryColor ? {
      primaryColor: doc.appearance.primaryColor,
    } : undefined,
    profileHeaderImage: doc?.profileHeaderImage,
    profileCustomization: doc.profileCustomization,
  };
}
