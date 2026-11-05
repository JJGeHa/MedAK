"use client";

import { checkReport, type EmployeeShareEvent, employeeShareCode, type Report } from "@medak/engine";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { addEmployeeEvent, removeEvent } from "@/lib/project-ops";
import { securityLabel } from "@/lib/review";
import type { SubmissionRow } from "@/lib/types";
import { useCase, SaveIndicator } from "./CaseProvider";
import { CheckStep } from "./CheckStep";
import { EventForm } from "./EventForm";
import { PeopleStep } from "./PeopleStep";
import { SendStep } from "./SendStep";

type Screen = "events" | "event" | "people" | "check" | "send";

export function ReportEditor({ reportId, companyName, submissions }: { reportId: string; companyName: string; submissions: SubmissionRow[] }) {
  const { t, lang } = useT();
  const { project, update, companyId } = useCase();
  const [screen, setScreen] = useState<Screen>("events");
  const [eventId, setEventId] = useState<string | null>(null);

  const report = project.reports.find((r) => r.id === reportId);
  const issues = useMemo(() => (report ? checkReport(project, report) : []), [project, report]);
  if (!report) return <main className="page"><div className="empty">{t("Indberetningen findes ikke.", "This report doesn't exist.")}</div></main>;

  const event = report.events.find((e): e is EmployeeShareEvent => e.id === eventId && e.kind === "employeeShares");
  const go = (s: Screen) => { setScreen(s); window.scrollTo(0, 0); };
  const whatLabel = (e: EmployeeShareEvent) => ({
    pay: t("Aktier som en del af lønnen", "Shares as part of pay"),
    options: t("Udnyttede optioner eller warrants", "Exercised options or warrants"),
    matching: t("Køb med matching shares", "Purchase with matching shares"),
  }[e.what]);

  const order: Record<Screen, number> = { events: 0, event: 0, people: 0, check: 1, send: 2 };
  const steps: [Screen, string][] = [["events", t("Hændelser", "Events")], ["check", t("Tjek", "Check")], ["send", t("Send til SKAT", "Send to SKAT")]];

  return (
    <>
      <div className="page" style={{ paddingBottom: 0, gap: 8 }}>
        <div className="crumbs">
          <Link href="/app">{t("Selskaber", "Companies")}</Link><span>/</span>
          <Link href={`/app/c/${companyId}`}>{companyName}</Link><span>/</span>
          <span>{t(`Indkomstår ${report.incomeYear}`, `Income year ${report.incomeYear}`)}</span>
          <span style={{ marginLeft: "auto" }}><SaveIndicator /></span>
        </div>
      </div>
      <div className="shell">
        <nav className="steps" aria-label={t("Trin", "Steps")}>
          {steps.map(([s, label], i) => (
            <div key={s} className="stack" style={{ gap: 2 }}>
              <button className={order[screen] > i ? "done" : order[screen] === i && (s !== "events" || screen === "events") ? "current" : ""} aria-current={order[screen] === i ? "step" : undefined} onClick={() => go(s)}>
                <span className="n">{i + 1}</span><span>{label}</span>
              </button>
              {s === "events" && order[screen] === 0 && event ? (
                <>
                  <button className={`sub ${screen === "event" ? "current" : ""}`} onClick={() => go("event")}>{whatLabel(event)}</button>
                  <button className={`sub ${screen === "people" ? "current" : ""}`} onClick={() => go("people")}>{t("Personer", "People")} ({event.participants.length})</button>
                </>
              ) : null}
            </div>
          ))}
        </nav>
        <main>
          {screen === "events" ? (
            <EventsList
              report={report}
              issueCount={(id) => issues.filter((i) => i.eventId === id && i.severity === "error").length}
              whatLabel={whatLabel}
              onOpen={(id) => { setEventId(id); go("event"); }}
              onPeople={(id) => { setEventId(id); go("people"); }}
              onAdd={() => {
                let created = "";
                update((p) => { const added = addEmployeeEvent(p, report.id); created = added.eventId; return added.project; });
                setEventId(created);
                go("event");
              }}
              onRemove={(id) => update((p) => removeEvent(p, report.id, id))}
              onNext={() => go("check")}
            />
          ) : null}
          {screen === "event" && event ? <EventForm key={event.id} reportId={report.id} event={event} onBack={() => go("events")} onNext={() => go("people")} /> : null}
          {screen === "people" && event ? <PeopleStep key={event.id} report={report} event={event} onBack={() => go("event")} onNext={() => go("check")} /> : null}
          {screen === "check" ? <CheckStep report={report} onBack={() => go("events")} onNext={() => go("send")} onFix={(id) => { setEventId(id); go(report.events.find((e) => e.id === id)?.kind === "employeeShares" ? "people" : "events"); }} /> : null}
          {screen === "send" ? <SendStep report={report} submissions={submissions} onBack={() => go("check")} /> : null}
        </main>
        <aside className="help no-print"><Help screen={screen} /></aside>
      </div>
      <span hidden>{lang}</span>
    </>
  );
}

function EventsList(props: {
  report: Report;
  issueCount: (eventId: string) => number;
  whatLabel: (e: EmployeeShareEvent) => string;
  onOpen: (id: string) => void;
  onPeople: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onNext: () => void;
}) {
  const { t, lang } = useT();
  const { project } = useCase();
  const { report } = props;
  const dateText = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(lang === "da" ? "da-DK" : "en-GB", { day: "numeric", month: "long", year: "numeric" }) : t("Ingen dato", "No date"));
  const isB = report.scenario === "B";

  return (
    <div className="panel">
      <div className="stack">
        <h1>{t(`Hændelser i ${report.incomeYear}`, `Events in ${report.incomeYear}`)}</h1>
        <p className="lead">{isB
          ? t("En hændelse er fx en tildeling af aktier eller en udnyttelse af optioner på en bestemt dato. Alle, der var med, tilføjes til hændelsen.", "An event is, for example, a grant of shares or an exercise of options on a given date. Everyone involved is added to the event.")
          : t("Denne indberetning er indlæst fra en fil. Du kan tjekke den og danne filen igen. Guidet redigering af denne type kommer senere.", "This report was loaded from a file. You can check it and make the file again. Guided editing of this type is coming later.")}</p>
      </div>
      {report.events.length === 0 ? <div className="empty">{t("Ingen hændelser endnu.", "No events yet.")}</div> : null}
      {report.events.map((e) => {
        if (e.kind === "imported") {
          return (
            <div className="event" key={e.id}>
              <div className="stack" style={{ gap: 6 }}>
                <h2>{t("Indlæste linjer", "Loaded lines")}</h2>
                <div className="meta"><span className="chip">{e.rows.length} {t("linjer", "lines")}</span><span className="small muted">{t("Bevaret præcis som i filen, fx rettelser.", "Kept exactly as in the file, e.g. corrections.")}</span></div>
              </div>
            </div>
          );
        }
        const errors = props.issueCount(e.id);
        const security = project.securities.find((s) => s.id === e.securityId);
        const code = e.kind === "employeeShares" ? employeeShareCode(e.what, e.scheme, e.date) : null;
        return (
          <div className="event" key={e.id}>
            <div className="stack" style={{ gap: 6 }}>
              <h2>{e.kind === "employeeShares" ? props.whatLabel(e) : t("Hændelse", "Event")} · {dateText(e.date)}</h2>
              <div className="meta">
                {code ? <span className="chip accent">{t("SKAT-kode", "SKAT code")} <span className="mono">{code}</span></span> : null}
                <span className="chip">{securityLabel(security, lang)}</span>
                <span className="chip">{e.participants.length} {t("personer", "people")}</span>
                {errors > 0 ? <span className="chip err">{errors} {t("skal rettes", "to fix")}</span> : e.participants.length > 0 ? <span className="chip ok">{t("Klar", "Ready")}</span> : null}
              </div>
            </div>
            {e.kind === "employeeShares" ? (
              <div className="row">
                <button className="btn" onClick={() => props.onOpen(e.id)}>{t("Rediger", "Edit")}</button>
                <button className="btn" onClick={() => props.onPeople(e.id)}>{t("Personer", "People")}</button>
                <button className="btn small danger" aria-label={t("Slet hændelse", "Delete event")} onClick={() => { if (window.confirm(t("Slet hændelsen?", "Delete the event?"))) props.onRemove(e.id); }}>×</button>
              </div>
            ) : null}
          </div>
        );
      })}
      {isB ? <button className="btn" style={{ alignSelf: "flex-start" }} onClick={props.onAdd}>+ {t("Tilføj hændelse", "Add event")}</button> : null}
      <div className="actions">
        <span />
        <button className="btn primary" onClick={props.onNext}>{t("Tjek indberetningen", "Check the report")}</button>
      </div>
    </div>
  );
}

export function Disclaimer() {
  const { t } = useT();
  return (
    <div className="disclaimer">
      <b>{t("Ikke skatterådgivning.", "Not tax advice.")}</b>
      <span>{t("Dette er generel information. Er du i tvivl om din situation, så søg professionel rådgivning.", "This is general information. If you are in any doubt about your situation, seek professional advice.")}</span>
    </div>
  );
}

function Help({ screen }: { screen: Screen }) {
  const { t } = useT();
  const tips: Record<Screen, string> = {
    events: t("Hver hændelse kan have mange personer, og en person kan være med i flere hændelser.", "Each event can have many people, and one person can be in several events."),
    event: t("Usikker på ordningen? Spørg den, der har sat aktieordningen op, eller din rådgiver.", "Unsure about the scheme? Ask whoever set up the share scheme, or your advisor."),
    people: t("Beløbet beskattet via lønnen er det, der er indberettet til eIndkomst for aktierne.", "The amount taxed through payroll is what was reported to eIndkomst for the shares."),
    check: t("Fejl skal rettes, før filen kan dannes. Advarsler kan du vælge at se bort fra.", "Errors must be fixed before the file can be made. You may choose to ignore warnings."),
    send: t("Afviste linjer skal genindberettes senest 14 dage efter SKATs svar.", "Rejected lines must be re-submitted within 14 days of SKAT's response."),
  };
  return (
    <>
      <div className="box"><h3>{t("Godt at vide", "Good to know")}</h3><p className="small">{tips[screen]}</p></div>
      {screen === "events" || screen === "event" || screen === "people" ? (
        <div className="box">
          <h3>{t("Skal det overhovedet indberettes?", "Does this need to be reported at all?")}</h3>
          <Disclaimer />
          <details>
            <summary>{t("Medarbejderen fik forskellen udbetalt kontant", "The employee was paid the difference in cash")}</summary>
            <p>{t("Ved differenceafregning har medarbejderen ikke fået aktier. Der indberettes kun til eIndkomst, ikke her. Overføres aktierne og sælges de samme dag, skal de indberettes her.", "With cash settlement of the difference, the employee did not get shares. It is reported only to eIndkomst, not here. If the shares are transferred and sold the same day, they must be reported here.")}</p>
          </details>
          <details>
            <summary>{t("Matching shares", "Matching shares")}</summary>
            <p>{t("Både købet af aktierne og de matchede aktier indberettes: købet på købsdatoen, de matchede aktier når de vester.", "Both the purchase and the matched shares are reported: the purchase on the purchase date, the matched shares when they vest.")}</p>
          </details>
          <details>
            <summary>{t("Aktierne kommer fra et udenlandsk moderselskab", "The shares come from a foreign parent company")}</summary>
            <p>{t("Ydes aktierne af et udenlandsk koncernselskab, er det normalt det danske selskab, hvor medarbejderen er ansat, der indberetter.", "If the shares are granted by a foreign group company, it is normally the Danish company employing the person that reports.")}</p>
          </details>
          <a className="small" href="https://info.skat.dk/data.aspx?oid=2289412" target="_blank" rel="noopener noreferrer">{t("SKATs vejledning", "SKAT's guidance")}</a>
        </div>
      ) : null}
    </>
  );
}
