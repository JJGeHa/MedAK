import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { appContext } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { workspaces, active } = await appContext();
  return (
    <>
      <AppHeader workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} activeId={active?.id ?? null} />
      {children}
    </>
  );
}
