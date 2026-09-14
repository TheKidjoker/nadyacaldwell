/**
 * The tabs in the top bar, and which one is current.
 *
 * Kept out of the component so the matching rule can be tested without a
 * renderer: "is /budget/goals still the Budget tab?" is the sort of question
 * that silently regresses when a route is added.
 */
export interface Tab {
  href: string;
  label: string;
}

export const TABS: Tab[] = [
  { href: "/", label: "Home" },
  { href: "/budget", label: "Budget" },
  { href: "/notes", label: "Notes" },
];

/**
 * A tab is current when the path is it, or lives under it.
 *
 * "/" is the exception: every path lives under it, so it matches only itself.
 * The `${href}/` guard rather than a bare `startsWith` keeps a future
 * "/notesomething" from lighting up the Notes tab.
 */
export function isCurrentTab(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
