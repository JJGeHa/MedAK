/**
 * Reading and writing case data. Everything runs as the signed-in user, so row-level security
 * applies, and personal data is decrypted only here, on the server, for that user's request.
 */
import { PROJECT_FORMAT, PROJECT_VERSION, type Project } from "@medak/engine";
import { supabaseServer } from "@/lib/supabase/server";
import type { CompanyRow, LoadedCase, SubmissionRow, WorkspaceRow } from "@/lib/types";
import { caseContext, open, seal, submissionContext, unwrapKey } from "./crypto";

export type Db = Awaited<ReturnType<typeof supabaseServer>>;

export async function session() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

export async function workspaceKey(db: Db, workspaceId: string): Promise<Buffer> {
  const { data, error } = await db.from("workspace_keys").select("wrapped_key").eq("workspace_id", workspaceId).single();
  if (error || !data) throw new Error("No access to this workspace");
  return unwrapKey(data.wrapped_key);
}

/** The parts of a project that are stored encrypted. Company and sender come from their tables. */
type CaseDocument = Pick<Project, "securities" | "persons" | "reports">;

export const EMPTY_DOCUMENT: CaseDocument = { securities: [], persons: [], reports: [] };

export function sealCase(document: CaseDocument, key: Buffer, workspaceId: string, companyId: string): string {
  return seal(JSON.stringify(document), key, caseContext(workspaceId, companyId));
}

export function toProject(document: CaseDocument, company: CompanyRow, workspace: WorkspaceRow): Project {
  const useSender = company.sent_by_workspace && workspace.sender_se;
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    company: { seNumber: company.se_number, name: company.file_name || company.name, address: company.address },
    ...(useSender ? { sender: { seNumber: workspace.sender_se!, name: workspace.sender_name ?? "", address: workspace.sender_address ?? "" } } : {}),
    securities: document.securities,
    persons: document.persons,
    reports: document.reports,
  };
}

const SUBMISSION_COLUMNS = "id, report_id, scenario, income_year, file_name, sha256, record_count, total_ore, is_correction, status, created_at";

/** Load and decrypt a company's case. Returns null if it doesn't exist or isn't this user's. */
export async function loadCase(db: Db, companyId: string, opts: { logOpen?: boolean } = {}): Promise<LoadedCase | null> {
  const { data: company } = await db.from("companies").select("id, workspace_id, se_number, name, file_name, address, sent_by_workspace").eq("id", companyId).maybeSingle<CompanyRow>();
  if (!company) return null;
  const { data: workspace } = await db.from("workspaces").select("id, name, sender_se, sender_name, sender_address").eq("id", company.workspace_id).single<WorkspaceRow>();
  const { data: file } = await db.from("case_files").select("payload, revision").eq("company_id", companyId).single();
  if (!workspace || !file) return null;

  const key = await workspaceKey(db, company.workspace_id);
  const document = JSON.parse(open(file.payload, key, caseContext(company.workspace_id, companyId)).toString("utf8")) as CaseDocument;
  if (opts.logOpen) await db.rpc("log_case_opened", { company: companyId });

  const { data: submissions } = await db.from("submissions").select(SUBMISSION_COLUMNS).eq("company_id", companyId).order("created_at", { ascending: false });
  return {
    company,
    workspace,
    project: toProject(document, company, workspace),
    revision: Number(file.revision),
    submissions: (submissions ?? []) as SubmissionRow[],
  };
}

/** The text of a file made for SKAT, decrypted. */
export async function readSubmissionBytes(db: Db, submissionId: string): Promise<{ bytes: Buffer; row: SubmissionRow & { company_id: string; workspace_id: string } } | null> {
  const { data } = await db.from("submissions").select(`${SUBMISSION_COLUMNS}, company_id, workspace_id, payload`).eq("id", submissionId).maybeSingle();
  if (!data) return null;
  const row = data as unknown as SubmissionRow & { company_id: string; workspace_id: string; payload: string };
  const key = await workspaceKey(db, row.workspace_id);
  return { bytes: open(row.payload, key, submissionContext(row.workspace_id, row.company_id)), row };
}
