"use client";

import { decodeWindows1252, importFile, mergeProjects, parseProject, type Project, ProjectFileError, serializeProject } from "@medak/engine";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { likelyIncomeYear, maskId } from "@/lib/format";
import { errorText, useT } from "@/lib/i18n";
import { addReport, personInUse, removePerson, removeReport } from "@/lib/project-ops";
import { personName } from "@/lib/review";
import type { CompanyRow, SubmissionRow, WorkspaceRow } from "@/lib/types";
import { updateCompany } from "@/server/actions";
import { TextField } from "../fields";
import { SaveIndicator, useCase } from "./CaseProvider";

type Tab = "reports" | "people" | "files" | "company";

export function CompanyView({ company, workspace, submissions }: { company: CompanyRow; workspace: WorkspaceRow; submissions: SubmissionRow[] }) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("reports");
  const tabs: [Tab, string][] = [["reports", t("Indberetninger", "Reports")], ["people", t("Personer og aktier", "People and shares")], ["files", t("Historik", "History")], ["company", t("Selskab", "Company")]];
  return (
    <main className="page narrow">
      <div className="crumbs">
        <Link href="/app">{t("Selskaber", "Companies")}</Link><span>/</span><span>{company.name}</span>
        <span style={{ marginLeft: "auto" }}><SaveIndicator /></span>
      </div>
      <h1>{company.name}</h1>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === "reports" ? <ReportsTab submissions={submissions} /> : null}
      {tab === "people" ? <PeopleTab /> : null}
      {tab === "files" ? <HistoryTab submissions={submissions} /> : null}
      {tab === "company" ? <CompanyTab company={company} workspace={workspace} /> : null}
    </main>
  );
}

function ReportsTab({ submissions }: { submissions: SubmissionRow[] }) {
  const { t } = useT();
  const router = useRouter();
  const { project, update, companyId, flush } = useCase();
  const years = Array.from({ length: 7 }, (_, i) => String(likelyIncomeYear(new Date()) - i));
  const [year, setYear] = useState(years[0]!);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const status = (reportId: string) => {
    const files = submissions.filter((s) => s.report_id === reportId);
    if (files.some((s) => s.status === "accepted")) return <span className="chip ok">{t("Godkendt af SKAT", "Accepted by SKAT")}</span>;
    if (files.some((s) => s.status === "rejected")) return <span className="chip err">{t("Afvist", "Rejected")}</span>;
    if (files.length > 0) return <span className="chip">{t("Fil dannet", "File made")}</span>;
    return <span className="chip">{t("Kladde", "Draft")}</span>;
  };
  const scenarioName = (s: string) => ({
    A: t("Køb af egne aktier", "Share buyback"),
    B: t("Medarbejderaktier", "Employee shares"),
    C: t("Investorfradrag", "Investor deduction"),
    D: t("Likvidationsprovenu", "Liquidation proceeds"),
  }[s] ?? s);

  async function start() {
    let created = "";
    update((p) => { const added = addReport(p, "B", year); created = added.reportId; return added.project; });
    if (await flush()) router.push(`/app/c/${companyId}/r/${created}`);
  }

  async function importAny(file: File) {
    setMessage(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 50_000_000) { setMessage({ ok: false, text: t("Filen er for stor.", "The file is too large.") }); return; }
    const text = decodeWindows1252(bytes);
    try {
      let imported: Project;
      let summary: string;
      if (text.trimStart().startsWith("{")) {
        imported = parseProject(new TextDecoder().decode(bytes));
        summary = t("Projektfilen er indlæst.", "The project file was loaded.");
      } else {
        const result = importFile(text);
        if (result.structured + result.keptVerbatim === 0) { setMessage({ ok: false, text: t("Filen indeholder ingen 2278-linjer. Er det den rigtige fil?", "The file has no 2278 lines. Is it the right file?") }); return; }
        imported = result.project;
        summary = t(
          `Indlæst: ${result.structured} linjer som hændelser, ${result.keptVerbatim} bevaret præcis som i filen.`,
          `Loaded: ${result.structured} lines as events, ${result.keptVerbatim} kept exactly as in the file.`,
        );
      }
      const otherCompany = imported.company.seNumber && imported.company.seNumber.replace(/^0+/, "") !== project.company.seNumber.replace(/^0+/, "");
      update((p) => mergeProjects(p, imported));
      setMessage({ ok: !otherCompany, text: otherCompany ? `${summary} ${t(`Bemærk: filen er for cvr-nr. ${imported.company.seNumber}, ikke dette selskab. Tjek den.`, `Note: the file is for CVR ${imported.company.seNumber}, not this company. Please check it.`)}` : summary });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ProjectFileError ? t("Det er ikke en gyldig projektfil.", "That isn't a valid project file.") : t("Filen kunne ikke læses.", "The file could not be read.") });
    }
  }

  return (
    <>
      {project.reports.length > 0 ? (
        <div className="list">
          {project.reports.map((r) => (
            <div key={r.id} className="list-item">
              <Link href={`/app/c/${companyId}/r/${r.id}`} className="linkish" style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{scenarioName(r.scenario)} {r.incomeYear}</div>
                <div className="small muted">{r.events.length} {t("hændelser", "events")}</div>
              </Link>
              <div className="row">
                {status(r.id)}
                {submissions.some((s) => s.report_id === r.id) ? null : (
                  <button className="btn small danger" aria-label={t("Slet indberetning", "Delete report")} onClick={() => { if (window.confirm(t("Slet denne kladde?", "Delete this draft?"))) update((p) => removeReport(p, r.id)); }}>×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="empty">{t("Ingen indberetninger endnu.", "No reports yet.")}</div>}

      <section className="panel">
        <h2>{t("Hvad vil du indberette?", "What do you want to report?")}</h2>
        <div className="cards">
          <div className="card primary">
            <h3>{t("Medarbejderaktier, optioner og warrants", "Employee shares, options and warrants")}</h3>
            <p className="small muted">{t("Aktier som løn, udnyttede optioner og warrants, RSU'er og matching shares.", "Shares as pay, exercised options and warrants, RSUs and matching shares.")}</p>
            <div className="foot row">
              <select aria-label={t("Indkomstår", "Income year")} value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 100 }}>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
              <button className="btn primary" onClick={start}>{t("Start", "Start")}</button>
            </div>
          </div>
          <div className="card">
            <h3>{t("Likvidationsprovenu", "Liquidation proceeds")}</h3>
            <p className="small muted">{t(
              "For de fleste er SKATs eget enkeltindberetningsskema i TastSelv Erhverv det nemmeste. Du skal kun bruge en fil, hvis aktierne er optaget til handel, eller hvis en anden end selskabet har udbetalt provenuet.",
              "For most companies, SKAT's own single-entry form in TastSelv Erhverv is easiest. You only need a file if the shares are listed, or if someone other than the company paid out the proceeds.",
            )}</p>
            <div className="foot"><a className="small" href="https://info.skat.dk/data.aspx?oid=2462530" target="_blank" rel="noopener noreferrer">{t("Sådan bruger du SKATs skema", "How to use SKAT's form")}</a></div>
          </div>
          <div className="card">
            <h3>{t("Køb af egne aktier", "Share buyback")}</h3>
            <p className="small muted">{t("Når selskabet køber aktier tilbage fra personer eller selskaber.", "When the company buys shares back from people or companies.")}</p>
            <div className="foot"><span className="chip">{t("Guidet flow kommer senere", "Guided flow coming later")}</span></div>
          </div>
          <div className="card">
            <h3>{t("Investorfradrag", "Investor deduction")}</h3>
            <p className="small muted">{t("Kapitalindskud, der giver investorer fradrag.", "Capital contributions that give investors a deduction.")}</p>
            <div className="foot"><span className="chip">{t("Guidet flow kommer senere", "Guided flow coming later")}</span></div>
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <label className="small">
            <b>{t("Har du allerede en fil?", "Already have a file?")}</b> {t("Indlæs en .txt-fil fra SKATs Excel-ark eller en MedAK-projektfil: ", "Load a .txt file from SKAT's Excel template or a MedAK project file: ")}
            <input type="file" accept=".txt,.json,text/plain,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importAny(f); e.target.value = ""; }} />
          </label>
          {message ? <p className={message.ok ? "ok-text" : "error-text"} role="status">{message.text}</p> : null}
        </div>
      </section>
    </>
  );
}

function PeopleTab() {
  const { t, lang } = useT();
  const { project, update } = useCase();

  function exportProject() {
    if (!window.confirm(t(
      "Filen indeholder cpr-numre i klar tekst. Gem den kun et sikkert sted. Fortsæt?",
      "The file holds CPR numbers in plain text. Only store it somewhere secure. Continue?",
    ))) return;
    const blob = new Blob([serializeProject(project)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `medak_${project.company.seNumber}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className="panel">
      <h2>{t("Personregister", "People register")}</h2>
      <p className="small muted">{t("Personer gemmes her og genbruges i senere hændelser og år. Rediger dem under en hændelse.", "People are kept here and reused in later events and years. Edit them from an event.")}</p>
      {project.persons.length > 0 ? (
        <div className="list">
          {project.persons.map((p) => (
            <div className="list-item" key={p.id}>
              <div><div style={{ fontWeight: 500 }}>{personName(p, lang)}</div><div className="small muted mono">{p.abroad ? t(`Bor i udlandet (${p.abroad.country || "?"})`, `Lives abroad (${p.abroad.country || "?"})`) : maskId(p.danishId)}</div></div>
              {personInUse(project, p.id) ? <span className="chip">{t("I brug", "In use")}</span> : <button className="btn small danger" onClick={() => update((x) => removePerson(x, p.id))}>{t("Fjern", "Remove")}</button>}
            </div>
          ))}
        </div>
      ) : <div className="empty">{t("Ingen personer endnu.", "No people yet.")}</div>}
      <h2>{t("Aktier", "Shares")}</h2>
      {project.securities.length > 0 ? (
        <div className="list">
          {project.securities.map((s) => (
            <div className="list-item" key={s.id}>
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div className="row small muted">{s.isin ? <span className="mono">{s.isin}</span> : null}<span className="chip">{s.listed ? t("Optaget til handel", "Listed") : t("Ikke optaget", "Not listed")}</span></div>
            </div>
          ))}
        </div>
      ) : <div className="empty">{t("Ingen aktier endnu.", "No shares yet.")}</div>}
      <div className="row">
        <button className="btn" onClick={exportProject}>{t("Eksportér alle data", "Export all data")}</button>
        <span className="small muted">{t("En kopi af selskabets data i MedAK, til backup eller flytning.", "A copy of the company's data in MedAK, for backup or moving.")}</span>
      </div>
    </section>
  );
}

function HistoryTab({ submissions }: { submissions: SubmissionRow[] }) {
  const { t, lang } = useT();
  if (submissions.length === 0) return <div className="empty">{t("Ingen filer dannet endnu.", "No files made yet.")}</div>;
  return (
    <div className="stack">
      <div className="list">
        {submissions.map((s) => (
          <div className="list-item" key={s.id}>
            <div className="stack" style={{ gap: 2 }}>
              <span className="mono small">{s.file_name}</span>
              <span className="small muted">{new Date(s.created_at).toLocaleString(lang === "da" ? "da-DK" : "en-GB")} · {s.record_count} {t("indberetninger", "records")} · SHA-256 <span className="mono">{s.sha256.slice(0, 12)}…</span></span>
            </div>
            <div className="row">
              <span className={`chip ${s.status === "accepted" ? "ok" : s.status === "rejected" ? "err" : ""}`}>{s.status === "accepted" ? t("Godkendt", "Accepted") : s.status === "rejected" ? t("Afvist", "Rejected") : t("Dannet", "Made")}</span>
              <a className="btn small" href={`/api/submissions/${s.id}`} download={s.file_name}>{t("Hent", "Download")}</a>
            </div>
          </div>
        ))}
      </div>
      <p className="small muted">{t("Grundlaget for indberetningen skal gemmes i 5 år. Filerne her kan ikke ændres eller slettes.", "The basis for the report must be kept for 5 years. These files can't be changed or deleted.")}</p>
    </div>
  );
}

function CompanyTab({ company, workspace }: { company: CompanyRow; workspace: WorkspaceRow }) {
  const { t } = useT();
  const router = useRouter();
  const [name, setName] = useState(company.name);
  const [fileName, setFileName] = useState(company.file_name ?? "");
  const [address, setAddress] = useState(company.address);
  const [sentByWorkspace, setSentByWorkspace] = useState(company.sent_by_workspace);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await updateCompany(company.id, { name, fileName, address, sentByWorkspace });
    setMessage(result.ok ? { ok: true, text: t("Gemt", "Saved") } : { ok: false, text: errorText(result.error, t) });
    if (result.ok) router.refresh();
  }

  return (
    <section className="panel">
      <form className="form" onSubmit={submit}>
        <p className="small muted">{t("Cvr-/se-nr.", "CVR/SE number")} <span className="mono">{company.se_number}</span></p>
        <TextField label={t("Navn", "Name")} value={name} onChange={setName} maxLength={100} required />
        <TextField label={t("Kort navn til filen", "Short name for the file")} value={fileName} onChange={setFileName} maxLength={27} hint={t("Kun nødvendigt, hvis navnet er over 27 tegn.", "Only needed if the name is over 27 characters.")} />
        <TextField label={t("Adresse", "Address")} value={address} onChange={setAddress} maxLength={35} hint={t("Højst 35 tegn, som i SKATs fil.", "At most 35 characters, as in SKAT's file.")} />
        {workspace.sender_se ? (
          <label className="check small">
            <input type="checkbox" checked={sentByWorkspace} onChange={(e) => setSentByWorkspace(e.target.checked)} />
            {t(`Filen sendes af ${workspace.sender_name ?? workspace.name} på selskabets vegne`, `The file is sent by ${workspace.sender_name ?? workspace.name} on the company's behalf`)}
          </label>
        ) : <p className="small muted">{t("Rådgivere kan angive deres firma som afsender under Indstillinger.", "Advisors can set their firm as the sender under Settings.")}</p>}
        <div className="row">
          <button className="btn primary" type="submit">{t("Gem", "Save")}</button>
          {message ? <span className={message.ok ? "ok-text" : "error-text"}>{message.text}</span> : null}
        </div>
      </form>
    </section>
  );
}
