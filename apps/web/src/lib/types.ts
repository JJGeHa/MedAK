import type { CorrectionChange, Project, SkatError } from "@medak/engine";

export type Lang = "da" | "en";

export interface CompanyRow {
  id: string;
  workspace_id: string;
  se_number: string;
  name: string;
  file_name: string | null;
  address: string;
  sent_by_workspace: boolean;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  sender_se: string | null;
  sender_name: string | null;
  sender_address: string | null;
}

export interface SubmissionRow {
  id: string;
  report_id: string;
  scenario: string;
  income_year: string;
  file_name: string;
  sha256: string;
  record_count: number;
  total_ore: number;
  is_correction: boolean;
  status: "made" | "accepted" | "rejected";
  created_at: string;
}

export interface LoadedCase {
  company: CompanyRow;
  workspace: WorkspaceRow;
  project: Project;
  revision: number;
  submissions: SubmissionRow[];
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface CorrectionPreview {
  hasAccepted: boolean;
  changes: CorrectionChange[];
}

export interface SentRowsMatch {
  errors: SkatError[];
  matches: (number | null)[];
}
