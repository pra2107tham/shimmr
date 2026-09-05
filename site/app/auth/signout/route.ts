// POST-only, and a real Route Handler rather than a client-side call, so it
// works from a plain <form> and clears the session cookie server-side in the
// same response that redirects — nothing left for a stale tab to reuse.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}
