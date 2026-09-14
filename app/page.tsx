import Link from "next/link";
import { Corners } from "@/components/Corners";
import { Hero } from "@/components/Hero";
import { Bloom } from "@/components/florals/Bloom";
import { getGoalsData, getPeriodData } from "@/lib/db/queries";
import { goalProgress, summarizePeriod } from "@/lib/budget/calc";
import { DEFAULT_TARGETS } from "@/lib/budget/types";
import { formatCents } from "@/lib/budget/format";
import { noteForDay } from "@/lib/notes";
import styles from "./landing.module.css";

export default async function Page() {
  const today = new Date().toISOString().slice(0, 10);
  const note = noteForDay(today);
  const data = await getPeriodData();
  const { goals, contributions } = await getGoalsData();

  const summary = data
    ? summarizePeriod({
        period: data.period,
        paychecks: data.paychecks,
        categories: data.categories,
        allocations: data.allocations,
        transactions: data.transactions,
        today,
        // Until Task 9 reads her saved targets from the database.
        targets: DEFAULT_TARGETS,
      })
    : null;

  return (
    <div className={styles.stage}>
      <Corners />

      <main className={styles.content}>
        <div className={styles.contentInner}>
          <Hero note={note} />

          {summary && (
            <section className={styles.dash}>
              {summary.safeToSpendPerDayCents === null ? (
                <>
                  <p className={styles.dashNumber}>
                    {formatCents(summary.spendableRemainingCents)}
                  </p>
                  <p className={styles.dashLabel}>left &middot; this period has ended</p>
                </>
              ) : (
                <>
                  <p className={styles.dashNumber}>
                    {formatCents(summary.safeToSpendPerDayCents)}
                  </p>
                  <p className={styles.dashLabel}>
                    a day for {summary.daysRemaining}{" "}
                    {summary.daysRemaining === 1 ? "day" : "days"} &middot;{" "}
                    {formatCents(summary.spendableRemainingCents)} left to spend
                  </p>
                </>
              )}

              <dl className={styles.stats}>
                <div className={styles.stat}>
                  <dt className={styles.statLabel}>This paycheck</dt>
                  <dd className={styles.statValue}>
                    {formatCents(summary.incomeCents)}
                  </dd>
                </div>
                <div className={styles.stat}>
                  <dt className={styles.statLabel}>Spent so far</dt>
                  <dd className={styles.statValue}>
                    {formatCents(summary.totalSpentCents)}
                  </dd>
                </div>
                <div className={styles.stat}>
                  <dt className={styles.statLabel}>
                    {summary.unallocatedCents < 0 ? "Over-allocated" : "Unallocated"}
                  </dt>
                  <dd className={styles.statValue}>
                    {formatCents(Math.abs(summary.unallocatedCents))}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {goals.length > 0 && (
            <section className={styles.goalsRow}>
              {goals.map((goal) => {
                const p = goalProgress({ goal, contributions, today });
                return (
                  <Link key={goal.id} href="/budget/goals" className={styles.goalChip}>
                    <Bloom
                      progress={p.pctComplete}
                      label={`${goal.name}: ${Math.round(p.pctComplete * 100)} percent saved`}
                      size={46}
                    />
                    <span className={styles.goalChipName}>{goal.name}</span>
                    <span className={styles.goalChipPct}>
                      {formatCents(p.savedCents)} of {formatCents(goal.targetCents)}
                    </span>
                  </Link>
                );
              })}
            </section>
          )}

          {!summary && (
            <p className={styles.dashLabel}>
              Nothing set up yet &mdash; your budget starts once the database is
              connected.
            </p>
          )}

          <nav className={styles.dashLinks}>
            <Link href="/budget" className={styles.dashLink}>
              Budget
            </Link>
            <Link href="/budget/goals" className={styles.dashLink}>
              Savings goals
            </Link>
          </nav>
        </div>
      </main>
    </div>
  );
}
