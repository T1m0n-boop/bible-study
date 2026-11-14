"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { useLanguage } from "../../../components/LanguageProvider";

type LibraryRecord = {
  session_id: string;
  join_code: string;
  session_name: string | null;
  status: "waiting" | "live" | "ended";
  study_id: string;
  study_title: string;
  passage: string | null;
  note_count: number;
  updated_at: string;
};

export default function ParticipantDashboard() {
  const { t } = useLanguage();
  const [email, setEmail] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [items, setItems] = useState<LibraryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setSignedIn(false);
      setEmail(null);
      setItems([]);
      setError("");
      return;
    }
    setSignedIn(true);
    setEmail(auth.user.email ?? null);
    const { data, error: libraryError } = await supabase.rpc("get_my_study_library");
    if (libraryError) {
      setError(libraryError.message);
      return;
    }
    setItems((data ?? []) as LibraryRecord[]);
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try { await load(); }
      catch { if (active) setError("dashboard.loadFailed"); }
      finally { if (active) setLoading(false); }
    }
    void initialLoad();
    return () => { active = false; };
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); }
    catch { setError("dashboard.refreshFailed"); }
    finally { setRefreshing(false); }
  }

  const active = items.filter((item) => item.status !== "ended");
  const ended = items.filter((item) => item.status === "ended");
  const noteCount = items.reduce((sum, item) => sum + Number(item.note_count || 0), 0);
  const errorMessage = error === "dashboard.loadFailed" || error === "dashboard.refreshFailed" ? t(error) : error;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-5">
          <Link href="/" className="text-xl font-bold text-indigo-700">{t("app.title")}</Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm font-medium">
            <Link href="/library" className="text-indigo-700 hover:underline">{t("dashboard.studyLibrary")}</Link>
            <Link href="/join" className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">{t("nav.join")}</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t("nav.dashboard")}</h1>
            <p className="mt-2 text-slate-600">
              {signedIn && email ? `${t("account.signedInAs")} ${email}` : t("dashboard.intro")}
            </p>
          </div>
          {signedIn && <button type="button" onClick={() => void refresh()} disabled={loading || refreshing}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-100 disabled:opacity-50">
            {refreshing ? t("dashboard.refreshing") : t("dashboard.refresh")}
          </button>}
        </section>

        {loading && <p>{t("dashboard.loading")}</p>}
        {!loading && !signedIn && (
          <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-xl font-semibold">{t("dashboard.signInTitle")}</h2>
            <p className="mt-2 text-slate-600">{t("dashboard.signInDescription")}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/participant-login" className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700">{t("nav.signIn")}</Link>
              <Link href="/register" className="rounded-lg border border-slate-300 px-5 py-3 font-medium hover:bg-slate-50">{t("dashboard.createAccount")}</Link>
              <Link href="/join" className="rounded-lg border border-slate-300 px-5 py-3 font-medium hover:bg-slate-50">{t("dashboard.joinGuest")}</Link>
            </div>
          </section>
        )}

        {!loading && signedIn && (
          <>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{t("dashboard.studiesError")}: {errorMessage}</p>}
            {!error && <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">{t("dashboard.studiesWithNotes")}</p><p className="mt-2 text-3xl font-bold">{items.length}</p></div>
                <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">{t("dashboard.ongoingSessions")}</p><p className="mt-2 text-3xl font-bold">{active.length}</p></div>
                <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">{t("dashboard.questionsWithNotes")}</p><p className="mt-2 text-3xl font-bold">{noteCount}</p></div>
              </div>

              {items.length === 0 ? (
                <section className="rounded-2xl border bg-white p-8">
                  <h2 className="text-xl font-semibold">{t("dashboard.firstStudyTitle")}</h2>
                  <p className="mt-2 text-slate-600">{t("dashboard.firstStudyDescription")}</p>
                  <Link href="/join" className="mt-5 inline-block rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700">{t("nav.join")}</Link>
                </section>
              ) : (
                <>
                  <section>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl font-semibold">{t("dashboard.continue")}</h2>
                      <Link href="/library" className="text-sm font-medium text-indigo-700 hover:underline">{t("dashboard.viewAllNotes")}</Link>
                    </div>
                    {active.length === 0 ? <p className="rounded-xl border bg-white p-5 text-slate-600">{t("dashboard.noOngoing")}</p> :
                      <div className="grid gap-4 md:grid-cols-2">{active.slice(0, 4).map(item => (
                        <article key={item.session_id} className="rounded-xl border bg-white p-6 shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-lg font-semibold">{item.study_title}</h3>
                            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">{item.status === "live" ? t("dashboard.live") : t("dashboard.waiting")}</span>
                          </div>
                          {item.passage && <p className="mt-1 text-indigo-700">{item.passage}</p>}
                          <p className="mt-3 text-sm text-slate-600">{item.session_name || t("dashboard.defaultSessionName")} · {item.note_count} {t("dashboard.questionsWithNotesLower")}</p>
                          <Link href={`/join/${encodeURIComponent(item.join_code)}`} className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">{t("dashboard.openSession")}</Link>
                        </article>
                      ))}</div>}
                  </section>
                  <section className="rounded-xl border bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><h2 className="text-xl font-semibold">{t("dashboard.previousStudies")}</h2><p className="mt-1 text-sm text-slate-600">{ended.length} {t("dashboard.endedSessions")}</p></div>
                      <Link href="/library" className="rounded-lg border border-indigo-600 px-4 py-2 font-medium text-indigo-700 hover:bg-indigo-50">{t("dashboard.openLibrary")}</Link>
                    </div>
                  </section>
                </>
              )}
            </>}
          </>
        )}
      </div>
    </main>
  );
}
