"use client";

import { useId, useRef, useState } from "react";
import { createBill, createSpendingCategory } from "@/lib/budget/actions";
import { formatCents } from "@/lib/budget/format";
import { perCheckSetAside } from "@/lib/budget/recurrence";
import type { Cadence } from "@/lib/budget/recurrence";
import { CADENCE_LABEL } from "./BillRow";
import styles from "./setup.module.css";

const CADENCES: Cadence[] = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
];

/**
 * Names, never amounts. A suggested figure would be a number she did not
 * choose sitting in a field she is about to submit, and nothing in this app
 * is seeded with a guess.
 */
const SUGGESTED_BILLS = ["Rent", "Daycare", "Car note", "Car insurance"];

/** Shared collapsed state: the `+` affordance that opens a row in place. */
function AddButton({
  label,
  quiet,
  onOpen,
}: {
  label: string;
  quiet: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${styles.addButton} ${quiet ? styles.addButtonQuiet : ""}`}
    >
      <span className={styles.addPlus} aria-hidden="true">
        +
      </span>
      {label}
    </button>
  );
}

/**
 * The bills add-slot.
 *
 * The point of this component is the line under the fields: as she types an
 * amount and picks a cadence, the derived per-paycheck set-aside appears
 * immediately, before she submits. `perCheckSetAside` is the same pure
 * function the server uses, so the preview and the saved envelope agree.
 */
export function AddBillSlot({
  today,
  quiet = false,
}: {
  today: string;
  quiet?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameId = useId();

  if (!open) {
    return (
      <AddButton label="add a bill" quiet={quiet} onOpen={() => setOpen(true)} />
    );
  }

  // Dollars in the field -> integer cents, the same rounding the action does.
  const cents = Math.round(Number(amount) * 100);
  const hasAmount =
    amount.trim() !== "" && Number.isFinite(cents) && cents > 0;
  const setAsideCents = hasAmount ? perCheckSetAside(cents, cadence) : null;

  function reset() {
    setName("");
    setAmount("");
    setCadence("monthly");
    setError(null);
    formRef.current?.reset();
  }

  return (
    <form
      ref={formRef}
      className={styles.slot}
      action={async (formData) => {
        setSaving(true);
        setError(null);
        try {
          await createBill(formData);
          reset();
          setOpen(false);
        } catch {
          setError("That didn't save. Check the name, amount and due date.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className={styles.chips}>
        {SUGGESTED_BILLS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className={styles.chip}
            // Fills the name and nothing else; she still sets the amount.
            onClick={() => setName(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className={`${styles.fields} ${styles.fieldsBill}`}>
        <label className={`${styles.field} ${styles.fieldWide}`} htmlFor={nameId}>
          <span className={styles.label}>Bill</span>
          <input
            id={nameId}
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Rent"
            autoComplete="off"
            required
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Amount</span>
          <input
            type="number"
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            required
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>How often</span>
          <select
            name="cadence"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as Cadence)}
            className={styles.select}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.label}>Next due</span>
          <input
            type="date"
            name="dueAnchor"
            min={today}
            required
            className={styles.input}
          />
        </label>
      </div>

      <p className={styles.derived} aria-live="polite">
        {setAsideCents === null ? (
          "Add an amount to see what this takes out of each paycheck."
        ) : (
          <>
            <span className={styles.derivedValue}>
              {formatCents(setAsideCents)}
            </span>{" "}
            set aside per paycheck
          </>
        )}
      </p>

      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={saving}>
          {saving ? "Saving…" : "Add bill"}
        </button>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}

/**
 * The spending add-slot: a name and nothing else.
 *
 * Spending envelopes are funded per period from `setAllocation`, so asking
 * for an amount here would be asking her to invent one.
 */
export function AddSpendingSlot({ quiet = false }: { quiet?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameId = useId();

  if (!open) {
    return (
      <AddButton
        label="add a spending category"
        quiet={quiet}
        onOpen={() => setOpen(true)}
      />
    );
  }

  return (
    <form
      ref={formRef}
      className={styles.slot}
      action={async (formData) => {
        setSaving(true);
        setError(null);
        try {
          await createSpendingCategory(formData);
          formRef.current?.reset();
          setOpen(false);
        } catch {
          setError("That didn't save. Try a different name.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className={styles.fields}>
        <label className={styles.field} htmlFor={nameId}>
          <span className={styles.label}>Category</span>
          <input
            id={nameId}
            type="text"
            name="name"
            maxLength={60}
            placeholder="Groceries"
            autoComplete="off"
            required
            className={styles.input}
          />
        </label>
      </div>

      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={saving}>
          {saving ? "Saving…" : "Add category"}
        </button>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => {
            setError(null);
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}
