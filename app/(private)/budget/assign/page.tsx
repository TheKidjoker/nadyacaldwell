import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getPeriodData } from "@/lib/db/queries";
import { summarizePeriod } from "@/lib/budget/calc";
import { formatCents, formatShortDate } from "@/lib/budget/format";
import { splitRowsFrom } from "@/lib/budget/splitRows";
import { AssignForm } from "@/components/budget/AssignForm";
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
 * It is no longer where she is SENT on first run — the dashboard splits the
 * first check inline, with the same component. This page is for a later
 * payday, and for the bill shares and the targets editor that only belong
 * here.
 *
 * It only reads and arranges. Every figure comes off one `summarizePeriod`
 * call, which is the same call `/` and `/budget` make, so the three screens
 * cannot quote different numbers for the same period. The live arithmetic she
 * watches while dragging lives in `SplitSliders`, on the same pure functions.
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

  /**
   * Rows, bills and opening amounts come out of one shared shaper, which the
   * dashboard calls too. Both screens now show the SAME split component, and
   * writing this out twice is exactly how one of them starts including a bill
   * the other drops.
   */
  const { rows, fixed, initialCents } = splitRowsFrom({
    envelopes: summary.envelopes,
    categories: data.categories,
  });

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
