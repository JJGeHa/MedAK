"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { TextField } from "@/components/fields";
import { useT } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const { t } = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabaseBrowser().auth.updateUser({ password });
    if (err) {
      setError(t("Adgangskoden skal have mindst 12 tegn med både bogstaver og tal. Er linket udløbet, så bestil et nyt.", "The password must have at least 12 characters, with both letters and digits. If the link has expired, request a new one."));
      return;
    }
    router.replace("/app");
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><span className="mark">M</span>MedAK</div>
        <h1 style={{ fontSize: "1.4rem" }}>{t("Vælg en ny adgangskode", "Choose a new password")}</h1>
        <form onSubmit={submit}>
          <TextField label={t("Ny adgangskode", "New password")} type="password" value={password} onChange={setPassword} autoComplete="new-password" required />
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <button className="btn primary" type="submit" style={{ justifyContent: "center" }}>{t("Gem", "Save")}</button>
        </form>
      </div>
    </main>
  );
}
