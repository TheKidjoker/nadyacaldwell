import { logPaycheck } from "@/lib/budget/actions";
import styles from "./setup.module.css";

/**
 * The one forced step of setup.
 *
 * `summarizePeriod` has nothing to compute against until a paycheck exists,
 * so this stands alone in the dashboard's frame until it is answered. It is
 * a plain server-rendered form bound straight to the action — no client
 * JavaScript, so it still submits if hydration is slow or never arrives.
 *
 * Nothing is prefilled. `max` only stops her from dating a paycheck into the
 * future; it does not guess a date for her, and no amount is ever suggested.
 */
export function PaycheckGate({ today }: { today: string }) {
  return (
    <section className={styles.gate} aria-labelledby="gate-question">
      <h2 id="gate-question" className={styles.gateQuestion}>
        When were you last paid, and how much?
      </h2>
      <p className={styles.gateWhy}>
        Everything else is built from this. You can add bills and spending
        right after.
      </p>

      <form action={logPaycheck}>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>Date</span>
            <input
              type="date"
              name="receivedOn"
              max={today}
              required
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Amount</span>
            <input
              type="number"
              name="amount"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.00"
              required
              className={styles.input}
            />
          </label>

          <fieldset className={styles.fieldset}>
            <legend className={styles.label}>What kind</legend>
            <div className={styles.choice}>
              <label className={styles.choiceOption}>
                <input type="radio" name="kind" value="base" defaultChecked />
                <span>Base</span>
              </label>
              <label className={styles.choiceOption}>
                <input type="radio" name="kind" value="commission" />
                <span>Commission</span>
              </label>
            </div>
          </fieldset>
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit}>
            Start my budget
          </button>
        </div>
      </form>
    </section>
  );
}
