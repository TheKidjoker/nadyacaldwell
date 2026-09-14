import { formatCents } from "@/lib/budget/format";
import { perCheckSetAside } from "@/lib/budget/recurrence";
import type { Cadence } from "@/lib/budget/recurrence";
import type { Category } from "@/lib/budget/types";
import styles from "./setup.module.css";

/** How she says the cadence out loud, not how it is stored. */
export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "weekly",
  biweekly: "every two weeks",
  monthly: "monthly",
  quarterly: "every three months",
  semiannual: "twice a year",
  annual: "once a year",
};

/**
 * One bill as it reads on the dashboard: the bill as it actually arrives on
 * the left, the per-paycheck set-aside on the right. The set-aside is the
 * number she budgets against, so it is the one set in full-size type.
 *
 * `/budget` keeps the detailed envelope card; this is the summary line.
 */
export function BillRow({ category }: { category: Category }) {
  const { recurringAmountCents, cadence } = category;

  // Bills always carry all three fields together (the schema enforces it),
  // but the Category type allows null, so the row degrades rather than throws.
  const setAsideCents =
    recurringAmountCents !== null && cadence !== null
      ? perCheckSetAside(recurringAmountCents, cadence)
      : null;

  return (
    <div className={styles.billRow}>
      <span className={styles.billName}>{category.name}</span>
      <span className={styles.billSetAside}>
        {setAsideCents === null ? "—" : formatCents(setAsideCents)}
      </span>
      <span className={styles.billMeta}>
        {recurringAmountCents !== null && cadence !== null
          ? `${formatCents(recurringAmountCents)} ${CADENCE_LABEL[cadence]}`
          : "No amount yet"}
      </span>
      <span className={styles.billSetAsideLabel}>per paycheck</span>
    </div>
  );
}
