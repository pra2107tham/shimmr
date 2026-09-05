"use client";

import { useState } from "react";
import styles from "./copy-button.module.css";

/** A small "copy" button for a one-line shell command shown elsewhere on the
 * page — takes the exact text to copy so the button can never drift from
 * what's actually displayed (see the /download Windows command, which did,
 * pointing at a raw.githubusercontent.com URL that 404s on this private
 * repo). Silently no-ops if the Clipboard API is unavailable; the command
 * is still plain text on the page, selectable by hand either way. */
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ""}`}
      aria-label="Copy command to clipboard"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
