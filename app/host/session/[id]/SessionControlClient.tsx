"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase";
import { useLanguage } from "../../../../components/LanguageProvider";

type Session = {
  id: string;
  study_id: string;
  session_name: string | null;
  join_code: string;
  status: "waiting" | "live" | "ended";
  current_question: number;
};

type Study = { title: string; passage: string | null };
type Question = { id: string; question_number: number; question_text: string };
type SupplementItem = {
  id: string;
  question_id: string;
  item_type: "reference" | "hint" | "explanation";
  content: string;
  sort_order: number;
  is_revealed: boolean;
};

type ParticipantStatus = {
  participant_id: string;
  display_name: string;
  is_online: boolean;
  is_ready: boolean;
  last_seen_at: string;
};

export default function SessionControlClient() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const { t, language } = useLanguage();

  const [session, setSession] = useState<Session | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState<ParticipantStatus[]>([]);
  const [supplements, setSupplements] = useState<SupplementItem[]>([]);
  const [supplementError, setSupplementError] = useState("");
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [participantError, setParticipantError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadParticipants = useCallback(async () => {
    const { data, error: lookupError } = await supabase.rpc(
      "get_session_participant_status",
      { p_session_id: sessionId }
    );
    if (lookupError) {
      setParticipantError(lookupError.message);
      return;
    }
    setParticipants((data ?? []) as ParticipantStatus[]);
    setParticipantError("");
    setLastRefresh(new Date());
  }, [sessionId]);

  const loadSupplements = useCallback(async () => {
    const { data, error: lookupError } = await supabase.rpc(
      "get_session_question_items",
      { p_session_id: sessionId }
    );
    if (lookupError) {
      setSupplementError(lookupError.message);
      return;
    }
    setSupplements((data ?? []) as SupplementItem[]);
    setSupplementError("");
  }, [sessionId]);

  async function toggleSupplement(item: SupplementItem) {
    if (!session || session.status !== "live" || busyItem) return;
    setBusyItem(item.id);
    setSupplementError("");
    const { error: toggleError } = await supabase.rpc(
      "set_session_item_revealed",
      {
        p_session_id: session.id,
        p_item_id: item.id,
        p_revealed: !item.is_revealed,
      }
    );
    if (toggleError) {
      setSupplementError(toggleError.message);
    } else {
      await loadSupplements();
    }
    setBusyItem(null);
  }

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const { data: sessionData, error: sessionError } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      if (!active) return;
      if (sessionError || !sessionData) {
        setError(sessionError?.message ?? t("hostSession.notFound"));
        setLoading(false);
        return;
      }

      const { data: studyData, error: studyError } = await supabase
        .from("studies")
        .select("title, passage")
        .eq("id", sessionData.study_id)
        .single();
      if (!active) return;
      if (studyError || !studyData) {
        setError(studyError?.message ?? t("hostSession.studyNotFound"));
        setLoading(false);
        return;
      }

      const { data: questionData, error: questionError } = await supabase
        .from("study_questions")
        .select("id, question_number, question_text")
        .eq("study_id", sessionData.study_id)
        .order("question_number", { ascending: true });
      if (!active) return;
      if (questionError) {
        setError(questionError.message);
        setLoading(false);
        return;
      }

      setSession(sessionData as Session);
      setStudy(studyData as Study);
      setQuestions((questionData ?? []) as Question[]);
      setLoading(false);
    }

    void loadSession();
    void loadSupplements();
    return () => { active = false; };
  }, [sessionId, loadSupplements]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    let inFlight = false;

    const refresh = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await loadParticipants();
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { active = false; clearInterval(timer); };
  }, [session?.id, loadParticipants]);

  async function updateSession(
    updates: Partial<Pick<Session, "status" | "current_question">>
  ) {
    if (!session || saving) return;
    setSaving(true);
    setError("");

    const { data, error: updateError } = await supabase
      .from("study_sessions")
      .update(updates)
      .eq("id", session.id)
      .select("*")
      .single();

    if (updateError || !data) {
      setError(updateError?.message ?? t("hostSession.updateFailed"));
    } else {
      setSession(data as Session);
      void loadParticipants();
    }
    setSaving(false);
  }

  async function undoLastReveal() {
    if (!session || saving || session.status !== "live" || session.current_question < 1) return;
    const previous = session.current_question;
    const confirmed = window.confirm(
      `${t("hostSession.undoHide")} ${previous} ${t("hostSession.undoReturn")} ${previous === 1 ? t("hostSession.undoWaiting") : `${t("hostSession.question")} ${previous - 1}`}?\n\n${t("hostSession.undoNotes")}`
    );
    if (!confirmed) return;

    setSaving(true);
    setError("");
    const { data, error: undoError } = await supabase.rpc(
      "leader_undo_last_question_reveal",
      { p_session_id: session.id, p_expected_question: previous }
    );
    if (undoError || typeof data !== "number") {
      setError(undoError?.message ?? t("hostSession.undoFailed"));
    } else {
      setSession({ ...session, current_question: data });
      void loadParticipants();
    }
    setSaving(false);
  }

  if (loading) return <main className="p-8 text-center">{t("hostSession.loading")}</main>;
  if (!session || !study) return (
    <main className="p-8 text-center text-red-600">{error || t("hostSession.notFound")}</main>
  );

  const current = session.current_question;
  const total = questions.length;
  const nextQuestion = questions.find(q => q.question_number === current + 1);
  const online = participants.filter(p => p.is_online);
  const ready = session.status === "live" && current > 0
    ? online.filter(p => p.is_ready).length : 0;
  const allReady = online.length > 0 && ready === online.length;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/host/dashboard" className="font-medium text-indigo-700 hover:underline">
          ← Back to Dashboard
        </Link>

        <h1 className="mt-6 text-3xl font-bold">{session.session_name || t("hostSession.defaultSession")}</h1>
        <p className="mt-2 text-slate-600">
          {study.title}{study.passage ? ` · ${study.passage}` : ""}
        </p>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm text-slate-500">{t("hostSession.joiningCode")}</p>
          <p className="mt-1 text-3xl font-bold tracking-widest text-indigo-700">{session.join_code}</p>
          <p className="mt-5">{t("hostSession.status")} <strong>{session.status === "waiting" ? t("hostSession.waiting") : session.status === "live" ? t("hostSession.live") : t("hostSession.ended")}</strong></p>
          <p className="mt-2">{t("hostSession.revealedCount")} <strong>{current} {t("hostSession.of")} {total}</strong></p>

          {session.status === "waiting" && (
            <button type="button" disabled={saving}
              onClick={() => void updateSession({ status: "live" })}
              className="mt-6 rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white disabled:opacity-50">
              Start Discussion
            </button>
          )}

          {session.status === "live" && nextQuestion && (
            <div className="mt-6 rounded-xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">{t("hostSession.nextQuestion")}</p>
              <p className="mt-2 whitespace-pre-wrap font-semibold">{nextQuestion.question_text}</p>
              {current > 0 && (
                <p className={`mt-3 text-sm font-medium ${allReady ? "text-emerald-700" : "text-amber-700"}`}>
                  {online.length === 0
                    ? t("hostSession.noOnline")
                    : allReady
                      ? t("hostSession.allReady")
                      : `${ready} ${t("hostSession.of")} ${online.length} ${t("hostSession.onlineReadySuffix")}`}
                </p>
              )}
              <button type="button" disabled={saving}
                onClick={() => void updateSession({ current_question: nextQuestion.question_number })}
                className="mt-4 rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white disabled:opacity-50">
                {t("hostSession.revealQuestion")} {nextQuestion.question_number}
              </button>
            </div>
          )}

          {session.status === "live" && current > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                {t("hostSession.undoHint")}
              </p>
              <button type="button" disabled={saving}
                onClick={() => void undoLastReveal()}
                className="mt-3 rounded-lg border border-amber-600 bg-white px-5 py-3 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50">
                {t("hostSession.undoReveal")} {current}
              </button>
            </div>
          )}

          {session.status === "live" && (
            <button type="button" disabled={saving}
              onClick={() => void updateSession({ status: "ended" })}
              className="mt-6 rounded-lg border border-red-500 px-5 py-3 font-medium text-red-600 disabled:opacity-50">
              {t("hostSession.endSession")}
            </button>
          )}

          {session.status === "ended" && (
            <p className="mt-6 font-medium text-slate-600">{t("hostSession.sessionEnded")}</p>
          )}
          {error && <p role="alert" className="mt-5 text-red-600">{error}</p>}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{t("hostSession.supplements")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("hostSession.supplementsHint")}
              </p>
            </div>
            <button type="button" onClick={() => void loadSupplements()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
              {t("hostSession.refreshItems")}
            </button>
          </div>
          {supplementError && <p role="alert" className="mt-4 text-sm text-red-600">{supplementError}</p>}
          {supplements.length === 0 && !supplementError && (
            <p className="mt-4 text-sm text-slate-500">{t("hostSession.noSupplements")}</p>
          )}
          <div className="mt-5 space-y-5">
            {questions.filter(q => supplements.some(item => item.question_id === q.id)).map(question => {
              const questionItems = supplements.filter(item => item.question_id === question.id);
              const isQuestionVisible = session.status === "live" && question.question_number <= current;
              return <div key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-indigo-700">{t("hostSession.question")} {question.question_number}</p>
                <p className="mt-1 whitespace-pre-wrap font-medium">{question.question_text}</p>
                {!isQuestionVisible && <p className="mt-2 text-xs text-amber-700">
                  {session.status === "ended" ? t("hostSession.endedRevealDisabled") : t("hostSession.revealQuestionFirst")}
                </p>}
                <div className="mt-3 space-y-3">
                  {questionItems.map(item => <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {item.item_type === "reference" ? t("hostSession.reference") : item.item_type === "hint" ? t("hostSession.hint") : t("hostSession.explanation")}
                          {item.is_revealed ? ` · ${t("hostSession.revealed")}` : ` · ${t("hostSession.hidden")}`}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{item.content}</p>
                      </div>
                      <button type="button"
                        disabled={!isQuestionVisible || busyItem !== null}
                        onClick={() => void toggleSupplement(item)}
                        className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                          item.is_revealed
                            ? "border border-amber-500 bg-white text-amber-800 hover:bg-amber-50"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {busyItem === item.id ? t("hostSession.saving") : item.is_revealed ? t("hostSession.hide") : t("hostSession.reveal")}
                      </button>
                    </div>
                  </div>)}
                </div>
              </div>;
            })}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{t("hostSession.participants")}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("hostSession.online")} <strong>{online.length}</strong> · {t("hostSession.joined")} <strong>{participants.length}</strong>
              </p>
            </div>
            <button type="button" onClick={() => void loadParticipants()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
              {t("hostSession.refresh")}
            </button>
          </div>

          {session.status === "live" && current > 0 && (
            <div className="mt-5 rounded-xl bg-indigo-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{t("hostSession.readyNext")}</span>
                <strong className="text-lg text-indigo-700">{ready} / {online.length}</strong>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-indigo-100"
                role="progressbar" aria-label={t("hostSession.onlineReadyAria")}
                aria-valuenow={ready} aria-valuemin={0} aria-valuemax={Math.max(1, online.length)}>
                <div className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${online.length ? (ready / online.length) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {t("hostSession.readinessPrefix")} {current}. {t("hostSession.readinessSuffix")}
              </p>
            </div>
          )}

          {participantError && <p role="alert" className="mt-4 text-sm text-red-600">
            {t("hostSession.participantRefreshFailed")} {participantError}
          </p>}

          {participants.length === 0 ? (
            <p className="mt-5 text-slate-600">{t("hostSession.noParticipants")}</p>
          ) : (
            <ul className="mt-5 divide-y divide-slate-100">
              {participants.map(participant => (
                <li key={participant.participant_id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{participant.display_name}</p>
                    <p className={`text-xs ${participant.is_online ? "text-emerald-700" : "text-slate-500"}`}>
                      {participant.is_online ? t("hostSession.onlineLabel") : t("hostSession.offlineLabel")}
                    </p>
                  </div>
                  {session.status === "live" && current > 0 && (
                    <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                      !participant.is_online ? "bg-slate-100 text-slate-500"
                        : participant.is_ready ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                    }`}>
                      {!participant.is_online ? t("hostSession.offline") : participant.is_ready ? t("hostSession.ready") : t("hostSession.stillWriting")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {lastRefresh && <p className="mt-4 text-xs text-slate-400">
            {t("hostSession.updatedAt")} {lastRefresh.toLocaleTimeString(language === "ro" ? "ro-RO" : "en-US")}. {t("hostSession.refreshEvery")}
          </p>}
        </section>
      </div>
    </main>
  );
}
