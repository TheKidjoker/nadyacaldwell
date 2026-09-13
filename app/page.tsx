import styles from "./scene.module.css";
import { Corners } from "@/components/Corners";
import { Hero } from "@/components/Hero";

export default function Page() {
  return (
    <div className={styles.stage}>
      <Corners />
      <Hero />
    </div>
  );
}
