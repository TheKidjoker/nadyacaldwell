ALTER TABLE "note_entries" DROP CONSTRAINT "note_entries_not_empty";--> statement-breakpoint
ALTER TABLE "note_entries" ADD COLUMN "enc_title" text;--> statement-breakpoint
ALTER TABLE "note_entries" ADD COLUMN "enc_body" text;--> statement-breakpoint
ALTER TABLE "note_sections" ADD COLUMN "enc_set_at" timestamp;--> statement-breakpoint
ALTER TABLE "note_sections" ADD COLUMN "enc_salt" text;--> statement-breakpoint
ALTER TABLE "note_sections" ADD COLUMN "enc_wrapped_dek" text;--> statement-breakpoint
ALTER TABLE "note_sections" ADD COLUMN "enc_recovery_salt" text;--> statement-breakpoint
ALTER TABLE "note_sections" ADD COLUMN "enc_recovery_wrapped_dek" text;--> statement-breakpoint
ALTER TABLE "note_sections" ADD COLUMN "enc_kdf_params" text;--> statement-breakpoint
ALTER TABLE "note_entries" ADD CONSTRAINT "note_entries_no_plaintext_when_encrypted" CHECK ("note_entries"."enc_body" IS NULL OR ("note_entries"."title" IS NULL AND "note_entries"."body" = ''));--> statement-breakpoint
ALTER TABLE "note_entries" ADD CONSTRAINT "note_entries_enc_title_needs_body" CHECK ("note_entries"."enc_title" IS NULL OR "note_entries"."enc_body" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "note_entries" ADD CONSTRAINT "note_entries_not_empty" CHECK ("note_entries"."enc_body" IS NOT NULL OR coalesce(btrim("note_entries"."title"), '') <> '' OR btrim("note_entries"."body") <> '');--> statement-breakpoint
ALTER TABLE "note_sections" ADD CONSTRAINT "note_sections_enc_all_or_none" CHECK (("note_sections"."enc_set_at" IS NULL AND "note_sections"."enc_salt" IS NULL AND "note_sections"."enc_wrapped_dek" IS NULL AND "note_sections"."enc_recovery_salt" IS NULL AND "note_sections"."enc_recovery_wrapped_dek" IS NULL AND "note_sections"."enc_kdf_params" IS NULL)
        OR ("note_sections"."enc_set_at" IS NOT NULL AND "note_sections"."enc_salt" IS NOT NULL AND "note_sections"."enc_wrapped_dek" IS NOT NULL AND "note_sections"."enc_recovery_salt" IS NOT NULL AND "note_sections"."enc_recovery_wrapped_dek" IS NOT NULL AND "note_sections"."enc_kdf_params" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "note_sections" ADD CONSTRAINT "note_sections_enc_salts_differ" CHECK ("note_sections"."enc_salt" IS NULL OR "note_sections"."enc_salt" <> "note_sections"."enc_recovery_salt");