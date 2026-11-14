"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../components/LanguageProvider";
import QuestionTableBuilder, {
  type QuestionTableConfig,
  validateQuestionTable,
  normalizeQuestionTable,
} from "../../components/QuestionTableBuilder";
import QuestionSupplementBuilder, {
  type SupplementItem,
} from "../../components/QuestionSupplementBuilder";

type StudyQuestion = {
  id: string;
  text: string;
  table_config: QuestionTableConfig | null;
  supplements: SupplementItem[];
};
type StudyDraft = {
  title: string;
  passage: string;
  description: string;
  questions: StudyQuestion[];
};
const STORAGE_KEY = "bible-study-host-draft";

function newQuestion(): StudyQuestion {
  return { id: crypto.randomUUID(), text: "", table_config: null, supplements: [] };
}
function emptyDraft(): StudyDraft {
  return { title: "", passage: "", description: "", questions: [newQuestion()] };
}

export default function HostPage() {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<StudyDraft | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StudyDraft;
        if (parsed && Array.isArray(parsed.questions)) {
          setDraft({
            ...parsed,
            questions: parsed.questions.map(q => ({
              ...q,
              table_config: q.table_config ?? null,
              supplements: Array.isArray(q.supplements)
                ? q.supplements.map(item => ({ ...item, localId: item.localId || crypto.randomUUID() }))
                : [],
            })),
          });
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
    setDraft(old => old ? {
      ...old,
      questions: old.questions.map(q => q.id === id ? { ...q, ...change } : q),
    } : old);
    setMessage("");
  }
  function addQuestion() {
    setDraft(old => old ? { ...old, questions: [...old.questions, newQuestion()] } : old);
    setMessage("");
  }
  function removeQuestion(id: string) {
    setDraft(old => old && old.questions.length > 1
      ? { ...old, questions: old.questions.filter(q => q.id !== id) }
      : old);
    setMessage("");
  }
  function validateDraft(value: StudyDraft): string | null {
    if (!value.title.trim()) return t("hostCreate.needTitle");
    if (!value.questions.length || value.questions.some(q => !q.text.trim())) {
      return t("hostCreate.needQuestions");
    }
    for (let i = 0; i < value.questions.length; i++) {
      const question = value.questions[i];
      const tableError = validateQuestionTable(question.table_config);
      if (tableError) return `${t("hostCreate.question")} ${i + 1}: ${tableError}`;
      if (question.supplements.some(item => !item.content.trim())) {
        return `${t("hostCreate.question")} ${i + 1}: ${t("hostCreate.needSupplement")}`;
      }
    }
    return null;
  }
  function saveDraft() {
    if (!draft) return;
    const validationError = validateDraft(draft);
    if (validationError) { setMessage(validationError); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setMessage(t("hostCreate.draftSaved"));
  }
  async function saveToSupabase() {
    if (!draft || saving) return;
    const validationError = validateDraft(draft);
    if (validationError) { setMessage(validationError); return; }
    setSaving(true);
    setMessage(t("hostCreate.savingCloud"));
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error(t("hostCreate.needSignIn"));

      const { data: study, error: studyError } = await supabase.from("studies").insert({
        title: draft.title.trim(),
        passage: draft.passage.trim(),
        description: draft.description.trim(),
      }).select("id").single();
      if (studyError || !study) {
        throw new Error(t("hostCreate.couldNotSaveStudy") + " " + (studyError?.message ?? t("hostCreate.unknownError")));
      }

      const questionRows = draft.questions.map((q, index) => ({
        study_id: study.id,
        question_number: index + 1,
        question_text: q.text.trim(),
        table_config: normalizeQuestionTable(q.table_config),
      }));
      const { data: savedQuestions, error: questionsError } = await supabase
        .from("study_questions")
        .insert(questionRows)
        .select("id, question_number");
      if (questionsError || !savedQuestions || savedQuestions.length !== draft.questions.length) {
        throw new Error(t("hostCreate.questionSaveFailure") + " " + (questionsError?.message ?? t("hostCreate.unexpectedCount")));
      }

      const questionIds = new Map(savedQuestions.map(q => [q.question_number, q.id]));
      const supplementRows = draft.questions.flatMap((q, index) =>
        q.supplements.map((item, itemIndex) => ({
          question_id: questionIds.get(index + 1)!,
          item_type: item.item_type,
          content: item.content.trim(),
          sort_order: itemIndex,
        }))
      );
      if (supplementRows.length) {
        const { error: supplementsError } = await supabase
          .from("study_question_items")
          .insert(supplementRows);
        if (supplementsError) {
          throw new Error(t("hostCreate.supplementSaveFailure") + " " + supplementsError.message);
        }
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setMessage(t("hostCreate.savedCloud"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("hostCreate.couldNotSave"));
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return <main className="p-8 text-center">{t("hostCreate.loading")}</main>;
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
      <Link href="/" className="text-xl font-bold text-indigo-700">Bible Study</Link><span className="text-sm text-slate-500">{t("hostCreate.creator")}</span>
    </div></header>
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-bold">{t("hostCreate.title")}</h1>
      <p className="mb-8 text-slate-600">{t("hostCreate.subtitle")}</p>
      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block font-medium">{t("hostCreate.studyTitle")}<input disabled={saving} value={draft.title} onChange={e => updateField("title", e.target.value)} placeholder={t("hostCreate.titleExample")} className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
        <label className="block font-medium">{t("hostCreate.passage")}<input disabled={saving} value={draft.passage} onChange={e => updateField("passage", e.target.value)} placeholder={t("hostCreate.passageExample")} className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
        <label className="block font-medium">{t("hostCreate.description")}<textarea disabled={saving} value={draft.description} onChange={e => updateField("description", e.target.value)} rows={3} placeholder={t("hostCreate.descriptionExample")} className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
      </div>
      <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">{t("hostCreate.questions")}</h2>
        <div className="space-y-4">{draft.questions.map((q, index) => <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><label htmlFor={`question-${q.id}`} className="font-semibold">{t("hostCreate.question")} {index + 1}</label>
            <button type="button" onClick={() => removeQuestion(q.id)} disabled={saving || draft.questions.length === 1} className="text-sm font-medium text-red-600 disabled:opacity-30">{t("hostCreate.remove")}</button></div>
          <textarea id={`question-${q.id}`} disabled={saving} value={q.text} onChange={e => updateQuestion(q.id, { text: e.target.value })} placeholder={t("hostCreate.questionPlaceholder")} rows={3} className="w-full rounded-lg border border-slate-300 px-4 py-3" />
          <QuestionTableBuilder value={q.table_config} onChange={value => updateQuestion(q.id, { table_config: value })} disabled={saving} />
          <QuestionSupplementBuilder value={q.supplements} onChange={value => updateQuestion(q.id, { supplements: value })} disabled={saving} />
        </div>)}</div>
        <button type="button" disabled={saving} onClick={addQuestion} className="mt-5 rounded-lg border border-indigo-600 px-5 py-3 font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">+ {t("hostCreate.addQuestion")}</button>
      </section>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button type="button" disabled={saving} onClick={saveDraft} className="rounded-lg bg-indigo-600 px-7 py-3 font-medium text-white disabled:opacity-50">{t("hostCreate.saveDraft")}</button>
        <button type="button" disabled={saving} onClick={() => void saveToSupabase()} className="rounded-lg bg-emerald-600 px-7 py-3 font-medium text-white disabled:opacity-50">{saving ? t("hostCreate.saving") : t("hostCreate.saveCloud")}</button>
        <Link href="/" className="font-medium text-slate-600 hover:underline">{t("hostCreate.back")}</Link>
      </div>
      {message && <p role="status" className="mt-4 font-medium text-indigo-700">{message}</p>}
      <p className="mt-6 text-sm text-slate-500">{t("hostCreate.saveHelp")}</p>
    </div>
  </main>;
}
