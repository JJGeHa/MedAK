"use server";

import {
  acceptedState, buildCorrection, buildFile, checkReport, decodeWindows1252, encodeWindows1252, expandReport,
  isValidCvr, matchErrorsToRows, parseFile, parseSkatErrors, reportFileName, type Project, type Report,
  type Row, senderOf, TEMPLATE_VERSION, toFixedDigits, validateRows,
} from "@medak/engine";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import type { ActionResult, CorrectionPreview, Lang, SentRowsMatch } from "@/lib/types";
import { newInviteToken, newWrappedKey, seal, sha256Hex, submissionContext } from "./crypto";
import { type Db, EMPTY_DOCUMENT, loadCase, readSubmissionBytes, sealCase, session, workspaceKey } from "./data";

const LANG_COOKIE = "medak-lang";
const MAX_DOCUMENT_BYTES = 10_000_000;

async function setLangCookie(lang: Lang) {
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}

// ---------- Language and profile ----------

export async function setLanguage(lang: Lang): Promise<void> {
  await setLangCookie(lang);
  const db = await (await import("@/lib/supabase/server")).supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (user) await db.from("profiles").update({ language: lang }).eq("user_id", user.id);
  revalidatePath("/", "layout");
}

export async function updateProfile(input: { displayName: string; language: Lang; deadlineReminders: boolean }): Promise<ActionResult> {
  const { supabase, user } = await session();
  const { error } = await supabase.from("profiles").update({
    display_name: input.displayName.trim().slice(0, 100),
    language: input.language === "en" ? "en" : "da",
    deadline_reminders: input.deadlineReminders,
  }).eq("user_id", user.id);
  if (error) return { ok: false, error: "save" };
  await setLangCookie(input.language);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * After sign-in. On a browser where a language was already chosen, that choice wins and is saved
 * (so someone signing up in English stays in English). On a new computer, the profile's applies.
 */
export async function applyProfileLanguage(): Promise<void> {
  const { supabase, user } = await session();
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  if (chosen === "da" || chosen === "en") {
    await supabase.from("profiles").update({ language: chosen }).eq("user_id", user.id);
    return;
  }
  const { data } = await supabase.from("profiles").select("language").eq("user_id", user.id).single();
  if (data?.language === "da" || data?.language === "en") await setLangCookie(data.language);
}

// ---------- Workspaces and team ----------

export async function createWorkspace(name: string): Promise<ActionResult<{ id: string }>> {
  const { supabase } = await session();
  const clean = name.trim();
  if (!clean) return { ok: false, error: "nameRequired" };
  const { data, error } = await supabase.rpc("create_workspace", { workspace_name: clean.slice(0, 100), wrapped_key: newWrappedKey() });
  if (error) return { ok: false, error: "save" };
  revalidatePath("/app", "layout");
  return { ok: true, id: data as string };
}

export async function switchWorkspace(workspaceId: string): Promise<void> {
  const { supabase, user } = await session();
  await supabase.from("profiles").update({ active_workspace_id: workspaceId }).eq("user_id", user.id);
  revalidatePath("/app", "layout");
}

export async function updateWorkspace(id: string, input: { name: string; senderSe: string; senderName: string; senderAddress: string }): Promise<ActionResult> {
  const { supabase } = await session();
  const senderSe = input.senderSe.trim();
  if (senderSe && !/^\d{8}$/.test(senderSe)) return { ok: false, error: "seInvalid" };
  if (input.senderName.trim().length > 27 || input.senderAddress.trim().length > 35) return { ok: false, error: "tooLong" };
  const { error, data } = await supabase.from("workspaces").update({
    name: input.name.trim().slice(0, 100),
    sender_se: senderSe || null,
    sender_name: input.senderName.trim() || null,
    sender_address: input.senderAddress.trim() || null,
  }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "notAllowed" };
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function inviteMember(workspaceId: string, email: string, role: "owner" | "member"): Promise<ActionResult<{ link: string }>> {
  const { supabase, user } = await session();
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: "emailInvalid" };
  const { token, hash } = newInviteToken();
  const { error } = await supabase.from("workspace_invites").insert({ workspace_id: workspaceId, email: clean, role, token_hash: hash, invited_by: user.id });
  if (error) return { ok: false, error: "notAllowed" };
  const h = await headers();
  const origin = h.get("origin") ?? `http://${h.get("host")}`;
  revalidatePath("/app/settings");
  return { ok: true, link: `${origin}/invite/${token}` };
}

export async function deleteInvite(id: string): Promise<void> {
  const { supabase } = await session();
  await supabase.from("workspace_invites").delete().eq("id", id);
  revalidatePath("/app/settings");
}

export async function acceptInvite(token: string): Promise<ActionResult> {
  const { supabase } = await session();
  const { error } = await supabase.rpc("accept_invite", { token });
  if (error) return { ok: false, error: "inviteInvalid" };
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function setMemberRole(workspaceId: string, userId: string, role: "owner" | "member"): Promise<ActionResult> {
  const { supabase } = await session();
  const { error, data } = await supabase.from("workspace_members").update({ role }).eq("workspace_id", workspaceId).eq("user_id", userId).select("user_id");
  if (error) return { ok: false, error: "lastOwner" };
  if (!data?.length) return { ok: false, error: "notAllowed" };
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function removeMember(workspaceId: string, userId: string): Promise<ActionResult> {
  const { supabase } = await session();
  const { error, data } = await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId).select("user_id");
  if (error) return { ok: false, error: "lastOwner" };
  if (!data?.length) return { ok: false, error: "notAllowed" };
  revalidatePath("/app", "layout");
  return { ok: true };
}

// ---------- Companies ----------

export async function createCompany(workspaceId: string, input: { seNumber: string; name: string; fileName: string; address: string; sentByWorkspace: boolean }): Promise<ActionResult<{ id: string }>> {
  const { supabase } = await session();
  const se = input.seNumber.replace(/\s/g, "");
  if (!/^\d{8}$/.test(se)) return { ok: false, error: "seInvalid" };
  if (!isValidCvr(se)) return { ok: false, error: "seChecksum" };
  if (!input.name.trim()) return { ok: false, error: "nameRequired" };
  if (input.address.trim().length > 35) return { ok: false, error: "tooLong" };
  if (input.fileName.trim().length > 27) return { ok: false, error: "tooLong" };

  const { data: company, error } = await supabase.from("companies").insert({
    workspace_id: workspaceId, se_number: se, name: input.name.trim().slice(0, 100),
    file_name: input.fileName.trim() || null, address: input.address.trim(), sent_by_workspace: input.sentByWorkspace,
  }).select("id").single();
  if (error || !company) return { ok: false, error: error?.code === "23505" ? "companyExists" : "save" };

  const key = await workspaceKey(supabase, workspaceId);
  const { error: fileError } = await supabase.from("case_files").insert({
    company_id: company.id, workspace_id: workspaceId, payload: sealCase(EMPTY_DOCUMENT, key, workspaceId, company.id),
  });
  if (fileError) return { ok: false, error: "save" };
  revalidatePath("/app");
  return { ok: true, id: company.id };
}

export async function updateCompany(id: string, input: { name: string; fileName: string; address: string; sentByWorkspace: boolean }): Promise<ActionResult> {
  const { supabase } = await session();
  if (!input.name.trim()) return { ok: false, error: "nameRequired" };
  if (input.address.trim().length > 35 || input.fileName.trim().length > 27) return { ok: false, error: "tooLong" };
  const { error, data } = await supabase.from("companies").update({
    name: input.name.trim().slice(0, 100), file_name: input.fileName.trim() || null,
    address: input.address.trim(), sent_by_workspace: input.sentByWorkspace,
  }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "notAllowed" };
  revalidatePath(`/app/c/${id}`, "layout");
  return { ok: true };
}

// ---------- Saving a case ----------

/**
 * Save the case. Refused if someone else saved since this copy was loaded, so team members
 * can't overwrite each other without noticing.
 */
export async function saveCase(companyId: string, project: Project, revision: number): Promise<ActionResult<{ revision: number }> | { ok: false; error: "conflict" }> {
  const { supabase, user } = await session();
  const { data: company } = await supabase.from("companies").select("workspace_id").eq("id", companyId).single();
  if (!company) return { ok: false, error: "notAllowed" };
  const document = { securities: project.securities, persons: project.persons, reports: project.reports };
  if (JSON.stringify(document).length > MAX_DOCUMENT_BYTES) return { ok: false, error: "tooLarge" };

  const key = await workspaceKey(supabase, company.workspace_id);
  const { data, error } = await supabase.from("case_files").update({
    payload: sealCase(document, key, company.workspace_id, companyId),
    revision: revision + 1,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }).eq("company_id", companyId).eq("revision", revision).select("revision");
  if (error) return { ok: false, error: "save" };
  if (!data?.length) return { ok: false, error: "conflict" };
  return { ok: true, revision: revision + 1 };
}

// ---------- Files for SKAT, history and corrections ----------

function rowsOfFile(bytes: Uint8Array): Row[] {
  return parseFile(decodeWindows1252(bytes)).rows.map((r) => r.row);
}

/** What SKAT holds for a report: the accepted files replayed in order. */
async function acceptedRows(db: Db, companyId: string, reportId: string): Promise<{ any: boolean; rows: Row[] }> {
  const { data } = await db.from("submissions").select("id").eq("company_id", companyId).eq("report_id", reportId).eq("status", "accepted").order("created_at", { ascending: true });
  const files: Row[][] = [];
  for (const { id } of data ?? []) {
    const sub = await readSubmissionBytes(db, id);
    if (sub) files.push(rowsOfFile(sub.bytes));
  }
  return { any: files.length > 0, rows: acceptedState(files) };
}

function currentRows(project: Project, report: Report): Row[] {
  return acceptedState([expandReport(project, report).rows.map((r) => r.row)]);
}

export async function correctionPreview(companyId: string, reportId: string): Promise<CorrectionPreview> {
  const { supabase } = await session();
  const loaded = await loadCase(supabase, companyId);
  const report = loaded?.project.reports.find((r) => r.id === reportId);
  if (!loaded || !report) return { hasAccepted: false, changes: [] };
  const accepted = await acceptedRows(supabase, companyId, reportId);
  if (!accepted.any) return { hasAccepted: false, changes: [] };
  const { changes } = buildCorrection(accepted.rows, currentRows(loaded.project, report), report.scenario);
  return { hasAccepted: true, changes: [...changes] };
}

/**
 * Make the file for SKAT from what is saved, and keep it in the history. If SKAT has already
 * accepted a file for this report, this makes a correction file with only the differences.
 */
export async function makeFile(companyId: string, reportId: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await session();
  const loaded = await loadCase(supabase, companyId);
  const report = loaded?.project.reports.find((r) => r.id === reportId);
  if (!loaded || !report) return { ok: false, error: "notAllowed" };
  const { project, company } = loaded;

  if (checkReport(project, report).some((i) => i.severity === "error")) return { ok: false, error: "hasErrors" };

  const accepted = await acceptedRows(supabase, companyId, reportId);
  let rows: readonly Row[] = expandReport(project, report).rows.map((r) => r.row);
  if (accepted.any) {
    rows = buildCorrection(accepted.rows, currentRows(project, report), report.scenario).rows;
    if (rows.length === 0) return { ok: false, error: "nothingToCorrect" };
    if (validateRows(rows, { scenario: report.scenario, incomeYear: report.incomeYear }).some((i) => i.severity === "error")) {
      return { ok: false, error: "hasErrors" };
    }
  }

  const bytes = encodeWindows1252(buildFile({ sender: senderOf(project), rows, version: TEMPLATE_VERSION[report.scenario] }));
  let total = 0n;
  for (const row of rows) {
    const amount = BigInt(/^\d+$/.test(row.NTOAFRBSKVALBLB ?? "") ? row.NTOAFRBSKVALBLB! : "0");
    total += row.NTOAFRBSKVALFTG === "-" ? -amount : amount;
  }
  const key = await workspaceKey(supabase, company.workspace_id);
  const baseName = reportFileName(project, report);
  const { data, error } = await supabase.from("submissions").insert({
    company_id: companyId,
    workspace_id: company.workspace_id,
    report_id: reportId,
    scenario: report.scenario,
    income_year: report.incomeYear,
    file_name: accepted.any ? baseName.replace(/\.txt$/, "_rettelse.txt") : baseName,
    sha256: sha256Hex(bytes),
    record_count: rows.length,
    total_ore: Number(total),
    payload: seal(bytes, key, submissionContext(company.workspace_id, companyId)),
    is_correction: accepted.any,
    created_by: user.id,
  }).select("id").single();
  if (error || !data) return { ok: false, error: "save" };
  revalidatePath(`/app/c/${companyId}`, "layout");
  return { ok: true, id: data.id };
}

export async function setSubmissionStatus(companyId: string, id: string, status: "made" | "accepted" | "rejected"): Promise<ActionResult> {
  const { supabase } = await session();
  const { error, data } = await supabase.from("submissions").update({ status }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "notAllowed" };
  revalidatePath(`/app/c/${companyId}`, "layout");
  return { ok: true };
}

/** The rows of a sent file, with what the user pasted from SKAT matched to them. */
export async function matchSkatErrors(submissionId: string, pasted: string): Promise<ActionResult<SentRowsMatch & { rows: Row[] }>> {
  const { supabase } = await session();
  if (pasted.length > 2_000_000) return { ok: false, error: "tooLarge" };
  const sub = await readSubmissionBytes(supabase, submissionId);
  if (!sub) return { ok: false, error: "notAllowed" };
  const rows = rowsOfFile(sub.bytes);
  const errors = parseSkatErrors(pasted);
  return { ok: true, errors, matches: matchErrorsToRows(errors, rows), rows };
}

// ---------- Exchange rates ----------

/**
 * The rate from Danmarks Nationalbank via Statistics Denmark: DKK per 100, the unit SKAT uses.
 * Only the currency and date leave our server, never anything about a person. No rate on a
 * weekend or holiday, so it steps back to the last banking day.
 */
export async function fetchExchangeRate(currency: string, isoDate: string): Promise<ActionResult<{ rate: string; date: string }>> {
  await session();
  if (!/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return { ok: false, error: "rateUnavailable" };
  const day = new Date(`${isoDate}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(day.getTime() - i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const tid = `${iso.slice(0, 4)}M${iso.slice(5, 7)}D${iso.slice(8, 10)}`;
    try {
      const res = await fetch("https://api.statbank.dk/v1/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "DNVALD", format: "CSV", lang: "en", variables: [
          { code: "VALUTA", values: [currency] }, { code: "KURTYP", values: ["KBH"] }, { code: "Tid", values: [tid] },
        ] }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, error: "rateUnavailable" };
      const value = (await res.text()).trim().split("\n").at(-1)?.split(";").at(-1)?.trim() ?? "";
      const parsed = toFixedDigits(value, 6, "en");
      if (parsed.ok && parsed.digits !== "0") return { ok: true, rate: parsed.digits, date: iso };
    } catch {
      return { ok: false, error: "rateUnavailable" };
    }
  }
  return { ok: false, error: "rateUnavailable" };
}
