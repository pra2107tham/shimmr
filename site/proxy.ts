// Runs on every request the matcher below lets through — /dashboard and
// /cli-auth only, not the whole site. Two jobs, both scoped to those two
// pages:
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
// This used to match every route in the site, on the reasoning that a
// session refresh is cheap and might as well happen everywhere. It isn't
// cheap: it's a network round trip to Supabase Auth, paid by every visitor
// on every navigation, including to `/`, `/how-it-works`, `/use-it`,
// `/security` and `/download` — none of which read the session server-side
// at all (SiteNav's auth state is a client-side check, see
// NavAuthLinks.tsx). That round trip was the single biggest thing making
// the site feel slow. Only the two routes that actually gate on a session
// need this middleware to run.
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
  // Only the routes PROTECTED actually gates. Every other route — the
  // marketing pages, /login, /signup, /auth/* — renders with no server-side
  // session check at all, so running this here bought them nothing but a
  // Supabase round trip on every load.
  matcher: ["/dashboard/:path*", "/cli-auth/:path*"],
};
