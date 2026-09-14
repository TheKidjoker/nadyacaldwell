import { verifySession } from "@/lib/dal";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate the whole private area. Pages still call verifySession() themselves
  // for the userId — it is memoized, so this costs one lookup per render.
  await verifySession();

  return <>{children}</>;
}
