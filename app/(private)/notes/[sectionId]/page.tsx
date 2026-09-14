import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { verifySession } from "@/lib/dal";
import { getSectionWithEntries } from "@/lib/db/notes";
import { EntryComposer } from "@/components/notes/EntryComposer";
import { JournalEntry } from "@/components/notes/JournalEntry";
import { TodoItem } from "@/components/notes/TodoItem";
import styles from "@/components/notes/notes.module.css";

export const metadata: Metadata = {
  title: "Notes",
  robots: { index: false, follow: false },
};

export default async function SectionPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;

  await verifySession();

  // Scoped to her inside the query. A section id belonging to somebody else
  // comes back null, and a 404 is the right answer for that as well as for an
  // id that never existed — it says nothing about which of the two it was.
  const data = await getSectionWithEntries(sectionId);
  if (!data) notFound();

  const { section, entries } = data;
  const today = new Date().toISOString().slice(0, 10);
  const last = entries.length - 1;

  return (
    <main className={styles.page}>
      <p className={styles.crumb}>
        <Link href="/notes">&larr; All notes</Link>
      </p>

      <header className={styles.head}>
        <h1 className={styles.title}>{section.name}</h1>
        <div className={styles.hairline} />
      </header>

      <EntryComposer
        sectionId={section.id}
        kind={section.kind}
        today={today}
      />

      {entries.length === 0 ? (
        <p className={styles.empty}>
          {section.kind === "todo"
            ? "Nothing on this list yet."
            : "Nothing written here yet."}
        </p>
      ) : (
        <ul className={styles.entries}>
          {entries.map((entry, index) =>
            section.kind === "todo" ? (
              <TodoItem
                key={entry.id}
                entry={entry}
                isFirst={index === 0}
                isLast={index === last}
              />
            ) : (
              <JournalEntry
                key={entry.id}
                entry={entry}
                today={today}
                isFirst={index === 0}
                isLast={index === last}
              />
            ),
          )}
        </ul>
      )}
    </main>
  );
}
