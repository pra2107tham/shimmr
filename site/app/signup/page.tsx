import type { Metadata } from "next";
import Link from "next/link";
import Bloom from "../Bloom";
import AuthForm from "../AuthForm";
import styles from "../auth-form.module.css";

export const metadata: Metadata = { title: "Create your account — Shimmr" };

export default function SignupPage() {
  return (
    <div className={styles.page}>
      <Bloom />
      <Link href="/" className={styles.back}>
        ← Back
      </Link>
      <AuthForm mode="signup" />
    </div>
  );
}
