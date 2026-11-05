/** Pure edits to a project. The editor calls these; nothing here touches the network. */
import {
  type EmployeeParticipant, type EmployeeShareEvent, freshId, type ImportedPersonRow, type Person, type Project,
  type Report, type Scenario, type Security,
} from "@medak/engine";

export function addReport(project: Project, scenario: Scenario, incomeYear: string): { project: Project; reportId: string } {
  const id = freshId("r", project.reports);
  return { project: { ...project, reports: [...project.reports, { id, scenario, incomeYear, events: [] }] }, reportId: id };
}

export function removeReport(project: Project, reportId: string): Project {
  return { ...project, reports: project.reports.filter((r) => r.id !== reportId) };
}

export function updateReport(project: Project, reportId: string, change: (r: Report) => Report): Project {
  return { ...project, reports: project.reports.map((r) => (r.id === reportId ? change(r) : r)) };
}

function allEvents(project: Project) {
  return project.reports.flatMap((r) => [...r.events]);
}

/** A new, empty employee-share event. The first share is preselected if there is exactly one. */
export function addEmployeeEvent(project: Project, reportId: string): { project: Project; eventId: string } {
  const id = freshId("e", allEvents(project));
  const event: EmployeeShareEvent = {
    kind: "employeeShares",
    id,
    what: "pay",
    date: "",
    securityId: project.securities.length === 1 ? project.securities[0]!.id : "",
    tradeCurrency: "DKK",
    pricePerShare: "0",
    participants: [],
  };
  return { project: updateReport(project, reportId, (r) => ({ ...r, events: [...r.events, event] })), eventId: id };
}

export function updateEvent(project: Project, reportId: string, eventId: string, change: (e: EmployeeShareEvent) => EmployeeShareEvent): Project {
  return updateReport(project, reportId, (r) => ({
    ...r,
    events: r.events.map((e) => (e.id === eventId && e.kind === "employeeShares" ? change(e) : e)),
  }));
}

export function removeEvent(project: Project, reportId: string, eventId: string): Project {
  return updateReport(project, reportId, (r) => ({ ...r, events: r.events.filter((e) => e.id !== eventId) }));
}

export function addSecurity(project: Project, fields: Omit<Security, "id">): { project: Project; securityId: string } {
  const id = freshId("s", project.securities);
  return { project: { ...project, securities: [...project.securities, { id, ...fields }] }, securityId: id };
}

export function updateSecurity(project: Project, security: Security): Project {
  return { ...project, securities: project.securities.map((s) => (s.id === security.id ? security : s)) };
}

export function addPerson(project: Project, fields: Omit<Person, "id"> = {}): { project: Project; personId: string } {
  const id = freshId("p", project.persons);
  return { project: { ...project, persons: [...project.persons, { id, ...fields }] }, personId: id };
}

export function updatePerson(project: Project, person: Person): Project {
  return { ...project, persons: project.persons.map((p) => (p.id === person.id ? person : p)) };
}

/** True when a person is used by any event, and so can't be removed from the register. */
export function personInUse(project: Project, personId: string): boolean {
  return allEvents(project).some((e) => e.kind !== "imported" && e.participants.some((p) => p.personId === personId));
}

export function removePerson(project: Project, personId: string): Project {
  if (personInUse(project, personId)) return project;
  return { ...project, persons: project.persons.filter((p) => p.id !== personId) };
}

export function addParticipant(event: EmployeeShareEvent, participant: EmployeeParticipant): EmployeeShareEvent {
  return { ...event, participants: [...event.participants, participant] };
}

export function updateParticipant(event: EmployeeShareEvent, personId: string, change: (p: EmployeeParticipant) => EmployeeParticipant): EmployeeShareEvent {
  return { ...event, participants: event.participants.map((p) => (p.personId === personId ? change(p) : p)) };
}

export function removeParticipant(event: EmployeeShareEvent, personId: string): EmployeeShareEvent {
  return { ...event, participants: event.participants.filter((p) => p.personId !== personId) };
}

/** Remove an optional key rather than storing it empty. */
export function setOptional<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): T {
  const copy = { ...obj };
  if (value === undefined || value === "") delete copy[key];
  else copy[key] = value;
  return copy;
}

/**
 * Add imported rows to an event. Someone already in the register (same CPR/CVR) is reused and
 * keeps their details; someone already in the event gets their numbers updated.
 */
export function addImportedPeople(project: Project, reportId: string, eventId: string, rows: readonly ImportedPersonRow[]): Project {
  let next = project;
  for (const row of rows) {
    let personId = row.danishId ? next.persons.find((p) => p.danishId === row.danishId)?.id : undefined;
    if (!personId) {
      const added = addPerson(next, {
        ...(row.name ? { displayName: row.name } : {}),
        ...(row.danishId ? { danishId: row.danishId } : {}),
      });
      next = added.project;
      personId = added.personId;
    }
    const participant: EmployeeParticipant = {
      personId,
      shares: row.shares ?? "0",
      ...(row.taxed !== undefined ? { taxed: row.taxed } : {}),
      ...(row.paid !== undefined ? { paid: row.paid } : {}),
      ...(row.noteNumber ? { noteNumber: row.noteNumber } : {}),
    };
    const id = personId;
    next = updateEvent(next, reportId, eventId, (e) =>
      e.participants.some((p) => p.personId === id)
        ? updateParticipant(e, id, (p) => ({ ...p, ...participant }))
        : addParticipant(e, participant),
    );
  }
  return next;
}
