"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { errorText, useT } from "@/lib/i18n";
import { acceptInvite } from "@/server/actions";

export default function InvitePage() {
  const { t } = useT();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    const result = await acceptInvite(token);
    if (!result.ok) { setError(errorText(result.error, t)); return; }
    router.replace("/app");
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><span className="mark">M</span>MedAK</div>
        <h1 style={{ fontSize: "1.4rem" }}>{t("Du er inviteret", "You've been invited")}</h1>
        <p className="small muted">{t("Du bliver medlem af et arbejdsområde og får adgang til dets selskaber og sager.", "You'll join a workspace and get access to its companies and cases.")}</p>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <button className="btn primary" onClick={accept} style={{ justifyContent: "center" }}>{t("Tiltræd", "Join")}</button>
      </div>
    </main>
  );
}
