"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { TextField } from "@/components/fields";
import { safeNext } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { applyProfileLanguage } from "@/server/actions";

interface Enrollment { factorId: string; qr: string; secret: string }

function MfaForm() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Setting up a factor must only happen once, however often the effect runs.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level?.currentLevel === "aal2") { window.location.assign(next); return; }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp[0];
      if (verified) { setFactorId(verified.id); return; }
      // An abandoned setup would block a new one.
      for (const f of factors?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MedAK" });
      if (err || !data) { setError(t("To-faktor kunne ikke sættes op. Prøv igen.", "Two-factor could not be set up. Please try again.")); return; }
      setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setFactorId(data.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
    if (err) {
      setError(t("Koden passer ikke. Prøv den næste kode.", "That code isn't right. Try the next code."));
      setBusy(false);
      return;
    }
    await applyProfileLanguage();
    window.location.assign(next);
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><span className="mark">M</span>MedAK</div>
        <h1 style={{ fontSize: "1.4rem" }}>{enrollment ? t("Sæt to-faktor op", "Set up two-factor") : t("Indtast din kode", "Enter your code")}</h1>
        {enrollment ? (
          <>
            <p className="small muted">{t(
              "MedAK indeholder cpr-numre, så alle konti skal bruge to-faktor. Scan koden med en app som Microsoft Authenticator, Google Authenticator eller 1Password.",
              "MedAK holds CPR numbers, so every account must use two-factor. Scan the code with an app such as Microsoft Authenticator, Google Authenticator or 1Password.",
            )}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="qr"><img src={enrollment.qr} alt={t("QR-kode til din to-faktor-app", "QR code for your two-factor app")} /></div>
            <p className="small muted">{t("Kan du ikke scanne? Skriv denne nøgle i appen:", "Can't scan? Enter this key in the app:")}<br /><span className="mono secret" data-testid="totp-secret">{enrollment.secret}</span></p>
          </>
        ) : (
          <p className="small muted">{t("Åbn din to-faktor-app og skriv den 6-cifrede kode.", "Open your two-factor app and enter the 6-digit code.")}</p>
        )}
        <form onSubmit={submit}>
          <TextField label={t("6-cifret kode", "6-digit code")} value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" required mono />
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <button className="btn primary" type="submit" disabled={busy || !factorId} style={{ justifyContent: "center" }}>{t("Fortsæt", "Continue")}</button>
        </form>
      </div>
    </main>
  );
}

export default function MfaPage() {
  return <Suspense><MfaForm /></Suspense>;
}
