/**
 * Tests the database's access rules against the real migration, in an in-memory Postgres.
 * Supabase's auth schema is stubbed with the same functions the policies use.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const migrations = join(import.meta.dirname, "../../../supabase/migrations");

const AUTH_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

const ANNA = "00000000-0000-4000-8000-00000000000a";
const BO = "00000000-0000-4000-8000-00000000000b";
const EVE = "00000000-0000-4000-8000-00000000000e";

let db: PGlite;

/** Run statements as a user: "anon", or a user id with or without two-factor. */
async function as<T = Record<string, unknown>>(
  who: { sub: string; email?: string; aal?: string } | "anon",
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const claims = who === "anon" ? "{}" : JSON.stringify({ aal: "aal2", ...who });
  await db.exec(`set role ${who === "anon" ? "anon" : "authenticated"}; select set_config('request.jwt.claims', '${claims}', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
  }
}

const anna = { sub: ANNA, email: "anna@example.com" };
const bo = { sub: BO, email: "bo@example.com" };
const eve = { sub: EVE, email: "eve@example.com" };

let ws: string;
let company: string;

async function sha256(token: string): Promise<string> {
  const r = await db.query<{ h: string }>(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') h`, [token]);
  return r.rows[0]!.h;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const file of readdirSync(migrations).sort()) {
    await db.exec(readFileSync(join(migrations, file), "utf8"));
  }
  for (const u of [anna, bo, eve]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  const [row] = await as<{ id: string }>(anna, `select public.create_workspace('Nordlys', 'wrapped') as id`);
  ws = row!.id;
  const [c] = await as<{ id: string }>(anna, `insert into public.companies (workspace_id, se_number, name) values ($1, '12345674', 'Nordlys ApS') returning id`, [ws]);
  company = c!.id;
  await as(anna, `insert into public.case_files (company_id, workspace_id, payload) values ($1, $2, 'ciphertext')`, [company, ws]);
});

describe("signed-out visitors", () => {
  it.each(["profiles", "workspaces", "workspace_members", "workspace_keys", "companies", "case_files", "submissions", "workspace_invites", "audit_log"])(
    "cannot read %s",
    async (table) => {
      await expect(as("anon", `select * from public.${table}`)).rejects.toThrow(/permission denied/);
    },
  );

  it("cannot call the workspace functions", async () => {
    await expect(as("anon", `select public.create_workspace('x', 'y')`)).rejects.toThrow(/permission denied/);
    await expect(as("anon", `select public.accept_invite('x')`)).rejects.toThrow(/permission denied/);
  });
});

describe("two-factor authentication", () => {
  const noMfa = { sub: ANNA, email: "anna@example.com", aal: "aal1" };

  it("is required to read case data, even for a member", async () => {
    expect(await as(noMfa, `select * from public.case_files`)).toEqual([]);
    expect(await as(noMfa, `select * from public.companies`)).toEqual([]);
    expect(await as(noMfa, `select * from public.workspace_keys`)).toEqual([]);
    expect(await as(anna, `select company_id from public.case_files`)).toHaveLength(1);
  });

  it("is required to write case data", async () => {
    await expect(as(noMfa, `insert into public.companies (workspace_id, se_number, name) values ($1, '87654303', 'X')`, [ws])).rejects.toThrow(/row-level security/);
    expect(await as(noMfa, `update public.case_files set payload = 'hacked' returning company_id`)).toEqual([]);
  });

  it("is required to create a workspace", async () => {
    await expect(as(noMfa, `select public.create_workspace('x', 'y')`)).rejects.toThrow(/Not allowed/);
  });

  it("still lets you see your own profile, to finish setting it up", async () => {
    expect(await as(noMfa, `select user_id from public.profiles`)).toEqual([{ user_id: ANNA }]);
  });
});

describe("another workspace's data", () => {
  it("is invisible to a non-member", async () => {
    for (const table of ["workspaces", "companies", "case_files", "workspace_keys", "workspace_members", "submissions"]) {
      expect(await as(eve, `select * from public.${table}`), table).toEqual([]);
    }
  });

  it("cannot be changed or deleted by a non-member", async () => {
    expect(await as(eve, `update public.case_files set payload = 'hacked' returning company_id`)).toEqual([]);
    expect(await as(eve, `update public.companies set name = 'hacked' returning id`)).toEqual([]);
    expect(await as(eve, `delete from public.companies returning id`)).toEqual([]);
    expect(await as(eve, `update public.workspaces set name = 'hacked' returning id`)).toEqual([]);
  });

  it("cannot be added to by a non-member", async () => {
    await expect(as(eve, `insert into public.companies (workspace_id, se_number, name) values ($1, '87654311', 'X')`, [ws])).rejects.toThrow(/row-level security/);
    await expect(as(eve, `insert into public.submissions (company_id, workspace_id, report_id, scenario, income_year, file_name, sha256, record_count, total_ore, payload, created_by) values ($1, $2, 'r', 'B', '2026', 'f', 's', 1, 1, 'p', $3)`, [company, ws, EVE])).rejects.toThrow(/row-level security/);
  });

  it("cannot be reached by pointing your own row at it", async () => {
    const [own] = await as<{ id: string }>(eve, `select public.create_workspace('Eve', 'k') as id`);
    const [empty] = await as<{ id: string }>(anna, `insert into public.companies (workspace_id, se_number, name) values ($1, '87654338', 'No case yet') returning id`, [ws]);
    await expect(
      as(eve, `insert into public.case_files (company_id, workspace_id, payload) values ($1, $2, 'x')`, [empty!.id, own!.id]),
    ).rejects.toThrow(/foreign key/);
  });

  it("cannot be read through the member list", async () => {
    await expect(as(eve, `select * from public.workspace_member_list($1)`, [ws])).rejects.toThrow(/Not allowed/);
  });

  it("cannot be logged as opened", async () => {
    await expect(as(eve, `select public.log_case_opened($1)`, [company])).rejects.toThrow(/Not allowed/);
  });
});

describe("invitations", () => {
  const invite = async (email: string, token: string, extra = "") => {
    const hash = await sha256(token);
    await as(anna, `insert into public.workspace_invites (workspace_id, email, token_hash, invited_by${extra ? ", expires_at" : ""}) values ($1, $2, $3, $4${extra ? `, ${extra}` : ""})`, [ws, email, hash, ANNA]);
  };

  it("can only be created by an owner", async () => {
    const hash = await sha256("eve-token");
    await expect(as(eve, `insert into public.workspace_invites (workspace_id, email, token_hash, invited_by) values ($1, 'x@example.com', $2, $3)`, [ws, hash, EVE])).rejects.toThrow(/row-level security/);
  });

  it("cannot be accepted with someone else's account", async () => {
    await invite("bo@example.com", "for-bo-1");
    await expect(as(eve, `select public.accept_invite('for-bo-1')`)).rejects.toThrow(/not valid/);
    expect(await as(eve, `select * from public.companies where workspace_id = $1`, [ws])).toEqual([]);
  });

  it("cannot be accepted with a wrong token or after it expires", async () => {
    await invite("bo@example.com", "expired", "now() - interval '1 day'");
    await expect(as(bo, `select public.accept_invite('wrong')`)).rejects.toThrow(/not valid/);
    await expect(as(bo, `select public.accept_invite('expired')`)).rejects.toThrow(/not valid/);
  });

  it("makes the invited person a member, once", async () => {
    await as(bo, `select public.accept_invite('for-bo-1')`);
    expect(await as(bo, `select company_id from public.case_files`)).toHaveLength(1);
    await expect(as(bo, `select public.accept_invite('for-bo-1')`)).rejects.toThrow(/not valid/);
    const members = await as<{ email: string; role: string }>(bo, `select email, role from public.workspace_member_list($1)`, [ws]);
    expect(members).toEqual([{ email: "anna@example.com", role: "owner" }, { email: "bo@example.com", role: "member" }]);
  });
});

describe("roles", () => {
  it("members can work on cases but not manage the team or see the audit log", async () => {
    expect(await as(bo, `update public.case_files set payload = 'new', revision = revision + 1 returning company_id`)).toHaveLength(1);
    expect(await as(bo, `update public.workspaces set name = 'x' returning id`)).toEqual([]);
    expect(await as(bo, `update public.workspace_members set role = 'owner' where user_id = $1 returning user_id`, [BO])).toEqual([]);
    expect(await as(bo, `delete from public.workspace_members where user_id = $1 returning user_id`, [ANNA])).toEqual([]);
    expect(await as(bo, `delete from public.companies returning id`)).toEqual([]);
    expect(await as(bo, `select * from public.audit_log`)).toEqual([]);
    expect(await as(bo, `select * from public.workspace_invites`)).toEqual([]);
  });

  it("the last owner cannot leave or be demoted", async () => {
    await expect(as(anna, `delete from public.workspace_members where user_id = $1`, [ANNA])).rejects.toThrow(/at least one owner/);
    await expect(as(anna, `update public.workspace_members set role = 'member' where user_id = $1`, [ANNA])).rejects.toThrow(/at least one owner/);
  });

  it("a removed member loses access immediately", async () => {
    const hash = await sha256("temp");
    const carl = "00000000-0000-4000-8000-00000000000c";
    await db.query(`insert into auth.users (id, email) values ($1, 'carl@example.com')`, [carl]);
    await as(anna, `insert into public.workspace_invites (workspace_id, email, token_hash, invited_by) values ($1, 'carl@example.com', $2, $3)`, [ws, hash, ANNA]);
    const c = { sub: carl, email: "carl@example.com" };
    await as(c, `select public.accept_invite('temp')`);
    expect(await as(c, `select company_id from public.case_files`)).toHaveLength(1);
    await as(anna, `delete from public.workspace_members where user_id = $1`, [carl]);
    expect(await as(c, `select company_id from public.case_files`)).toEqual([]);
  });

  it("users cannot read another user's profile", async () => {
    expect(await as<{ user_id: string }>(bo, `select user_id from public.profiles`)).toEqual([{ user_id: BO }]);
  });

  it("users cannot give themselves a role through a protected column", async () => {
    await expect(as(bo, `update public.workspaces set id = gen_random_uuid()`)).rejects.toThrow(/permission denied/);
  });
});

describe("submissions", () => {
  let id: string;

  beforeAll(async () => {
    const [row] = await as<{ id: string }>(bo, `insert into public.submissions (company_id, workspace_id, report_id, scenario, income_year, file_name, sha256, record_count, total_ore, payload, created_by) values ($1, $2, 'r1', 'B', '2026', 'f.txt', 'abc', 2, 100, 'ciphertext', $3) returning id`, [company, ws, BO]);
    id = row!.id;
  });

  it("can have their status updated", async () => {
    expect(await as(bo, `update public.submissions set status = 'accepted' where id = $1 returning status`, [id])).toEqual([{ status: "accepted" }]);
  });

  it("cannot have their contents changed or be deleted", async () => {
    await expect(as(anna, `update public.submissions set payload = 'forged' where id = $1`, [id])).rejects.toThrow(/permission denied/);
    await expect(as(anna, `delete from public.submissions where id = $1`, [id])).rejects.toThrow(/permission denied/);
  });

  it("keep their company from being deleted, for the 5-year retention duty", async () => {
    await expect(as(anna, `delete from public.companies where id = $1`, [company])).rejects.toThrow(/foreign key/);
  });

  it("cannot be attributed to someone else", async () => {
    await expect(as(bo, `insert into public.submissions (company_id, workspace_id, report_id, scenario, income_year, file_name, sha256, record_count, total_ore, payload, created_by) values ($1, $2, 'r1', 'B', '2026', 'f.txt', 'abc', 2, 100, 'c', $3)`, [company, ws, ANNA])).rejects.toThrow(/row-level security/);
  });
});

describe("audit log", () => {
  it("records actions automatically, and holds no personal data", async () => {
    await as(anna, `update public.case_files set payload = 'again', revision = revision + 1 where company_id = $1`, [company]);
    await as(anna, `select public.log_case_opened($1)`, [company]);
    const rows = await as<{ action: string; actor: string; target: string }>(anna, `select action, actor, target from public.audit_log where target = $1 order by id desc limit 2`, [company]);
    expect(rows).toEqual([
      { action: "case_files.open", actor: ANNA, target: company },
      { action: "case_files.update", actor: ANNA, target: company },
    ]);
  });

  it("cannot be written to, changed or deleted, even by an owner", async () => {
    await expect(as(anna, `insert into public.audit_log (workspace_id, action) values ($1, 'forged')`, [ws])).rejects.toThrow(/permission denied/);
    await expect(as(anna, `update public.audit_log set action = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(as(anna, `delete from public.audit_log`)).rejects.toThrow(/permission denied/);
  });
});

describe("the schema", () => {
  it("has row-level security on every table", async () => {
    const r = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(r.rows).toEqual([]);
  });

  it("does not store personal data in plain columns", async () => {
    const r = await db.query<{ column_name: string }>(`
      select column_name from information_schema.columns where table_schema = 'public'
      and column_name ~* '(cpr|tin|birth|pnr|person)'`);
    expect(r.rows).toEqual([]);
  });
});
