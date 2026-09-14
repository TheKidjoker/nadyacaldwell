"use server";

/**
 * Write side of the budget data layer.
 *
 * Task 9 replaces these bodies with authenticated Drizzle inserts (and zod
 * parsing of the form data); the exported signatures are what the forms in
 * `components/budget` and the goals page are bound to, so they stay put.
 */
import { revalidatePath } from "next/cache";
import {
  addCategoryRow,
  addGoalContributionRow,
  addGoalRow,
  addPaycheckRow,
  addTransactionRow,
  setAllocationRow,
  store,
} from "@/lib/db/demo-store";

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

export async function logPaycheck(formData: FormData) {
  const kind = String(formData.get("kind"));
  if (kind !== "base" && kind !== "commission") throw new Error("Unknown kind");

  addPaycheckRow({
    receivedOn: isoDate(formData.get("receivedOn")),
    amountCents: toCents(formData.get("amount")),
    kind,
  });

  revalidatePath("/budget");
}

export async function addTransaction(formData: FormData) {
  const categoryId = formData.get("categoryId")
    ? String(formData.get("categoryId"))
    : null;

  if (categoryId && !store.categories.some((c) => c.id === categoryId)) {
    throw new Error("Unknown category");
  }

  addTransactionRow({
    categoryId,
    occurredOn: isoDate(formData.get("occurredOn")),
    amountCents: toCents(formData.get("amount")),
  });

  revalidatePath("/budget");
}

export async function setAllocation(formData: FormData) {
  const payPeriodId = String(formData.get("payPeriodId"));
  const categoryId = String(formData.get("categoryId"));

  if (!store.periods.some((p) => p.id === payPeriodId)) {
    throw new Error("Unknown pay period");
  }
  if (!store.categories.some((c) => c.id === categoryId)) {
    throw new Error("Unknown category");
  }

  setAllocationRow({
    payPeriodId,
    categoryId,
    amountCents: toCents(formData.get("amount")),
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
  const cadence = String(formData.get("cadence"));
  if (!CADENCES.includes(cadence as (typeof CADENCES)[number])) {
    throw new Error("Unknown cadence");
  }

  addCategoryRow({
    name: text(formData.get("name"), 60),
    kind: "bill",
    bucket: "needs",
    // Bills always carry over: a part-funded bill envelope is meaningless if
    // it resets every payday.
    carryover: true,
    cadence: cadence as (typeof CADENCES)[number],
    recurringAmountCents: toCents(formData.get("amount")),
    dueAnchor: isoDate(formData.get("dueAnchor")),
    color: String(formData.get("color") || "#6ba1cd"),
  });

  revalidatePath("/budget");
  revalidatePath("/onboarding");
}

export async function createSpendingCategory(formData: FormData) {
  addCategoryRow({
    name: text(formData.get("name"), 60),
    kind: "spending",
    bucket: "wants",
    carryover: formData.get("carryover") === "on",
    cadence: null,
    recurringAmountCents: null,
    dueAnchor: null,
    color: String(formData.get("color") || "#93bee0"),
  });

  revalidatePath("/budget");
  revalidatePath("/onboarding");
}

export async function createGoal(formData: FormData) {
  const rawDate = String(formData.get("targetDate") ?? "");

  addGoalRow({
    name: text(formData.get("name"), 60),
    targetCents: toCents(formData.get("target")),
    targetDate: rawDate === "" ? null : isoDate(rawDate),
  });

  revalidatePath("/budget/goals");
}

export async function addGoalContribution(formData: FormData) {
  const goalId = String(formData.get("goalId"));
  if (!store.goals.some((g) => g.id === goalId)) throw new Error("Unknown goal");

  addGoalContributionRow({
    goalId,
    occurredOn: isoDate(formData.get("occurredOn")),
    amountCents: toCents(formData.get("amount")),
  });

  revalidatePath("/budget/goals");
}
