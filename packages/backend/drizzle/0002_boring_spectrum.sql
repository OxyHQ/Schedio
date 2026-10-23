-- oxy:deploy-phase=pre
ALTER TABLE "social_accounts" DROP CONSTRAINT "social_accounts_access_token_ciphertext_check";--> statement-breakpoint
ALTER TABLE "social_accounts" ALTER COLUMN "access_token_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "oxy_task_id" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_access_token_ciphertext_check" CHECK (("social_accounts"."platform" = 'mention' and "social_accounts"."access_token_ciphertext" is null) or ("social_accounts"."access_token_ciphertext" is not null and "social_accounts"."access_token_ciphertext" like 'v1:%'));