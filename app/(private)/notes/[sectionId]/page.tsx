import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { verifySession } from "@/lib/dal";
import { getSectionWithEntries } from "@/lib/db/notes";
import { EntryComposer } from "@/components/notes/EntryComposer";
import { JournalEntry } from "@/components/notes/JournalEntry";
import { SectionLock } from "@/components/notes/SectionLock";
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
  //
  // A protected section that is not currently unlocked comes back with
  // `locked` true and no entries at all: the ciphertext never leaves the data
  // layer, so there is nothing sealed here to render or to ship to the client.
  const data = await getSectionWithEntries(sectionId);
  if (!data) notFound();

  const { section, locked, entries, entryCount } = data;
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

      {/* ONE slot, in one place, always rendered.
          Not an aesthetic choice: turning protection on and recovering with a
          code both hand back a recovery code that this component holds in
          state and shows once. Moving the component between two positions in
          the tree would unmount it on exactly those two transitions, and the
          code — which exists nowhere else, by design — would be gone before
          she ever saw it. */}
      <SectionLock
        sectionId={section.id}
        encrypted={section.encrypted}
        locked={locked}
        entryCount={entryCount}
      />

      {!locked && (
        <>
          <EntryComposer
            sectionId={section.id}
            kind={section.kind}
            today={today}
            encrypted={section.encrypted}
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
                    encrypted={section.encrypted}
                  />
                ) : (
                  <JournalEntry
                    key={entry.id}
                    entry={entry}
                    today={today}
                    isFirst={index === 0}
                    isLast={index === last}
                    encrypted={section.encrypted}
                  />
                ),
              )}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
