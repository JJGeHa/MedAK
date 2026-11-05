"use client";

import {
  checkReport, type EmployeeShareEvent, expandReport, FOREIGN_COUNTRY_CODES, COUNTRY_CODES, formatIssue, fromFixedDigits, guessColumns, hasHeaderRow,
  type ForeignOwner, type Identification, parseDelimited, type PeopleColumn, type Person, readPeople, type Report,
} from "@medak/engine";
import { useMemo, useState } from "react";
import { maskId } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { addImportedPeople, addParticipant, addPerson, removeParticipant, setOptional, updateEvent, updateParticipant, updatePerson } from "@/lib/project-ops";
import { personName } from "@/lib/review";
import { Choice, NumberInput, SelectField, TextField } from "../fields";
import { useCase } from "./CaseProvider";

export function PeopleStep({ report, event, onBack, onNext }: { report: Report; event: EmployeeShareEvent; onBack: () => void; onNext: () => void }) {
  const { t, lang } = useT();
  const { project, update } = useCase();
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const change = (fn: (e: EmployeeShareEvent) => EmployeeShareEvent) => update((p) => updateEvent(p, report.id, event.id, fn));
  const { rows } = useMemo(() => expandReport(project, report), [project, report]);
  const issues = useMemo(() => checkReport(project, report), [project, report]);
  const rowOf = (personId: string) => rows.find((r) => r.eventId === event.id && r.personId === personId)?.row;
  const issuesOf = (personId: string) => issues.filter((i) => i.eventId === event.id && i.personId === personId);

  const inEvent = new Set(event.participants.map((p) => p.personId));
  const available = project.persons.filter((p) => !inEvent.has(p.id));
  const selectedPerson = project.persons.find((p) => p.id === selected);

  function addNew() {
    update((p) => {
      const added = addPerson(p);
      setSelected(added.personId);
      return updateEvent(added.project, report.id, event.id, (e) => addParticipant(e, { personId: added.personId, shares: "0" }));
    });
  }

  const dkk = (digits: string | undefined) => (digits ? fromFixedDigits(digits, 2, lang) : "–");

  return (
    <div className="panel">
      <div className="stack">
        <h1>{t("Personer i hændelsen", "People in the event")}</h1>
        <p className="lead">{t("For hver person: antal aktier og det beløb, der er beskattet via lønnen (eIndkomst). Betalt beløb og anskaffelsessum regnes ud.", "For each person: number of shares and the amount taxed through payroll (eIndkomst). Amount paid and acquisition sum are calculated.")}</p>
      </div>
      <div className="row">
        <button className="btn" onClick={addNew}>+ {t("Tilføj person", "Add person")}</button>
        <button className="btn" onClick={() => setImporting(!importing)}>{t("Indsæt fra regneark eller CSV", "Paste from spreadsheet or CSV")}</button>
        {available.length > 0 ? (
          <select
            aria-label={t("Tilføj fra personregistret", "Add from the people register")}
            style={{ width: "auto" }}
            value=""
            onChange={(e) => { if (e.target.value) { const id = e.target.value; change((ev) => addParticipant(ev, { personId: id, shares: "0" })); setSelected(id); } }}
          >
            <option value="">{t("Tilføj fra registret …", "Add from the register …")}</option>
            {available.map((p) => <option key={p.id} value={p.id}>{personName(p, lang)}</option>)}
          </select>
        ) : null}
      </div>

      {importing ? <PeopleImport onDone={() => setImporting(false)} onImport={(people) => { update((p) => addImportedPeople(p, report.id, event.id, people)); setImporting(false); }} /> : null}

      {event.participants.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Person", "Person")}</th>
                <th className="num">{t("Aktier", "Shares")}</th>
                <th className="num">{t("Betalt", "Paid")} ({event.tradeCurrency})</th>
                <th className="num">{t("Beskattet via løn (DKK)", "Taxed via payroll (DKK)")}</th>
                <th className="num">{t("Anskaffelsessum (DKK)", "Acquisition sum (DKK)")}</th>
                <th>{t("Status", "Status")}</th>
                <th aria-label={t("Handlinger", "Actions")} />
              </tr>
            </thead>
            <tbody>
              {event.participants.map((part) => {
                const person = project.persons.find((p) => p.id === part.personId);
                const row = rowOf(part.personId);
                const problems = issuesOf(part.personId);
                const errors = problems.filter((i) => i.severity === "error");
                return (
                  <tr key={part.personId} className={selected === part.personId ? "sel" : ""}>
                    <td>
                      <div className="person">
                        <button onClick={() => setSelected(selected === part.personId ? null : part.personId)}>{personName(person, lang)}</button>
                        <span className="small muted mono">{person?.abroad ? t(`Bor i udlandet (${person.abroad.country || "?"})`, `Lives abroad (${person.abroad.country || "?"})`) : maskId(person?.danishId)}</span>
                      </div>
                    </td>
                    <td className="num"><NumberInput digits={part.shares} decimals={6} ariaLabel={t("Antal aktier", "Number of shares")} onChange={(d) => change((e) => updateParticipant(e, part.personId, (p) => ({ ...p, shares: d ?? "0" })))} /></td>
                    <td className="num">{dkk(paidText(part, event))}</td>
                    <td className="num"><NumberInput digits={part.taxed ?? "0"} decimals={2} ariaLabel={t("Beskattet via lønnen", "Taxed through payroll")} onChange={(d) => change((e) => updateParticipant(e, part.personId, (p) => setOptional(p, "taxed", d)))} /></td>
                    <td className="num"><b>{dkk(row?.KURVAEBSKVALBLB)}</b></td>
                    <td>
                      {errors.length > 0 ? <span className="chip err" title={errors.map((i) => formatIssue(i, lang)).join(" ")}>{t("Ret", "Fix")} ({errors.length})</span> : problems.length > 0 ? <span className="chip warn">{t("Tjek", "Check")}</span> : <span className="chip ok">OK</span>}
                    </td>
                    <td><button className="btn small" aria-label={t("Fjern fra hændelsen", "Remove from the event")} onClick={() => { change((e) => removeParticipant(e, part.personId)); if (selected === part.personId) setSelected(null); }}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="empty">{t("Ingen personer endnu. Tilføj dem én ad gangen, eller indsæt en liste fra et regneark.", "No people yet. Add them one at a time, or paste a list from a spreadsheet.")}</div>}

      {selectedPerson ? (
        <PersonDrawer
          person={selectedPerson}
          noteNumber={event.participants.find((p) => p.personId === selectedPerson.id)?.noteNumber}
          messages={issuesOf(selectedPerson.id).map((i) => formatIssue(i, lang))}
          onChange={(person) => update((p) => updatePerson(p, person))}
          onNoteChange={(note) => change((e) => updateParticipant(e, selectedPerson.id, (p) => setOptional(p, "noteNumber", note)))}
        />
      ) : null}

      <div className="actions">
        <button className="btn" onClick={onBack}>{t("Tilbage", "Back")}</button>
        <button className="btn primary" onClick={onNext}>{t("Tjek indberetningen", "Check the report")}</button>
      </div>
    </div>
  );
}

/** What the person paid in the trade currency, shown in the table. */
function paidText(part: EmployeeShareEvent["participants"][number], event: EmployeeShareEvent): string {
  if (part.paid) return part.paid;
  if (!/^\d+$/.test(part.shares) || !/^\d+$/.test(event.pricePerShare)) return "0";
  const value = (BigInt(part.shares) * BigInt(event.pricePerShare) + 5_000_000_000n) / 10_000_000_000n;
  return value.toString();
}

function PersonDrawer(props: {
  person: Person;
  noteNumber: string | undefined;
  messages: string[];
  onChange: (person: Person) => void;
  onNoteChange: (note: string | undefined) => void;
}) {
  const { t } = useT();
  const { person, onChange } = props;
  const abroad = person.abroad;
  const emptyForeign: ForeignOwner = { identification: { type: "tin", tin: "" }, names: { kind: "person", first: "", last: "" }, town: "", countryName: "", country: "" };
  const setForeign = (fields: Partial<ForeignOwner>) => onChange({ ...person, abroad: { ...(abroad ?? emptyForeign), ...fields } });
  const opt = <K extends keyof ForeignOwner>(key: K, value: string) => onChange({ ...person, abroad: setOptional(abroad ?? emptyForeign, key, value.trim() ? (value as ForeignOwner[K]) : undefined) });

  return (
    <div className="drawer">
      <h2>{person.displayName || t("Ny person", "New person")}</h2>
      {props.messages.length > 0 ? (
        <div className="note-box err stack" style={{ gap: 4 }}>
          {props.messages.map((m) => <span key={m} className="small">{m}</span>)}
        </div>
      ) : null}
      <TextField label={t("Navn", "Name")} value={person.displayName ?? ""} maxLength={100} onChange={(v) => onChange(setOptional(person, "displayName", v))} hint={t("Til jer selv. Kommer kun med i filen, hvis personen bor i udlandet.", "For your own use. Only goes in the file if the person lives abroad.")} />
      <div className="choices" role="radiogroup" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Choice checked={!abroad} onSelect={() => { const { abroad: _a, ...rest } = person; onChange(rest); }} title={t("Bor i Danmark", "Lives in Denmark")} />
        <Choice checked={Boolean(abroad)} onSelect={() => setForeign({})} title={t("Bor i udlandet", "Lives abroad")} />
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <TextField
          label={abroad ? t("Dansk cpr-/cvr-nr., hvis personen har et", "Danish CPR/CVR number, if the person has one") : t("Cpr-nr. (eller cvr-/se-nr.)", "CPR number (or CVR/SE number)")}
          value={person.danishId ?? ""}
          mono
          inputMode="numeric"
          maxLength={11}
          onChange={(v) => onChange(setOptional(person, "danishId", v.replace(/[\s-]/g, "")))}
          hint={t("Uden bindestreg. Foranstillede nuller bevares.", "No hyphen. Leading zeros are kept.")}
        />
        <TextField label={t("Fondsnota-nr.", "Contract note no.")} value={props.noteNumber ?? ""} maxLength={17} onChange={(v) => props.onNoteChange(v.trim() || undefined)} hint={t("Valgfrit. Ellers bruges nummer i aktiebogen, eller fødselsdato/cvr.", "Optional. Otherwise the share register no. or birth date/CVR is used.")} />
      </div>
      {abroad ? <ForeignFields owner={abroad} setForeign={setForeign} opt={opt} /> : null}
    </div>
  );
}

function ForeignFields({ owner, setForeign, opt }: { owner: ForeignOwner; setForeign: (f: Partial<ForeignOwner>) => void; opt: (key: keyof ForeignOwner, value: string) => void }) {
  const { t } = useT();
  const id = owner.identification;
  const names = owner.names;
  const setId = (identification: Identification) => setForeign({ identification });

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="seg" role="group" aria-label={t("Hvem er det?", "Who is it?")} style={{ width: "fit-content" }}>
        <button type="button" aria-pressed={names.kind === "person"} onClick={() => setForeign({ names: { kind: "person", first: names.kind === "company" ? names.name : names.first, last: names.kind === "person" ? names.last : "" } })}>{t("En person", "A person")}</button>
        <button type="button" aria-pressed={names.kind === "company"} onClick={() => setForeign({ names: { kind: "company", name: names.kind === "person" ? `${names.first} ${names.last}`.trim() : names.name } })}>{t("Et selskab", "A company")}</button>
      </div>
      {names.kind === "person" ? (
        <div className="row">
          <TextField label={t("Fornavn", "First name")} value={names.first} maxLength={70} onChange={(v) => setForeign({ names: { ...names, first: v } })} />
          <TextField label={t("Efternavn", "Last name")} value={names.last} maxLength={70} onChange={(v) => setForeign({ names: { ...names, last: v } })} />
        </div>
      ) : <TextField label={t("Selskabets navn", "Company name")} value={names.name} maxLength={70} onChange={(v) => setForeign({ names: { kind: "company", name: v } })} />}

      <SelectField
        label={t("Hvordan kan personen identificeres?", "How can the person be identified?")}
        value={id.type}
        onChange={(v) => setId(v === "tin" ? { type: "tin", tin: "" } : v === "birth" ? { type: "birth", birthDate: "", birthCountry: "" } : { type: "missing" })}
        options={[
          { value: "tin", label: t("Udenlandsk skattenummer (TIN)", "Foreign tax number (TIN)") },
          { value: "birth", label: t("Fødselsdato og -sted", "Date and place of birth") },
          { value: "missing", label: t("Vi har ingen af delene", "We have neither") },
        ]}
      />
      {id.type === "tin" ? <TextField label="TIN" value={id.tin} maxLength={20} mono onChange={(v) => setId({ type: "tin", tin: v.trim() })} /> : null}
      {id.type === "birth" ? (
        <div className="row" style={{ alignItems: "flex-start" }}>
          <TextField label={t("Fødselsdato", "Date of birth")} type="date" value={id.birthDate} onChange={(v) => setId({ ...id, birthDate: v })} style={{ maxWidth: 200 }} />
          <TextField label={t("Fødested", "Place of birth")} value={id.birthPlace ?? ""} maxLength={35} onChange={(v) => setId(setOptional(id, "birthPlace", v))} hint={t("Står det ikke på legitimationen, så lad det stå tomt.", "If it isn't on the ID, leave it empty.")} />
          <SelectField label={t("Fødeland", "Country of birth")} value={id.birthCountry} onChange={(v) => setId({ ...id, birthCountry: v })} options={[{ value: "", label: "–" }, ...COUNTRY_CODES.map((c) => ({ value: c, label: c }))]} style={{ maxWidth: 120, minWidth: 100 }} />
        </div>
      ) : null}

      <h3>{t("Adresse i hjemlandet", "Address in the home country")}</h3>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <TextField label={t("Vej", "Street")} value={owner.street ?? ""} maxLength={70} onChange={(v) => opt("street", v)} />
        <TextField label={t("Nummer", "Number")} value={owner.houseNumber ?? ""} maxLength={10} onChange={(v) => opt("houseNumber", v)} style={{ maxWidth: 120, minWidth: 90 }} />
        <TextField label={t("Postboks", "PO box")} value={owner.poBox ?? ""} maxLength={20} onChange={(v) => opt("poBox", v)} style={{ maxWidth: 160 }} />
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <TextField label={t("Postnr.", "Postcode")} value={owner.postcode ?? ""} maxLength={15} onChange={(v) => opt("postcode", v)} style={{ maxWidth: 140, minWidth: 100 }} />
        <TextField label={t("By", "Town")} value={owner.town} maxLength={70} onChange={(v) => setForeign({ town: v })} />
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <TextField label={t("Land", "Country")} value={owner.countryName} maxLength={70} onChange={(v) => setForeign({ countryName: v })} />
        <SelectField label={t("Landekode", "Country code")} value={owner.country} onChange={(v) => setForeign({ country: v })} options={[{ value: "", label: "–" }, ...FOREIGN_COUNTRY_CODES.map((c) => ({ value: c, label: c }))]} style={{ maxWidth: 120, minWidth: 100 }} />
      </div>
    </div>
  );
}

function PeopleImport({ onImport, onDone }: { onImport: (rows: ReturnType<typeof readPeople>) => void; onDone: () => void }) {
  const { t, lang } = useT();
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<PeopleColumn, number>> | null>(null);
  const [skipFirst, setSkipFirst] = useState(true);
  const rows = useMemo(() => parseDelimited(text), [text]);

  function load(value: string) {
    setText(value);
    const parsed = parseDelimited(value);
    const header = hasHeaderRow(parsed);
    setSkipFirst(header);
    setMapping(header ? guessColumns(parsed[0] ?? []) : {});
  }

  const columns: { key: PeopleColumn; label: string }[] = [
    { key: "name", label: t("Navn", "Name") },
    { key: "id", label: t("Cpr-/cvr-nr.", "CPR/CVR number") },
    { key: "shares", label: t("Antal aktier", "Number of shares") },
    { key: "taxed", label: t("Beskattet via løn", "Taxed via payroll") },
    { key: "paid", label: t("Betalt i alt", "Total paid") },
    { key: "note", label: t("Fondsnota-nr.", "Contract note no.") },
  ];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const headers = skipFirst ? rows[0] ?? [] : [];
  const columnOptions = [{ value: "", label: t("Ikke med", "Not included") }, ...Array.from({ length: width }, (_, i) => ({ value: String(i), label: headers[i] || t(`Kolonne ${i + 1}`, `Column ${i + 1}`) }))];
  const preview = mapping ? readPeople(rows, mapping, lang, skipFirst) : [];
  const problems = preview.filter((p) => p.problems.length > 0);
  const missingId = preview.filter((p) => !p.danishId).length;

  return (
    <div className="drawer">
      <h2>{t("Indsæt personer", "Paste people")}</h2>
      <textarea aria-label={t("Indsæt her", "Paste here")} placeholder={t("Kopiér rækkerne fra Excel og indsæt dem her …", "Copy the rows from Excel and paste them here …")} value={text} onChange={(e) => load(e.target.value)} />
      <label className="small">
        {t("Eller vælg en CSV-fil: ", "Or choose a CSV file: ")}
        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text()); }} />
      </label>
      {mapping && rows.length > 0 ? (
        <>
          <label className="check small"><input type="checkbox" checked={skipFirst} onChange={(e) => setSkipFirst(e.target.checked)} />{t("Første række er overskrifter", "The first row is headers")}</label>
          <div className="grid-2">
            {columns.map((c) => (
              <SelectField key={c.key} label={c.label} value={mapping[c.key]?.toString() ?? ""} options={columnOptions} onChange={(v) => {
                const next = { ...mapping };
                if (v === "") delete next[c.key]; else next[c.key] = Number(v);
                setMapping(next);
              }} />
            ))}
          </div>
          <p className="small">{t(`${preview.length} personer klar.`, `${preview.length} people ready.`)}{missingId > 0 ? ` ${t(`${missingId} uden cpr-/cvr-nr. skal have det tilføjet bagefter.`, `${missingId} without a CPR/CVR number will need one added afterwards.`)}` : ""}</p>
          {problems.length > 0 ? (
            <div className="note-box err stack" style={{ gap: 2 }}>
              <b className="small">{t("Disse værdier kunne ikke læses og bliver ikke gættet:", "These values could not be read and won't be guessed:")}</b>
              {problems.slice(0, 8).map((p) => <span className="small" key={p.rowNumber}>{t("Række", "Row")} {p.rowNumber}: {p.problems.map((c) => columns.find((x) => x.key === c)?.label).join(", ")}</span>)}
            </div>
          ) : null}
        </>
      ) : null}
      <div className="row">
        <button className="btn primary" disabled={preview.length === 0} onClick={() => onImport(preview)}>{t("Tilføj personerne", "Add the people")}</button>
        <button className="btn link" onClick={onDone}>{t("Fortryd", "Cancel")}</button>
      </div>
    </div>
  );
}
