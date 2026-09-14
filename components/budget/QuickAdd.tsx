"use client";

import { useRef } from "react";
import { addTransaction } from "@/lib/budget/actions";
import type { Category } from "@/lib/budget/types";
import styles from "@/app/(private)/budget/budget.module.css";

export function QuickAdd({
  categories,
  today,
}: {
  categories: Category[];
  today: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await addTransaction(formData);
        formRef.current?.reset();
      }}
      className={styles.quickAdd}
    >
      <input
        type="number"
        name="amount"
        step="0.01"
        min="0"
        placeholder="0.00"
        inputMode="decimal"
        required
        aria-label="Amount"
        className={styles.quickAmount}
      />
      <select name="categoryId" aria-label="Category" className={styles.quickSelect}>
        {categories
          .filter((c) => c.kind === "spending")
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        <option value="">Uncategorized</option>
      </select>
      <input type="hidden" name="occurredOn" value={today} />
      <button type="submit" className={styles.quickSubmit}>
        Add
      </button>
    </form>
  );
}
