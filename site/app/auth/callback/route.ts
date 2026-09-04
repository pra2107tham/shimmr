// Where a magic-link email sends someone back. Supabase's link points here
// with a PKCE `code`; this exchanges it for a session (setting the cookie
// via the server client) and sends the person on to wherever they were
// headed — /dashboard by default, or back to whatever page asked them to
// sign in first.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") || "/dashboard";

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  const failed = new URL("/login", request.url);
  failed.searchParams.set("error", "link_expired");
  return NextResponse.redirect(failed);
}
