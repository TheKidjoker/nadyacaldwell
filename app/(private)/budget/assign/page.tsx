import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getPeriodData } from "@/lib/db/queries";
import { summarizePeriod } from "@/lib/budget/calc";
import { formatCents, formatShortDate } from "@/lib/budget/format";
import { AssignForm } from "@/components/budget/AssignForm";
import type { AssignRow, FixedRow } from "@/components/budget/AssignForm";
import { AddSpendingSlot } from "@/components/budget/AddSlot";
import styles from "./assign.module.css";

export const metadata = {
  title: "Assign this paycheck",
};

/**
 * Where a paycheck becomes spendable.
 *
 * Until this screen existed `setAllocation` was called from nowhere, so every
 * spending envelope held nothing, `spendableRemainingCents` summed to zero and
 * the daily number the whole tool is built around could not appear at all.
 *
 * This page only reads and arranges. Every figure comes off one
 * `summarizePeriod` call, which is the same call `/` and `/budget` make, so
 * the three screens cannot quote different numbers for the same period. The
 * live arithmetic she watches while typing lives in `AssignForm`, on the same
 * pure functions.
 */
export default async function AssignPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodId } = await searchParams;

  // Under (private), but a Server Component is not the security boundary
  // either: the session is verified here as well as inside every query.
  await verifySession();

  const data = await getPeriodData(periodId);

  // Setup happens on the home page, not in a wizard. With no pay period there
  // is nothing to assign against, so this points back there rather than
  // rendering an empty frame.
  if (!data) {
    return (
      <main className={styles.page}>
        <nav className={styles.topNav}>
          <Link href="/">&larr; Home</Link>
        </nav>
        <h1 className={styles.title}>Nothing to assign yet</h1>
        <p className={styles.lede}>
          Log your first paycheck on the home page and this screen fills in.
        </p>
        <nav className={styles.footerNav}>
          <Link href="/">Start on the home page &rarr;</Link>
        </nav>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const summary = summarizePeriod({
    period: data.period,
    paychecks: data.paychecks,
    categories: data.categories,
    allocations: data.allocations,
    transactions: data.transactions,
    today,
    targets: data.targets,
  });

  const byId = new Map(data.categories.map((c) => [c.id, c]));

  /**
   * Bills, read-only. A bill missing any of its three fields has no honest
   * per-check share, so it is left out of the form rather than written at a
   * guessed amount — the schema forbids that row anyway.
   */
  const fixed: FixedRow[] = summary.envelopes.flatMap((e) => {
    if (e.kind !== "bill") return [];
    if (
      e.perCheckSetAsideCents === null ||
      e.recurringAmountCents === null ||
      e.cadence === null
    ) {
      return [];
    }

    return [
      {
        id: e.categoryId,
        name: byId.get(e.categoryId)?.name ?? "Bill",
        bucket: e.bucket,
        setAsideCents: e.perCheckSetAsideCents,
        recurringAmountCents: e.recurringAmountCents,
        cadence: e.cadence,
        nextDueOn: e.nextDueOn,
      },
    ];
  });

  /** Her envelopes, in her own order. Never re-sorted by amount. */
  const rows: AssignRow[] = summary.envelopes
    .filter((e) => e.kind === "spending")
    .map((e) => ({
      id: e.categoryId,
      name: byId.get(e.categoryId)?.name ?? "Category",
      bucket: e.bucket,
      carriedInCents: e.carriedInCents,
      spentCents: e.spentCents,
    }));

  /** What each envelope already holds for THIS period. Not a suggestion. */
  const initialCents = Object.fromEntries(
    summary.envelopes.map((e) => [e.categoryId, e.allocatedCents]),
  );

  return (
    <main className={styles.page}>
      <nav className={styles.topNav}>
        <Link href="/">&larr; Home</Link>
        <Link href="/budget">Budget</Link>
      </nav>

      <h1 className={styles.title}>Assign this paycheck</h1>
      <p className={styles.lede}>
        {formatCents(summary.incomeCents)} came in &middot;{" "}
        {formatShortDate(data.period.startsOn)} &ndash;{" "}
        {formatShortDate(data.period.endsOn)}
      </p>

      <AssignForm
        payPeriodId={data.period.id}
        rows={rows}
        fixed={fixed}
        initialCents={initialCents}
        incomeCents={summary.incomeCents}
        daysRemaining={summary.daysRemaining}
        savedTargets={data.targets}
      >
        <AddSpendingSlot />
      </AssignForm>

      <nav className={styles.footerNav}>
        <Link href="/budget">&larr; Budget</Link>
        <Link href="/budget/goals">Savings goals &rarr;</Link>
      </nav>
    </main>
  );
}
