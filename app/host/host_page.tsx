"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import QuestionTableBuilder, { type QuestionTableConfig, validateQuestionTable, normalizeQuestionTable } from "../../components/QuestionTableBuilder";
import QuestionSupplementBuilder, { type SupplementItem, validateSupplementItems } from "../../components/QuestionSupplementBuilder";

type StudyQuestion = { id: string; text: string; table_config: QuestionTableConfig | null; supplements: SupplementItem[] };
type StudyDraft = { title: string; passage: string; description: string; questions: StudyQuestion[] };
const STORAGE_KEY = "bible-study-host-draft";
function emptyDraft(): StudyDraft {
  return { title: "", passage: "", description: "", questions: [{ id: crypto.randomUUID(), text: "", table_config: null, supplements: [] }] };
}

export default function HostPage() {
  const [draft, setDraft] = useState<StudyDraft | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StudyDraft;
        if (parsed && Array.isArray(parsed.questions)) {
          setDraft({ ...parsed, questions: parsed.questions.map(q => ({ ...q, table_config: q.table_config ?? null, supplements: Array.isArray(q.supplements) ? q.supplements.map(s => ({ ...s, localId: s.localId || crypto.randomUUID() })) : [] })) });
          return;
        }
      } catch { /* Ignore invalid saved data. */ }
    }
    setDraft(emptyDraft());
  }, []);

  function updateField(field: "title" | "passage" | "description", value: string) {
    setDraft(old => old ? { ...old, [field]: value } : old);
    setMessage("");
  }
  function updateQuestion(id: string, change: Partial<StudyQuestion>) {
    setDraft(old => old ? { ...old, questions: old.questions.map(q => q.id === id ? { ...q, ...change } : q) } : old);
    setMessage("");
  }
  function addQuestion() {
    setDraft(old => old ? { ...old, questions: [...old.questions, { id: crypto.randomUUID(), text: "", table_config: null, supplements: [] }] } : old);
    setMessage("");
  }
  function removeQuestion(id: string) {
    setDraft(old => old && old.questions.length > 1 ? { ...old, questions: old.questions.filter(q => q.id !== id) } : old);
    setMessage("");
  }
  function validateDraft(value: StudyDraft): string | null {
    if (!value.title.trim()) return "Please enter a study title.";
    if (!value.questions.length || value.questions.some(q => !q.text.trim())) return "Please fill in all discussion questions.";
    for (let i = 0; i < value.questions.length; i++) {
      const tableError = validateQuestionTable(value.questions[i].table_config);
      if (tableError) return `Question ${i + 1}: ${tableError}`;
      const supplementError = validateSupplementItems(value.questions[i].supplements);
      if (supplementError) return `Question ${i + 1}: ${supplementError}`;
    }
    return null;
  }
  function saveDraft() {
    if (!draft) return;
    const validationError = validateDraft(draft);
    if (validationError) { setMessage(validationError); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setMessage("Draft saved successfully in this browser!");
  }
  async function saveToSupabase() {
    if (!draft || saving) return;
    const validationError = validateDraft(draft);
    if (validationError) { setMessage(validationError); return; }
    setSaving(true);
    setMessage("Saving study to Supabase...");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Please sign in before saving your study.");
      const { data: study, error: studyError } = await supabase.from("studies").insert({
        title: draft.title.trim(), passage: draft.passage.trim(), description: draft.description.trim(),
      }).select("id").single();
      if (studyError || !study) throw new Error("Could not save study: " + (studyError?.message ?? "Unknown error"));
      const questionRows = draft.questions.map((q, index) => ({
        study_id: study.id, question_number: index + 1, question_text: q.text.trim(), table_config: normalizeQuestionTable(q.table_config),
      }));
      const { data: savedQuestions, error: questionsError } = await supabase.from("study_questions").insert(questionRows).select("id, question_number");
      if (questionsError || !savedQuestions) throw new Error("Study created, but questions could not be saved: " + (questionsError?.message ?? "No question IDs returned"));
      const idByNumber = new Map(savedQuestions.map(q => [q.question_number, q.id]));
      const itemRows = draft.questions.flatMap((q, index) => {
        const questionId = idByNumber.get(index + 1);
        if (!questionId) throw new Error(`Missing saved question ${index + 1}.`);
        return q.supplements.map((item, order) => ({ question_id: questionId, item_type: item.item_type, content: item.content.trim(), sort_order: order }));
      });
      if (itemRows.length) {
        const { error: itemError } = await supabase.from("study_question_items").insert(itemRows);
        if (itemError) throw new Error("Study and questions created, but supplementary items could not be saved: " + itemError.message + ". Check the created study before retrying.");
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setMessage("Study, questions, and supplementary items saved successfully to Supabase!");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save study."); }
    finally { setSaving(false); }
  }

  if (!draft) return <main className="p-8 text-center">Loading study editor...</main>;
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
      <Link href="/" className="text-xl font-bold text-indigo-700">Bible Study</Link><span className="text-sm text-slate-500">Study Creator</span>
    </div></header>
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-bold">Create a Bible Study</h1>
      <p className="mb-8 text-slate-600">Prepare your study and discussion questions.</p>
      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block font-medium">Study Title<input value={draft.title} onChange={e => updateField("title", e.target.value)} placeholder="e.g. Trusting God in Difficult Times" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
        <label className="block font-medium">Bible Passage<input value={draft.passage} onChange={e => updateField("passage", e.target.value)} placeholder="e.g. Psalm 11:1-7" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
        <label className="block font-medium">Study Description<textarea value={draft.description} onChange={e => updateField("description", e.target.value)} rows={3} placeholder="What is the main purpose of this study?" className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
      </div>
      <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">Discussion Questions</h2>
        <div className="space-y-4">{draft.questions.map((q, index) => <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><label htmlFor={`question-${q.id}`} className="font-semibold">Question {index + 1}</label>
            <button type="button" onClick={() => removeQuestion(q.id)} disabled={saving || draft.questions.length === 1} className="text-sm font-medium text-red-600 disabled:opacity-30">Remove</button></div>
          <textarea id={`question-${q.id}`} disabled={saving} value={q.text} onChange={e => updateQuestion(q.id, { text: e.target.value })} placeholder="Enter your discussion question..." rows={3} className="w-full rounded-lg border border-slate-300 px-4 py-3" />
          <QuestionTableBuilder value={q.table_config} onChange={value => updateQuestion(q.id, { table_config: value })} disabled={saving} />
          <QuestionSupplementBuilder value={q.supplements} onChange={value => updateQuestion(q.id, { supplements: value })} disabled={saving} />
        </div>)}</div>
        <button type="button" disabled={saving} onClick={addQuestion} className="mt-5 rounded-lg border border-indigo-600 px-5 py-3 font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">+ Add Question</button>
      </section>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button type="button" disabled={saving} onClick={saveDraft} className="rounded-lg bg-indigo-600 px-7 py-3 font-medium text-white disabled:opacity-50">Save Draft</button>
        <button type="button" disabled={saving} onClick={() => void saveToSupabase()} className="rounded-lg bg-emerald-600 px-7 py-3 font-medium text-white disabled:opacity-50">{saving ? "Saving..." : "Save to Supabase"}</button>
        <Link href="/" className="font-medium text-slate-600 hover:underline">Back to Home</Link>
      </div>
      {message && <p role="status" className="mt-4 font-medium text-indigo-700">{message}</p>}
      <p className="mt-6 text-sm text-slate-500">Save Draft keeps a copy in this browser. Save to Supabase creates a new study in the database.</p>
    </div>
  </main>;
}
