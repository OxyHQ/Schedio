-- oxy:deploy-phase=pre
CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"account_id" text NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"effect_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"lease_token" text,
	"url" text,
	"error" text,
	CONSTRAINT "deliveries_effectKey_unique" UNIQUE("effect_key"),
	CONSTRAINT "deliveries_platform_check" CHECK ("deliveries"."platform" in ('mention', 'mastodon')),
	CONSTRAINT "deliveries_status_check" CHECK ("deliveries"."status" in ('pending', 'sending', 'succeeded', 'failed', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"platform" text NOT NULL,
	"instance" text NOT NULL,
	"secrets_ciphertext" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_policies" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"required" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_accounts" DROP CONSTRAINT "social_accounts_platform_check";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "approved_revision" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "queue_position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "instance" text DEFAULT 'https://mastodon.social' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "oauth_client_id" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "oauth_client_secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_post_account_key" ON "deliveries" USING btree ("post_id","account_id");--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_platform_check" CHECK ("social_accounts"."platform" in ('twitter', 'instagram', 'facebook', 'linkedin', 'mastodon', 'mention'));