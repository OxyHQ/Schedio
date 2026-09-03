-- oxy:deploy-phase=pre
CREATE TABLE "blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"platform" text NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "post_analytics_non_negative_check" CHECK ("post_analytics"."likes" >= 0 and "post_analytics"."shares" >= 0 and "post_analytics"."comments" >= 0 and "post_analytics"."impressions" >= 0 and "post_analytics"."reach" >= 0 and "post_analytics"."clicks" >= 0)
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"media" text[] DEFAULT '{}' NOT NULL,
	"platform_ids" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "posts_status_check" CHECK ("posts"."status" in ('draft', 'scheduled', 'published', 'failed')),
	CONSTRAINT "posts_retry_count_check" CHECK ("posts"."retry_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "publishing_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "publishing_schedules_slots_array_check" CHECK (jsonb_typeof("publishing_schedules"."slots") = 'array')
);
--> statement-breakpoint
CREATE TABLE "restricts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"restricted_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"platform_user_id" text NOT NULL,
	"platform_username" text NOT NULL,
	"access_token_ciphertext" text NOT NULL,
	"refresh_token_ciphertext" text,
	"token_expires_at" timestamp with time zone,
	"profile_image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "social_accounts_platform_check" CHECK ("social_accounts"."platform" in ('twitter', 'instagram', 'facebook', 'linkedin', 'mastodon')),
	CONSTRAINT "social_accounts_access_token_ciphertext_check" CHECK ("social_accounts"."access_token_ciphertext" like 'v1:%'),
	CONSTRAINT "social_accounts_refresh_token_ciphertext_check" CHECK ("social_accounts"."refresh_token_ciphertext" is null or "social_accounts"."refresh_token_ciphertext" like 'v1:%')
);
--> statement-breakpoint
CREATE TABLE "user_behaviors" (
	"id" text PRIMARY KEY NOT NULL,
	"oxy_user_id" text NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "user_behaviors_oxy_user_id_key" UNIQUE("oxy_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"oxy_user_id" text NOT NULL,
	"appearance_theme_mode" text DEFAULT 'system' NOT NULL,
	"appearance_primary_color" text,
	"profile_header_image" text,
	"privacy_profile_visibility" text DEFAULT 'public' NOT NULL,
	"privacy_show_contact_info" boolean DEFAULT true NOT NULL,
	"privacy_allow_tags" boolean DEFAULT true NOT NULL,
	"privacy_allow_allos" boolean DEFAULT true NOT NULL,
	"privacy_show_online_status" boolean DEFAULT true NOT NULL,
	"privacy_hide_like_counts" boolean DEFAULT false NOT NULL,
	"privacy_hide_share_counts" boolean DEFAULT false NOT NULL,
	"privacy_hide_reply_counts" boolean DEFAULT false NOT NULL,
	"privacy_hide_save_counts" boolean DEFAULT false NOT NULL,
	"privacy_hidden_words" text[] DEFAULT '{}' NOT NULL,
	"privacy_restricted_users" text[] DEFAULT '{}' NOT NULL,
	"privacy_blocked_users" text[] DEFAULT '{}' NOT NULL,
	"profile_cover_photo_enabled" boolean DEFAULT true NOT NULL,
	"profile_minimalist_mode" boolean DEFAULT false NOT NULL,
	"profile_display_name" text,
	"profile_cover_image" text,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "user_settings_oxy_user_id_key" UNIQUE("oxy_user_id"),
	CONSTRAINT "user_settings_theme_mode_check" CHECK ("user_settings"."appearance_theme_mode" in ('light', 'dark', 'system')),
	CONSTRAINT "user_settings_profile_visibility_check" CHECK ("user_settings"."privacy_profile_visibility" in ('public', 'private', 'followers_only'))
);
--> statement-breakpoint
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_owner_target_key" ON "blocks" USING btree ("user_id","blocked_id");--> statement-breakpoint
CREATE INDEX "blocks_target_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_analytics_post_platform_key" ON "post_analytics" USING btree ("post_id","platform");--> statement-breakpoint
CREATE INDEX "posts_owner_created_at_idx" ON "posts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_owner_status_idx" ON "posts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "posts_status_scheduled_at_idx" ON "posts" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "publishing_schedules_owner_idx" ON "publishing_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "restricts_owner_target_key" ON "restricts" USING btree ("user_id","restricted_id");--> statement-breakpoint
CREATE INDEX "restricts_target_idx" ON "restricts" USING btree ("restricted_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_owner_platform_user_key" ON "social_accounts" USING btree ("user_id","platform","platform_user_id");--> statement-breakpoint
CREATE INDEX "social_accounts_owner_active_idx" ON "social_accounts" USING btree ("user_id","is_active");
