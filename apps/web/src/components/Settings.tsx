"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { errorText, useT } from "@/lib/i18n";
import type { Lang, WorkspaceRow } from "@/lib/types";
import { deleteInvite, inviteMember, removeMember, setMemberRole, updateProfile, updateWorkspace } from "@/server/actions";
import { SelectField, TextField } from "./fields";

interface Member { user_id: string; display_name: string; email: string; role: "owner" | "member" }
interface Invite { id: string; email: string; role: string; expires_at: string }
interface AuditEntry { id: number; actor: string | null; action: string; target: string | null; at: string }

export function SettingsView(props: {
  userId: string;
  email: string;
  profile: { displayName: string; language: Lang; deadlineReminders: boolean };
  workspace: WorkspaceRow | null;
  isOwner: boolean;
  members: Member[];
  invites: Invite[];
  audit: AuditEntry[];
}) {
  return (
    <>
      <ProfileSection email={props.email} profile={props.profile} />
      {props.workspace ? (
        <>
          <WorkspaceSection workspace={props.workspace} isOwner={props.isOwner} />
          <TeamSection workspaceId={props.workspace.id} userId={props.userId} isOwner={props.isOwner} members={props.members} invites={props.invites} />
          {props.isOwner ? <AuditSection entries={props.audit} members={props.members} /> : null}
        </>
      ) : null}
    </>
  );
}

function ProfileSection({ email, profile }: { email: string; profile: { displayName: string; language: Lang; deadlineReminders: boolean } }) {
  const { t } = useT();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [language, setLanguage] = useState<Lang>(profile.language);
  const [reminders, setReminders] = useState(profile.deadlineReminders);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await updateProfile({ displayName, language, deadlineReminders: reminders });
    setSaved(result.ok);
    router.refresh();
  }

  return (
    <section className="panel">
      <h2>{t("Din profil", "Your profile")}</h2>
      <form className="form" onSubmit={submit}>
        <p className="small muted">{t("Logget ind som", "Logged in as")} <b>{email}</b> · {t("To-faktor er slået til", "Two-factor is on")}</p>
        <TextField label={t("Dit navn", "Your name")} value={displayName} onChange={(v) => { setDisplayName(v); setSaved(false); }} maxLength={100} hint={t("Vises for dine kolleger.", "Shown to your colleagues.")} />
        <SelectField label={t("Sprog", "Language")} value={language} onChange={(v) => { setLanguage(v === "en" ? "en" : "da"); setSaved(false); }} options={[{ value: "da", label: "Dansk" }, { value: "en", label: "English" }]} style={{ maxWidth: 220 }} />
        <label className="check small">
          <input type="checkbox" checked={reminders} onChange={(e) => { setReminders(e.target.checked); setSaved(false); }} />
          {t("Vis fristen 20. januar på forsiden", "Show the 20 January deadline on the front page")}
        </label>
        <div className="row">
          <button className="btn primary" type="submit">{t("Gem", "Save")}</button>
          {saved ? <span className="ok-text">{t("Gemt", "Saved")}</span> : null}
        </div>
      </form>
    </section>
  );
}

function WorkspaceSection({ workspace, isOwner }: { workspace: WorkspaceRow; isOwner: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [senderSe, setSenderSe] = useState(workspace.sender_se ?? "");
  const [senderName, setSenderName] = useState(workspace.sender_name ?? "");
  const [senderAddress, setSenderAddress] = useState(workspace.sender_address ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await updateWorkspace(workspace.id, { name, senderSe, senderName, senderAddress });
    setMessage(result.ok ? { ok: true, text: t("Gemt", "Saved") } : { ok: false, text: errorText(result.error, t) });
    if (result.ok) router.refresh();
  }

  return (
    <section className="panel">
      <h2>{t("Arbejdsområde og afsender", "Workspace and sender")}</h2>
      <form className="form" onSubmit={submit}>
        <TextField label={t("Navn", "Name")} value={name} onChange={setName} maxLength={100} />
        <div className="note-box">{t(
          "Er I rådgivere, så udfyld jeres firmas oplysninger her. De bruges som afsender i filen for de selskaber, I indberetter for. Indberetter selskabet selv, så lad felterne stå tomme.",
          "If you are advisors, enter your firm's details here. They are used as the sender in the file for the companies you report for. If the company reports itself, leave these empty.",
        )}</div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <TextField label={t("Firmaets cvr-nr.", "Firm's CVR number")} value={senderSe} onChange={setSenderSe} inputMode="numeric" maxLength={8} style={{ maxWidth: 200 }} />
          <TextField label={t("Firmanavn", "Firm name")} value={senderName} onChange={setSenderName} maxLength={27} hint={t("Højst 27 tegn (SKATs grænse)", "At most 27 characters (SKAT's limit)")} />
        </div>
        <TextField label={t("Adresse", "Address")} value={senderAddress} onChange={setSenderAddress} maxLength={35} hint={t("Højst 35 tegn", "At most 35 characters")} />
        {isOwner ? (
          <div className="row">
            <button className="btn primary" type="submit">{t("Gem", "Save")}</button>
            {message ? <span className={message.ok ? "ok-text" : "error-text"}>{message.text}</span> : null}
          </div>
        ) : <p className="small muted">{t("Kun ejere kan ændre dette.", "Only owners can change this.")}</p>}
      </form>
    </section>
  );
}

function TeamSection(props: { workspaceId: string; userId: string; isOwner: boolean; members: Member[]; invites: Invite[] }) {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "member">("member");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report = (result: { ok: boolean; error?: string }) => {
    setError(result.ok ? null : errorText(result.error ?? "save", t));
    if (result.ok) router.refresh();
  };

  async function invite(e: FormEvent) {
    e.preventDefault();
    setLink(null);
    const result = await inviteMember(props.workspaceId, email, role);
    if (!result.ok) { setError(errorText(result.error, t)); return; }
    setError(null);
    setEmail("");
    setLink(result.link);
    router.refresh();
  }

  const roleLabel = (r: string) => (r === "owner" ? t("Ejer", "Owner") : t("Medlem", "Member"));

  return (
    <section className="panel">
      <h2>{t("Team", "Team")}</h2>
      <p className="small muted">{t(
        "Alle i arbejdsområdet kan se og ændre alle selskaber i det. Ejere kan desuden administrere teamet og se loggen.",
        "Everyone in the workspace can see and change all its companies. Owners can also manage the team and see the log.",
      )}</p>
      <div className="list">
        {props.members.map((m) => (
          <div className="list-item" key={m.user_id}>
            <div>
              <div style={{ fontWeight: 500 }}>{m.display_name || m.email}{m.user_id === props.userId ? ` (${t("dig", "you")})` : ""}</div>
              {m.display_name ? <div className="small muted">{m.email}</div> : null}
            </div>
            <div className="row">
              <span className="chip">{roleLabel(m.role)}</span>
              {props.isOwner ? (
                <>
                  <button className="btn small" onClick={async () => report(await setMemberRole(props.workspaceId, m.user_id, m.role === "owner" ? "member" : "owner"))}>
                    {m.role === "owner" ? t("Gør til medlem", "Make member") : t("Gør til ejer", "Make owner")}
                  </button>
                  <button className="btn small danger" onClick={async () => report(await removeMember(props.workspaceId, m.user_id))}>{m.user_id === props.userId ? t("Forlad", "Leave") : t("Fjern", "Remove")}</button>
                </>
              ) : m.user_id === props.userId ? (
                <button className="btn small danger" onClick={async () => report(await removeMember(props.workspaceId, m.user_id))}>{t("Forlad", "Leave")}</button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      {props.isOwner ? (
        <>
          <h3>{t("Invitér en kollega", "Invite a colleague")}</h3>
          <form className="row" style={{ alignItems: "flex-end" }} onSubmit={invite}>
            <TextField label={t("E-mail", "Email")} type="email" value={email} onChange={setEmail} required />
            <SelectField label={t("Rolle", "Role")} value={role} onChange={(v) => setRole(v === "owner" ? "owner" : "member")} options={[{ value: "member", label: t("Medlem", "Member") }, { value: "owner", label: t("Ejer", "Owner") }]} style={{ maxWidth: 160, minWidth: 120 }} />
            <button className="btn" type="submit" style={{ height: 40 }}>{t("Lav invitation", "Create invitation")}</button>
          </form>
          {link ? (
            <div className="note-box stack" style={{ gap: 6 }}>
              <b>{t("Send dette link til din kollega", "Send this link to your colleague")}</b>
              <span className="mono secret">{link}</span>
              <span className="small muted">{t("Linket vises kun nu. Det virker kun for den inviterede e-mailadresse og udløber om 7 dage.", "The link is only shown now. It only works for the invited email address and expires in 7 days.")}</span>
            </div>
          ) : null}
          {props.invites.length > 0 ? (
            <div className="list">
              {props.invites.map((i) => (
                <div className="list-item" key={i.id}>
                  <div><span>{i.email}</span> <span className="chip">{roleLabel(i.role)}</span></div>
                  <button className="btn small" onClick={async () => { await deleteInvite(i.id); router.refresh(); }}>{t("Træk tilbage", "Withdraw")}</button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AuditSection({ entries, members }: { entries: AuditEntry[]; members: Member[] }) {
  const { t, lang } = useT();
  const who = (id: string | null) => {
    if (!id) return t("Systemet", "The system");
    const m = members.find((x) => x.user_id === id);
    return m ? (m.display_name || m.email) : t("Tidligere medlem", "Former member");
  };
  const what: Record<string, string> = {
    "case_files.open": t("åbnede en sag", "opened a case"),
    "case_files.update": t("ændrede en sag", "changed a case"),
    "case_files.insert": t("oprettede en sag", "created a case"),
    "companies.insert": t("tilføjede et selskab", "added a company"),
    "companies.update": t("ændrede et selskab", "changed a company"),
    "companies.delete": t("slettede et selskab", "deleted a company"),
    "submissions.insert": t("dannede en fil til SKAT", "made a file for SKAT"),
    "submissions.update": t("ændrede status på en fil", "changed a file's status"),
    "workspace_members.insert": t("tilføjede et medlem", "added a member"),
    "workspace_members.update": t("ændrede et medlems rolle", "changed a member's role"),
    "workspace_members.delete": t("fjernede et medlem", "removed a member"),
    "workspace_invites.insert": t("lavede en invitation", "created an invitation"),
    "workspace_invites.update": t("brugte en invitation", "used an invitation"),
    "workspace_invites.delete": t("trak en invitation tilbage", "withdrew an invitation"),
  };
  return (
    <section className="panel">
      <h2>{t("Log", "Log")}</h2>
      <p className="small muted">{t("De seneste handlinger. Loggen kan ikke ændres.", "The latest actions. The log cannot be changed.")}</p>
      <div className="list">
        {entries.map((e) => (
          <div className="list-item small" key={e.id}>
            <span>{who(e.actor)} {what[e.action] ?? e.action}</span>
            <span className="muted">{new Date(e.at).toLocaleString(lang === "da" ? "da-DK" : "en-GB")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
