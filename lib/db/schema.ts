import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// --- Better Auth tables (names fixed by the adapter) ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Stamped when she taps through the first-run welcome, so it plays once in
  // her life rather than once per device. Nullable: null means never seen.
  welcomedAt: timestamp("welcomed_at"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --- Budget tables ---
// Money is always integer cents. Calendar days are `date`, never `timestamp`.

export const cadenceEnum = pgEnum("cadence", [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]);
export const bucketEnum = pgEnum("bucket", ["needs", "wants", "savings"]);
export const categoryKindEnum = pgEnum("category_kind", ["spending", "bill"]);
export const paycheckKindEnum = pgEnum("paycheck_kind", ["base", "commission"]);

export const payPeriods = pgTable(
  "pay_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
  },
  (t) => [unique("pay_periods_user_start").on(t.userId, t.startsOn)],
);

export const paychecks = pgTable(
  "paychecks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    receivedOn: date("received_on").notNull(),
    amountCents: integer("amount_cents").notNull(),
    kind: paycheckKindEnum("kind").notNull(),
    note: text("note"),
  },
  (t) => [index("paychecks_user_received_idx").on(t.userId, t.receivedOn)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: categoryKindEnum("kind").notNull(),
    /** Bills force this true; accumulating is what a set-aside means. */
    carryover: boolean("carryover").notNull().default(false),
    bucket: bucketEnum("bucket").notNull().default("wants"),
    cadence: cadenceEnum("cadence"),
    recurringAmountCents: integer("recurring_amount_cents"),
    dueAnchor: date("due_anchor"),
    color: text("color").notNull().default("#9ac5e7"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at"),
  },
  (t) => [
    check(
      // `kind` is a pgEnum column; cast to text so the comparison against a
      // plain string literal type-checks under Postgres's enum operator
      // rules (an enum column has no `=` operator against `text`).
      "bill_fields_together",
      sql`(${t.kind}::text = 'bill' AND ${t.cadence} IS NOT NULL AND ${t.recurringAmountCents} IS NOT NULL AND ${t.dueAnchor} IS NOT NULL)
        OR (${t.kind}::text = 'spending' AND ${t.cadence} IS NULL AND ${t.recurringAmountCents} IS NULL AND ${t.dueAnchor} IS NULL)`,
    ),
    index("categories_user_idx").on(t.userId),
  ],
);

export const allocations = pgTable(
  "allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    payPeriodId: uuid("pay_period_id")
      .notNull()
      .references(() => payPeriods.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [
    unique("allocations_period_category").on(t.payPeriodId, t.categoryId),
    index("allocations_pay_period_idx").on(t.payPeriodId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Null means uncategorized: counts toward total spend, no envelope. */
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    occurredOn: date("occurred_on").notNull(),
    amountCents: integer("amount_cents").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("transactions_user_occurred_idx").on(t.userId, t.occurredOn)],
);

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetCents: integer("target_cents").notNull(),
  targetDate: date("target_date"),
  archivedAt: timestamp("archived_at"),
});

export const goalContributions = pgTable("goal_contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  occurredOn: date("occurred_on").notNull(),
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
});

export const allocationTargets = pgTable(
  "allocation_targets",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    needsPct: integer("needs_pct").notNull().default(50),
    wantsPct: integer("wants_pct").notNull().default(30),
    savingsPct: integer("savings_pct").notNull().default(20),
  },
  (t) => [
    check(
      "targets_sum_to_100",
      sql`${t.needsPct} + ${t.wantsPct} + ${t.savingsPct} = 100`,
    ),
  ],
);

// --- Notes / diary / to-do tables ---
// Her own sections, named by her; nothing here is preset. A section is either
// a place she writes dated entries or a list she ticks off, and `kind` fixes
// which at creation. Days she sees are `date` ('YYYY-MM-DD'); the created/
// updated stamps are row bookkeeping and stay `timestamp`.
//
// SEAM — optional per-section passwords. He has not decided between hiding a
// section behind a check (theatre against anyone holding the database) and
// real encryption (a forgotten password destroys her entries permanently), and
// the two want different columns: the first a password hash + salt HERE on
// note_sections, the second a KDF salt and wrapped data key here plus
// ciphertext columns replacing `title`/`body` on note_entries. Adding either
// now would presuppose the answer, so neither is present.

export const noteSectionKindEnum = pgEnum("note_section_kind", [
  "journal",
  "todo",
]);

export const noteSections = pgTable(
  "note_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: noteSectionKindEnum("kind").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("note_sections_name_present", sql`btrim(${t.name}) <> ''`),
    index("note_sections_user_sort_idx").on(t.userId, t.sortOrder),
  ],
);

export const noteEntries = pgTable(
  "note_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => noteSections.id, { onDelete: "cascade" }),
    /**
     * The day the entry is about, for a journal section. Null on a to-do item,
     * which has no day of its own — the seam a due date would use later.
     */
    entryOn: date("entry_on"),
    /** A to-do item's text; a journal entry's optional heading. */
    title: text("title"),
    /** The writing. Empty string on a to-do item, never null. */
    body: text("body").notNull().default(""),
    done: boolean("done").notNull().default(false),
    /** The day she ticked it. Set with `done`, cleared when she un-ticks. */
    doneOn: date("done_on"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // An entry has to carry something: a blank row is a bug, not a thought.
    check(
      "note_entries_not_empty",
      sql`coalesce(btrim(${t.title}), '') <> '' OR btrim(${t.body}) <> ''`,
    ),
    // A completion date without a completion is a lie about the row.
    check(
      "note_entries_done_on_with_done",
      sql`${t.done} OR ${t.doneOn} IS NULL`,
    ),
    index("note_entries_section_sort_idx").on(t.sectionId, t.sortOrder),
    index("note_entries_user_idx").on(t.userId),
  ],
);
