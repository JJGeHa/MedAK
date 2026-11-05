"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { WorkspaceRow } from "@/lib/types";
import { switchWorkspace } from "@/server/actions";
import { LangSwitch } from "./LangSwitch";

/** Signing out after inactivity matters here: CPR numbers shouldn't sit open on an empty desk. */
const IDLE_MINUTES = 30;

export function AppHeader(props: { workspaces: Pick<WorkspaceRow, "id" | "name">[]; activeId: string | null }) {
  const { t } = useT();
  const router = useRouter();
  const lastActive = useRef(Date.now());

  const signOut = async (reason?: string) => {
    await supabaseBrowser().auth.signOut();
    window.location.assign(reason ? `/login?reason=${reason}` : "/login");
  };

  useEffect(() => {
    const touch = () => { lastActive.current = Date.now(); };
    const events = ["keydown", "pointerdown", "scroll"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    const timer = window.setInterval(() => {
      if (Date.now() - lastActive.current > IDLE_MINUTES * 60_000) void signOut("idle");
    }, 30_000);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      {process.env.NEXT_PUBLIC_MEDAK_LIVE !== "1" ? (
        <div className="dev-banner">{t("Udviklingsversion: brug kun opdigtede data, ingen rigtige cpr-numre.", "Development version: use made-up data only, no real CPR numbers.")}</div>
      ) : null}
      <header className="topbar">
        <Link href="/app" className="brand linkish"><span className="mark">M</span>MedAK</Link>
        {props.workspaces.length > 1 ? (
          <select
            aria-label={t("Arbejdsområde", "Workspace")}
            value={props.activeId ?? ""}
            style={{ width: "auto", height: 34 }}
            onChange={async (e) => { await switchWorkspace(e.target.value); router.push("/app"); router.refresh(); }}
          >
            {props.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        ) : props.workspaces[0] ? <span className="small muted">{props.workspaces[0].name}</span> : null}
        <div className="spacer" />
        <nav className="nav-links">
          <Link href="/app">{t("Selskaber", "Companies")}</Link>
          <Link href="/app/settings">{t("Indstillinger", "Settings")}</Link>
          <button type="button" onClick={() => void signOut()}>{t("Log ud", "Log out")}</button>
        </nav>
        <LangSwitch />
      </header>
    </>
  );
}
