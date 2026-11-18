"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import { useLanguage } from "./LanguageProvider";

type Access = { signedIn: boolean; leader: boolean; admin: boolean };

export default function SiteNavigation() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [access, setAccess] = useState<Access>({ signedIn: false, leader: false, admin: false });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let active = true;
    let request = 0;

    async function updateAccess() {
      const current = ++request;
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active || current !== request) return;
      if (authError || !authData.user) {
        setAccess({ signedIn: false, leader: false, admin: false });
        return;
      }

      const [leaderResult, adminResult] = await Promise.all([
        supabase.from("study_leaders").select("user_id").eq("user_id", authData.user.id).maybeSingle(),
        supabase.rpc("is_study_admin"),
      ]);
      if (!active || current !== request) return;
      setAccess({
        signedIn: true,
        leader: !leaderResult.error && !!leaderResult.data,
        admin: !adminResult.error && adminResult.data === true,
      });
    }

    void updateAccess();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => { if (active) void updateAccess(); }, 0);
    });
    return () => { active = false; request++; subscription.unsubscribe(); };
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (!mounted) {
    return <nav aria-label="Main navigation" className="h-16 border-b border-slate-200 bg-white" />;
  }

  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/join", label: t("nav.join") },
    ...(access.signedIn ? [
      { href: "/participant/dashboard", label: t("nav.dashboard") },
      { href: "/library", label: t("nav.myLibrary") },
    ] : []),
    ...(access.leader ? [{ href: "/host/dashboard", label: t("nav.host") }] : []),
    ...(access.admin ? [{ href: "/admin/leaders", label: t("nav.manageLeaders") }] : []),
  ];

  function navLink(href: string, label: string) {
    const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined}
        className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100 hover:text-indigo-700"}`}>
        {label}
      </Link>
    );
  }

  return (
    <nav aria-label={t("nav.mainNavigation")} className="border-b border-slate-200 bg-white text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="shrink-0 text-lg font-bold text-indigo-700">{t("app.title")}</Link>
        <div className="hidden flex-wrap items-center justify-end gap-1 md:flex">
          {links.map(({ href, label }) => navLink(href, label))}
        </div>
        <button type="button" aria-expanded={menuOpen} aria-controls="mobile-site-navigation"
          aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          onClick={() => setMenuOpen(value => !value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 md:hidden">
          {menuOpen ? t("nav.close") : t("nav.menu")}
        </button>
      </div>
      {menuOpen && (
        <div id="mobile-site-navigation" className="flex flex-col gap-1 border-t border-slate-200 px-6 py-3 md:hidden">
          {links.map(({ href, label }) => navLink(href, label))}
        </div>
      )}
    </nav>
  );
}
