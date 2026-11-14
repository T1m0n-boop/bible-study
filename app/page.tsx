"use client";

import Link from "next/link";
import { useLanguage } from "../components/LanguageProvider";

export default function Home() {
  const { t } = useLanguage();
  const participantPages = [
    { icon: "📚", title: t("home.dashboardTitle"), description: t("home.dashboardDescription"), href: "/participant/dashboard", action: t("home.openDashboard") },
    { icon: "📓", title: t("home.libraryTitle"), description: t("home.libraryDescription"), href: "/library", action: t("home.viewNotes") },
  ];

  return (
    <main className="flex-1 bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-700">{t("home.welcome")}</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{t("home.headline")}</h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">{t("home.intro")}</p>
        </div>

        <section className="mt-10 rounded-2xl border border-indigo-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span aria-hidden="true" className="text-4xl">📖</span>
              <h2 className="mt-3 text-2xl font-bold">{t("home.joinTitle")}</h2>
              <p className="mt-2 max-w-xl text-slate-600">{t("home.joinDescription")}</p>
            </div>
            <Link href="/join" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700">{t("home.joinTitle")}</Link>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">{t("home.personalTitle")}</h2>
          <p className="mt-2 text-slate-600">{t("home.personalDescription")}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {participantPages.map((item) => (
              <article key={item.href} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span aria-hidden="true" className="text-3xl">{item.icon}</span>
                <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 flex-1 text-slate-600">{item.description}</p>
                <Link href={item.href} className="mt-6 inline-flex min-h-11 items-center justify-center self-start rounded-lg border border-indigo-600 px-5 py-2.5 font-semibold text-indigo-700 hover:bg-indigo-50">{item.action}</Link>
              </article>
            ))}
          </div>
          <p className="mt-5 text-sm text-slate-600">
            {t("home.newHere")}{" "}
            <Link href="/register" className="font-semibold text-indigo-700 underline">{t("home.createAccount")}</Link>
            {" · "}{t("home.alreadyRegistered")}{" "}
            <Link href="/participant-login" className="font-semibold text-indigo-700 underline">{t("home.signIn")}</Link>
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-200 bg-slate-100 p-6 sm:p-8">
          <h2 className="text-xl font-bold">{t("home.leaderTitle")}</h2>
          <p className="mt-2 text-slate-600">{t("home.leaderDescription")}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/host/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white hover:bg-slate-800">{t("home.leaderDashboard")}</Link>
            <Link href="/host" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-800 hover:bg-slate-50">{t("home.createStudy")}</Link>
          </div>
        </section>
      </section>
      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">{t("home.footer")}</footer>
    </main>
  );
}
