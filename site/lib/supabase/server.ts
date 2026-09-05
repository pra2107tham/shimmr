// The server client. Used from Server Components, Route Handlers, and
// proxy.ts — anywhere that reads or writes the session cookie on the server.
//
// Server Components can read cookies but cannot write them (Next.js forbids
// it outside a Route Handler or Server Action). setAll is wrapped in a
// try/catch for exactly that case: proxy.ts already refreshes the session on
// every request, so a Server Component that cannot persist a refreshed token
// is not a bug, just a context where the write is someone else's job.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set " +
        "(Vercel project settings -> Environment Variables). See site/README.md.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — proxy.ts's session
          // refresh already covers this request; nothing lost.
        }
      },
    },
  });
}
