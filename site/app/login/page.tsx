import type { Metadata } from "next";
import SiteNav from "../SiteNav";
import AuthForm from "../AuthForm";
import { pageMetadata } from "../seo";
import styles from "../auth-form.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Sign in — Shimmr",
  description: "Sign in to Shimmr with a magic link, Google, or GitHub.",
  path: "/login",
  noIndex: true,
});

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className={styles.page}>
      <SiteNav />
      <div className={styles.center}>
        <AuthForm mode="login" next={next} />
      </div>
    </div>
  );
}
