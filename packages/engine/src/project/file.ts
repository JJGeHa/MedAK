/**
 * A project as a file, for export and backup. It holds CPR numbers in plain text, so whoever
 * exports one is responsible for keeping it safe.
 */
import { PROJECT_FORMAT, PROJECT_VERSION, type Project } from "./types.ts";

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2) + "\n";
}

export type ProjectFileProblem = "notJson" | "notAProject" | "newerVersion";

export class ProjectFileError extends Error {
  readonly problem: ProjectFileProblem;
  constructor(problem: ProjectFileProblem) {
    super(`Cannot open project file: ${problem}`);
    this.name = "ProjectFileError";
    this.problem = problem;
  }
}

/**
 * Read a project file. Checks that it is a project of a version this code understands;
 * the contents are checked by checkReport like anything the user types.
 * @throws ProjectFileError
 */
export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFileError("notJson");
  }
  const p = data as Partial<Project> | null;
  if (
    typeof p !== "object" || p === null || p.format !== PROJECT_FORMAT || typeof p.version !== "number" ||
    typeof p.company !== "object" || !Array.isArray(p.securities) || !Array.isArray(p.persons) || !Array.isArray(p.reports)
  ) {
    throw new ProjectFileError("notAProject");
  }
  if (p.version > PROJECT_VERSION) throw new ProjectFileError("newerVersion");
  return p as Project;
}
