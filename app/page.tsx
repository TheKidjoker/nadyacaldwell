import styles from "./scene.module.css";
import { Corners } from "@/components/Corners";
import { Hero } from "@/components/Hero";
import { SceneBackdrop } from "@/components/scene/SceneBackdrop";

export default function Page() {
  return (
    <div className={styles.stage}>
      {/* Decorative 3D environment, with a static poster behind it. */}
      <SceneBackdrop />

      {/* Real HTML, always rendered, never dependent on WebGL. */}
      <Corners />
      <Hero />
    </div>
  );
}
