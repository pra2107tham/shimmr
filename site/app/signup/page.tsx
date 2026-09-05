import type { Metadata } from "next";
import SiteNav from "../SiteNav";
import AuthForm from "../AuthForm";
import { pageMetadata } from "../seo";
import styles from "../auth-form.module.css";

export const metadata: Metadata = pageMetadata({
  title: "Create your account — Shimmr",
  description: "Create a Shimmr account with a magic link, Google, or GitHub. No password.",
  path: "/signup",
  noIndex: true,
});

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className={styles.page}>
      <SiteNav />
      <div className={styles.center}>
        <AuthForm mode="signup" next={next} />
      </div>
    </div>
  );
}
