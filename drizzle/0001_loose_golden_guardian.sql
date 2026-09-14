CREATE TYPE "public"."category_kind" AS ENUM('spending', 'bill');--> statement-breakpoint
CREATE TYPE "public"."paycheck_kind" AS ENUM('base', 'commission');--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "bill_fields_together";--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "kind" SET DATA TYPE "public"."category_kind" USING "kind"::"public"."category_kind";--> statement-breakpoint
ALTER TABLE "paychecks" ALTER COLUMN "kind" SET DATA TYPE "public"."paycheck_kind" USING "kind"::"public"."paycheck_kind";--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocations_pay_period_idx" ON "allocations" USING btree ("pay_period_id");--> statement-breakpoint
CREATE INDEX "categories_user_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "paychecks_user_received_idx" ON "paychecks" USING btree ("user_id","received_on");--> statement-breakpoint
CREATE INDEX "transactions_user_occurred_idx" ON "transactions" USING btree ("user_id","occurred_on");--> statement-breakpoint
ALTER TABLE "allocation_targets" ADD CONSTRAINT "targets_sum_to_100" CHECK ("allocation_targets"."needs_pct" + "allocation_targets"."wants_pct" + "allocation_targets"."savings_pct" = 100);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "bill_fields_together" CHECK (("categories"."kind"::text = 'bill' AND "categories"."cadence" IS NOT NULL AND "categories"."recurring_amount_cents" IS NOT NULL AND "categories"."due_anchor" IS NOT NULL)
        OR ("categories"."kind"::text = 'spending' AND "categories"."cadence" IS NULL AND "categories"."recurring_amount_cents" IS NULL AND "categories"."due_anchor" IS NULL));