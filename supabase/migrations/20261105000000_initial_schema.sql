-- MedAK schema. See docs/security.md for the reasoning.
--
-- Access is enforced here, by row-level security on the signed-in user's own session. The web
-- app has no service-role key, so a bug in the app cannot reach another workspace's data.
-- Personal data (CPR numbers, names, addresses) is only ever stored encrypted by the app server:
-- `payload` columns hold ciphertext, and the key is not in this database.

-- ---------- Helpers ----------

-- True when the session has passed two-factor authentication.
create function public.has_mfa() returns boolean
  language sql stable set search_path = ''
  as $$ select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' $$;

-- ---------- Profiles ----------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  language text not null default 'da' check (language in ('da', 'en')),
  deadline_reminders boolean not null default true,
  active_workspace_id uuid,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Workspaces and members ----------

-- A workspace is a team: a company's finance team, or an advisor firm with many clients.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  -- The sender written in the file when an advisor reports on a company's behalf.
  sender_se text check (sender_se ~ '^[0-9]{8}$'),
  sender_name text check (char_length(sender_name) <= 27),
  sender_address text check (char_length(sender_address) <= 35),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_active_workspace_fk foreign key (active_workspace_id)
  references public.workspaces (id) on delete set null;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user on public.workspace_members (user_id);

-- Security definer so policies can ask about membership without recursing into its own policy.
create function public.is_member(ws uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()) $$;

create function public.is_owner(ws uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role = 'owner') $$;

-- A workspace must always have an owner.
create function public.keep_an_owner() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.workspaces w where w.id = old.workspace_id)
     and not exists (
       select 1 from public.workspace_members m
       where m.workspace_id = old.workspace_id and m.role = 'owner' and m.user_id <> old.user_id
     ) then
    raise exception 'A workspace must keep at least one owner' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger workspace_keeps_owner before update or delete on public.workspace_members
  for each row execute function public.keep_an_owner();

-- The workspace's data key, encrypted with the server's master key.
create table public.workspace_keys (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  wrapped_key text not null,
  created_at timestamptz not null default now()
);

-- ---------- Companies and their case data ----------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  se_number text not null check (se_number ~ '^[0-9]{8}$'),
  name text not null check (char_length(name) between 1 and 100),
  -- SKAT's file holds 27 characters of the sender's name; a shorter form for longer names.
  file_name text check (char_length(file_name) <= 27),
  -- As written in the file, which holds 35 characters.
  address text not null default '' check (char_length(address) <= 35),
  -- When true, the file's sender is the workspace's advisor details, not the company itself.
  sent_by_workspace boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, se_number),
  unique (id, workspace_id)
);

-- Everything about a company's reports: shares, people, events. Encrypted as one document.
create table public.case_files (
  company_id uuid primary key,
  workspace_id uuid not null,
  payload text not null check (char_length(payload) <= 15000000),
  -- Goes up on every save. A save based on an old revision is refused, so team members
  -- cannot silently overwrite each other's work.
  revision bigint not null default 1,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (company_id, workspace_id) references public.companies (id, workspace_id) on delete cascade
);

-- A file made for sending to SKAT. Kept to support the 5-year retention duty, so it cannot be
-- edited or deleted through the app; only its status can change.
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  workspace_id uuid not null,
  report_id text not null,
  scenario text not null check (scenario in ('A', 'B', 'C', 'D')),
  income_year text not null check (income_year ~ '^[0-9]{4}$'),
  file_name text not null,
  sha256 text not null,
  record_count integer not null,
  total_ore bigint not null,
  payload text not null check (char_length(payload) <= 15000000),
  is_correction boolean not null default false,
  status text not null default 'made' check (status in ('made', 'accepted', 'rejected')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, workspace_id) references public.companies (id, workspace_id) on delete restrict
);
create index submissions_company on public.submissions (company_id, created_at desc);

create function public.only_status_changes() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Only the status of a submission can change' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger submissions_only_status before update on public.submissions
  for each row execute function public.only_status_changes();

-- ---------- Invitations ----------

-- The token itself is only in the link the owner shares; this holds its hash.
create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 320),
  role text not null default 'member' check (role in ('owner', 'member')),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index workspace_invites_workspace on public.workspace_invites (workspace_id);

-- ---------- Audit log ----------

-- Who did what, without personal data. Written by triggers, so it can't be skipped, and no
-- role can change it through the API.
create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor uuid,
  action text not null check (char_length(action) <= 50),
  target text check (char_length(target) <= 100),
  at timestamptz not null default now()
);
create index audit_log_workspace on public.audit_log (workspace_id, at desc);

create function public.write_audit() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
  ws uuid := (case when tg_table_name = 'workspaces' then row_data ->> 'id' else row_data ->> 'workspace_id' end)::uuid;
  tgt text := case tg_table_name
    when 'case_files' then row_data ->> 'company_id'
    when 'workspace_members' then row_data ->> 'user_id'
    when 'workspace_invites' then row_data ->> 'id'
    else row_data ->> 'id' end;
begin
  -- Nothing to record against once the workspace itself is being removed.
  if exists (select 1 from public.workspaces w where w.id = ws) then
    insert into public.audit_log (workspace_id, actor, action, target)
    values (ws, auth.uid(), tg_table_name || '.' || lower(tg_op), tgt);
  end if;
  return coalesce(new, old);
end $$;

create trigger audit_companies after insert or update or delete on public.companies
  for each row execute function public.write_audit();
create trigger audit_case_files after insert or update on public.case_files
  for each row execute function public.write_audit();
create trigger audit_submissions after insert or update on public.submissions
  for each row execute function public.write_audit();
create trigger audit_members after insert or update or delete on public.workspace_members
  for each row execute function public.write_audit();
create trigger audit_invites after insert or update or delete on public.workspace_invites
  for each row execute function public.write_audit();

-- Reading personal data is worth recording too; the server calls this when it opens a case.
create function public.log_case_opened(company uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare
  ws uuid;
begin
  select c.workspace_id into ws from public.companies c where c.id = company;
  if ws is null or not public.is_member(ws) or not public.has_mfa() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  insert into public.audit_log (workspace_id, actor, action, target)
  values (ws, auth.uid(), 'case_files.open', company::text);
end $$;

-- ---------- Functions for steps a policy alone can't express ----------

-- Creating a workspace, its first owner and its key in one step.
create function public.create_workspace(workspace_name text, wrapped_key text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare
  ws uuid;
begin
  if auth.uid() is null or not public.has_mfa() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  insert into public.workspaces (name) values (workspace_name) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  insert into public.workspace_keys (workspace_id, wrapped_key) values (ws, create_workspace.wrapped_key);
  update public.profiles set active_workspace_id = ws where user_id = auth.uid();
  return ws;
end $$;

-- Accepting an invitation requires being signed in with the invited, verified email address.
create function public.accept_invite(token text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare
  inv public.workspace_invites;
  hash text := encode(pg_catalog.sha256(convert_to(token, 'UTF8')), 'hex');
begin
  if auth.uid() is null or not public.has_mfa() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into inv from public.workspace_invites i
    where i.token_hash = hash and i.accepted_at is null and i.expires_at > now();
  if inv.id is null or inv.email <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Invitation not valid for this account' using errcode = 'insufficient_privilege';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, auth.uid(), inv.role)
    on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_at = now() where id = inv.id;
  update public.profiles set active_workspace_id = inv.workspace_id where user_id = auth.uid();
  return inv.workspace_id;
end $$;

-- Team members' names and email addresses, for co-members only.
create function public.workspace_member_list(ws uuid)
  returns table (user_id uuid, display_name text, email text, role text)
  language plpgsql stable security definer set search_path = ''
  as $$
begin
  if not public.is_member(ws) or not public.has_mfa() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
    select m.user_id, p.display_name, u.email::text, m.role
    from public.workspace_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.workspace_id = ws
    order by m.created_at;
end $$;

-- ---------- Row-level security ----------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_keys enable row level security;
alter table public.companies enable row level security;
alter table public.case_files enable row level security;
alter table public.submissions enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.audit_log enable row level security;

-- Your own profile. Available before two-factor is set up, since it only holds preferences.
create policy profiles_own_select on public.profiles for select to authenticated
  using (user_id = auth.uid());
create policy profiles_own_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_member(id) and public.has_mfa());
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_owner(id) and public.has_mfa()) with check (public.is_owner(id) and public.has_mfa());

create policy members_select on public.workspace_members for select to authenticated
  using (public.is_member(workspace_id) and public.has_mfa());
create policy members_update on public.workspace_members for update to authenticated
  using (public.is_owner(workspace_id) and public.has_mfa()) with check (public.is_owner(workspace_id) and public.has_mfa());
-- Owners can remove anyone; anyone can leave.
create policy members_delete on public.workspace_members for delete to authenticated
  using ((public.is_owner(workspace_id) or user_id = auth.uid()) and public.has_mfa());

create policy keys_select on public.workspace_keys for select to authenticated
  using (public.is_member(workspace_id) and public.has_mfa());

create policy companies_select on public.companies for select to authenticated
  using (public.is_member(workspace_id) and public.has_mfa());
create policy companies_insert on public.companies for insert to authenticated
  with check (public.is_member(workspace_id) and public.has_mfa());
create policy companies_update on public.companies for update to authenticated
  using (public.is_member(workspace_id) and public.has_mfa()) with check (public.is_member(workspace_id) and public.has_mfa());
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_owner(workspace_id) and public.has_mfa());

create policy case_files_select on public.case_files for select to authenticated
  using (public.is_member(workspace_id) and public.has_mfa());
create policy case_files_insert on public.case_files for insert to authenticated
  with check (public.is_member(workspace_id) and public.has_mfa());
create policy case_files_update on public.case_files for update to authenticated
  using (public.is_member(workspace_id) and public.has_mfa()) with check (public.is_member(workspace_id) and public.has_mfa());

create policy submissions_select on public.submissions for select to authenticated
  using (public.is_member(workspace_id) and public.has_mfa());
create policy submissions_insert on public.submissions for insert to authenticated
  with check (public.is_member(workspace_id) and public.has_mfa() and created_by = auth.uid());
create policy submissions_update on public.submissions for update to authenticated
  using (public.is_member(workspace_id) and public.has_mfa()) with check (public.is_member(workspace_id) and public.has_mfa());

create policy invites_select on public.workspace_invites for select to authenticated
  using (public.is_owner(workspace_id) and public.has_mfa());
create policy invites_insert on public.workspace_invites for insert to authenticated
  with check (public.is_owner(workspace_id) and public.has_mfa() and invited_by = auth.uid());
create policy invites_delete on public.workspace_invites for delete to authenticated
  using (public.is_owner(workspace_id) and public.has_mfa());

create policy audit_select on public.audit_log for select to authenticated
  using (public.is_owner(workspace_id) and public.has_mfa());

-- ---------- Privileges ----------

-- Nothing for signed-out visitors, and only the operations each table is meant to allow.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select, update (display_name, language, deadline_reminders, active_workspace_id) on public.profiles to authenticated;
grant select, update (name, sender_se, sender_name, sender_address) on public.workspaces to authenticated;
grant select, delete, update (role) on public.workspace_members to authenticated;
grant select on public.workspace_keys to authenticated;
grant select, insert, delete, update (name, file_name, address, sent_by_workspace) on public.companies to authenticated;
grant select, insert, update (payload, revision, updated_by, updated_at) on public.case_files to authenticated;
grant select, insert, update (status) on public.submissions to authenticated;
grant select, insert, delete on public.workspace_invites to authenticated;
grant select on public.audit_log to authenticated;

grant execute on function public.has_mfa() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.workspace_member_list(uuid) to authenticated;
grant execute on function public.log_case_opened(uuid) to authenticated;
