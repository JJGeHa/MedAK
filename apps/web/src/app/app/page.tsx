import Link from "next/link";
import { CreateCompanyForm, CreateWorkspaceForm } from "@/components/Dashboard";
import { annualDeadline, daysUntil, likelyIncomeYear } from "@/lib/format";
import type { CompanyRow, Lang } from "@/lib/types";
import { appContext } from "@/server/context";
import { getLang } from "@/server/lang";

const t = (lang: Lang) => (da: string, en: string) => (lang === "da" ? da : en);

export default async function DashboardPage() {
  const { supabase, active, profile } = await appContext();
  const tr = t(await getLang());

  if (!active) {
    return (
      <main className="page narrow">
        <div className="panel">
          <div className="stack">
            <h1>{tr("Velkommen til MedAK", "Welcome to MedAK")}</h1>
            <p className="lead">{tr(
              "Start med at oprette et arbejdsområde. Det er jeres fælles sted: et selskabs økonomiafdeling, eller et rådgiverfirma med flere kunder. Du kan invitere kolleger bagefter.",
              "Start by creating a workspace. It's your team's shared place: a company's finance team, or an advisor firm with several clients. You can invite colleagues afterwards.",
            )}</p>
          </div>
          <CreateWorkspaceForm />
        </div>
      </main>
    );
  }

  const { data } = await supabase.from("companies").select("id, workspace_id, se_number, name, file_name, address, sent_by_workspace").eq("workspace_id", active.id).order("name");
  const companies = (data ?? []) as CompanyRow[];
  const today = new Date();
  const year = likelyIncomeYear(today);
  const deadline = annualDeadline(year);
  const days = daysUntil(deadline, today);
  const lang = await getLang();
  const deadlineText = deadline.toLocaleDateString(lang === "da" ? "da-DK" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <main className="page narrow">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{tr("Selskaber", "Companies")}</h1>
        {profile?.deadline_reminders !== false ? (
          <span className={`chip ${days <= 30 ? "warn" : ""}`}>
            {tr(`Frist for ${year}: ${deadlineText} (om ${days} dage)`, `Deadline for ${year}: ${deadlineText} (in ${days} days)`)}
          </span>
        ) : null}
      </div>
      {companies.length > 0 ? (
        <div className="list">
          {companies.map((c) => (
            <Link key={c.id} href={`/app/c/${c.id}`} className="list-item">
              <div>
                <div style={{ fontWeight: 500 }}>{c.name}</div>
                <div className="small muted mono">{tr("Cvr", "CVR")} {c.se_number}</div>
              </div>
              <span className="muted" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">{tr("Ingen selskaber endnu. Tilføj det første herunder.", "No companies yet. Add the first one below.")}</div>
      )}
      <div className="panel">
        <h2>{tr("Tilføj selskab", "Add a company")}</h2>
        <CreateCompanyForm workspaceId={active.id} hasSender={Boolean(active.sender_se)} />
      </div>
    </main>
  );
}
