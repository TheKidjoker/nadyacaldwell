import { Corners } from "@/components/Corners";
import { Hero } from "@/components/Hero";
import { Sprig } from "@/components/florals/Sprig";
import florals from "@/components/florals/florals.module.css";
import styles from "./landing.module.css";

export default function Page() {
  return (
    <div className={styles.stage}>
      <Sprig className={`${florals.cornerSprig} ${florals.topLeft}`} />
      <Sprig className={`${florals.cornerSprig} ${florals.bottomRight}`} />

      <Corners />
      <Hero />
    </div>
  );
}
