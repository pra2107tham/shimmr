import type { Metadata } from "next";
import SiteNav from "../SiteNav";
import AuthForm from "../AuthForm";
import styles from "../auth-form.module.css";

export const metadata: Metadata = { title: "Create your account — Shimmr" };

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
