import type { Metadata } from "next";
import SiteNav from "../SiteNav";
import AuthForm from "../AuthForm";
import styles from "../auth-form.module.css";

export const metadata: Metadata = { title: "Sign in — Shimmr" };

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
