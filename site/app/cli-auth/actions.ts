"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

// Runs entirely server-side: the session's access token never reaches the
// browser as anything other than the httpOnly cookie it already lives in.
// This is the click that turns into the real check — cli_claim verifies
// the token this pulls from the session, not anything the form itself
// carries.
export async function claimCliCode(formData: FormData) {
  const code = String(formData.get("code") ?? "");

  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/cli-auth?code=${code}`)}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    redirect(`/cli-auth?code=${encodeURIComponent(code)}&error=${encodeURIComponent("this deployment has no backend configured")}`);
  }

  let message: string | null = null;
  try {
    const res = await fetch(`${url}/functions/v1/cli_claim`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { error?: string });
      message = body.error || `could not connect that device (${res.status})`;
    }
  } catch {
    message = "could not reach the backend — check your connection and try again";
  }

  if (message) {
    redirect(`/cli-auth?code=${encodeURIComponent(code)}&error=${encodeURIComponent(message)}`);
  }
  redirect(`/cli-auth?code=${encodeURIComponent(code)}&claimed=1`);
}
