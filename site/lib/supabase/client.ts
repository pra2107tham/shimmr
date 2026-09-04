// The browser client. Used from Client Components — the login form and the
// dashboard's realtime feed.
//
// NEXT_PUBLIC_SUPABASE_ANON_KEY is meant to be public: it identifies the
// project, not a caller. What actually protects data is Postgres row-level
// security (supabase/migrations/20260905000000_web_auth_and_dashboard.sql),
// the same way an API base URL is public but the tokens sent to it are not.
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set " +
        "(Vercel project settings -> Environment Variables). See site/README.md.",
    );
  }
  return createBrowserClient(url, key);
}
