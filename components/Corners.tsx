import styles from "@/app/landing.module.css";

export function Corners() {
  return (
    <div className={styles.corners}>
      <p className={styles.cornerLeft}>
        <span>Dream</span>
        <span>Create</span>
        <span>Grow</span>
        <span>Belong</span>
      </p>

      <p className={styles.cornerRight}>
        <span>A brighter</span>
        <span>chapter ahead</span>
      </p>

    </div>
  );
}
