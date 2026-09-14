CREATE TYPE "public"."note_section_kind" AS ENUM('journal', 'todo');--> statement-breakpoint
CREATE TABLE "note_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"section_id" uuid NOT NULL,
	"entry_on" date,
	"title" text,
	"body" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_on" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "note_entries_not_empty" CHECK (coalesce(btrim("note_entries"."title"), '') <> '' OR btrim("note_entries"."body") <> ''),
	CONSTRAINT "note_entries_done_on_with_done" CHECK ("note_entries"."done" OR "note_entries"."done_on" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "note_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "note_section_kind" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "note_sections_name_present" CHECK (btrim("note_sections"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "note_entries" ADD CONSTRAINT "note_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_entries" ADD CONSTRAINT "note_entries_section_id_note_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."note_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_sections" ADD CONSTRAINT "note_sections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_entries_section_sort_idx" ON "note_entries" USING btree ("section_id","sort_order");--> statement-breakpoint
CREATE INDEX "note_entries_user_idx" ON "note_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "note_sections_user_sort_idx" ON "note_sections" USING btree ("user_id","sort_order");