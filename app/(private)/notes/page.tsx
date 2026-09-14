import type { Metadata } from "next";
import { verifySession } from "@/lib/dal";
import { getSections } from "@/lib/db/notes";
import { AddSectionSlot } from "@/components/notes/AddSectionSlot";
import { SectionCard } from "@/components/notes/SectionCard";
import styles from "@/components/notes/notes.module.css";

export const metadata: Metadata = {
  title: "Notes",
  // Hers, and not for anyone else — including a crawler that wanders in
  // behind a stale session.
  robots: { index: false, follow: false },
};

export default async function NotesPage() {
  // This page lives under (private), but a Server Component is not the
  // security boundary either — the session is verified here as well as inside
  // getSections(), which scopes every row it returns to it.
  await verifySession();

  const sections = await getSections();

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Notes</h1>
        <div className={styles.hairline} />
        <p className={styles.lead}>
          Make whatever sections you want and call them whatever you like.
          Nothing in here is set up for you.
        </p>
      </header>

      {sections.length === 0 ? (
        <p className={styles.empty}>
          Nothing yet. A section can be somewhere you write, or a list you tick
          off &mdash; start with one and add more whenever.
        </p>
      ) : (
        <ul className={styles.sections}>
          {sections.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              isFirst={index === 0}
              isLast={index === sections.length - 1}
            />
          ))}
        </ul>
      )}

      <AddSectionSlot quiet={sections.length > 0} />
    </main>
  );
}
