// Shared by opengraph-image.tsx and twitter-image.tsx — both are Next.js
// file-convention routes that each need their own default export, but
// there's no reason the actual image (or its size/alt) should be defined
// twice. One branded image, site-wide, in the Terminal Ledger palette.
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Shimmr — the context layer between AI coding agents and everything they run on";

// Fetched once (this route is statically generated, so once per build) —
// the standard way next/og examples load a real font, and not optional
// here: Satori's undocumented built-in fallback turned out to have a real
// bug. Specific word pairs in the headline ("context layer", "everything
// they") rendered with a visibly wrong gap between them under the default
// font — reproducible with the real copy, absent with dummy text of the
// same shape, and gone entirely once a real font is loaded instead. An old
// browser's user-agent is the usual trick to make Google Fonts skip woff2
// — here it still answers with plain .woff (not .woff2), which Satori's
// font parser reads fine too, so this takes whatever format comes back
// rather than insisting on one.
async function loadFont(weight: number): Promise<ArrayBuffer> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36" },
  }).then((r) => r.text());
  const match = css.match(/src: url\(([^)]+)\) format\('(?:truetype|woff)'\)/);
  if (!match) throw new Error(`brand-og-image: no usable font URL in Google Fonts CSS for weight ${weight}`);
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

export async function renderBrandImage() {
  const [regular, semibold] = await Promise.all([loadFont(400), loadFont(600)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#08090a",
          padding: "90px",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 44 }}>
          <div style={{ width: 36, height: 36, background: "#9fe870" }} />
          <div style={{ display: "flex", fontSize: 46, fontWeight: 600, color: "#e8eaed", letterSpacing: 0 }}>shimmr</div>
          <div
            style={{
              display: "flex",
              fontSize: 18,
              color: "#9fe870",
              border: "2px solid rgba(159,232,112,0.35)",
              padding: "6px 16px",
              letterSpacing: 3,
            }}
          >
            EARLY
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 54, fontWeight: 600, color: "#e8eaed", lineHeight: 1.18 }}>
          <div style={{ display: "flex" }}>The context layer between AI coding</div>
          <div style={{ display: "flex" }}>agents and everything they run on.</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#8b9199", marginTop: 40 }}>
          Local-first. Free, forever — until you connect something.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
