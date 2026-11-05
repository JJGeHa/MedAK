"use client";

import { fromFixedDigits, type Report, type Row } from "@medak/engine";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { errorText, useT } from "@/lib/i18n";
import { describeRow, explainCode, rowName } from "@/lib/review";
import type { CorrectionPreview, SubmissionRow } from "@/lib/types";
import { correctionPreview, makeFile, matchSkatErrors, setSubmissionStatus } from "@/server/actions";
import { useCase } from "./CaseProvider";

export function SendStep({ report, submissions, onBack }: { report: Report; submissions: SubmissionRow[]; onBack: () => void }) {
  const { t, lang } = useT();
  const router = useRouter();
  const { companyId, flush, project, state } = useCase();
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const history = submissions.filter((s) => s.report_id === report.id);
  const newestMade = history.find((s) => s.status === "made");
  const hasAcceptedKey = history.filter((s) => s.status === "accepted").map((s) => s.id).join();

  // What would a new file contain? Compares with what SKAT accepted, once anything was.
  useEffect(() => {
    let live = true;
    (async () => {
      if (!(await flush())) return;
      const result = await correctionPreview(companyId, report.id);
      if (live) setPreview(result);
    })();
    return () => { live = false; };
  }, [companyId, flush, report.id, hasAcceptedKey, state === "saved"]);

  async function make() {
    setBusy(true);
    setError(null);
    if (!(await flush())) { setError(errorText("save", t)); setBusy(false); return; }
    const result = await makeFile(companyId, report.id);
    setBusy(false);
    if (!result.ok) { setError(errorText(result.error, t)); return; }
    router.refresh();
  }

  async function setStatus(id: string, status: "made" | "accepted" | "rejected") {
    const result = await setSubmissionStatus(companyId, id, status);
    if (!result.ok) setError(errorText(result.error, t));
    router.refresh();
  }

  const statusChip = (s: SubmissionRow) =>
    s.status === "accepted" ? <span className="chip ok">{t("Godkendt af SKAT", "Accepted by SKAT")}</span>
      : s.status === "rejected" ? <span className="chip err">{t("Afvist", "Rejected")}</span>
        : <span className="chip">{t("Dannet", "Made")}</span>;

  const correcting = preview?.hasAccepted === true;
  const nothingNew = correcting && preview.changes.length === 0;

  return (
    <div className="panel">
      <div className="stack">
        <h1>{correcting ? t("Ret det, SKAT har godkendt", "Correct what SKAT accepted") : t("Send til SKAT", "Send to SKAT")}</h1>
        <p className="lead">{t("Du uploader selv filen i TastSelv Erhverv. MedAK sender ikke noget til SKAT.", "You upload the file yourself in TastSelv Erhverv. MedAK sends nothing to SKAT.")}</p>
      </div>

      {correcting ? (
        nothingNew ? (
          <div className="note-box">{t("Der er ingen ændringer i forhold til det, SKAT har godkendt. Ret en hændelse for at lave en rettelse.", "Nothing has changed from what SKAT accepted. Edit an event to make a correction.")}</div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <p className="small">{t(
              "Rettelsesfilen indeholder kun forskellene: den forkerte linje tilbageføres, og den rigtige sendes med. Begge skal sendes i samme fil, og det gør MedAK.",
              "The correction file holds only the differences: the wrong line is reversed and the right one sent with it. They must go in the same file, which MedAK takes care of.",
            )}</p>
            <ol className="review">
              {preview.changes.map((c, i) => (
                <li key={i} className="small">
                  {c.kind === "changed" ? <><b>{t("Ændret", "Changed")}:</b> {describeRow(c.before, project.persons, lang)} → {describeRow(c.after, project.persons, lang)}</> : null}
                  {c.kind === "removed" ? <><b>{t("Fjernet", "Removed")}:</b> {describeRow(c.before, project.persons, lang)}</> : null}
                  {c.kind === "added" ? <><b>{t("Ny", "New")}:</b> {describeRow(c.after, project.persons, lang)}</> : null}
                </li>
              ))}
            </ol>
          </div>
        )
      ) : null}

      <div className="row">
        <button className="btn primary" disabled={busy || nothingNew || preview === null} onClick={make}>
          {correcting ? t("Dan rettelsesfil", "Make correction file") : t("Dan fil", "Make file")}
        </button>
        {error ? <span className="error-text" role="alert">{error}</span> : null}
      </div>

      {history.length > 0 ? (
        <>
          <h2>{t("Filer", "Files")}</h2>
          <div className="list">
            {history.map((s) => (
              <div className="list-item" key={s.id}>
                <div className="stack" style={{ gap: 2 }}>
                  <div className="row" style={{ gap: 8 }}><span className="mono small">{s.file_name}</span>{statusChip(s)}{s.is_correction ? <span className="chip">{t("Rettelse", "Correction")}</span> : null}</div>
                  <span className="small muted">
                    {new Date(s.created_at).toLocaleString(lang === "da" ? "da-DK" : "en-GB")} · {s.record_count} {t("indberetninger", "records")} · {fromFixedDigits(String(Math.abs(s.total_ore)), 2, lang)} kr.
                  </span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <a className="btn small" href={`/api/submissions/${s.id}`} download={s.file_name}>{t("Hent", "Download")}</a>
                  {s.status === "made" ? (
                    <>
                      <button className="btn small" onClick={() => setStatus(s.id, "accepted")}>{t("SKAT godkendte", "SKAT accepted")}</button>
                      <button className="btn small" onClick={() => setStatus(s.id, "rejected")}>{t("SKAT afviste", "SKAT rejected")}</button>
                    </>
                  ) : <button className="btn small" onClick={() => setStatus(s.id, "made")}>{t("Fortryd status", "Undo status")}</button>}
                </div>
              </div>
            ))}
          </div>
          <p className="small muted">{t("Filerne gemmes krypteret, så I kan dokumentere indberetningen i de 5 år, loven kræver. De kan ikke slettes.", "The files are kept encrypted, so you can document the report for the 5 years the law requires. They can't be deleted.")}</p>
        </>
      ) : null}

      <h2>{t("Sådan uploader du", "How to upload")}</h2>
      <ol className="how">
        <li>{t("Log på TastSelv Erhverv som selskabet (eller som rådgiver).", "Log on to TastSelv Erhverv as the company (or as the advisor).")}</li>
        <li><span>{t("Vælg", "Choose")} <b>Øvrige indberetninger</b> → <b>Værdipapirer</b> → <b>Indberetning om medarbejderaktier, tilbagekøb …</b> → <b>Indberet via fil</b>.</span></li>
        <li><span>{t("Vælg indkomstår", "Choose income year")} <b>{report.incomeYear}</b> {t("og indberetningstypen, og vælg filen.", "and the report type, then choose the file.")}</span></li>
        <li><span>{t("Klik", "Click")} <b>Næste</b>. {t("Er filen valideret, klik", "If the file validates, click")} <b>Godkend</b>. {t("Det skal ske inden 5 dage, ellers bliver filen forældet.", "You must do this within 5 days, or the file expires.")}</span></li>
        <li>{t("Sammenlign kvitteringen med tallene her, og markér filen som godkendt.", "Compare the receipt with the figures here, and mark the file as accepted.")}</li>
      </ol>

      {history.length > 0 ? <ErrorPaste submission={newestMade ?? history[0]!} /> : null}

      <div className="actions">
        <button className="btn" onClick={onBack}>{t("Tilbage", "Back")}</button>
      </div>
    </div>
  );
}

/** Paste what SKAT reported and see it matched to the right person, in plain words. */
function ErrorPaste({ submission }: { submission: SubmissionRow }) {
  const { t, lang } = useT();
  const { project } = useCase();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ rows: Row[]; items: { title: string; lines: string[] }[]; none: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    const r = await matchSkatErrors(submission.id, text);
    if (!r.ok) { setError(errorText(r.error, t)); return; }
    const items = r.errors.map((e, i) => {
      const index = r.matches[i];
      const row = index === null || index === undefined ? undefined : r.rows[index];
      return {
        title: row ? rowName(row, project.persons, lang) : e.fileLine ? t(`Linje ${e.fileLine} i filen`, `Line ${e.fileLine} in the file`) : t("Ukendt linje", "Unknown line"),
        lines: [...e.codes.map((c) => explainCode(c, lang)), ...(e.text && e.codes.length === 0 ? [e.text] : [])],
      };
    });
    setResult({ rows: r.rows, items, none: items.length === 0 });
  }

  return (
    <details>
      <summary>{t("Fik du fejl fra SKAT?", "Did SKAT report errors?")}</summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <p className="small muted">{t(
          `Indsæt fejlene fra SKATs valideringsrapport, så finder vi personerne i filen ${submission.file_name}. Afviste linjer skal rettes og sendes igen senest 14 dage efter SKATs svar. I TastSelv sendes filen igen med samme filnavn.`,
          `Paste the errors from SKAT's validation report, and we'll find the people in the file ${submission.file_name}. Rejected lines must be fixed and sent again within 14 days of SKAT's response. In TastSelv, send the file again with the same file name.`,
        )}</p>
        <textarea aria-label={t("SKATs fejl", "SKAT's errors")} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Linje 3: Fejl i ISINkode", "Line 3: Fejl i ISINkode")} />
        <button className="btn" style={{ alignSelf: "flex-start" }} disabled={!text.trim()} onClick={run}>{t("Find personerne", "Find the people")}</button>
        {error ? <p className="error-text">{error}</p> : null}
        {result?.none ? <p className="small">{t("Vi kunne ikke finde linjenumre eller fejlkoder i teksten. Se efter \"Linje 3\" eller lignende i rapporten.", "We couldn't find line numbers or error codes in the text. Look for \"Linje 3\" or similar in the report.")}</p> : null}
        {result && !result.none ? (
          <div className="stack" style={{ gap: 8 }}>
            {result.items.map((item, i) => (
              <div key={i} className="issue err"><div><b>{item.title}:</b> {item.lines.join(" · ") || t("Se rapporten", "See the report")}</div></div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}
