import type { WorkspaceRow } from "@/lib/types";
import { session } from "./data";

/** The signed-in user's profile, workspaces and the one they are working in. */
export async function appContext() {
  const { supabase, user } = await session();
  const { data: profile } = await supabase.from("profiles").select("display_name, language, deadline_reminders, active_workspace_id").eq("user_id", user.id).single();
  const { data: workspaces } = await supabase.from("workspaces").select("id, name, sender_se, sender_name, sender_address").order("created_at");
  const list = (workspaces ?? []) as WorkspaceRow[];
  const active = list.find((w) => w.id === profile?.active_workspace_id) ?? list[0] ?? null;
  const { data: membership } = active
    ? await supabase.from("workspace_members").select("role").eq("workspace_id", active.id).eq("user_id", user.id).single()
    : { data: null };
  return { supabase, user, profile, workspaces: list, active, isOwner: membership?.role === "owner" };
}
