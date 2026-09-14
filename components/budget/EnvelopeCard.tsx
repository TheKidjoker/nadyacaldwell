import { formatCents } from "@/lib/budget/format";
import type { EnvelopeBalance, Category } from "@/lib/budget/types";
import styles from "@/app/(private)/budget/budget.module.css";

export function EnvelopeCard({
  category,
  balance,
}: {
  category: Category;
  balance: EnvelopeBalance;
}) {
  const pct = Math.min(100, Math.round(balance.pctUsed * 100));

  return (
    <article className={styles.envelope}>
      <header className={styles.envelopeHead}>
        <h3 className={styles.envelopeName}>{category.name}</h3>
        <span
          className={balance.overspent ? styles.amountOver : styles.amount}
        >
          {formatCents(balance.remainingCents)}
        </span>
      </header>

      <div
        className={styles.bar}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${category.name}: ${formatCents(balance.spentCents)} spent of ${formatCents(
          balance.carriedInCents + balance.allocatedCents,
        )}`}
      >
        <div
          className={balance.overspent ? styles.fillOver : styles.fill}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className={styles.envelopeMeta}>
        {formatCents(balance.spentCents)} spent
        {balance.carriedInCents !== 0 && (
          <> &middot; {formatCents(balance.carriedInCents)} carried in</>
        )}
        {balance.kind === "bill" && balance.recurringAmountCents !== null && (
          <>
            {" "}
            &middot; {balance.fullyFunded ? "fully funded" : "funding"} toward{" "}
            {formatCents(balance.recurringAmountCents)} {balance.cadence}
            {balance.nextDueOn && <> &middot; due {balance.nextDueOn}</>}
          </>
        )}
      </p>
    </article>
  );
}
