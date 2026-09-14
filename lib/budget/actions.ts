"use server";

/**
 * Write side of the budget data layer.
 *
 * A Server Action is a public POST endpoint: the form that renders it is not
 * the security boundary, so every action re-verifies the session itself and
 * every insert carries — and every ownership check filters on — that user id.
 * The exported signatures are what the forms in `components/budget` and the
 * goals page are bound to, so they stay put.
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { periodBoundsFrom } from "@/lib/budget/periods";
import {
  allocations,
  categories,
  goalContributions,
  goals,
  paychecks,
  payPeriods,
  transactions,
} from "@/lib/db/schema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Dollars from a form input -> integer cents, without float drift. */
function toCents(dollars: FormDataEntryValue | null): number {
  const amount = Math.round(Number(dollars) * 100);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid amount");
  return amount;
}

function isoDate(value: FormDataEntryValue | null): string {
  const date = String(value ?? "");
  if (!ISO_DATE.test(date)) throw new Error("Expected YYYY-MM-DD");
  return date;
}

function text(value: FormDataEntryValue | null, max: number): string {
  const s = String(value ?? "").trim();
  if (s.length === 0 || s.length > max) throw new Error("Invalid text");
  return s;
}

/**
 * An id arriving in a form says only which row she means, never that it is
 * hers. Every id is re-read under her user id before it is written against.
 */
async function assertOwnsCategory(
  userId: string,
  categoryId: string,
): Promise<void> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);

  if (rows.length === 0) throw new Error("Unknown category");
}

/** Categories order by insertion, so a new one lands at the end of her list. */
async function nextSortOrder(userId: string): Promise<number> {
  const [last] = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(desc(categories.sortOrder))
    .limit(1);

  return last ? last.sortOrder + 1 : 0;
}

export async function logPaycheck(formData: FormData) {
  const { userId } = await verifySession();

  const kind = String(formData.get("kind"));
  if (kind !== "base" && kind !== "commission") throw new Error("Unknown kind");

  const receivedOn = isoDate(formData.get("receivedOn"));

  await db.transaction(async (tx) => {
    // Her first paycheck is also what establishes the pay period it belongs
    // to — nothing else in the app creates one, and every figure on the
    // dashboard is period-scoped, so without this the home page would take
    // the paycheck and still have nothing to compute from.
    const [existing] = await tx
      .select({ id: payPeriods.id })
      .from(payPeriods)
      .where(eq(payPeriods.userId, userId))
      .orderBy(desc(payPeriods.startsOn))
      .limit(1);

    if (!existing) {
      const bounds = periodBoundsFrom(receivedOn);
      await tx.insert(payPeriods).values({ userId, ...bounds });
    }

    await tx.insert(paychecks).values({
      userId,
      receivedOn,
      amountCents: toCents(formData.get("amount")),
      kind,
    });
  });

  // The dashboard and its setup states both live on "/", so it has to be
  // revalidated too or the gate card survives its own submission.
  revalidatePath("/");
  revalidatePath("/budget");
}

export async function addTransaction(formData: FormData) {
  const { userId } = await verifySession();

  const raw = formData.get("categoryId");
  const categoryId = raw && String(raw) !== "" ? String(raw) : null;

  // Null is legitimate: an uncategorized spend counts toward the total but
  // lands in no envelope.
  if (categoryId) await assertOwnsCategory(userId, categoryId);

  await db.insert(transactions).values({
    userId,
    categoryId,
    occurredOn: isoDate(formData.get("occurredOn")),
    amountCents: toCents(formData.get("amount")),
  });

  revalidatePath("/budget");
}

export async function setAllocation(formData: FormData) {
  const { userId } = await verifySession();

  const payPeriodId = String(formData.get("payPeriodId"));
  const categoryId = String(formData.get("categoryId"));
  const amountCents = toCents(formData.get("amount"));

  const [periodRows] = await Promise.all([
    db
      .select({ id: payPeriods.id })
      .from(payPeriods)
      .where(and(eq(payPeriods.id, payPeriodId), eq(payPeriods.userId, userId)))
      .limit(1),
    assertOwnsCategory(userId, categoryId),
  ]);

  if (periodRows.length === 0) throw new Error("Unknown pay period");

  // Re-assigning an envelope is an edit, not a second allocation; the unique
  // key on (period, category) turns the second write into the edit.
  await db
    .insert(allocations)
    .values({ userId, payPeriodId, categoryId, amountCents })
    .onConflictDoUpdate({
      target: [allocations.payPeriodId, allocations.categoryId],
      set: { amountCents },
    });

  revalidatePath("/budget");
}

const CADENCES = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;

export async function createBill(formData: FormData) {
  const { userId } = await verifySession();

  const cadence = String(formData.get("cadence"));
  if (!CADENCES.includes(cadence as (typeof CADENCES)[number])) {
    throw new Error("Unknown cadence");
  }

  const name = text(formData.get("name"), 60);
  const recurringAmountCents = toCents(formData.get("amount"));
  const dueAnchor = isoDate(formData.get("dueAnchor"));
  const color = String(formData.get("color") || "#6ba1cd");

  await db.insert(categories).values({
    userId,
    name,
    kind: "bill",
    bucket: "needs",
    // Bills always carry over: a part-funded bill envelope is meaningless if
    // it resets every payday.
    carryover: true,
    cadence: cadence as (typeof CADENCES)[number],
    recurringAmountCents,
    dueAnchor,
    color,
    sortOrder: await nextSortOrder(userId),
  });

  revalidatePath("/");
  revalidatePath("/budget");
}

export async function createSpendingCategory(formData: FormData) {
  const { userId } = await verifySession();

  const name = text(formData.get("name"), 60);
  const carryover = formData.get("carryover") === "on";
  const color = String(formData.get("color") || "#93bee0");

  await db.insert(categories).values({
    userId,
    name,
    kind: "spending",
    bucket: "wants",
    carryover,
    // The bill_fields_together constraint rejects a spending row that carries
    // any of the three, so they are written as null explicitly.
    cadence: null,
    recurringAmountCents: null,
    dueAnchor: null,
    color,
    sortOrder: await nextSortOrder(userId),
  });

  revalidatePath("/");
  revalidatePath("/budget");
}

export async function createGoal(formData: FormData) {
  const { userId } = await verifySession();

  const rawDate = String(formData.get("targetDate") ?? "");

  await db.insert(goals).values({
    userId,
    name: text(formData.get("name"), 60),
    targetCents: toCents(formData.get("target")),
    targetDate: rawDate === "" ? null : isoDate(rawDate),
  });

  revalidatePath("/budget/goals");
}

export async function addGoalContribution(formData: FormData) {
  const { userId } = await verifySession();

  const goalId = String(formData.get("goalId"));

  const owned = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .limit(1);

  if (owned.length === 0) throw new Error("Unknown goal");

  await db.insert(goalContributions).values({
    userId,
    goalId,
    occurredOn: isoDate(formData.get("occurredOn")),
    amountCents: toCents(formData.get("amount")),
  });

  revalidatePath("/budget/goals");
}
