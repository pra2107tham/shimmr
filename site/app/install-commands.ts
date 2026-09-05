// The one place the public install commands are defined. Both the homepage
// and the /download page import these, so the URL shown cannot drift from
// the URL a copy button actually copies — which is exactly how the Windows
// command ended up pointing at raw.githubusercontent.com, a URL that 404s
// for anyone who isn't a collaborator on this private repository (ADR
// 0009). Object storage is the one that's actually public.
export const INSTALL_UNIX =
  "curl -fsSL https://fpxntzwkiepnwsazmaxf.supabase.co/storage/v1/object/public/releases/install.sh | sh";
export const INSTALL_WINDOWS =
  "irm https://fpxntzwkiepnwsazmaxf.supabase.co/storage/v1/object/public/releases/install.ps1 | iex";
