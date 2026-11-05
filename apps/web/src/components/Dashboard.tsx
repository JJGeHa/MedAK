"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { errorText, useT } from "@/lib/i18n";
import { createCompany, createWorkspace } from "@/server/actions";
import { TextField } from "./fields";

export function CreateWorkspaceForm() {
  const { t } = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await createWorkspace(name);
    if (!result.ok) { setError(errorText(result.error, t)); return; }
    router.refresh();
  }

  return (
    <form className="form" onSubmit={submit}>
      <TextField label={t("Navn på arbejdsområde", "Workspace name")} value={name} onChange={setName} placeholder={t("Fx Nordlys eller Revisor & Co", "E.g. Nordlys or Accountants & Co")} required {...(error ? { error } : {})} />
      <button className="btn primary" type="submit" style={{ alignSelf: "flex-start" }}>{t("Opret arbejdsområde", "Create workspace")}</button>
    </form>
  );
}

export function CreateCompanyForm({ workspaceId, hasSender }: { workspaceId: string; hasSender: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [se, setSe] = useState("");
  const [name, setName] = useState("");
  const [fileName, setFileName] = useState("");
  const [address, setAddress] = useState("");
  const [sentByWorkspace, setSentByWorkspace] = useState(hasSender);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createCompany(workspaceId, { seNumber: se, name, fileName, address, sentByWorkspace });
    setBusy(false);
    if (!result.ok) { setError(errorText(result.error, t)); return; }
    router.push(`/app/c/${result.id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <TextField label={t("Cvr- eller se-nr.", "CVR or SE number")} value={se} onChange={setSe} inputMode="numeric" maxLength={9} required style={{ maxWidth: 200 }} />
        <TextField label={t("Selskabets navn", "Company name")} value={name} onChange={setName} required />
      </div>
      {name.trim().length > 27 ? (
        <TextField
          label={t("Kort navn til filen", "Short name for the file")}
          value={fileName}
          onChange={setFileName}
          maxLength={27}
          required={!sentByWorkspace}
          hint={t("SKATs fil har kun plads til 27 tegn. Skriv en kort udgave i stedet for at navnet bliver klippet af.", "SKAT's file only has room for 27 characters. Enter a short version, so the name isn't cut off.")}
        />
      ) : null}
      <TextField label={t("Adresse", "Address")} value={address} onChange={setAddress} maxLength={35} hint={t("Højst 35 tegn, som i SKATs fil.", "At most 35 characters, as in SKAT's file.")} />
      {hasSender ? (
        <label className="check small">
          <input type="checkbox" checked={sentByWorkspace} onChange={(e) => setSentByWorkspace(e.target.checked)} />
          {t("Filen sendes af vores firma på selskabets vegne", "The file is sent by our firm on the company's behalf")}
        </label>
      ) : null}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={busy} style={{ alignSelf: "flex-start" }}>{t("Tilføj selskab", "Add company")}</button>
    </form>
  );
}
