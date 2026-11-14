"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { useLanguage } from "./LanguageProvider";

export default function AccountStatus() {
  const router = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkAccount() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setEmail(data.user?.email ?? null);
      setLoading(false);
    }

    void checkAccount();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setEmail(session?.user?.email ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setError("");
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      setSigningOut(false);
      return;
    }
    setEmail(null);
    setSigningOut(false);
    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return <span className="text-sm text-slate-500">{t("account.checking")}</span>;
  }

  if (!email) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/participant-login" className="text-sm font-medium text-indigo-700 hover:underline">
          {t("nav.signIn")}
        </Link>
        <Link href="/register" className="rounded-lg border border-indigo-600 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
          {t("account.register")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{t("account.signedInAs")}</p>
        <p className="max-w-48 truncate text-sm font-medium text-slate-800" title={email}>{email}</p>
      </div>
      <button type="button" onClick={() => void handleSignOut()} disabled={signingOut}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
        {signingOut ? t("account.signingOut") : t("nav.signOut")}
      </button>
      {error && <p role="alert" className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
