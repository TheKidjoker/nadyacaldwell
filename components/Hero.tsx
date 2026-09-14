import styles from "@/app/landing.module.css";

export function Hero() {
  return (
    <div className={styles.heading}>
      <h1 className={styles.name}>Nadya</h1>

      <div className={styles.rule} aria-hidden="true">
        <span />
        <span />
      </div>
    </div>
  );
}
