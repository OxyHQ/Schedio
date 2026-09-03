import { createdAt, updatedAt } from "@oxyhq/db";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  type PgColumn,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const POST_STATUSES = ["draft", "scheduled", "published", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const SOCIAL_PLATFORMS = [
  "twitter",
  "instagram",
  "facebook",
  "linkedin",
  "mastodon",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const PROFILE_VISIBILITIES = ["public", "private", "followers_only"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

export interface PublishingSlot {
  readonly dayOfWeek: number;
  readonly time: string;
}

function oneOf(column: PgColumn, values: readonly string[]) {
  const choices = values.map((value) => `'${value.split("'").join("''")}'`).join(", ");
  return sql`${column} in (${sql.raw(choices)})`;
}

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    platform: text({ enum: SOCIAL_PLATFORMS }).notNull(),
    platformUserId: text().notNull(),
    platformUsername: text().notNull(),
    accessTokenCiphertext: text().notNull(),
    refreshTokenCiphertext: text(),
    tokenExpiresAt: timestamp({ withTimezone: true, mode: "date" }),
    profileImageUrl: text(),
    isActive: boolean().notNull().default(true),
    connectedAt: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("social_accounts_owner_platform_user_key").on(
      table.userId,
      table.platform,
      table.platformUserId,
    ),
    index("social_accounts_owner_active_idx").on(table.userId, table.isActive),
    check("social_accounts_platform_check", oneOf(table.platform, SOCIAL_PLATFORMS)),
    check(
      "social_accounts_access_token_ciphertext_check",
      sql`${table.accessTokenCiphertext} like 'v1:%'`,
    ),
    check(
      "social_accounts_refresh_token_ciphertext_check",
      sql`${table.refreshTokenCiphertext} is null or ${table.refreshTokenCiphertext} like 'v1:%'`,
    ),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    content: text().notNull(),
    media: text().array().notNull().default([]),
    platformIds: text().array().notNull().default([]),
    status: text({ enum: POST_STATUSES }).notNull().default("draft"),
    scheduledAt: timestamp({ withTimezone: true, mode: "date" }),
    publishedAt: timestamp({ withTimezone: true, mode: "date" }),
    hashtags: text().array().notNull().default([]),
    retryCount: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("posts_owner_created_at_idx").on(table.userId, table.createdAt),
    index("posts_owner_status_idx").on(table.userId, table.status),
    index("posts_status_scheduled_at_idx").on(table.status, table.scheduledAt),
    check("posts_status_check", oneOf(table.status, POST_STATUSES)),
    check("posts_retry_count_check", sql`${table.retryCount} >= 0`),
  ],
);

export const postAnalytics = pgTable(
  "post_analytics",
  {
    id: text().primaryKey(),
    postId: text()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    platform: text().notNull(),
    likes: integer().notNull().default(0),
    shares: integer().notNull().default(0),
    comments: integer().notNull().default(0),
    impressions: integer().notNull().default(0),
    reach: integer().notNull().default(0),
    clicks: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("post_analytics_post_platform_key").on(table.postId, table.platform),
    check(
      "post_analytics_non_negative_check",
      sql`${table.likes} >= 0 and ${table.shares} >= 0 and ${table.comments} >= 0 and ${table.impressions} >= 0 and ${table.reach} >= 0 and ${table.clicks} >= 0`,
    ),
  ],
);

export const publishingSchedules = pgTable(
  "publishing_schedules",
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    name: text().notNull(),
    slots: jsonb().$type<PublishingSlot[]>().notNull().default([]),
    timezone: text().notNull().default("UTC"),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("publishing_schedules_owner_idx").on(table.userId),
    check("publishing_schedules_slots_array_check", sql`jsonb_typeof(${table.slots}) = 'array'`),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    blockedId: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("blocks_owner_target_key").on(table.userId, table.blockedId),
    index("blocks_target_idx").on(table.blockedId),
  ],
);

export const restricts = pgTable(
  "restricts",
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    restrictedId: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("restricts_owner_target_key").on(table.userId, table.restrictedId),
    index("restricts_target_idx").on(table.restrictedId),
  ],
);

export const userBehaviors = pgTable("user_behaviors", {
  id: text().primaryKey(),
  oxyUserId: text().notNull().unique("user_behaviors_oxy_user_id_key"),
  preferences: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userSettings = pgTable(
  "user_settings",
  {
    id: text().primaryKey(),
    oxyUserId: text().notNull().unique("user_settings_oxy_user_id_key"),
    appearanceThemeMode: text({ enum: THEME_MODES }).notNull().default("system"),
    appearancePrimaryColor: text(),
    profileHeaderImage: text(),
    privacyProfileVisibility: text({ enum: PROFILE_VISIBILITIES }).notNull().default("public"),
    privacyShowContactInfo: boolean().notNull().default(true),
    privacyAllowTags: boolean().notNull().default(true),
    privacyAllowAllos: boolean().notNull().default(true),
    privacyShowOnlineStatus: boolean().notNull().default(true),
    privacyHideLikeCounts: boolean().notNull().default(false),
    privacyHideShareCounts: boolean().notNull().default(false),
    privacyHideReplyCounts: boolean().notNull().default(false),
    privacyHideSaveCounts: boolean().notNull().default(false),
    privacyHiddenWords: text().array().notNull().default([]),
    privacyRestrictedUsers: text().array().notNull().default([]),
    privacyBlockedUsers: text().array().notNull().default([]),
    profileCoverPhotoEnabled: boolean().notNull().default(true),
    profileMinimalistMode: boolean().notNull().default(false),
    profileDisplayName: text(),
    profileCoverImage: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("user_settings_theme_mode_check", oneOf(table.appearanceThemeMode, THEME_MODES)),
    check(
      "user_settings_profile_visibility_check",
      oneOf(table.privacyProfileVisibility, PROFILE_VISIBILITIES),
    ),
  ],
);
