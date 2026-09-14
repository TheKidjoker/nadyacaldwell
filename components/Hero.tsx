import styles from "@/app/landing.module.css";

export function Hero({ note }: { note: string | null }) {
  return (
    <div className={styles.heading}>
      <h1 className={styles.name}>Nadya</h1>
      <div className={styles.hairline} aria-hidden="true" />
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
