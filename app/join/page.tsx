"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../components/LanguageProvider";

type ParticipantSession = {
  session_id: string;
  session_name: string | null;
  status: "waiting" | "live" | "ended";
  study_title: string;
};

export default function JoinStudyPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [joinCode, setJoinCode] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [joining, setJoining] = useState(false);
  const [errorKey, setErrorKey] = useState<
    | "join.invalidLength" | "join.invalidCharacters" | "join.nameRequired"
    | "join.lookupFailed" | "join.notFound" | "join.unexpected" | ""
  >("");

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    const name = participantName.trim();
    if (code.length !== 6) { setErrorKey("join.invalidLength"); return; }
    if (!/^[A-Z0-9]{6}$/.test(code)) { setErrorKey("join.invalidCharacters"); return; }
    if (!name) { setErrorKey("join.nameRequired"); return; }
    setJoining(true);
    setErrorKey("");
    try {
      const { data, error: lookupError } = await supabase.rpc("get_participant_session", { p_join_code: code });
      if (lookupError) { setErrorKey("join.lookupFailed"); return; }
      const session = data as ParticipantSession | null;
      if (!session) { setErrorKey("join.notFound"); return; }
      localStorage.setItem(`bible-study-participant-${session.session_id}`, name);
      sessionStorage.setItem(`bible-study-code-${session.session_id}`, code);
      router.push(`/join/${code}`);
    } catch {
      setErrorKey("join.unexpected");
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 sm:py-16">
      <div className="w-full max-w-lg">
        <div className="text-center">
          <span aria-hidden="true" className="text-5xl">📖</span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{t("join.title")}</h1>
          <p className="mt-3 text-slate-600">{t("join.intro")}</p>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-indigo-50 p-4">
            <span aria-hidden="true" className="text-2xl">✨</span>
            <div>
              <p className="font-semibold text-indigo-900">{t("join.guestTitle")}</p>
              <p className="mt-1 text-sm text-indigo-800">{t("join.guestDescription")}</p>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label htmlFor="join-code" className="block text-sm font-semibold text-slate-800">{t("join.codeLabel")}</label>
              <p id="join-code-help" className="mt-1 text-sm text-slate-500">{t("join.codeHelp")}</p>
              <input
                id="join-code" type="text" value={joinCode}
                onChange={(event) => {
                  setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
                  setErrorKey("");
                }}
                placeholder="AB7K29" maxLength={6} autoCapitalize="characters"
                autoComplete="off" spellCheck={false} aria-describedby="join-code-help" required
                className="mt-3 min-h-14 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl font-bold uppercase tracking-[0.2em] text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label htmlFor="participant-name" className="block text-sm font-semibold text-slate-800">{t("join.nameLabel")}</label>
              <p className="mt-1 text-sm text-slate-500">{t("join.nameHelp")}</p>
              <input
                id="participant-name" type="text" value={participantName}
                onChange={(event) => { setParticipantName(event.target.value); setErrorKey(""); }}
                placeholder={t("join.namePlaceholder")} maxLength={50} autoComplete="name" required
                className="mt-3 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {errorKey && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {t(errorKey)}
              </div>
            )}
            <button type="submit" disabled={joining}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
              {joining ? t("join.checking") : t("join.submit")}
            </button>
          </form>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{t("join.saveTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("join.saveDescription")}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/register" className="font-semibold text-indigo-700 hover:underline">{t("join.createAccount")}</Link>
            <Link href="/participant-login" className="font-semibold text-indigo-700 hover:underline">{t("join.signIn")}</Link>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">{t("join.noCode")}</p>
      </div>
    </main>
  );
}
