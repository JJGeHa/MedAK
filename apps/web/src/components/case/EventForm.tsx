"use client";

import { COUNTRY_CODES, CURRENCY_CODES, type EmployeeShareEvent, type EmployeeShareScheme, type EmployeeShareWhat, isValidIsin, schemeOptions, type Security } from "@medak/engine";
import { useState } from "react";
import { errorText, useT } from "@/lib/i18n";
import { addSecurity, setOptional, updateEvent, updateSecurity } from "@/lib/project-ops";
import { fetchExchangeRate } from "@/server/actions";
import { Choice, NumberField, SelectField, TextField } from "../fields";
import { useCase } from "./CaseProvider";

export function EventForm({ reportId, event, onBack, onNext }: { reportId: string; event: EmployeeShareEvent; onBack: () => void; onNext: () => void }) {
  const { t } = useT();
  const { update, project } = useCase();
  const change = (fn: (e: EmployeeShareEvent) => EmployeeShareEvent) => update((p) => updateEvent(p, reportId, event.id, fn));

  const whats: { value: EmployeeShareWhat; title: string; description: string }[] = [
    { value: "pay", title: t("Medarbejdere fik aktier som en del af lønnen", "Employees received shares as part of their pay"), description: t("Fx tildelte aktier, RSU'er eller aktier købt til favørkurs.", "E.g. granted shares, RSUs or shares bought at a discount.") },
    { value: "options", title: t("Medarbejdere udnyttede optioner eller warrants", "Employees exercised options or warrants"), description: t("De fik aktier ved at bruge en købe- eller tegningsret.", "They got shares by using a purchase or subscription right.") },
    { value: "matching", title: t("Medarbejdere købte aktier og fik matching shares", "Employees bought shares and received matching shares"), description: t("Både købet og de matchede aktier indberettes.", "Both the purchase and the matched shares are reported.") },
  ];

  const schemeText: Record<EmployeeShareScheme, { title: string; description: string }> = {
    "lp7-10": { title: t("LL § 7 P, op til 10 % af årslønnen", "LL § 7 P, up to 10% of annual salary"), description: t("Den almindelige medarbejderaktieordning.", "The standard employee share scheme.") },
    "lp7-20": { title: t("LL § 7 P, op til 20 % af årslønnen", "LL § 7 P, up to 20% of annual salary"), description: t("Når ordningen tilbydes bredt til de ansatte.", "When the scheme is offered broadly to employees.") },
    "lp7-uncapped": event.date >= "2026-07-01"
      ? { title: t("LL § 7 P uden loft (ordningen fra 1. juli 2026)", "LL § 7 P with no cap (the scheme from 1 July 2026)"), description: t("Kræver et grundbeløb i årslønnen.", "Requires a base amount in the annual salary.") }
      : { title: t("LL § 7 P, op til 50 % af lønnen", "LL § 7 P, up to 50% of salary"), description: t("Ordningen gjaldt til og med 30. juni 2026.", "The scheme applied until 30 June 2026.") },
    ll16: { title: t("LL § 16, beskattet som almindelig løn", "LL § 16, taxed as ordinary salary"), description: t("Fx RSU'er fra et udenlandsk moderselskab.", "E.g. RSUs from a foreign parent company.") },
    ll28: { title: t("LL § 28, købe- og tegningsretter", "LL § 28, purchase and subscription rights"), description: t("Typisk optioner eller warrants i mindre selskaber.", "Typically options or warrants in smaller companies.") },
  };

  const options = schemeOptions(event.what, event.date);
  let question = 2;

  return (
    <div className="panel">
      <div className="stack">
        <h1>{t("Beskriv hændelsen", "Describe the event")}</h1>
        <p className="lead">{t("Svar på spørgsmålene. Koden til SKAT vises, så du kan sammenligne med SKATs vejledning, men du skal ikke vælge den selv.", "Answer the questions. The code for SKAT is shown so you can compare it with SKAT's guidance, but you don't have to choose it yourself.")}</p>
      </div>

      <div className="q">
        <div className="q-head"><span className="q-num">1</span><h2>{t("Hvad skete der?", "What happened?")}</h2></div>
        <div className="choices" role="radiogroup">
          {whats.map((w) => <Choice key={w.value} checked={event.what === w.value} onSelect={() => change((e) => ({ ...e, what: w.value }))} title={w.title} description={w.description} />)}
        </div>
      </div>

      <div className="q">
        <div className="q-head"><span className="q-num">{question}</span><h2>{t("Hvornår fik medarbejderne endelig ret til aktierne?", "When did the employees get the final right to the shares?")}</h2></div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <TextField label={t("Dato", "Date")} type="date" value={event.date} onChange={(v) => change((e) => ({ ...e, date: v }))} style={{ maxWidth: 240 }} />
          <p className="small muted" style={{ flex: 2, minWidth: 220, paddingTop: 26 }}>{t("Retserhvervelsesdatoen, fx når aktierne vestede. Den afgør indkomståret og hvilke regler der gælder.", "The date the right was acquired, e.g. when the shares vested. It decides the income year and which rules apply.")}</p>
        </div>
      </div>

      {event.what !== "matching" ? (
        <div className="q">
          <div className="q-head"><span className="q-num">{++question}</span><h2>{t("Hvilke regler er ordningen omfattet af?", "Which rules does the scheme fall under?")}</h2></div>
          <div className="choices" role="radiogroup">
            {options.map((o) => (
              <Choice key={o.scheme} checked={event.scheme === o.scheme} onSelect={() => change((e) => ({ ...e, scheme: o.scheme }))} title={schemeText[o.scheme].title} description={schemeText[o.scheme].description} code={o.code} />
            ))}
          </div>
          <p className="small muted">{t("I tvivl? Spørg den, der har sat ordningen op, eller din rådgiver.", "Not sure? Ask whoever set up the scheme, or your advisor.")}</p>
        </div>
      ) : null}

      <div className="q">
        <div className="q-head"><span className="q-num">{++question}</span><h2>{t("Hvilken aktie?", "Which share?")}</h2></div>
        <SecurityPicker
          securities={project.securities}
          selected={event.securityId}
          onSelect={(id) => change((e) => ({ ...e, securityId: id }))}
          onAdd={(fields) => {
            update((p) => {
              const added = addSecurity(p, fields);
              return updateEvent(added.project, reportId, event.id, (e) => ({ ...e, securityId: added.securityId }));
            });
          }}
          onChange={(s) => update((p) => updateSecurity(p, s))}
        />
      </div>

      <div className="q">
        <div className="q-head"><span className="q-num">{++question}</span><h2>{t("Hvad betalte medarbejderne pr. aktie?", "What did the employees pay per share?")}</h2></div>
        <PriceFields event={event} onChange={change} />
      </div>

      <div className="actions">
        <button className="btn" onClick={onBack}>{t("Tilbage", "Back")}</button>
        <button className="btn primary" onClick={onNext}>{t("Videre til personer", "Continue to people")}</button>
      </div>
    </div>
  );
}

function PriceFields({ event, onChange }: { event: EmployeeShareEvent; onChange: (fn: (e: EmployeeShareEvent) => EmployeeShareEvent) => void }) {
  const { t } = useT();
  const [rateNote, setRateNote] = useState<{ ok: boolean; text: string } | null>(null);
  const foreign = event.tradeCurrency !== "DKK";

  async function suggestRate() {
    if (!event.date) { setRateNote({ ok: false, text: t("Vælg datoen først.", "Choose the date first.") }); return; }
    const result = await fetchExchangeRate(event.tradeCurrency, event.date);
    if (!result.ok) { setRateNote({ ok: false, text: errorText(result.error, t) }); return; }
    onChange((e) => ({ ...e, exchangeRate: result.rate }));
    setRateNote({ ok: true, text: t(`Nationalbankens kurs den ${result.date}. Tjek den mod jeres egne oplysninger.`, `Danmarks Nationalbank's rate on ${result.date}. Check it against your own records.`) });
  }

  return (
    <>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <NumberField label={t("Pris pr. aktie", "Price per share")} digits={event.pricePerShare} decimals={6} minDecimals={2} onChange={(d) => onChange((e) => ({ ...e, pricePerShare: d ?? "0" }))} hint={t("0, hvis de fik aktierne gratis", "0 if they got the shares for free")} style={{ maxWidth: 220 }} />
        <SelectField
          label={t("Valuta", "Currency")}
          value={event.tradeCurrency}
          onChange={(v) => { setRateNote(null); onChange((e) => setOptional({ ...e, tradeCurrency: v }, "exchangeRate", v === "DKK" ? undefined : e.exchangeRate)); }}
          options={CURRENCY_CODES.map((c) => ({ value: c, label: c }))}
          style={{ maxWidth: 140, minWidth: 110 }}
        />
        {foreign ? (
          <NumberField
            label={t(`Kurs, kroner pr. 100 ${event.tradeCurrency}`, `Rate, DKK per 100 ${event.tradeCurrency}`)}
            digits={event.exchangeRate}
            decimals={6}
            minDecimals={2}
            onChange={(d) => onChange((e) => setOptional(e, "exchangeRate", d))}
            style={{ maxWidth: 260 }}
            action={<button className="btn link small" type="button" style={{ alignSelf: "flex-start" }} onClick={suggestRate}>{t("Foreslå kurs fra Nationalbanken", "Suggest rate from Danmarks Nationalbank")}</button>}
          />
        ) : null}
      </div>
      {rateNote ? <p className={rateNote.ok ? "small muted" : "error-text"}>{rateNote.text}</p> : null}
    </>
  );
}

const NEW = "__new";

function SecurityPicker(props: {
  securities: readonly Security[];
  selected: string;
  onSelect: (id: string) => void;
  onAdd: (fields: Omit<Security, "id">) => void;
  onChange: (security: Security) => void;
}) {
  const { t } = useT();
  const [adding, setAdding] = useState(props.securities.length === 0);
  const current = props.securities.find((s) => s.id === props.selected);

  return (
    <>
      {props.securities.length > 0 ? (
        <SelectField
          label={t("Aktie", "Share")}
          value={adding ? NEW : props.selected}
          onChange={(v) => { if (v === NEW) setAdding(true); else { setAdding(false); props.onSelect(v); } }}
          options={[
            ...(props.selected || adding ? [] : [{ value: "", label: t("Vælg en aktie", "Choose a share") }]),
            ...props.securities.map((s) => ({ value: s.id, label: s.name })),
            { value: NEW, label: `+ ${t("Ny aktieklasse", "New share class")}` },
          ]}
        />
      ) : null}
      {adding ? (
        <NewSecurity onAdd={(fields) => { props.onAdd(fields); setAdding(false); }} {...(props.securities.length > 0 ? { onCancel: () => setAdding(false) } : {})} />
      ) : current ? (
        <SecurityDetails security={current} onChange={props.onChange} />
      ) : null}
    </>
  );
}

function SecurityDetails({ security, onChange }: { security: Security; onChange: (s: Security) => void }) {
  const { t } = useT();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <TextField label={t("Fulde navn", "Full name")} value={security.name} maxLength={50} onChange={(v) => onChange({ ...security, name: v })} hint={t("Brug samme navn hvert år, fx SELSKAB A/S B-aktier.", "Use the same name every year, e.g. COMPANY A/S B shares.")} />
      <ListedFields security={security} onChange={onChange} />
    </div>
  );
}

function ListedFields({ security, onChange }: { security: Omit<Security, "id"> & { id?: string }; onChange: (s: never) => void }) {
  const { t } = useT();
  const change = onChange as unknown as (s: typeof security) => void;
  const isin = security.isin ?? "";
  const isinBad = isin !== "" && !isValidIsin(isin);
  return (
    <>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <SelectField label={t("Udstedt i", "Issued in")} value={security.issuerCountry} options={COUNTRY_CODES.map((c) => ({ value: c, label: c }))} onChange={(v) => change({ ...security, issuerCountry: v })} style={{ maxWidth: 120, minWidth: 100 }} />
        <SelectField
          label={t("Optaget til handel?", "Listed?")}
          value={security.listed ? "yes" : "no"}
          options={[{ value: "no", label: t("Nej, ikke optaget til handel", "No, not admitted to trading") }, { value: "yes", label: t("Ja, reguleret marked eller MHF", "Yes, regulated market or MTF") }]}
          onChange={(v) => change({ ...security, listed: v === "yes" })}
          hint={t("Status på datoen for hændelsen.", "Status on the date of the event.")}
        />
        <TextField
          label={t("ISIN", "ISIN")}
          value={isin}
          maxLength={12}
          mono
          onChange={(v) => change(setOptional(security, "isin", v.toUpperCase().trim()))}
          {...(isinBad ? { error: t("ISIN-koden er ikke gyldig.", "The ISIN isn't valid.") } : { hint: security.listed ? t("Børsnoterede aktier har altid en ISIN-kode.", "Listed shares always have an ISIN.") : t("Kun hvis aktien har en officiel ISIN-kode.", "Only if the share has an official ISIN.") })}
        />
      </div>
    </>
  );
}

function NewSecurity({ onAdd, onCancel }: { onAdd: (fields: Omit<Security, "id">) => void; onCancel?: () => void }) {
  const { t } = useT();
  const [draft, setDraft] = useState<Omit<Security, "id">>({ name: "", issuerCountry: "DK", listed: false });
  return (
    <div className="drawer">
      <h3>{t("Ny aktieklasse", "New share class")}</h3>
      <TextField label={t("Fulde navn", "Full name")} value={draft.name} maxLength={50} onChange={(v) => setDraft({ ...draft, name: v })} hint={t("Fx SELSKAB A/S B-aktier. Brug samme navn hvert år.", "E.g. COMPANY A/S B shares. Use the same name every year.")} />
      <ListedFields security={draft} onChange={((s: Omit<Security, "id">) => setDraft(s)) as never} />
      <div className="row">
        <button className="btn" type="button" disabled={!draft.name.trim()} onClick={() => onAdd({ ...draft, name: draft.name.trim() })}>{t("Tilføj aktie", "Add share")}</button>
        {onCancel ? <button className="btn link" type="button" onClick={onCancel}>{t("Fortryd", "Cancel")}</button> : null}
      </div>
    </div>
  );
}
