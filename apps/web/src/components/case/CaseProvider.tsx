"use client";

import type { Project } from "@medak/engine";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { saveCase } from "@/server/actions";

type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

interface CaseContextValue {
  companyId: string;
  project: Project;
  update: (change: (p: Project) => Project) => void;
  /** Save now and wait, e.g. before making a file from what is saved. Returns false if it failed. */
  flush: () => Promise<boolean>;
  state: SaveState;
}

const CaseContext = createContext<CaseContextValue | null>(null);

export function useCase(): CaseContextValue {
  const value = useContext(CaseContext);
  if (!value) throw new Error("useCase outside CaseProvider");
  return value;
}

const SAVE_DELAY_MS = 800;

/**
 * Holds the case while it's being edited and saves it automatically. If a colleague saved in the
 * meantime, the save is refused and the user is told, rather than overwriting their work.
 */
export function CaseProvider(props: { companyId: string; project: Project; revision: number; children: ReactNode }) {
  const [project, setProject] = useState(props.project);
  const [state, setState] = useState<SaveState>("saved");
  const latest = useRef(props.project);
  const revision = useRef(props.revision);
  const timer = useRef<number | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const dirty = useRef(false);

  const runSave = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return true;
    dirty.current = false;
    setState("saving");
    const attempt = (async () => {
      try {
        const result = await saveCase(props.companyId, latest.current, revision.current);
        if (result.ok) {
          revision.current = result.revision;
          if (!dirty.current) setState("saved");
          return true;
        }
        dirty.current = true;
        setState(result.error === "conflict" ? "conflict" : "error");
        return false;
      } catch {
        dirty.current = true;
        setState("error");
        return false;
      }
    })();
    inFlight.current = attempt;
    const ok = await attempt;
    inFlight.current = null;
    return ok;
  }, [props.companyId]);

  const update = useCallback((change: (p: Project) => Project) => {
    const next = change(latest.current);
    latest.current = next;
    setProject(next);
    dirty.current = true;
    setState((s) => (s === "conflict" ? s : "dirty"));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void runSave(); }, SAVE_DELAY_MS);
  }, [runSave]);

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    return runSave();
  }, [runSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return (
    <CaseContext.Provider value={{ companyId: props.companyId, project, update, flush, state }}>
      {props.children}
    </CaseContext.Provider>
  );
}

export function SaveIndicator() {
  const { state } = useCase();
  const { t } = useT();
  if (state === "conflict") {
    return (
      <span className="save-state bad" role="alert">
        {t("En kollega har ændret sagen. ", "A colleague has changed this case. ")}
        <button className="btn link" onClick={() => window.location.reload()}>{t("Indlæs igen", "Reload")}</button>
      </span>
    );
  }
  if (state === "error") return <span className="save-state bad" role="alert">{t("Kunne ikke gemme. Prøver igen ved næste ændring.", "Couldn't save. Will retry on your next change.")}</span>;
  return <span className="save-state">{state === "saved" ? t("Gemt", "Saved") : t("Gemmer …", "Saving …")}</span>;
}
