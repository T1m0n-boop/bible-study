"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../../lib/supabase";
import { PresentationPreview, type PresentationContent } from "../../../../../components/PresentationBlocks";
import { useLanguage } from "../../../../../components/LanguageProvider";

type Session = {
  id: string;
  study_id: string;
  session_name: string | null;
  status: "waiting" | "live" | "ended";
  current_block: number;
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

type Block = {
  id: string;
  block_type: "question" | "slide" | "text" | "image";
  question_id: string | null;
  sort_order: number;
  content: PresentationContent | null;
};

export default function ProjectorClient() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const ro = language === "ro";
  const [session, setSession] = useState<Session | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [supplements, setSupplements] = useState<SupplementItem[]>([]);
  const [supplementError, setSupplementError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const refreshPosition = useCallback(async () => {
    const { data, error: requestError } = await supabase.from("study_sessions")
      .select("id, study_id, session_name, status, current_block")
      .eq("id", id).single();
    if (requestError || !data) {
      setError(requestError?.message ?? "Session not found");
    } else {
      setSession(data as Session);
      setError("");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    let active = true;
    async function loadContent() {
      const { data: sessionData, error: sessionError } = await supabase.from("study_sessions")
        .select("id, study_id, session_name, status, current_block")
        .eq("id", id).single();
      if (!active) return;
      if (sessionError || !sessionData) {
        setError(sessionError?.message ?? "Session not found");
        setLoading(false);
        return;
      }
      const [studyResult, questionsResult, blocksResult] = await Promise.all([
        supabase.from("studies").select("title, passage").eq("id", sessionData.study_id).single(),
        supabase.from("study_questions").select("id, question_number, question_text")
          .eq("study_id", sessionData.study_id).order("question_number"),
        supabase.from("study_content_blocks")
          .select("id, block_type, question_id, sort_order, content")
          .eq("study_id", sessionData.study_id).order("sort_order"),
      ]);
      if (!active) return;
      const problem = studyResult.error || questionsResult.error || blocksResult.error;
      if (problem) {
        setError(problem.message);
      } else {
        setStudy(studyResult.data as Study);
        setQuestions((questionsResult.data ?? []) as Question[]);
        setBlocks((blocksResult.data ?? []) as Block[]);
        setSession(sessionData as Session);
        setError("");
      }
      setLoading(false);
    }
    void loadContent();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    let pending = false;
    const poll = async () => {
      if (!active || pending) return;
      pending = true;
      try { await refreshPosition(); } finally { pending = false; }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refreshPosition]);

  // Read the same reveal state used by the leader controls. Never display hidden items.
  const refreshSupplements = useCallback(async () => {
    const { data, error: requestError } = await supabase.rpc(
      "get_session_question_items", { p_session_id: id }
    );
    if (requestError) {
      setSupplementError(requestError.message);
      return;
    }
    setSupplements((data ?? []) as SupplementItem[]);
    setSupplementError("");
  }, [id]);

  useEffect(() => {
    let active = true;
    let pending = false;
    const poll = async () => {
      if (!active || pending) return;
      pending = true;
      try { await refreshSupplements(); } finally { pending = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refreshSupplements]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* Fullscreen can be blocked by browser permissions. */ }
  }

  const position = session?.current_block ?? 0;
  const block = position > 0 ? blocks[position - 1] : null;
  const question = block?.block_type === "question"
    ? questions.find(q => q.id === block.question_id) : null;
  const visibleSupplements = question
    ? supplements.filter(item => item.question_id === question.id && item.is_revealed)
      .sort((a, b) => a.sort_order - b.sort_order)
    : [];
  const supplementLabels = ro
    ? { reference: "Referință biblică", hint: "Indiciu", explanation: "Explicație" }
    : { reference: "Bible reference", hint: "Hint", explanation: "Explanation" };

  return (
    <main className="relative flex min-h-dvh flex-col bg-slate-950 text-white">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 opacity-25 transition-opacity hover:opacity-100 focus-within:opacity-100">
        <button type="button" onClick={() => void toggleFullscreen()}
          className="rounded-lg border border-slate-500 bg-slate-900/90 px-4 py-2 text-sm font-medium text-white">
          {fullscreen ? (ro ? "Ieși din ecran complet" : "Exit fullscreen") : (ro ? "Ecran complet" : "Fullscreen")}
        </button>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-xl text-slate-300">{ro ? "Se încarcă..." : "Loading..."}</div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-red-300">{error}</p>
          <Link className="underline" href={`/host/session/${id}`}>{ro ? "Înapoi la conducător" : "Back to leader controls"}</Link>
        </div>
      ) : session?.status === "ended" ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <h1 className="text-4xl font-bold">{ro ? "Sesiunea s-a încheiat" : "Session ended"}</h1>
          <p className="mt-5 text-xl text-slate-300">{study?.title}</p>
        </div>
      ) : session?.status === "waiting" || !block ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <h1 className="max-w-5xl text-4xl font-bold sm:text-6xl">{study?.title || (ro ? "Studiu biblic" : "Bible study")}</h1>
          {study?.passage && <p className="mt-7 text-2xl text-slate-300">{study.passage}</p>}
          <p className="mt-10 text-lg text-slate-400">{session?.status === "waiting"
            ? (ro ? "În așteptarea începerii sesiunii" : "Waiting for the session to start")
            : (ro ? "În așteptarea primului element" : "Waiting for the first block")}</p>
        </div>
      ) : block.block_type === "question" ? (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12 text-center sm:px-16 sm:py-16">
          <p className="mb-8 text-xl font-semibold uppercase tracking-widest text-indigo-300">
            {ro ? "Întrebarea" : "Question"} {question?.question_number ?? ""}
          </p>
          <h1 className="max-w-6xl whitespace-pre-wrap break-words text-3xl font-semibold leading-snug sm:text-5xl lg:text-6xl">
            {question?.question_text ?? (ro ? "Întrebarea nu a fost găsită." : "Question not found.")}
          </h1>
          {visibleSupplements.length > 0 && (
            <section className="mt-10 w-full max-w-5xl space-y-4 text-left" aria-label={ro ? "Materiale suplimentare dezvăluite" : "Revealed supplementary materials"}>
              {visibleSupplements.map(item => (
                <article key={item.id} className="rounded-2xl border border-slate-700 bg-slate-900/90 px-6 py-5 sm:px-8">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-300 sm:text-base">
                    {supplementLabels[item.item_type]}
                  </h2>
                  <p className="mt-3 whitespace-pre-wrap break-words text-xl leading-relaxed text-white sm:text-2xl">
                    {item.content}
                  </p>
                </article>
              ))}
            </section>
          )}
          {supplementError && (
            <p role="status" className="mt-6 text-sm text-amber-300">
              {ro ? "Materialele suplimentare nu au putut fi actualizate." : "Supplementary materials could not be refreshed."}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-stretch">
          <PresentationPreview content={block.content ?? {}} type={block.block_type} />
        </div>
      )}
      <footer className="px-6 pb-4 text-center text-xs text-slate-500">
        {session?.session_name || study?.title || "Bible Study"}
      </footer>
    </main>
  );
}
