"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS, isCurrentTab } from "@/lib/top-nav";
import styles from "./TopNav.module.css";

/**
 * The bar across the top of the private area.
 *
 * Real `<Link>`s in a real `<nav>` — so they middle-click, they prefetch, and
 * a screen reader announces the landmark and the current page. The current tab
 * is marked three ways that do not depend on each other: `aria-current`, a rule
 * under the label, and a lift in weight and ink. Colour alone would fail anyone
 * who cannot separate --ink from --ink-soft.
 *
 * Deliberately not sticky: the budget page already parks a sticky quick-add at
 * the top of the scroller, and two competing sticky bars on a phone leaves very
 * little page.
 */
export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Sections">
      <ul className={styles.tabs}>
        {TABS.map((tab) => {
          const current = isCurrentTab(pathname, tab.href);

          return (
            <li key={tab.href} className={styles.item}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={
                  current ? `${styles.tab} ${styles.tabCurrent}` : styles.tab
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
