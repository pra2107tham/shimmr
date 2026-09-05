import type { Metadata } from "next";
import Link from "next/link";
import Bloom from "../Bloom";
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
      <Bloom />
      <Link href="/" className={styles.back}>
        ← Back
      </Link>
      <AuthForm mode="login" next={next} />
    </div>
  );
}
