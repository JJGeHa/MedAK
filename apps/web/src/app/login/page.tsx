"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { TextField } from "@/components/fields";
import { LangSwitch } from "@/components/LangSwitch";
import { type OAuthProvider, oauthProviders, ssoDomain, ssoEnabled } from "@/lib/auth-options";
import { safeNext } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Mode = "signIn" | "signUp" | "reset" | "sso";
type Method = "link" | "password";
/** What the "check your inbox" step offers. Only the emails with a code can be finished by typing it. */
type Sent = "code" | "linkOnly" | null;

const PROVIDER_NAMES: Record<OAuthProvider, string> = { google: "Google", azure: "Microsoft" };

function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signUp" ? "signUp" : "signIn");
  const [method, setMethod] = useState<Method>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const linkFailed = params.get("error") === "link";
  const [error, setError] = useState<string | null>(
    linkFailed
      ? t("Linket er udløbet, brugt eller åbnet i en anden browser. Bed om et nyt, eller brug koden fra mailen.", "The link has expired, been used or was opened in another browser. Ask for a new one, or use the code from the email.")
      : null,
  );
  const [sent, setSent] = useState<Sent>(null);
  const [busy, setBusy] = useState(false);

  const afterSignIn = `/mfa?next=${encodeURIComponent(next)}`;
  const callback = (target: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`;
  const goTo = (nextMode: Mode) => { setMode(nextMode); setSent(null); setError(null); setCode(""); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();

    if (mode === "sso") {
      const domain = ssoDomain(email);
      const result = domain ? await supabase.auth.signInWithSSO({ domain, options: { redirectTo: callback(afterSignIn) } }) : null;
      if (!result || result.error || !result.data?.url) {
        setError(t("Der er ikke sat single sign-on op for den adresse.", "Single sign-on isn't set up for that address."));
        setBusy(false);
        return;
      }
      window.location.assign(result.data.url);
      return;
    }

    if (mode === "reset") {
      // Changing a password requires two-factor, so the link passes through that step first.
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback(`/mfa?next=${encodeURIComponent("/reset-password")}`) });
      setSent("linkOnly");
      setBusy(false);
      return;
    }

    if (method === "link") {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: mode === "signUp", emailRedirectTo: callback(afterSignIn) },
      });
      // Unknown addresses and repeat requests look the same as success, so accounts can't be
      // discovered here. Only a fault on the server is worth telling the user about.
      if (err && (err.status ?? 0) >= 500) {
        setError(t("Mailen kunne ikke sendes. Prøv igen.", "The email could not be sent. Please try again."));
        setBusy(false);
        return;
      }
      setSent("code");
      setBusy(false);
      return;
    }

    if (mode === "signIn") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.code === "email_not_confirmed"
          ? t("Bekræft din e-mailadresse først. Se efter mailen i din indbakke.", "Confirm your email address first. Look for the email in your inbox.")
          : t("Forkert e-mail eller adgangskode.", "Wrong email or password."));
        setBusy(false);
        return;
      }
      router.replace(afterSignIn);
      return;
    }

    const { error: err } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(afterSignIn) } });
    if (err) {
      setError(err.code === "weak_password"
        ? t("Adgangskoden skal have mindst 12 tegn med både bogstaver og tal.", "The password must have at least 12 characters, with both letters and digits.")
        : t("Kontoen kunne ikke oprettes. Prøv igen.", "The account could not be created. Please try again."));
      setBusy(false);
      return;
    }
    setSent("code");
    setBusy(false);
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (err) {
      setError(t("Koden passer ikke eller er udløbet. Tjek den, eller bed om en ny.", "The code is wrong or has expired. Check it, or ask for a new one."));
      setBusy(false);
      return;
    }
    router.replace(afterSignIn);
  }

  async function withProvider(provider: OAuthProvider) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback(afterSignIn), ...(provider === "azure" ? { scopes: "email" } : {}) },
    });
    if (err) {
      setError(t(`Du kunne ikke logges ind med ${PROVIDER_NAMES[provider]}. Prøv igen.`, `Could not log in with ${PROVIDER_NAMES[provider]}. Please try again.`));
      setBusy(false);
    }
  }

  const title = mode === "signIn" ? t("Log ind", "Log in")
    : mode === "signUp" ? t("Opret konto", "Create an account")
    : mode === "sso" ? t("Log ind med single sign-on", "Log in with single sign-on")
    : t("Nulstil adgangskode", "Reset password");

  const submitLabel = mode === "reset" ? t("Send link", "Send link")
    : mode === "sso" ? t("Fortsæt", "Continue")
    : method === "link" ? t("Send mig et link", "Email me a link")
    : mode === "signIn" ? t("Log ind", "Log in")
    : t("Opret konto", "Create account");

  const canUseMethods = mode === "signIn" || mode === "signUp";
  const hasOther = canUseMethods && (oauthProviders.length > 0 || ssoEnabled);

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Link href="/" className="brand" style={{ color: "inherit" }}><span className="mark">M</span>MedAK</Link>
          <LangSwitch />
        </div>
        <h1 style={{ fontSize: "1.4rem" }}>{title}</h1>

        {sent === "linkOnly" ? (
          <p className="note-box">{t("Tjek din indbakke. Vi har sendt en mail med et link, hvis adressen kan bruges.", "Check your inbox. We have sent an email with a link, if the address can be used.")}</p>
        ) : sent === "code" ? (
          <form onSubmit={submitCode}>
            <p className="note-box">{t(
              `Tjek din indbakke. Hvis ${email} kan bruges, har vi sendt en mail. Åbn linket i denne browser, eller skriv koden her.`,
              `Check your inbox. If ${email} can be used, we have sent an email. Open the link in this browser, or enter the code here.`,
            )}</p>
            <TextField label={t("Kode fra mailen", "Code from the email")} value={code} onChange={setCode} autoComplete="one-time-code" required />
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: "center" }}>{t("Fortsæt", "Continue")}</button>
          </form>
        ) : (
          <>
            {hasOther ? (
              <div className="stack" style={{ gap: 8 }}>
                {oauthProviders.map((provider) => (
                  <button key={provider} type="button" className="btn" disabled={busy} style={{ justifyContent: "center" }} onClick={() => void withProvider(provider)}>
                    {t(`Fortsæt med ${PROVIDER_NAMES[provider]}`, `Continue with ${PROVIDER_NAMES[provider]}`)}
                  </button>
                ))}
                {ssoEnabled ? (
                  <button type="button" className="btn" disabled={busy} style={{ justifyContent: "center" }} onClick={() => goTo("sso")}>
                    {t("Fortsæt med single sign-on", "Continue with single sign-on")}
                  </button>
                ) : null}
                <p className="muted small" style={{ textAlign: "center" }}>{t("eller med din e-mail", "or with your email")}</p>
              </div>
            ) : null}
            <form onSubmit={submit}>
              <TextField label={mode === "sso" ? t("Arbejdsmail", "Work email") : t("E-mail", "Email")} type="email" value={email} onChange={setEmail} autoComplete="email" required />
              {canUseMethods && method === "password" ? (
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
              <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: "center" }}>{submitLabel}</button>
              {linkFailed && canUseMethods && method === "link" ? (
                <button type="button" className="btn link" style={{ alignSelf: "center" }} disabled={!email.includes("@")} onClick={() => { setSent("code"); setError(null); }}>
                  {t("Skriv e-mail ovenfor, og brug koden fra mailen", "Enter your email above, then use the code from the email")}
                </button>
              ) : null}
              {canUseMethods ? (
                <button type="button" className="btn link" style={{ alignSelf: "center" }} onClick={() => { setMethod(method === "link" ? "password" : "link"); setError(null); }}>
                  {method === "link" ? t("Brug en adgangskode i stedet", "Use a password instead") : t("Send mig et link i stedet", "Email me a link instead")}
                </button>
              ) : null}
            </form>
            {canUseMethods ? <p className="muted small">{t("Du bekræfter altid med din godkendelses-app bagefter.", "You always confirm with your authenticator app afterwards.")}</p> : null}
          </>
        )}

        <div className="row small" style={{ justifyContent: "space-between" }}>
          {mode !== "signIn" || sent ? <button type="button" className="btn link" onClick={() => goTo("signIn")}>{t("Tilbage til log ind", "Back to log in")}</button> : (
            <>
              <button type="button" className="btn link" onClick={() => goTo("signUp")}>{t("Opret konto", "Create an account")}</button>
              {method === "password" ? <button type="button" className="btn link" onClick={() => goTo("reset")}>{t("Glemt adgangskode?", "Forgot password?")}</button> : null}
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
