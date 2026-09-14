import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Corners } from "@/components/Corners";
import { Hero } from "@/components/Hero";
import { Bloom } from "@/components/florals/Bloom";
import { AddBillSlot, AddSpendingSlot } from "@/components/budget/AddSlot";
import { BillRow } from "@/components/budget/BillRow";
import { PaycheckGate } from "@/components/budget/PaycheckGate";
import { auth } from "@/lib/auth";
import { getGoalsData, getPeriodData } from "@/lib/db/queries";
import { goalProgress, summarizePeriod } from "@/lib/budget/calc";
import { perCheckSetAside } from "@/lib/budget/recurrence";
import { DEFAULT_TARGETS } from "@/lib/budget/types";
import { formatCents } from "@/lib/budget/format";
import { noteForDay } from "@/lib/notes";
import styles from "./landing.module.css";
import setup from "@/components/budget/setup.module.css";

/**
 * The shell is constant in all three states: corners, her name, the hairline,
 * the note. Only what sits underneath changes, so signing in reads as the
 * room lighting up rather than as a different page.
 */
function Shell({ note, children }: { note: string | null; children: ReactNode }) {
  return (
    <div className={styles.stage}>
      <Corners />

      <main className={styles.content}>
        <div className={styles.contentInner}>
          <Hero note={note} />
          {children}
        </div>
      </main>
    </div>
  );
}

export default async function Page() {
  const today = new Date().toISOString().slice(0, 10);
  const note = noteForDay(today);

  // `/` is public and indexed (see app/robots.ts and app/sitemap.ts), so the
  // signed-out render must not read a single row of her finances. Every query
  // below sits under this check on purpose -- `verifySession` inside the query
  // layer would redirect rather than return null, which is wrong for a page
  // that has a legitimate signed-out state. Do not hoist a fetch above here.
  const session = await auth.api.getSession({ headers: await headers() });

  // --- State A: signed out. No database access at all. ---
  if (!session) {
    return (
      <Shell note={note}>
        <nav className={styles.dashLinks}>
          <Link href="/signin" className={styles.dashLink}>
            Sign in
          </Link>
        </nav>
      </Shell>
    );
  }

  const data = await getPeriodData();

  // --- State B: signed in, nothing to compute from yet. ---
  // The gate stands alone: summarizePeriod has no pay period to work against,
  // so there is no honest number to put above it.
  if (!data) {
    return (
      <Shell note={note}>
        <PaycheckGate today={today} />
      </Shell>
    );
  }

  // --- State C: the dashboard. ---
  const { goals, contributions } = await getGoalsData();

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

  const bills = data.categories.filter((c) => c.kind === "bill");
  const spending = data.categories.filter((c) => c.kind === "spending");

  /**
   * The daily-number hold.
   *
   * With a paycheck logged but no envelopes, every cent looks spendable and
   * safeToSpendPerDay would quote her rent money back as pocket change. That
   * is not a cautious number, it is a wrong one. So the headline holds at
   * $--.-- until she has told us about at least one bill or one spending
   * category -- derived here from the rows she has actually entered, not from
   * any stored flag or extra column.
   */
  const hasEnvelopes = bills.length > 0 || spending.length > 0;

  const billSetAsideCents = bills.reduce(
    (total, c) =>
      total +
      (c.recurringAmountCents !== null && c.cadence !== null
        ? perCheckSetAside(c.recurringAmountCents, c.cadence)
        : 0),
    0,
  );

  return (
    <Shell note={note}>
      <section className={styles.dash}>
        {!hasEnvelopes ? (
          <>
            <p className={styles.dashNumber}>$--.--</p>
            <p className={styles.dashLabel}>once your bills are in</p>
          </>
        ) : summary.safeToSpendPerDayCents === null ? (
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
            <dd className={styles.statValue}>{formatCents(summary.incomeCents)}</dd>
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

      <section className={setup.section}>
        <div className={setup.sectionHead}>
          <h2 className={setup.sectionTitle}>Bills</h2>
          {bills.length > 0 && (
            <span className={setup.sectionTotal}>
              {formatCents(billSetAsideCents)} per paycheck
            </span>
          )}
        </div>

        {bills.length > 0 ? (
          <div className={setup.rows}>
            {bills.map((bill) => (
              <BillRow key={bill.id} category={bill} />
            ))}
          </div>
        ) : (
          <p className={setup.empty}>
            Rent, daycare, the car &mdash; anything that arrives on a schedule.
            Each one takes its share out of every paycheck before the daily
            number is worked out.
          </p>
        )}

        <AddBillSlot today={today} quiet={bills.length > 0} />
      </section>

      <section className={setup.section}>
        <div className={setup.sectionHead}>
          <h2 className={setup.sectionTitle}>Spending</h2>
        </div>

        {spending.length > 0 ? (
          <div className={setup.rows}>
            {spending.map((category) => (
              <div key={category.id} className={setup.spendRow}>
                {category.name}
              </div>
            ))}
          </div>
        ) : (
          <p className={setup.empty}>
            The everyday ones &mdash; groceries, gas, going out. Name them now
            and give them money each payday.
          </p>
        )}

        <AddSpendingSlot quiet={spending.length > 0} />
      </section>

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

      <nav className={styles.dashLinks}>
        <Link href="/budget" className={styles.dashLink}>
          Budget
        </Link>
        <Link href="/budget/goals" className={styles.dashLink}>
          Savings goals
        </Link>
      </nav>
    </Shell>
  );
}
