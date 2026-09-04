// Runs on every request. Two jobs:
//
//  1. Refresh the Supabase session cookie so it does not expire out from
//     under a Server Component mid-visit — Server Components cannot write
//     cookies themselves (see lib/supabase/server.ts), so this is the one
//     place that reliably can.
//  2. Gate /dashboard: no session, no access. This is defence in depth —
//     the dashboard page checks again server-side before rendering anything
//     — but a redirect here means an unauthenticated visitor never even
//     requests the page.
//
// Named proxy.ts, not middleware.ts: Next.js 16 renamed the convention (the
// exported function is `proxy`, not `middleware`). See ADR — er, see the
// site's own AGENTS.md, which exists for exactly this kind of thing.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard"];

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Degrade to "not signed in" rather than crash the whole site if the env
  // vars are missing — the marketing page has to keep working either way.
  if (!url || !key) {
    if (PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p))) {
    const redirectTo = new URL("/login", request.url);
    redirectTo.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectTo);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and Next's own internals — cheap to
    // run, and the session needs refreshing on any page, not only /dashboard.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
