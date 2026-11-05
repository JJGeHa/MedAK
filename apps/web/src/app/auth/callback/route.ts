import { type NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/format";

/**
 * Where email links and Google, Microsoft and SSO sign-ins land. Signing in here only passes the
 * first step: the session still has to pass two-factor before it can reach any data.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const next = safeNext(params.get("next"));
  let failed = params.has("error") || !code;
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  }
  if (failed) {
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("error", "link");
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
