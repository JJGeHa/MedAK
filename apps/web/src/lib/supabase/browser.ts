import { createBrowserClient } from "@supabase/ssr";

/** Used only for signing in and two-factor. All case data goes through the server. */
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
