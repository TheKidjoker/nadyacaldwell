import Link from "next/link";
import { getGoalsData } from "@/lib/db/queries";
import { goalProgress } from "@/lib/budget/calc";
import { formatCents } from "@/lib/budget/format";
import { createGoal, addGoalContribution } from "@/lib/budget/actions";
import { Bloom } from "@/components/florals/Bloom";
import styles from "./goals.module.css";

export default async function GoalsPage() {
  const { goals, contributions } = await getGoalsData();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className={styles.page}>
      <nav className={styles.topNav}>
        <Link href="/budget">&larr; Budget</Link>
      </nav>

      <h1 className={styles.title}>Savings goals</h1>

      <div className={styles.goals}>
        {goals.map((goal) => {
          const p = goalProgress({ goal, contributions, today });

          return (
            <article key={goal.id} className={styles.goal}>
              <div className={styles.bloom}>
                <Bloom
                  progress={p.pctComplete}
                  label={`${goal.name}: ${formatCents(p.savedCents)} saved of ${formatCents(
                    goal.targetCents,
                  )}, ${Math.round(p.pctComplete * 100)} percent`}
                  size={72}
                />
              </div>

              <div className={styles.goalBody}>
                <h2 className={styles.goalName}>{goal.name}</h2>
                <p className={styles.goalAmount}>
                  {formatCents(p.savedCents)}{" "}
                  <span className={styles.goalTarget}>
                    of {formatCents(goal.targetCents)}
                  </span>
                </p>

                <p className={styles.goalMeta}>
                  {p.isComplete ? (
                    "Done."
                  ) : p.isOverdue ? (
                    <span className={styles.overdue}>
                      Past its date &middot; {formatCents(p.remainingCents)} short
                    </span>
                  ) : p.requiredPerMonthCents !== null ? (
                    <>
                      {formatCents(p.requiredPerMonthCents)} a month to make{" "}
                      {goal.targetDate}
                    </>
                  ) : (
                    <>{formatCents(p.remainingCents)} to go</>
                  )}
                </p>

                <form action={addGoalContribution} className={styles.contribute}>
                  <input type="hidden" name="goalId" value={goal.id} />
                  <input type="hidden" name="occurredOn" value={today} />
                  <input
                    type="number"
                    name="amount"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    inputMode="decimal"
                    required
                    aria-label={`Add to ${goal.name}`}
                    className={styles.input}
                  />
                  <button type="submit" className={styles.addButton}>
                    Add
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>

      <section className={styles.newGoal}>
        <h2 className={styles.sectionTitle}>New goal</h2>
        <form action={createGoal} className={styles.newGoalForm}>
          <input
            name="name"
            placeholder="What for?"
            required
            maxLength={60}
            aria-label="Goal name"
            className={styles.input}
          />
          <input
            type="number"
            name="target"
            step="0.01"
            min="0"
            placeholder="Amount"
            inputMode="decimal"
            required
            aria-label="Target amount"
            className={styles.input}
          />
          <input
            type="date"
            name="targetDate"
            aria-label="Target date (optional)"
            className={styles.input}
          />
          <button type="submit" className={styles.addButton}>
            Create
          </button>
        </form>
      </section>
    </main>
  );
}
