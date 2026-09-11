import styles from "@/app/scene.module.css";

export function Hero() {
  return (
    <main className={styles.content}>
      <div className={styles.contentInner}>
        <h1 className={styles.name}>
          <span className={styles.nameLine}>Nadya</span>{" "}
          <span className={styles.nameLine}>Caldwell</span>
        </h1>

        <div className={styles.rule} aria-hidden="true">
          <span />
          <span />
        </div>

        <p className={styles.soon}>Coming Soon</p>
        <p className={styles.sub}>Something beautiful is on the way.</p>
      </div>
    </main>
  );
}
