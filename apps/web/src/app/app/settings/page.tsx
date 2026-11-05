import { SettingsView } from "@/components/Settings";
import { appContext } from "@/server/context";
import { getLang } from "@/server/lang";

export default async function SettingsPage() {
  const { supabase, user, profile, active, isOwner } = await appContext();
  const lang = await getLang();
  const { data: members } = active ? await supabase.rpc("workspace_member_list", { ws: active.id }) : { data: [] };
  const { data: invites } = active && isOwner
    ? await supabase.from("workspace_invites").select("id, email, role, expires_at, accepted_at").eq("workspace_id", active.id).is("accepted_at", null).order("created_at")
    : { data: [] };
  const { data: audit } = active && isOwner
    ? await supabase.from("audit_log").select("id, actor, action, target, at").eq("workspace_id", active.id).order("id", { ascending: false }).limit(30)
    : { data: [] };

  return (
    <main className="page narrow">
      <h1>{lang === "da" ? "Indstillinger" : "Settings"}</h1>
      <SettingsView
        userId={user.id}
        email={user.email ?? ""}
        profile={{
          displayName: profile?.display_name ?? "",
          language: profile?.language === "en" ? "en" : "da",
          deadlineReminders: profile?.deadline_reminders !== false,
        }}
        workspace={active}
        isOwner={isOwner}
        members={(members ?? []) as { user_id: string; display_name: string; email: string; role: "owner" | "member" }[]}
        invites={(invites ?? []) as { id: string; email: string; role: string; expires_at: string }[]}
        audit={(audit ?? []) as { id: number; actor: string | null; action: string; target: string | null; at: string }[]}
      />
    </main>
  );
}
