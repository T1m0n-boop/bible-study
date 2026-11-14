"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import AdminLink from "../../../components/AdminLink";
import { useLanguage } from "../../../components/LanguageProvider";

type Study = {
  id: string;
  title: string;
  passage: string | null;
  description: string | null;
  created_at: string;
};

type StudyQuestion = {
  id: string;
  study_id: string;
  question_number: number;
  question_text: string;
};

type StudySession = {
  id: string;
  study_id: string;
  session_name: string | null;
  join_code: string;
  status: "waiting" | "live" | "ended";
  current_question: number;
  created_at: string;
};

export default function StudyDashboard() {
  const { t, language } = useLanguage();
  const [studies, setStudies] = useState<Study[]>([]);
  const [questions, setQuestions] = useState<StudyQuestion[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expandedStudy, setExpandedStudy] = useState<string | null>(null);
  const [expandedSessionForm, setExpandedSessionForm] = useState<string | null>(null);
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  const [creatingSession, setCreatingSession] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [studyAction, setStudyAction] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [createdSession, setCreatedSession] = useState<{
    id: string;
    studyId: string;
    name: string;
    code: string;
  } | null>(null);

  const loadDashboard = useCallback(async () => {
    const [studyResult, questionResult, sessionResult] = await Promise.all([
      supabase
        .from("studies")
        .select("id, title, passage, description, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("study_questions")
        .select("id, study_id, question_number, question_text")
        .order("question_number", { ascending: true }),
      supabase
        .from("study_sessions")
        .select("id, study_id, session_name, join_code, status, current_question, created_at")
        .order("created_at", { ascending: false }),
    ]);

    const message =
      studyResult.error?.message ||
      questionResult.error?.message ||
      sessionResult.error?.message;

    if (message) {
      setError(message);
    } else {
      setStudies(studyResult.data ?? []);
      setQuestions(questionResult.data ?? []);
      setSessions((sessionResult.data ?? []) as StudySession[]);
      setError("");
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      await loadDashboard();
      if (active) setLoading(false);
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, [loadDashboard]);

  async function refreshDashboard() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadDashboard();
    } finally {
      setRefreshing(false);
    }
  }

  function questionsForStudy(studyId: string) {
    return questions.filter((question) => question.study_id === studyId);
  }

  function sessionsForStudy(studyId: string) {
    return sessions.filter((session) => session.study_id === studyId);
  }

  async function createSession(studyId: string) {
    if (creatingSession) return;

    if (questionsForStudy(studyId).length === 0) {
      setSessionMessage(t("hostDashboard.needQuestion"));
      return;
    }

    const name = sessionNames[studyId]?.trim() || t("hostDashboard.defaultSession");
    setCreatingSession(studyId);
    setSessionMessage("");
    setCreatedSession(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        setSessionMessage(t("hostDashboard.signInFirst"));
        return;
      }

      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let attempt = 0; attempt < 5; attempt++) {
        const randomValues = new Uint32Array(6);
        crypto.getRandomValues(randomValues);
        const code = Array.from(randomValues)
          .map((value) => alphabet[value % alphabet.length])
          .join("");

        const { data: newSession, error: insertError } = await supabase
          .from("study_sessions")
          .insert({
            study_id: studyId,
            session_name: name,
            join_code: code,
            status: "waiting",
            current_question: 0,
          })
          .select("id, study_id, session_name, join_code, status, current_question, created_at")
          .single();

        if (!insertError && newSession) {
          setSessions((previous) => [newSession as StudySession, ...previous]);
          setCreatedSession({ id: newSession.id, studyId, name, code });
          setSessionMessage(t("hostDashboard.createSuccess"));
          return;
        }

        if (insertError?.code !== "23505") {
          setSessionMessage(
            t("hostDashboard.createFailure") + " " + (insertError?.message ?? t("hostDashboard.unknownError"))
          );
          return;
        }
      }

      setSessionMessage(t("hostDashboard.uniqueCode"));
    } catch {
      setSessionMessage(t("hostDashboard.createUnexpected"));
    } finally {
      setCreatingSession(null);
    }
  }

  async function duplicateStudy(study: Study) {
    if (studyAction) return;
    setStudyAction(study.id);
    setSessionMessage("");
    let newId: string | null = null;
    try {
      const { data: copy, error: copyError } = await supabase
        .from("studies")
        .insert({
          title: `${study.title} (${t("hostDashboard.copySuffix")})`,
          passage: study.passage,
          description: study.description,
        })
        .select("id")
        .single();
      if (copyError || !copy) throw new Error(copyError?.message || t("hostDashboard.copyFailure"));
      newId = copy.id;
      const sourceQuestions = questionsForStudy(study.id);
      if (sourceQuestions.length) {
        const { error: questionError } = await supabase.from("study_questions").insert(
          sourceQuestions.map((q) => ({
            study_id: copy.id,
            question_number: q.question_number,
            question_text: q.question_text,
          }))
        );
        if (questionError) throw new Error(questionError.message);
      }
      await loadDashboard();
      setSessionMessage(`${t("hostDashboard.duplicated")} "${study.title}".`);
    } catch (e) {
      if (newId) await supabase.from("studies").delete().eq("id", newId);
      setSessionMessage(`${t("hostDashboard.duplicateFailure")} ${e instanceof Error ? e.message : t("hostDashboard.unknownError")}`);
    } finally {
      setStudyAction(null);
    }
  }

  async function deleteStudy(study: Study) {
    if (studyAction) return;
    if (sessionsForStudy(study.id).length > 0) {
      setSessionMessage(t("hostDashboard.hasSessions"));
      return;
    }
    if (!window.confirm(`${t("hostDashboard.confirmStudyPrefix")} "${study.title}" ${t("hostDashboard.confirmStudySuffix")}`)) return;
    setStudyAction(study.id);
    setSessionMessage("");
    try {
      const { error: questionsError } = await supabase.from("study_questions").delete().eq("study_id", study.id);
      if (questionsError) throw new Error(questionsError.message);
      const { data, error: studyError } = await supabase.from("studies").delete().eq("id", study.id).select("id");
      if (studyError) throw new Error(studyError.message);
      if (!data?.length) throw new Error(t("hostDashboard.notDeleted"));
      await loadDashboard();
      setSessionMessage(`${t("hostDashboard.deleted")} "${study.title}".`);
    } catch (e) {
      setSessionMessage(`${t("hostDashboard.deleteStudyFailure")} ${e instanceof Error ? e.message : t("hostDashboard.unknownError")}`);
      await loadDashboard();
    } finally {
      setStudyAction(null);
    }
  }

  async function deleteSession(savedSession: StudySession) {
    if (deletingSession || creatingSession) return;

    const sessionName = savedSession.session_name || t("hostDashboard.defaultSession");
    const confirmed = window.confirm(
      `${t("hostDashboard.confirmSessionPrefix")} "${sessionName}" (${savedSession.join_code})?\n\n${t("hostDashboard.confirmSessionSuffix")}`
    );
    if (!confirmed) return;

    setDeletingSession(savedSession.id);
    setSessionMessage("");

    try {
      const { data, error: deleteError } = await supabase
        .from("study_sessions")
        .delete()
        .eq("id", savedSession.id)
        .select("id");

      if (deleteError) {
        setSessionMessage(t("hostDashboard.deleteSessionFailure") + " " + deleteError.message);
        return;
      }
      if (!data || data.length === 0) {
        setSessionMessage(t("hostDashboard.sessionNotDeleted"));
        return;
      }

      setSessions((previous) => previous.filter((item) => item.id !== savedSession.id));
      setCreatedSession((previous) =>
        previous?.id === savedSession.id ? null : previous
      );
      setSessionMessage(`${t("hostDashboard.deletedSession")} ${sessionName}`);
    } catch {
      setSessionMessage(t("hostDashboard.deleteUnexpected"));
    } finally {
      setDeletingSession(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-xl font-bold text-indigo-700">
            {t("hostDashboard.homeTitle")}
          </Link>
          <Link
            href="/host"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {t("hostDashboard.createStudy")}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t("hostDashboard.myStudies")}</h1>
            <p className="mt-2 text-slate-600">
              {t("hostDashboard.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AdminLink />
            <button
              type="button"
              onClick={refreshDashboard}
              disabled={loading || refreshing}
              className="rounded-lg border border-indigo-600 px-4 py-2 font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              {refreshing ? t("hostDashboard.refreshing") : t("hostDashboard.refreshSessions")}
            </button>
          </div>
        </div>

        {loading && <p>{t("hostDashboard.loading")}</p>}
        {error && (
          <p role="alert" className="mb-6 text-red-600">
            {t("hostDashboard.loadError")} {error}
          </p>
        )}

        {!loading && !error && studies.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="mb-4 text-slate-600">{t("hostDashboard.empty")}</p>
            <Link href="/host" className="font-medium text-indigo-700 hover:underline">
              {t("hostDashboard.first")}
            </Link>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-5">
            {studies.map((study) => {
              const studyQuestions = questionsForStudy(study.id);
              const studySessions = sessionsForStudy(study.id);
              const expanded = expandedStudy === study.id;

              return (
                <article
                  key={study.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <h2 className="text-xl font-semibold">{study.title}</h2>
                  {study.passage && <p className="mt-1 text-indigo-700">{study.passage}</p>}
                  {study.description && (
                    <p className="mt-3 text-slate-600">{study.description}</p>
                  )}
                  <p className="mt-4 text-sm text-slate-500">
                    {studyQuestions.length} {t("hostDashboard.discussionQuestions")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpandedStudy(expanded ? null : study.id)}
                    className="mt-4 rounded-lg border border-indigo-600 px-4 py-2 font-medium text-indigo-700 hover:bg-indigo-50"
                  >
                    {expanded ? t("hostDashboard.hideQuestions") : t("hostDashboard.viewQuestions")}
                  </button>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link href={`/host/study/${study.id}/edit`} className="rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50">
                      {t("hostDashboard.editStudy")}
                    </Link>
                    <button type="button" onClick={() => void duplicateStudy(study)} disabled={studyAction !== null}
                      className="rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50 disabled:opacity-50">
                      {studyAction === study.id ? t("hostDashboard.working") : t("hostDashboard.duplicate")}
                    </button>
                    <button type="button" onClick={() => void deleteStudy(study)} disabled={studyAction !== null}
                      className="rounded-lg border border-red-300 px-4 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                      {t("hostDashboard.deleteStudy")}
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
                      {studyQuestions.map((question) => (
                        <div key={question.id} className="rounded-lg bg-slate-50 p-4">
                          <p className="font-semibold">{t("hostDashboard.question")} {question.question_number}</p>
                          <p className="mt-2 text-slate-700">{question.question_text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSessionForm(expandedSessionForm === study.id ? null : study.id)
                    }
                    aria-expanded={expandedSessionForm === study.id}
                    aria-controls={`session-form-${study.id}`}
                    className="mt-4 ml-3 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
                  >
                    {expandedSessionForm === study.id ? t("hostDashboard.hideForm") : t("hostDashboard.startSession")}
                  </button>

                  {expandedSessionForm === study.id && (
                  <section id={`session-form-${study.id}`} className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="font-semibold">{t("hostDashboard.startLive")}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {t("hostDashboard.createDescription")}
                    </p>
                    <label
                      htmlFor={`session-name-${study.id}`}
                      className="mt-4 block text-sm font-medium"
                    >
                      {t("hostDashboard.sessionName")}
                    </label>
                    <input
                      id={`session-name-${study.id}`}
                      type="text"
                      value={sessionNames[study.id] ?? ""}
                      onChange={(event) =>
                        setSessionNames((previous) => ({
                          ...previous,
                          [study.id]: event.target.value,
                        }))
                      }
                      placeholder={t("hostDashboard.nameExample")}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3"
                    />
                    <button
                      type="button"
                      onClick={() => createSession(study.id)}
                      disabled={creatingSession !== null}
                      className="mt-4 rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {creatingSession === study.id ? t("hostDashboard.creating") : t("hostDashboard.startSession")}
                    </button>

                    {createdSession?.studyId === study.id && (
                      <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-white p-4">
                        <p className="font-semibold text-emerald-800">{t("hostDashboard.sessionCreated")}</p>
                        <p className="mt-2 text-sm text-slate-600">{createdSession.name}</p>
                        <p className="mt-3 text-sm text-slate-600">{t("hostDashboard.joiningCode")}</p>
                        <p className="text-2xl font-bold tracking-widest text-indigo-700">
                          {createdSession.code}
                        </p>
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(createdSession.code)}
                          className="mt-3 text-sm font-medium text-indigo-700 hover:underline"
                        >
                          {t("hostDashboard.copyJoiningCode")}
                        </button>
                        <Link
                          href={`/host/session/${createdSession.id}`}
                          className="mt-4 block w-fit rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700"
                        >
                          {t("hostDashboard.openControls")}
                        </Link>
                      </div>
                    )}
                  </section>
                  )}

                  <section className="mt-6">
                    <h3 className="text-lg font-semibold">
                      {t("hostDashboard.savedSessions")} ({studySessions.length})
                    </h3>
                    {studySessions.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">
                        {t("hostDashboard.noSessions")}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {studySessions.map((savedSession) => (
                          <div
                            key={savedSession.id}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-semibold">
                                {savedSession.session_name || t("hostDashboard.defaultSession")}
                              </h4>
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  savedSession.status === "live"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : savedSession.status === "waiting"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {savedSession.status === "live"
                                  ? t("hostDashboard.live")
                                  : savedSession.status === "waiting"
                                    ? t("hostDashboard.waiting")
                                    : t("hostDashboard.ended")}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">
                              {t("hostDashboard.joinCode")} <strong className="tracking-wider">{savedSession.join_code}</strong>
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {savedSession.current_question} {t("hostDashboard.of")} {studyQuestions.length} {t("hostDashboard.questionsRevealed")}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {t("hostDashboard.created")} {new Date(savedSession.created_at).toLocaleString(language === "ro" ? "ro-RO" : "en-US")}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-4">
                              <Link
                                href={`/host/session/${savedSession.id}`}
                                className="font-medium text-indigo-700 hover:underline"
                              >
                                {savedSession.status === "ended"
                                  ? t("hostDashboard.viewSession")
                                  : t("hostDashboard.openControls")}
                              </Link>
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(savedSession.join_code)}
                                className="text-sm font-medium text-slate-600 hover:underline"
                              >
                                {t("hostDashboard.copyCode")}
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteSession(savedSession)}
                                disabled={deletingSession !== null || creatingSession !== null}
                                className="text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingSession === savedSession.id
                                  ? t("hostDashboard.deleting")
                                  : t("hostDashboard.deleteSession")}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </article>
              );
            })}
          </div>
        )}

        {sessionMessage && (
          <p role="status" className="mt-6 font-medium text-indigo-700">
            {sessionMessage}
          </p>
        )}
      </div>
    </main>
  );
}
