// Runs on every request. Two jobs:
//
//  1. Refresh the Supabase session cookie so it does not expire out from
//     under a Server Component mid-visit — Server Components cannot write
//     cookies themselves (see lib/supabase/server.ts), so this is the one
//     place that reliably can.
//  2. Gate /dashboard and /cli-auth: no session, no access. This is defence
//     in depth — both pages check again server-side before rendering
//     anything — but a redirect here means an unauthenticated visitor never
//     even requests the page.
//
// Named proxy.ts, not middleware.ts: Next.js 16 renamed the convention (the
// exported function is `proxy`, not `middleware`). See the site's own
// AGENTS.md, which exists for exactly this kind of thing.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/cli-auth"];

// /cli-auth?flow=signup means the CLI ran `shimmr signup`, not `shimmr
// login` — an unauthenticated visitor should land wherever that command
// would have sent them anyway (a place to create an account, not just sign
// into one), same distinction the --email path has always drawn between
// the two commands.
function signInRouteFor(request: NextRequest): string {
  if (request.nextUrl.pathname.startsWith("/cli-auth") && request.nextUrl.searchParams.get("flow") === "signup") {
    return "/signup";
  }
  return "/login";
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Degrade to "not signed in" rather than crash the whole site if the env
  // vars are missing — the marketing page has to keep working either way.
  if (!url || !key) {
    if (PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p))) {
      return NextResponse.redirect(new URL(signInRouteFor(request), request.url));
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
    const redirectTo = new URL(signInRouteFor(request), request.url);
    // Path *and* query — /cli-auth?code=...&flow=... needs both back after
    // the sign-in round trip, not just the pathname.
    redirectTo.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectTo);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and Next's own internals — cheap to
    // run, and the session needs refreshing on any page, not only the
    // protected ones.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
