"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { TextField } from "@/components/fields";
import { LangSwitch } from "@/components/LangSwitch";
import { safeNext } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Mode = "signIn" | "signUp" | "reset";

function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const callback = (target: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    if (mode === "signIn") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.code === "email_not_confirmed"
          ? t("Bekræft din e-mailadresse først. Se efter mailen i din indbakke.", "Confirm your email address first. Look for the email in your inbox.")
          : t("Forkert e-mail eller adgangskode.", "Wrong email or password."));
        setBusy(false);
        return;
      }
      router.replace(`/mfa?next=${encodeURIComponent(next)}`);
      return;
    }
    if (mode === "signUp") {
      const { error: err } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(`/mfa?next=${encodeURIComponent(next)}`) } });
      if (err) {
        setError(err.code === "weak_password"
          ? t("Adgangskoden skal have mindst 12 tegn med både bogstaver og tal.", "The password must have at least 12 characters, with both letters and digits.")
          : t("Kontoen kunne ikke oprettes. Prøv igen.", "The account could not be created. Please try again."));
        setBusy(false);
        return;
      }
    } else {
      // Changing a password requires two-factor, so the link passes through that step first.
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback(`/mfa?next=${encodeURIComponent("/reset-password")}`) });
    }
    // The same message whether or not the address exists, so accounts can't be discovered here.
    setSent(true);
    setBusy(false);
  }

  const title = mode === "signIn" ? t("Log ind", "Log in") : mode === "signUp" ? t("Opret konto", "Create an account") : t("Nulstil adgangskode", "Reset password");

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="brand"><span className="mark">M</span>MedAK</div>
          <LangSwitch />
        </div>
        <h1 style={{ fontSize: "1.4rem" }}>{title}</h1>
        {sent ? (
          <p className="note-box">{t("Tjek din indbakke. Vi har sendt en mail med et link, hvis adressen kan bruges.", "Check your inbox. We have sent an email with a link, if the address can be used.")}</p>
        ) : (
          <form onSubmit={submit}>
            <TextField label={t("E-mail", "Email")} type="email" value={email} onChange={setEmail} autoComplete="email" required />
            {mode !== "reset" ? (
              <TextField
                label={t("Adgangskode", "Password")}
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                required
                {...(mode === "signUp" ? { hint: t("Mindst 12 tegn med både bogstaver og tal.", "At least 12 characters, with both letters and digits.") } : {})}
              />
            ) : null}
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: "center" }}>
              {mode === "signIn" ? t("Log ind", "Log in") : mode === "signUp" ? t("Opret konto", "Create account") : t("Send link", "Send link")}
            </button>
          </form>
        )}
        <div className="row small" style={{ justifyContent: "space-between" }}>
          {mode !== "signIn" ? <button type="button" className="btn link" onClick={() => { setMode("signIn"); setSent(false); setError(null); }}>{t("Tilbage til log ind", "Back to log in")}</button> : (
            <>
              <button type="button" className="btn link" onClick={() => { setMode("signUp"); setError(null); }}>{t("Opret konto", "Create an account")}</button>
              <button type="button" className="btn link" onClick={() => { setMode("reset"); setError(null); }}>{t("Glemt adgangskode?", "Forgot password?")}</button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
