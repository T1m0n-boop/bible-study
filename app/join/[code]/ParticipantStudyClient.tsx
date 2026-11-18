"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { TouchEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { useLanguage } from "../../../components/LanguageProvider";
import { PresentationPreview, type PresentationContent } from "../../../components/PresentationBlocks";

type TableConfig = { headers: [string, string]; rows: string[] };
type Supplement = {
  id: string;
  item_type: "reference" | "hint" | "explanation";
  content: string;
  sort_order: number;
};
type Question = {
  id: string;
  number: number;
  text: string;
  table_config?: TableConfig | null;
  supplements?: Supplement[];
};
type TableAnswers = Record<string, Record<string, string>>;
type PresentedBlock = {
  id: string;
  type: "question" | "slide" | "image" | "text";
  position: number;
  question_id: string | null;
  content: PresentationContent;
};

type ParticipantSession = {
  session_id: string;
  session_name: string | null;
  status: "waiting" | "live" | "ended";
  current_question: number;
  study_title: string;
  passage: string | null;
  description: string | null;
  questions: Question[];
};

type CloudNote = { question_id: string; note_text: string; table_answers: Record<string, string> | null };

type ParticipantIdentity = {
  participantId: string;
  token: string;
  sessionId: string;
};

function getOrCreateParticipantToken(sessionId: string): string {
  const key = `bible-study-presence-token-${sessionId}`;
  const existing = localStorage.getItem(key);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  localStorage.setItem(key, token);
  return token;
}

function ParticipantStudyContent() {
  const { t } = useLanguage();
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [presentedBlocks, setPresentedBlocks] = useState<PresentedBlock[]>([]);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [contentError, setContentError] = useState("");
  const [participantName, setParticipantName] = useState("Guest");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tableAnswers, setTableAnswers] = useState<TableAnswers>({});
  const tableAnswersRef = useRef<TableAnswers>({});
  const pendingTablesRef = useRef<TableAnswers>({});
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const notesRef = useRef<Record<string, string>>({});
  const pendingRef = useRef<Record<string, string>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identityRef = useRef("");
  const sessionRef = useRef<ParticipantSession | null>(null);
  const userRef = useRef<User | null>(null);
  const notesReadyRef = useRef(false);
  const saveInProgressRef = useRef(false);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [followingLeader, setFollowingLeader] = useState(true);
  const lastSessionIdRef = useRef("");
  const [viewMode, setViewMode] = useState<"focused" | "continuous">("focused");
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [participantIdentity, setParticipantIdentity] = useState<ParticipantIdentity | null>(null);
  const [presenceError, setPresenceError] = useState("");
  const [readyQuestion, setReadyQuestion] = useState<number | null>(null);
  const [readyBusy, setReadyBusy] = useState(false);
  const draftKey = (sid: string, uid: string) => `bible-study-pending-${sid}-${uid}`;
  function backupDrafts(sid: string, uid: string) {
    try { localStorage.setItem(draftKey(sid, uid), JSON.stringify(pendingRef.current)); } catch {}
  }
  function recoverDrafts(sid: string, uid: string): Record<string,string> {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(draftKey(sid,uid)) || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).filter((e): e is [string,string] => typeof e[1] === "string"))
        : {};
    } catch { return {}; }
  }

  const tableDraftKey = (sid: string, uid: string) => `bible-study-pending-tables-${sid}-${uid}`;
  const guestTableKey = (sid: string) => `bible-study-table-answers-${sid}`;
  function setDisplayedTables(value: TableAnswers) { tableAnswersRef.current = value; setTableAnswers(value); }
  function readTables(key: string): TableAnswers {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      return Object.fromEntries(Object.entries(raw).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v)).map(([id, v]) => [id, Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"))]));
    } catch { return {}; }
  }
  function backupTableDrafts(sid: string, uid: string) {
    try { localStorage.setItem(tableDraftKey(sid, uid), JSON.stringify(pendingTablesRef.current)); } catch {}
  }
  function setDisplayedNotes(value: Record<string, string>) {
    notesRef.current = value;
    setNotes(value);
  }

  const flushNotes = useCallback(async () => {
    if (saveInProgressRef.current) return;
    const currentUser = userRef.current;
    const currentSession = sessionRef.current;
    if (!currentUser || !currentSession || !notesReadyRef.current) return;

    const entries = Object.entries(pendingRef.current);
    const tableEntries = Object.entries(pendingTablesRef.current);
    if (entries.length === 0 && tableEntries.length === 0) return;
    const questionIds = [...new Set([...entries.map(([id]) => id), ...tableEntries.map(([id]) => id)])];
    pendingRef.current = {};
    pendingTablesRef.current = {};
    backupDrafts(currentSession.session_id, currentUser.id);
    backupTableDrafts(currentSession.session_id, currentUser.id);
    saveInProgressRef.current = true;
    setSaveStatus(t("live.saving"));

    const rows = questionIds.map((question_id) => ({
      user_id: currentUser.id,
      session_id: currentSession.session_id,
      question_id,
      note_text: notesRef.current[question_id] ?? "",
      table_answers: tableAnswersRef.current[question_id] ?? {},
      updated_at: new Date().toISOString(),
    }));
    const { error: saveError } = await supabase
      .from("participant_notes")
      .upsert(rows, { onConflict: "user_id,session_id,question_id" });

    saveInProgressRef.current = false;
    if (saveError) {
      // Keep the latest local edits available for a retry.
      for (const [questionId, text] of entries) {
        if (!(questionId in pendingRef.current)) pendingRef.current[questionId] = text;
      }
      for (const [questionId, answers] of tableEntries) {
        if (!(questionId in pendingTablesRef.current)) pendingTablesRef.current[questionId] = answers;
      }
      backupDrafts(currentSession.session_id, currentUser.id);
      backupTableDrafts(currentSession.session_id, currentUser.id);
      setSaveStatus(t("live.cloudFailed"));
    } else {
      backupDrafts(currentSession.session_id, currentUser.id);
      backupTableDrafts(currentSession.session_id, currentUser.id);
      setSaveStatus(Object.keys(pendingRef.current).length || Object.keys(pendingTablesRef.current).length ? t("live.saving") : t("live.savedToAccount"));
    }
    if (!saveError && (Object.keys(pendingRef.current).length || Object.keys(pendingTablesRef.current).length) && userRef.current?.id === currentUser.id && sessionRef.current?.session_id === currentSession.session_id) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flushNotes(), 800);
    }
  }, []);

  // Authentication can change while the page is open.
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setAccountReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (!active) return;
      setUser(authSession?.user ?? null);
      setAccountReady(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSession() {
      const { data, error: lookupError } = await supabase.rpc("get_participant_session", { p_join_code: code });
      if (!active) return;
      if (lookupError) {
        setError("Could not load session: " + lookupError.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setError(t("live.notFound"));
        setSession(null);
        sessionRef.current = null;
        setLoading(false);
        return;
      }
      const { data: contentData, error: blocksError } = await supabase.rpc(
        "get_participant_session_content", { p_join_code: code }
      );
      if (!active) return;
      if (blocksError) {
        setContentError(blocksError.message);
      } else {
        setContentError("");
        setPresentedBlocks((contentData?.blocks ?? []) as PresentedBlock[]);
        setCurrentBlock(contentData?.current_block ?? 0);
      }
      const result = data as ParticipantSession;
      sessionRef.current = result;
      setSession(result);
      setParticipantName(localStorage.getItem(`bible-study-participant-${result.session_id}`) || "Guest");
      setError("");
      setLoading(false);
    }
    void loadSession();
    const interval = setInterval(() => void loadSession(), 3000);
    return () => { active = false; clearInterval(interval); };
  }, [code]);

  // Register one stable participant identity per browser and session.
  // The token stays on this device; only its hash is stored in Supabase.
  useEffect(() => {
    if (!session || session.status === "ended") return;
    const sessionId = session.session_id;
    let active = true;

    async function register() {
      try {
        const token = getOrCreateParticipantToken(sessionId);
        const name = (localStorage.getItem(`bible-study-participant-${sessionId}`) || "Guest")
          .trim().slice(0, 60) || "Guest";
        const { data, error: registerError } = await supabase.rpc(
          "register_session_participant",
          { p_join_code: code, p_display_name: name, p_token: token }
        );
        if (!active) return;
        if (registerError || typeof data !== "string") {
          setPresenceError(registerError?.message ?? t("live.registerFail"));
          return;
        }
        setParticipantIdentity({ participantId: data, token, sessionId });
        setPresenceError("");
      } catch {
        if (active) setPresenceError(t("live.identityFail"));
      }
    }

    void register();
    return () => { active = false; };
  }, [session?.session_id, session?.status === "ended", code]);

  // Heartbeats let the leader see who is currently online.
  useEffect(() => {
    if (!participantIdentity || session?.status === "ended") return;
    let active = true;
    async function heartbeat() {
      if (document.visibilityState === "hidden") return;
      const { data, error: heartbeatError } = await supabase.rpc(
        "session_participant_heartbeat",
        {
          p_participant_id: participantIdentity!.participantId,
          p_token: participantIdentity!.token,
        }
      );
      if (!active) return;
      if (heartbeatError || data !== true) {
        setPresenceError(heartbeatError?.message ?? t("live.connectionFail"));
      } else {
        setPresenceError("");
      }
    }
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 10000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [participantIdentity, session?.status === "ended"]);

  // Display preference is local to this browser; no database change is required.
  useEffect(() => {
    try {
      if (localStorage.getItem("bible-study-question-view") === "continuous") {
        setViewMode("continuous");
      }
    } catch { /* Storage may be unavailable. */ }
  }, []);

  function changeViewMode(mode: "focused" | "continuous") {
    setViewMode(mode);
    try { localStorage.setItem("bible-study-question-view", mode); } catch {}
  }

  // The API must return only blocks the session has already presented.
  // In particular, the SQL function must retain the highest-ever revealed position
  // when the leader steps backwards (see accompanying SQL instructions).
  const availableBlocks = [...presentedBlocks].sort((a, b) => a.position - b.position);
  const leaderPosition = availableBlocks.some(block => block.position === currentBlock)
    ? currentBlock : null;
  const activePosition = followingLeader && leaderPosition !== null
    ? leaderPosition : (availableBlocks.some(block => block.position === selectedPosition)
      ? selectedPosition : leaderPosition ?? availableBlocks.at(-1)?.position ?? null);
  const activeIndex = availableBlocks.findIndex(block => block.position === activePosition);
  const visibleBlocks = viewMode === "focused"
    ? availableBlocks.filter(block => block.position === activePosition) : availableBlocks;
  const blockShortcuts = (() => {
    let question = 0;
    let other = 0;
    return availableBlocks.map(block => ({
      ...block,
      shortcut: block.type === "question" ? `Q${++question}` : `B${++other}`,
    }));
  })();

  useEffect(() => {
    if (!session) return;
    if (lastSessionIdRef.current !== session.session_id) {
      lastSessionIdRef.current = session.session_id;
      setFollowingLeader(true);
      setSelectedPosition(null);
    }
  }, [session?.session_id]);

  // Scroll only on deliberate navigation and when a following participant is
  // advanced by the leader; routine polling must not interrupt text entry.
  const previousLeaderRef = useRef<number | null>(null);
  useEffect(() => {
    const changed = previousLeaderRef.current !== currentBlock;
    previousLeaderRef.current = currentBlock;
    if (changed && followingLeader && leaderPosition !== null && viewMode === "continuous") {
      requestAnimationFrame(() => document.getElementById(`block-${leaderPosition}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [currentBlock, followingLeader, leaderPosition, viewMode]);

  function navigateBlock(position: number) {
    if (!availableBlocks.some(block => block.position === position)) return;
    setSelectedPosition(position);
    setFollowingLeader(false);
    if (viewMode === "continuous") {
      requestAnimationFrame(() => document.getElementById(`block-${position}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function followLeader() {
    if (leaderPosition === null) return;
    setSelectedPosition(leaderPosition);
    setFollowingLeader(true);
    if (viewMode === "continuous") {
      requestAnimationFrame(() => document.getElementById(`block-${leaderPosition}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    if (viewMode !== "focused" || event.touches.length !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, button, select, a, [contenteditable='true']")) return;
    touchStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || viewMode !== "focused" || event.changedTouches.length !== 1) return;
    const deltaX = event.changedTouches[0].clientX - start.x;
    const deltaY = event.changedTouches[0].clientY - start.y;
    if (Math.abs(deltaX) < 65 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
    const next = availableBlocks[activeIndex + (deltaX < 0 ? 1 : -1)];
    if (next) navigateBlock(next.position);
  }

  // Readiness belongs to the current question, not the whole session.
  useEffect(() => {
    setReadyQuestion(null);
  }, [session?.session_id, session?.current_question]);

  async function toggleReady() {
    if (!session || session.status !== "live" || session.current_question < 1 ||
        !participantIdentity || readyBusy) return;

    const questionNumber = session.current_question;
    const nextReady = readyQuestion !== questionNumber;
    setReadyBusy(true);
    setPresenceError("");

    const { data, error: readyError } = await supabase.rpc(
      "set_session_participant_ready",
      {
        p_participant_id: participantIdentity.participantId,
        p_token: participantIdentity.token,
        p_question_number: questionNumber,
        p_is_ready: nextReady,
      }
    );
    if (readyError || data !== true) {
      setPresenceError(readyError?.message ?? t("live.readinessFail"));
    } else if (sessionRef.current?.current_question === questionNumber) {
      setReadyQuestion(nextReady ? questionNumber : null);
    }
    setReadyBusy(false);
  }

  // Load notes only when the session or signed-in identity changes.
  useEffect(() => {
    if (!accountReady || !session) return;
    const key = `${session.session_id}:${user?.id ?? "guest"}`;
    if (identityRef.current === key) return;
    identityRef.current = key;
    let active = true;
    notesReadyRef.current = false;
    setNotesLoaded(false);
    setSaveStatus("");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingRef.current = {};
    pendingTablesRef.current = {};
    userRef.current = user;
    setDisplayedTables({});
    setDisplayedNotes({});

    async function loadNotes() {
      if (!user) {
        const saved = localStorage.getItem(`bible-study-notes-${session!.session_id}`);
        let parsed: Record<string, string> = {};
        if (saved) {
          try {
            const value: unknown = JSON.parse(saved);
            if (value && typeof value === "object" && !Array.isArray(value)) {
              parsed = Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
            }
          } catch { /* Ignore invalid local data. */ }
        }
        if (!active) return;
        setDisplayedNotes(parsed);
        setDisplayedTables(readTables(guestTableKey(session!.session_id)));
        notesReadyRef.current = true;
        setNotesLoaded(true);
        return;
      }
      const { data, error: noteError } = await supabase
        .from("participant_notes")
        .select("question_id, note_text, table_answers")
        .eq("user_id", user.id)
        .eq("session_id", session!.session_id);
      if (!active) return;
      if (noteError) {
        setSaveStatus("Could not load cloud notes: " + noteError.message);
        return;
      }
      const loaded = Object.fromEntries(((data ?? []) as CloudNote[]).map((row) => [row.question_id, row.note_text]));
      const loadedTables = Object.fromEntries(((data ?? []) as CloudNote[]).map((row) => [row.question_id, row.table_answers ?? {}]));
      const tableDrafts = readTables(tableDraftKey(session!.session_id, user.id));
      pendingTablesRef.current = tableDrafts;
      setDisplayedTables({ ...loadedTables, ...tableDrafts });
      const drafts = recoverDrafts(session!.session_id, user.id);
      pendingRef.current = drafts;
      setDisplayedNotes({ ...loaded, ...drafts });
      notesReadyRef.current = true;
      setNotesLoaded(true);
      setSaveStatus((Object.keys(drafts).length || Object.keys(tableDrafts).length) ? t("live.recovered") : t("live.storedAccount"));
      if (Object.keys(drafts).length || Object.keys(tableDrafts).length) {
        saveTimer.current = setTimeout(() => void flushNotes(), 1000);
      }
    }
    void loadNotes();
    return () => { active = false; };
  }, [accountReady, session?.session_id, user?.id]);

  // Attempt to save outstanding account notes when leaving the page.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && (Object.keys(pendingRef.current).length || Object.keys(pendingTablesRef.current).length)) void flushNotes();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [flushNotes]);

  function updateNote(questionId: string, value: string) {
    const currentSession = sessionRef.current;
    if (!currentSession || !notesReadyRef.current) return;
    const updated = { ...notesRef.current, [questionId]: value };
    setDisplayedNotes(updated);
    if (!userRef.current) {
      localStorage.setItem(`bible-study-notes-${currentSession.session_id}`, JSON.stringify(updated));
      return;
    }
    pendingRef.current[questionId] = value;
    backupDrafts(currentSession.session_id, userRef.current.id);
    setSaveStatus(t("live.unsaved"));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushNotes(), 800);
  }

  function updateTableAnswer(questionId: string, rowIndex: number, value: string) {
    const currentSession = sessionRef.current;
    if (!currentSession || !notesReadyRef.current) return;
    const updated = { ...tableAnswersRef.current, [questionId]: { ...(tableAnswersRef.current[questionId] ?? {}), [String(rowIndex)]: value } };
    setDisplayedTables(updated);
    if (!userRef.current) {
      localStorage.setItem(guestTableKey(currentSession.session_id), JSON.stringify(updated));
      return;
    }
    pendingTablesRef.current[questionId] = updated[questionId];
    backupTableDrafts(currentSession.session_id, userRef.current.id);
    setSaveStatus(t("live.unsaved"));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushNotes(), 800);
  }

  useEffect(() => {
    const retry = () => { if ((Object.keys(pendingRef.current).length || Object.keys(pendingTablesRef.current).length)) void flushNotes(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [flushNotes]);

  function exportNotes() {
    if (!session) return;
    const lines = [
      session.study_title,
      ...(session.passage?.trim() ? [session.passage.trim()] : []),
      session.session_name || "Bible Study Session",
      `${t("live.participant")}: ${participantName}`,
      "",
      ...session.questions.flatMap((question) => [
        `${t("live.question")} ${question.number}: ${question.text}`,
        ...(question.supplements ?? []).map(item => `${item.item_type === "reference" ? t("live.reference") : item.item_type === "hint" ? t("live.hint") : t("live.explanation")}: ${item.content}`),
        ...(question.table_config ? [
          `${question.table_config.headers[0]} | ${question.table_config.headers[1]}`,
          ...question.table_config.rows.map((label, index) => `${label} | ${tableAnswers[question.id]?.[String(index)] ?? ""}`),
          "",
        ] : []),
        t("live.personalNotesExport"),
        notes[question.id]?.trim() || t("live.noNotes"),
        "",
      ]),
    ];
    const file = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bible-study-notes-${session.session_id}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (loading) return <main className="p-8 text-center">{t("live.loadingJoining")}</main>;
  if (error && !session) return (
    <main className="min-h-screen bg-slate-50 p-8 text-center">
      <p className="text-red-600">{error}</p>
      <Link href="/join" className="mt-5 inline-block font-medium text-indigo-700">{t("live.returnJoin")}</Link>
    </main>
  );
  if (!session) return null;

  return (
    <main className="min-h-screen bg-slate-50 px-3 pb-44 pt-5 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="font-medium text-indigo-700 hover:underline">← {t("live.home")}</Link>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-8 sm:p-6">
          <p className="text-sm text-slate-500">{t("live.welcome")}, {participantName}</p>
          <h1 className="mt-3 break-words text-2xl font-bold sm:text-3xl">{session.study_title}</h1>
          {session.passage && <p className="mt-2 font-medium text-indigo-700">{session.passage}</p>}
          {session.description && <p className="mt-3 text-slate-600">{session.description}</p>}
          <div className="mt-6 rounded-lg bg-indigo-50 p-4">
            <p className="font-medium">{session.session_name || "Bible Study Session"}</p>
            <p className="mt-2 text-sm">{t("live.status")}: <strong>{session.status === "waiting" ? t("live.waiting") : session.status === "ended" ? t("live.ended") : t("live.live")}</strong></p>
            <p className="mt-1 text-sm">{t("live.revealed")}: {session.questions.length}</p>
            <div role="progressbar" aria-label={t("live.revealed")} aria-valuenow={session.questions.length} aria-valuemin={0} aria-valuemax={Math.max(1, session.current_question, session.questions.length)} className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100">
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${100 * session.questions.length / Math.max(1, session.current_question, session.questions.length)}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-600">{t("live.newAppear")}</p>
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 p-4 text-sm">
            {user ? (
              <p>{t("live.signedAs")} <strong>{user.email}</strong>. {t("live.savedAccount")}</p>
            ) : (
              <p>{t("live.guestMessage")} <Link href="/participant-login" className="font-medium text-indigo-700 underline">{t("live.signIn")}</Link> {t("live.cloudNotes")}</p>
            )}
            {user && <button type="button" onClick={async () => { await flushNotes(); await supabase.auth.signOut(); }} className="mt-2 font-medium text-indigo-700 underline">{t("live.signOut")}</button>}
            {saveStatus && <p role="status" className="mt-2 text-slate-600">{saveStatus}</p>}
            {user && <button type="button" onClick={() => void flushNotes()} className="mt-3 min-h-11 rounded-lg border border-indigo-600 px-4 py-2 font-medium text-indigo-700">{t("live.retry")}</button>}
          </div>
        </div>
        {presenceError && session.status !== "ended" && (
          <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {t("live.presence")}: {presenceError}
          </p>
        )}
        {session.status === "ended" && <p className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-slate-700">{t("live.endedInfo")}</p>}
        {availableBlocks.length > 0 && (
          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold text-slate-700">{t("live.questionDisplay")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={t("live.questionDisplay")}>
              <button type="button" onClick={() => changeViewMode("focused")}
                aria-pressed={viewMode === "focused"}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium ${viewMode === "focused" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                {t("live.oneAtATime")}
              </button>
              <button type="button" onClick={() => changeViewMode("continuous")}
                aria-pressed={viewMode === "continuous"}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium ${viewMode === "continuous" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                {t("live.continuous")}
              </button>
            </div>
          </section>
        )}
        {contentError && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-800">{contentError}</p>}
        {availableBlocks.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <h2 className="text-xl font-semibold">{session.status === "ended" ? t("live.noQuestions") : t("live.waitingFirst")}</h2>
            <p className="mt-3 text-slate-600">{session.status === "ended" ? t("live.endedNoQuestions") : t("live.leaderWill")}</p>
          </div>
        ) : (
          <div className="mt-6 space-y-5" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {visibleBlocks.map((block) => {
              const question = block.type === "question"
                ? session.questions.find(q => q.id === block.question_id) : undefined;
              const shortcut = blockShortcuts.find(item => item.id === block.id)?.shortcut;
              return <article id={`block-${block.position}`} key={block.id} className="scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700">{shortcut} · {block.type}</p>
                {block.type !== "question" ? (
                  <PresentationPreview content={block.content ?? {}} type={block.type} compact />
                ) : question ? (<>
                <p className="text-sm font-semibold text-indigo-700">{t("live.question")} {question.number}</p>
                <h2 className="mt-2 whitespace-pre-wrap break-words text-lg font-semibold leading-relaxed sm:text-xl">{question.text}</h2>
                {(question.supplements ?? []).length > 0 && (
                  <section className="mt-5 space-y-3" aria-label={`${t("live.additional")} — ${t("live.question")} ${question.number}`}>
                    <h3 className="font-semibold text-slate-800">{t("live.additional")}</h3>
                    {[...(question.supplements ?? [])]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((item) => (
                        <div key={item.id} className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                            {item.item_type === "reference" ? t("live.reference") : item.item_type === "hint" ? t("live.hint") : t("live.explanation")}
                          </p>
                          <p className="whitespace-pre-wrap break-words text-slate-800">{item.content}</p>
                        </div>
                      ))}
                  </section>
                )}
                {question.table_config && (
                  <div className="mt-5 overflow-x-auto">
                    <h3 className="mb-3 font-semibold">{t("live.table")}</h3>
                    <table className="w-full border-collapse text-left text-sm sm:text-base">
                      <thead><tr>
                        <th className="w-2/5 border border-slate-300 bg-slate-100 p-3">{question.table_config.headers[0]}</th>
                        <th className="border border-slate-300 bg-slate-100 p-3">{question.table_config.headers[1]}</th>
                      </tr></thead>
                      <tbody>{question.table_config.rows.map((rowLabel, index) => (
                        <tr key={index}>
                          <th scope="row" className="border border-slate-300 p-3 font-medium">{rowLabel}</th>
                          <td className="border border-slate-300 p-2">
                            <input type="text" aria-label={`${question.table_config!.headers[1]} for ${rowLabel}`}
                              value={tableAnswers[question.id]?.[String(index)] ?? ""}
                              onChange={(e) => updateTableAnswer(question.id, index, e.target.value)}
                              disabled={!notesLoaded} placeholder={t("live.answerOptional")}
                              className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base disabled:opacity-50" />
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                <div className="mt-5">
                  <label htmlFor={`note-${question.id}`} className="block text-sm font-medium text-slate-700">{t("live.personalNotes")}</label>
                  <textarea id={`note-${question.id}`} value={notes[question.id] ?? ""} onChange={(event) => updateNote(question.id, event.target.value)} placeholder={t("live.notesPlaceholder")} rows={6} disabled={!notesLoaded} className="mt-2 w-full min-h-44 resize-y rounded-xl border border-slate-300 bg-white p-4 text-base leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50" />
                  <p className="mt-2 text-xs text-slate-500">{user ? t("live.syncBackup") : t("live.savedDevice")}</p>
                </div>
                </>) : <p className="text-sm text-amber-800">This question is not currently returned by the session API. Update get_participant_session to retain previously presented questions.</p>}
              </article>;
            })}
          </div>
        )}
        {availableBlocks.length > 0 && (
          <div className="mt-5 space-y-4">
            {viewMode === "focused" && availableBlocks.length > 1 && (
              <nav aria-label={t("live.questionNavigation")} className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { const previous = availableBlocks[activeIndex - 1]; if (previous) navigateBlock(previous.position); }} disabled={activeIndex <= 0}
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                  ← {t("live.previous")}
                </button>
                <button type="button" onClick={() => { const next = availableBlocks[activeIndex + 1]; if (next) navigateBlock(next.position); }} disabled={activeIndex >= availableBlocks.length - 1}
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                  {t("live.next")} →
                </button>
              </nav>
            )}
        {session.status === "live" && session.current_question > 0 && availableBlocks.find(block => block.position === currentBlock)?.type === "question" && (
          <section className="mt-5 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold">{t("live.readyTitle")}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {t("live.readyGeneral")}
            </p>
            <button
              type="button"
              onClick={() => void toggleReady()}
              disabled={!participantIdentity || readyBusy}
              className={`mt-4 min-h-12 w-full rounded-xl px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                readyQuestion === session.current_question
                  ? "bg-emerald-700 hover:bg-emerald-800"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {readyBusy
                ? t("live.updating")
                : !participantIdentity
                  ? t("live.connecting")
                  : readyQuestion === session.current_question
                    ? t("live.readyUndo")
                    : t("live.readyButton")}
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">
              {t("live.leaderDecides")}
            </p>
          </section>
        )}
            <button type="button" onClick={exportNotes} className="w-full min-h-12 rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700">{t("live.export")}</button>
          </div>
        )}
        {error && <p role="alert" className="mt-6 text-sm text-red-600">{error}</p>}
      </div>
      {session.status === "live" && availableBlocks.length > 0 && (
        <nav aria-label="Study block navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-2 shadow-lg backdrop-blur-sm" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto max-w-3xl">
            <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Previously presented blocks">
              {blockShortcuts.map(block => (
                <button key={block.id} type="button" onClick={() => navigateBlock(block.position)}
                  title={`${block.type === "question" ? "Question" : "Content block"} · ${block.content?.title || block.shortcut}`}
                  aria-current={activePosition === block.position ? "step" : undefined}
                  className={`min-h-11 min-w-12 shrink-0 rounded-lg border px-3 font-semibold ${activePosition === block.position ? "border-indigo-700 bg-indigo-600 text-white" : block.type === "question" ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-300 bg-slate-100 text-slate-700"}`}>
                  {block.shortcut}
                </button>
              ))}
            </div>
            <button type="button" onClick={followLeader} disabled={leaderPosition === null}
              className={`min-h-11 w-full rounded-lg px-4 py-2 font-semibold disabled:opacity-50 ${followingLeader ? "border border-emerald-300 bg-emerald-50 text-emerald-800" : "bg-indigo-600 text-white"}`}>
              {followingLeader ? "✓ Following Leader" : "↪ Follow Leader"}
            </button>
          </div>
        </nav>
      )}
    </main>
  );
}

function LoadingFallback() {
  const { t } = useLanguage();
  return <main className="min-h-screen bg-slate-50 p-8 text-center">{t("live.loadingStudy")}</main>;
}

export default function ParticipantStudyPage() {
  return <Suspense fallback={<LoadingFallback />}><ParticipantStudyContent /></Suspense>;
}
