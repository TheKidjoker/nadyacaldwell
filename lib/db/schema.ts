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
// OPTIONAL PER-SECTION ENCRYPTION. The seam that used to be described here is
// now taken, and taken by the second of the two options: real encryption, not
// a check she could be waved past. A forgotten password and a lost recovery
// code destroy those entries permanently. `lib/notes-crypto.ts` documents the
// scheme; what it needs from the database is:
//
//   note_sections   the two wrapped copies of the section's data key — one
//                   under her password, one under a recovery code — each with
//                   its own KDF salt, plus the scrypt parameters used. All
//                   six columns are null together or set together; a section
//                   is protected exactly when `enc_set_at` is not null.
//   note_entries    `enc_title` / `enc_body` hold sealed blobs. A row is
//                   encrypted exactly when `enc_body` is not null, and such a
//                   row must carry no plaintext at all — the check below is
//                   what makes "we encrypted it" mean the words are gone from
//                   `title` and `body`, not merely copied.
//
// Encryption is OPT-IN and per section. Plaintext sections keep working with
// every column below null, which is what every existing row already is.
//
// NOT encrypted, and not pretended to be: the section's name, how many entries
// it holds, when each was written or edited, its order in the list, and
// whether a to-do item is ticked. That metadata stays readable so the index
// and the ordering still work while a section is locked.

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

    // --- optional encryption. Null on every section she has not protected. ---

    /** When she turned protection on. Non-null IS "this section is encrypted". */
    encSetAt: timestamp("enc_set_at"),
    /** base64. scrypt salt for the password wrap. */
    encSalt: text("enc_salt"),
    /** base64. The data key, sealed under the key derived from her password. */
    encWrappedDek: text("enc_wrapped_dek"),
    /** base64. A separate scrypt salt for the recovery-code wrap. */
    encRecoverySalt: text("enc_recovery_salt"),
    /** base64. The SAME data key, sealed under the recovery code. */
    encRecoveryWrappedDek: text("enc_recovery_wrapped_dek"),
    /** JSON. The scrypt parameters both wraps used, so they can be raised later. */
    encKdfParams: text("enc_kdf_params"),
  },
  (t) => [
    check("note_sections_name_present", sql`btrim(${t.name}) <> ''`),
    // Six columns that only mean anything together. Half a set of key material
    // is a section that cannot be opened and cannot be told it is broken.
    check(
      "note_sections_enc_all_or_none",
      sql`(${t.encSetAt} IS NULL AND ${t.encSalt} IS NULL AND ${t.encWrappedDek} IS NULL AND ${t.encRecoverySalt} IS NULL AND ${t.encRecoveryWrappedDek} IS NULL AND ${t.encKdfParams} IS NULL)
        OR (${t.encSetAt} IS NOT NULL AND ${t.encSalt} IS NOT NULL AND ${t.encWrappedDek} IS NOT NULL AND ${t.encRecoverySalt} IS NOT NULL AND ${t.encRecoveryWrappedDek} IS NOT NULL AND ${t.encKdfParams} IS NOT NULL)`,
    ),
    // The two salts are what stop one scrypt run from testing both wraps.
    check(
      "note_sections_enc_salts_differ",
      sql`${t.encSalt} IS NULL OR ${t.encSalt} <> ${t.encRecoverySalt}`,
    ),
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

    // --- ciphertext, on rows in a protected section. Null everywhere else. ---

    /** base64 sealed blob standing in for `title`. Null when she gave none. */
    encTitle: text("enc_title"),
    /**
     * base64 sealed blob standing in for `body`. Non-null IS "this row is
     * encrypted" — an empty body is still sealed, so there is one unambiguous
     * flag rather than two half-answers.
     */
    encBody: text("enc_body"),
  },
  (t) => [
    // An entry has to carry something: a blank row is a bug, not a thought.
    // An encrypted row satisfies this by holding ciphertext; what it actually
    // says is checked before it is sealed, in lib/notes-actions.ts.
    check(
      "note_entries_not_empty",
      sql`${t.encBody} IS NOT NULL OR coalesce(btrim(${t.title}), '') <> '' OR btrim(${t.body}) <> ''`,
    ),
    // The one that makes the promise true. Encrypting an entry must MOVE the
    // words, not copy them: if this row has ciphertext, the plaintext columns
    // are empty, and no half-finished write can leave the original behind.
    check(
      "note_entries_no_plaintext_when_encrypted",
      sql`${t.encBody} IS NULL OR (${t.title} IS NULL AND ${t.body} = '')`,
    ),
    // A sealed title with no sealed body would be a row nothing can classify.
    check(
      "note_entries_enc_title_needs_body",
      sql`${t.encTitle} IS NULL OR ${t.encBody} IS NOT NULL`,
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
