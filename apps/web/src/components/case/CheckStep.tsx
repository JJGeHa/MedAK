"use client";

import { checkReport, expandReport, formatIssue, fromFixedDigits, type Report, reportTotals } from "@medak/engine";
import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { describeRow, personName } from "@/lib/review";
import { useCase } from "./CaseProvider";

export function CheckStep({ report, onBack, onNext, onFix }: { report: Report; onBack: () => void; onNext: () => void; onFix: (eventId: string, personId?: string) => void }) {
  const { t, lang } = useT();
  const { project } = useCase();
  const issues = useMemo(() => checkReport(project, report), [project, report]);
  const { rows } = useMemo(() => expandReport(project, report), [project, report]);
  const totals = useMemo(() => reportTotals(project, report), [project, report]);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const now = new Date().toLocaleString(lang === "da" ? "da-DK" : "en-GB");

  return (
    <div className="panel">
      <div className="stack">
        <h1>{t("Tjek indberetningen", "Check the report")}</h1>
        <p className="lead">{t("Gennemse det hele i almindeligt sprog, før filen dannes.", "Review everything in plain language before the file is made.")}</p>
        <p className="print-only small">{project.company.name} · {t("Cvr", "CVR")} {project.company.seNumber} · {t("Indkomstår", "Income year")} {report.incomeYear} · {t("Udskrevet", "Printed")} {now}</p>
      </div>
      <div className="tiles">
        <div className="tile"><span className="small muted">{t("Indberetninger", "Records")}</span><span className="big">{totals.records}</span></div>
        <div className="tile"><span className="small muted">{t("Samlet beløb (DKK)", "Total amount (DKK)")}</span><span className="big">{fromFixedDigits((totals.totalDkkOre < 0n ? -totals.totalDkkOre : totals.totalDkkOre).toString(), 2, lang)}</span></div>
        <div className="tile"><span className="small muted">{t("Skal rettes", "To fix")}</span><span className="big" style={{ color: errors.length ? "var(--err)" : "var(--ok)" }}>{errors.length}</span></div>
      </div>
      <p className="small muted">{t("SKATs kvittering viser antal indberetninger og et samlet beløb. Sammenlign dem med tallene her efter upload.", "SKAT's receipt shows the number of records and a total amount. Compare them with these figures after uploading.")}</p>

      {issues.length > 0 ? (
        <div className="stack no-print" style={{ gap: 8 }}>
          {[...errors, ...warnings].map((issue, i) => {
            const person = project.persons.find((p) => p.id === issue.personId);
            return (
              <div key={i} className={`issue ${issue.severity === "error" ? "err" : "warn"}`}>
                <div>{person ? <b>{personName(person, lang)}: </b> : null}{formatIssue(issue, lang)}</div>
                {issue.skatCode ? <span className="code mono small">SKAT {issue.skatCode}</span> : <span className="code" />}
                {issue.eventId ? <button className="btn link small" onClick={() => onFix(issue.eventId!, issue.personId)}>{t("Ret", "Fix")}</button> : null}
              </div>
            );
          })}
        </div>
      ) : rows.length > 0 ? <div className="note-box no-print">{t("Ingen fejl. Indberetningen er klar.", "No errors. The report is ready.")}</div> : null}

      <h2>{t("Gennemgang", "Review")}</h2>
      {rows.length > 0 ? (
        <ol className="review">
          {rows.map(({ row }, i) => <li key={i}>{describeRow(row, project.persons, lang)}</li>)}
        </ol>
      ) : <div className="empty">{t("Der er ikke noget at gennemgå endnu.", "There's nothing to review yet.")}</div>}
      <div className="row no-print">
        <button className="btn" onClick={() => window.print()}>{t("Udskriv / gem som PDF", "Print / save as PDF")}</button>
        <span className="small muted">{t("Til godkendelse internt og som dokumentation (skal gemmes i 5 år).", "For internal sign-off and as documentation (must be kept for 5 years).")}</span>
      </div>
      <div className="actions">
        <button className="btn" onClick={onBack}>{t("Tilbage", "Back")}</button>
        <button className="btn primary" disabled={errors.length > 0 || rows.length === 0} onClick={onNext}>{t("Videre til send", "Continue to send")}</button>
      </div>
    </div>
  );
}
