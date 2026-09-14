import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { getPeriodData } from "@/lib/db/queries";
import { summarizePeriod } from "@/lib/budget/calc";
import { DEFAULT_TARGETS } from "@/lib/budget/types";
import { formatCents } from "@/lib/budget/format";
import { EnvelopeCard } from "@/components/budget/EnvelopeCard";
import { QuickAdd } from "@/components/budget/QuickAdd";
import { periodStanding } from "@/components/budget/periodStanding";
import styles from "./budget.module.css";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodId } = await searchParams;

  // This page lives under (private), but a Server Component is not the
  // security boundary either -- the session is verified here as well as
  // inside every query it runs.
  await verifySession();

  const data = await getPeriodData(periodId);

  // Setup happens on the home page now, not in a wizard of its own: with no
  // pay period there is nothing here to navigate, so this points back there
  // rather than rendering an empty frame.
  if (!data) {
    return (
      <main className={styles.page}>
        <nav className={styles.periodNav}>
          <Link href="/">&larr; Home</Link>
        </nav>
        <section className={styles.headline}>
          <p className={styles.headlineLabel}>
            Nothing to show until your first paycheck is logged.
          </p>
          <p className={styles.emptyAction}>
            <Link href="/">Start on the home page &rarr;</Link>
          </p>
        </section>
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
    // Until Task 9 reads her saved targets from the database.
    targets: DEFAULT_TARGETS,
  });

  /** Same figures as the home page, from the same helper. */
  const standing = periodStanding(summary, data.categories);

  const index = data.periods.findIndex((p) => p.id === data.period.id);
  const prev = data.periods[index - 1];
  const next = data.periods[index + 1];

  const byId = new Map(data.categories.map((c) => [c.id, c]));
  const spending = summary.envelopes.filter((e) => e.kind === "spending");
  const bills = summary.envelopes.filter((e) => e.kind === "bill");

  return (
    <main className={styles.page}>
      <nav className={styles.periodNav}>
        {prev ? (
          <Link href={`/budget?period=${prev.id}`}>&larr; Previous</Link>
        ) : (
          <span />
        )}
        <span className={styles.periodLabel}>
          {data.period.startsOn} &ndash; {data.period.endsOn}
        </span>
        {next ? <Link href={`/budget?period=${next.id}`}>Next &rarr;</Link> : <span />}
      </nav>

      <section className={styles.headline}>
        {/* The same hold as the home page, from the same helper. Without it
            this read "$0.00 a day for 9 days" the moment a bill was added,
            which is false rather than cautious: safeToSpendPerDay divides the
            SPENDING envelopes, and a bill never puts money in one. */}
        {!standing.hasSpendable ? (
          <>
            <p className={styles.headlineNumber}>
              {formatCents(standing.toAssignCents)}
            </p>
            <p className={styles.headlineLabel}>
              to assign
              {standing.billsStillNeededCents > 0 && (
                <>
                  {" "}
                  &middot; {formatCents(standing.billsStillNeededCents)} held for
                  bills
                </>
              )}
            </p>
          </>
        ) : summary.safeToSpendPerDayCents === null ? (
          <>
            <p className={styles.headlineNumber}>
              {formatCents(summary.spendableRemainingCents)}
            </p>
            <p className={styles.headlineLabel}>left &middot; period has ended</p>
          </>
        ) : (
          <>
            <p className={styles.headlineNumber}>
              {formatCents(summary.safeToSpendPerDayCents)}
            </p>
            <p className={styles.headlineLabel}>
              a day for {summary.daysRemaining}{" "}
              {summary.daysRemaining === 1 ? "day" : "days"} &middot;{" "}
              {formatCents(summary.spendableRemainingCents)} left
            </p>
          </>
        )}
      </section>

      <QuickAdd categories={data.categories} today={today} />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>This paycheck</h2>
        <p className={styles.income}>
          {formatCents(summary.baseCents)} base
          {summary.commissionCents > 0 && (
            <> &middot; {formatCents(summary.commissionCents)} commission</>
          )}
        </p>
        {summary.unallocatedCents !== 0 && (
          <p className={styles.unallocated}>
            {formatCents(Math.abs(summary.unallocatedCents))}{" "}
            {summary.unallocatedCents > 0 ? "unallocated" : "over-allocated"} &middot;{" "}
            <Link href="/budget/goals">send to a goal</Link>
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Spending</h2>
        <div className={styles.envelopes}>
          {spending.map((balance) => (
            <EnvelopeCard
              key={balance.categoryId}
              category={byId.get(balance.categoryId)!}
              balance={balance}
            />
          ))}
        </div>
      </section>

      {bills.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Set aside for bills</h2>
          <p className={styles.sectionNote}>
            Not counted in your daily number &mdash; this money is spoken for.
          </p>
          <div className={styles.envelopes}>
            {bills.map((balance) => (
              <EnvelopeCard
                key={balance.categoryId}
                category={byId.get(balance.categoryId)!}
                balance={balance}
              />
            ))}
          </div>
        </section>
      )}

      <nav className={styles.footerNav}>
        <Link href="/">&larr; Home</Link>
        <Link href="/budget/goals">Savings goals &rarr;</Link>
      </nav>
    </main>
  );
}
