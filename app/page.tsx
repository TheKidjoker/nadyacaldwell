import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Corners } from "@/components/Corners";
import { TopNav } from "@/components/TopNav";
import { SignOutButton } from "@/components/SignOutButton";
import { Welcome } from "@/components/Welcome";
import { Hero } from "@/components/Hero";
import { Bloom } from "@/components/florals/Bloom";
import { AddBillSlot, AddSpendingSlot } from "@/components/budget/AddSlot";
import { BillRow } from "@/components/budget/BillRow";
import { PaycheckGate } from "@/components/budget/PaycheckGate";
import { SpendableBar } from "@/components/budget/SpendableBar";
import { auth } from "@/lib/auth";
import { hasSeenWelcome } from "@/lib/db/welcome";
import { getGoalsData, getPeriodData } from "@/lib/db/queries";
import { goalProgress, summarizePeriod } from "@/lib/budget/calc";
import { perCheckSetAside } from "@/lib/budget/recurrence";
import { formatCents } from "@/lib/budget/format";
import { noteForDay } from "@/lib/notes";
import styles from "./landing.module.css";
import setup from "@/components/budget/setup.module.css";

/**
 * The shell is constant in all three states: corners, her name, the hairline,
 * the note. Only what sits underneath changes, so signing in reads as the
 * room lighting up rather than as a different page.
 */
function Shell({
  note,
  signedIn = false,
  children,
}: {
  note: string | null;
  signedIn?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.stage}>
      <Corners />

      {/* "/" sits outside the (private) segment that mounts the nav, so it
        * mounts its own — but only once there is somewhere to navigate to.
        * Showing tabs to a signed-out stranger would advertise routes that
        * immediately bounce them. */}
      {signedIn && <TopNav />}

      <main className={styles.content}>
        <div className={styles.contentInner}>
          <Hero note={note} />
          {children}

          {signedIn && (
            <div className={styles.signOutRow}>
              <SignOutButton />
            </div>
          )}
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

  // --- The first run, once in her life. ---
  // Deliberately above every other signed-in branch and outside the Shell:
  // it owns the whole screen, and it renders its own name rather than sitting
  // under Hero's, which would show the wordmark twice.
  if (!(await hasSeenWelcome(session.user.id))) {
    return <Welcome />;
  }

  const data = await getPeriodData();

  // --- State B: signed in, nothing to compute from yet. ---
  // The gate stands alone: summarizePeriod has no pay period to work against,
  // so there is no honest number to put above it.
  if (!data) {
    return (
      <Shell note={note} signedIn>
        <PaycheckGate today={today} />
      </Shell>
    );
  }

  // --- State C: the dashboard. ---
  const { goals, contributions } = await getGoalsData();

  /**
   * Where this paycheck stands comes straight off `summary`. `/budget` reads
   * the same fields off the same call, so the two headlines cannot drift
   * apart -- these used to be re-derived in a component beside both pages.
   *
   * The daily-number hold lives in `summary.hasSpendable`: it turns on whether
   * a spendable figure can honestly exist, NOT on whether a category row does.
   * Adding a bill must not release it -- a bill only ever takes money out of
   * the spendable pool, so releasing on one flipped the headline straight to a
   * false "$0.00 a day".
   */
  const summary = summarizePeriod({
    period: data.period,
    paychecks: data.paychecks,
    categories: data.categories,
    allocations: data.allocations,
    transactions: data.transactions,
    today,
    targets: data.targets,
  });

  const bills = data.categories.filter((c) => c.kind === "bill");
  const spending = data.categories.filter((c) => c.kind === "spending");

  const billSetAsideCents = bills.reduce(
    (total, c) =>
      total +
      (c.recurringAmountCents !== null && c.cadence !== null
        ? perCheckSetAside(c.recurringAmountCents, c.cadence)
        : 0),
    0,
  );

  /** Nothing entered at all -- the original "tell me about your bills" state. */
  const preSetup = bills.length === 0 && spending.length === 0;

  return (
    <Shell note={note} signedIn>
      <section className={styles.dash}>
        {preSetup ? (
          <>
            <p className={styles.dashNumber}>$--.--</p>
            <p className={styles.dashLabel}>once your bills are in</p>
          </>
        ) : !summary.hasSpendable ? (
          /* Bills are in but nothing is assigned to spend yet. There is no
             honest daily figure, so the headline shows the money that is
             genuinely hers to direct, names it for what it is, and -- the
             whole point -- goes somewhere. A figure labelled "to assign" that
             links nowhere is a instruction with no door attached. */
          <Link href="/budget/assign" className={styles.dashAction}>
            <span className={styles.dashNumber}>
              {formatCents(summary.toAssignCents)}
            </span>
            {/* Terse on purpose: the bar directly below breaks the paycheck
                down, and repeating the bills figure here said it twice. */}
            <span className={styles.dashLabel}>to assign &rarr;</span>
          </Link>
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

        {/* Sits directly under the headline because it qualifies it: the
            headline is a rate (or, before anything is assigned, a balance),
            and this is the pool it comes out of. Pay period, not month --
            see the component. */}
        <SpendableBar
          period={data.period}
          inEnvelopesCents={summary.spendableRemainingCents}
          toAssignCents={summary.toAssignCents}
          spentCents={summary.spendableSpentCents}
          heldForBillsCents={summary.billsStillNeededCents}
        />

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
        <Link href="/budget/assign" className={styles.dashLink}>
          Assign this paycheck
        </Link>
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
