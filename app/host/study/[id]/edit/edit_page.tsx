"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../../../lib/supabase";
import QuestionTableBuilder, { type QuestionTableConfig, normalizeQuestionTable, validateQuestionTable } from "../../../../../components/QuestionTableBuilder";
import QuestionSupplementBuilder, { type SupplementItem, validateSupplementItems } from "../../../../../components/QuestionSupplementBuilder";

type Question = { id?: string; localId: string; question_text: string; table_config: QuestionTableConfig | null; supplements: SupplementItem[] };
type StoredItem = { id: string; question_id: string; item_type: SupplementItem["item_type"]; content: string; sort_order: number };

export default function EditStudyPage() {
  const params = useParams();
  const router = useRouter();
  const studyId = String(params.id);
  const [title, setTitle] = useState("");
  const [passage, setPassage] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [originalItemIds, setOriginalItemIds] = useState<string[]>([]);
  const [hasSessions, setHasSessions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [study, questionResult, sessionResult] = await Promise.all([
        supabase.from("studies").select("title, passage, description").eq("id", studyId).single(),
        supabase.from("study_questions").select("id, question_text, question_number, table_config").eq("study_id", studyId).order("question_number"),
        supabase.from("study_sessions").select("id").eq("study_id", studyId).limit(1),
      ]);
      if (!active) return;
      const failure = study.error || questionResult.error || sessionResult.error;
      if (failure) { setError(failure.message); setLoading(false); return; }
      const questionIds = (questionResult.data ?? []).map(q => q.id);
      const itemResult = questionIds.length
        ? await supabase.from("study_question_items").select("id, question_id, item_type, content, sort_order").in("question_id", questionIds).order("sort_order")
        : { data: [] as StoredItem[], error: null };
      if (!active) return;
      if (itemResult.error) { setError(itemResult.error.message); setLoading(false); return; }
      const storedItems = (itemResult.data ?? []) as StoredItem[];
      setTitle(study.data.title);
      setPassage(study.data.passage ?? "");
      setDescription(study.data.description ?? "");
      setQuestions((questionResult.data ?? []).map(q => ({
        id: q.id, localId: q.id, question_text: q.question_text, table_config: q.table_config ?? null,
        supplements: storedItems.filter(item => item.question_id === q.id).map(item => ({ id: item.id, localId: item.id, item_type: item.item_type, content: item.content })),
      })));
      setOriginalIds(questionIds);
      setOriginalItemIds(storedItems.map(item => item.id));
      setHasSessions((sessionResult.data?.length ?? 0) > 0);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [studyId]);

  function updateQuestion(index: number, change: Partial<Question>) {
    setQuestions(old => old.map((q, i) => i === index ? { ...q, ...change } : q));
  }
  function moveQuestion(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= questions.length) return;
    setQuestions(old => {
      const next = [...old];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    if (saving || hasSessions) return;
    if (!title.trim()) { setError("Please enter a study title."); return; }
    if (!questions.length || questions.some(q => !q.question_text.trim())) {
      setError("Add at least one question and fill in every question."); return;
    }
    for (let i = 0; i < questions.length; i++) {
      const tableError = validateQuestionTable(questions[i].table_config);
      if (tableError) { setError(`Question ${i + 1}: ${tableError}`); return; }
      const supplementError = validateSupplementItems(questions[i].supplements);
      if (supplementError) { setError(`Question ${i + 1}: ${supplementError}`); return; }
    }
    setSaving(true);
    setError("");
    try {
      const { data: sessions, error: sessionError } = await supabase.from("study_sessions").select("id").eq("study_id", studyId).limit(1);
      if (sessionError) throw new Error(sessionError.message);
      if (sessions?.length) throw new Error("A session now exists for this study. Editing is locked.");
      const { error: studyError } = await supabase.from("studies").update({
        title: title.trim(), passage: passage.trim() || null, description: description.trim() || null,
      }).eq("id", studyId);
      if (studyError) throw new Error(studyError.message);

      // Move existing question numbers out of the way before reordering to avoid unique-index collisions.
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.id) continue;
        const { error } = await supabase.from("study_questions").update({ question_number: 100000 + i }).eq("id", q.id).eq("study_id", studyId);
        if (error) throw new Error(error.message);
      }
      for (const id of originalIds) {
        if (!questions.some(q => q.id === id)) {
          const { error } = await supabase.from("study_questions").delete().eq("id", id).eq("study_id", studyId);
          if (error) throw new Error(error.message);
        }
      }
      const savedQuestionIds: string[] = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const values = { question_number: i + 1, question_text: q.question_text.trim(), table_config: normalizeQuestionTable(q.table_config) };
        if (q.id) {
          const { error } = await supabase.from("study_questions").update(values).eq("id", q.id).eq("study_id", studyId);
          if (error) throw new Error(error.message);
          savedQuestionIds.push(q.id);
        } else {
          const { data, error } = await supabase.from("study_questions").insert({ study_id: studyId, ...values }).select("id").single();
          if (error || !data) throw new Error(error?.message ?? "Could not retrieve new question ID.");
          savedQuestionIds.push(data.id);
        }
      }
      const currentItemIds = new Set(questions.flatMap(q => q.supplements.map(item => item.id).filter((id): id is string => Boolean(id))));
      for (const id of originalItemIds) {
        if (!currentItemIds.has(id)) {
          const { error } = await supabase.from("study_question_items").delete().eq("id", id);
          if (error) throw new Error(error.message);
        }
      }
      for (let i = 0; i < questions.length; i++) {
        const questionId = savedQuestionIds[i];
        for (let j = 0; j < questions[i].supplements.length; j++) {
          const item = questions[i].supplements[j];
          const values = { question_id: questionId, item_type: item.item_type, content: item.content.trim(), sort_order: j };
          if (item.id) {
            const { error } = await supabase.from("study_question_items").update(values).eq("id", item.id);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase.from("study_question_items").insert(values);
            if (error) throw new Error(error.message);
          }
        }
      }
      router.push("/host/dashboard");
      router.refresh();
    } catch (e) { setError((e instanceof Error ? e.message : "Could not save study.") + " If saving partially succeeded, reload this study before retrying."); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="mx-auto max-w-3xl p-8">Loading study...</main>;
  return <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900"><div className="mx-auto max-w-3xl space-y-6">
    <Link href="/host/dashboard" className="font-medium text-indigo-700 hover:underline">← Back to Dashboard</Link>
    <h1 className="text-3xl font-bold">Edit Study</h1>
    {hasSessions && <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">This study already has saved sessions. Editing is disabled to protect existing questions and participant notes. Duplicate the study from the dashboard to make a revised version.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    <div className="space-y-4 rounded-xl border bg-white p-6">
      <label className="block font-medium">Title<input disabled={hasSessions || saving} value={title} onChange={e => setTitle(e.target.value)} className="mt-2 block w-full rounded-lg border p-3" /></label>
      <label className="block font-medium">Bible Passage<input disabled={hasSessions || saving} value={passage} onChange={e => setPassage(e.target.value)} className="mt-2 block w-full rounded-lg border p-3" /></label>
      <label className="block font-medium">Description<textarea disabled={hasSessions || saving} value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-2 block w-full rounded-lg border p-3" /></label>
    </div>
    <section className="space-y-4 rounded-xl border bg-white p-6"><h2 className="text-xl font-semibold">Discussion Questions</h2>
      {questions.map((q, i) => <div key={q.localId} className="rounded-lg border bg-slate-50 p-4">
        <label className="block font-medium">Question {i + 1}<textarea disabled={hasSessions || saving} rows={3} value={q.question_text} onChange={e => updateQuestion(i, { question_text: e.target.value })} className="mt-2 block w-full rounded-lg border bg-white p-3" /></label>
        <QuestionTableBuilder value={q.table_config} onChange={value => updateQuestion(i, { table_config: value })} disabled={hasSessions || saving} />
        <QuestionSupplementBuilder value={q.supplements} onChange={value => updateQuestion(i, { supplements: value })} disabled={hasSessions || saving} />
        {!hasSessions && <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={saving || i === 0} onClick={() => moveQuestion(i, -1)} className="rounded border px-3 py-1 disabled:opacity-40">↑ Up</button>
          <button type="button" disabled={saving || i === questions.length - 1} onClick={() => moveQuestion(i, 1)} className="rounded border px-3 py-1 disabled:opacity-40">↓ Down</button>
          <button type="button" disabled={saving || questions.length === 1} onClick={() => setQuestions(old => old.filter((_, j) => j !== i))} className="rounded border border-red-300 px-3 py-1 text-red-700 disabled:opacity-40">Remove</button>
        </div>}
      </div>)}
      {!hasSessions && <button type="button" disabled={saving} onClick={() => setQuestions(old => [...old, { localId: crypto.randomUUID(), question_text: "", table_config: null, supplements: [] }])} className="rounded-lg border border-indigo-600 px-4 py-2 text-indigo-700">+ Add Question</button>}
    </section>
    {!hasSessions && <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>}
  </div></main>;
}
