"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import styles from "./signout.module.css";

/**
 * Deliberately quiet.
 *
 * This is her own private tool on her own phone, so signing out is a rare,
 * deliberate act — not something to give equal billing to her money. It sits
 * at the edge of the page and stays out of the way.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className={styles.signOut}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await signOut();
          // refresh() rather than push(): the server components decide what
          // "/" renders, so the tree has to be re-fetched, not just navigated.
          router.replace("/");
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
