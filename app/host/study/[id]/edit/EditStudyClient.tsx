"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEditorTranslation } from "../../../../../components/EditorTranslation";
import StudyPreview from "../../../../../components/StudyPreview";
import { supabase } from "../../../../../lib/supabase";
import QuestionTableBuilder, { type QuestionTableConfig, validateQuestionTable, normalizeQuestionTable } from "../../../../../components/QuestionTableBuilder";
import { PresentationStyleEditor, type PresentationContent } from "../../../../../components/PresentationBlocks";
import QuestionSupplementBuilder, { type SupplementItem, validateSupplementItems } from "../../../../../components/QuestionSupplementBuilder";

type StudyQuestion = {
  id: string;
  text: string;
  leader_notes: string;
  table_config: QuestionTableConfig | null;
  supplements: SupplementItem[];
};
type ContentBlock = { id: string; type: "question" | "slide" | "text" | "image"; title: string; body: string; imageUrl: string; } & PresentationContent;
type StudyDraft = {
  title: string;
  passage: string;
  description: string;
  leader_notes: string;
  questions: StudyQuestion[];
  blocks: ContentBlock[];
};
function emptyQuestion(): StudyQuestion {
  return { id: crypto.randomUUID(), text: "", leader_notes: "", table_config: null, supplements: [] };
}
function newBlock(type: ContentBlock["type"], id = crypto.randomUUID()): ContentBlock {
  return { id, type, title: "", body: "", imageUrl: "" };
}
function emptyDraft(): StudyDraft {
  return { title: "", passage: "", description: "", leader_notes: "", questions: [], blocks: [] };
}


const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function StudyImageUploader({
  imageUrl, onImageUrlChange, disabled, onUploadStateChange,
}: {
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  disabled: boolean;
  onUploadStateChange: (uploading: boolean) => void;
}) {
  const tr = useEditorTranslation();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function uploadImage(file: File) {
    if (disabled || uploading) return;
    setUploadError("");
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setUploadError(tr("Choose a JPG, PNG, WebP, or GIF image."));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(tr("Images must be 10 MB or smaller."));
      return;
    }
    setUploading(true);
    onUploadStateChange(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error(tr("Please sign in as a study leader before uploading."));
      const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[file.type];
      const objectPath = `${authData.user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("study-images").upload(objectPath, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("study-images").getPublicUrl(objectPath);
      if (!data.publicUrl) throw new Error(tr("Could not get the uploaded image URL."));
      onImageUrlChange(data.publicUrl);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : tr("Image upload failed."));
    } finally {
      setUploading(false);
      onUploadStateChange(false);
    }
  }

  return <div className="space-y-3">
    <label className="block font-medium">{tr("Upload image from computer")}
      <input
        type="file" accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={disabled || uploading}
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void uploadImage(file);
        }}
        className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm disabled:opacity-50"
      />
    </label>
    <p className="text-xs text-slate-500">{tr("JPG, PNG, WebP or GIF · maximum 10 MB. Uploaded images have public URLs.")}</p>
    {uploading && <p role="status" className="text-sm font-medium text-indigo-700">{tr("Uploading image...")}</p>}
    {uploadError && <p role="alert" className="text-sm text-red-700">{uploadError}</p>}
    <label className="block font-medium">{tr("Or paste a public HTTPS image URL")}
      <input type="url" disabled={disabled || uploading} value={imageUrl}
        onChange={event => onImageUrlChange(event.target.value)}
        placeholder="https://example.com/image.jpg"
        className="mt-2 w-full rounded-lg border p-3" />
    </label>
    {imageUrl && <div className="rounded-lg border bg-slate-50 p-3">
      <p className="mb-2 text-sm font-medium">{tr("Image preview")}</p>
      {/* A broken preview means the URL may not be publicly accessible. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={tr("Study image preview")} className="max-h-72 w-full rounded object-contain" />
    </div>}
  </div>;
}

export default function EditStudyClient() {
  const tr = useEditorTranslation();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const studyId = params.id;
  const [draft, setDraft] = useState<StudyDraft | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  function trackUpload(isUploading: boolean) {
    setUploadingCount(count => Math.max(0, count + (isUploading ? 1 : -1)));
  }
  const [hasSessions, setHasSessions] = useState(false);
  const [originalQuestionIds, setOriginalQuestionIds] = useState<string[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const dragSourceId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const savedNavigation = useRef(false);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty && !savedNavigation.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function markChanged() { setDirty(true); setMessage(""); }
  function toggleCollapsed(id: string) {
    setCollapsedIds(old => old.includes(id) ? old.filter(item => item !== id) : [...old, id]);
  }
  function reorderBlocks(sourceId: string, targetId: string) {
    if (saving || hasSessions || sourceId === targetId) return;
    setDraft(old => {
      if (!old) return old;
      const blocks = [...old.blocks];
      const from = blocks.findIndex(b => b.id === sourceId);
      const to = blocks.findIndex(b => b.id === targetId);
      if (from < 0 || to < 0) return old;
      const [moved] = blocks.splice(from, 1);
      blocks.splice(to, 0, moved);
      return { ...old, blocks };
    });
    markChanged();
  }
  function duplicateBlock(id: string) {
    if (saving || hasSessions) return;
    const newId = crypto.randomUUID();
    setDraft(old => {
      if (!old) return old;
      const index = old.blocks.findIndex(b => b.id === id);
      if (index < 0) return old;
      const source = old.blocks[index];
      const copy: ContentBlock = { ...source, id: newId };
      const blocks = [...old.blocks];
      blocks.splice(index + 1, 0, copy);
      if (source.type !== "question") return { ...old, blocks };
      const question = old.questions.find(q => q.id === id);
      if (!question) return old;
      const copiedQuestion: StudyQuestion = {
        ...question, id: newId,
        table_config: question.table_config ? JSON.parse(JSON.stringify(question.table_config)) : null,
        supplements: question.supplements.map(item => ({ ...item, id: crypto.randomUUID(), localId: crypto.randomUUID() })),
      };
      return { ...old, blocks, questions: [...old.questions, copiedQuestion] };
    });
    markChanged();
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const [study, questionResult, blockResult, sessionResult] = await Promise.all([
        supabase.from("studies").select("title,passage,description,leader_notes").eq("id", studyId).single(),
        supabase.from("study_questions").select("id,question_number,question_text,leader_notes,table_config").eq("study_id", studyId).order("question_number"),
        supabase.from("study_content_blocks").select("id,block_type,sort_order,question_id,content").eq("study_id", studyId).order("sort_order"),
        supabase.from("study_sessions").select("id").eq("study_id", studyId).limit(1),
      ]);
      if (!active) return;
      const failure = study.error || questionResult.error || blockResult.error || sessionResult.error;
      if (failure || !study.data) { setMessage(failure?.message ?? "Study not found."); return; }
      const questionRows = questionResult.data ?? [];
      const questionIds = questionRows.map(q => q.id);
      const itemResult = questionIds.length
        ? await supabase.from("study_question_items").select("id,question_id,item_type,content,sort_order").in("question_id", questionIds).order("sort_order")
        : { data: [], error: null };
      if (!active) return;
      if (itemResult.error) { setMessage(itemResult.error.message); return; }
      const questions: StudyQuestion[] = questionRows.map(q => ({
        id: q.id, text: q.question_text, leader_notes: q.leader_notes ?? "",
        table_config: q.table_config ?? null,
        supplements: (itemResult.data ?? []).filter(i => i.question_id === q.id).map(i => ({
          id: i.id, localId: i.id, item_type: i.item_type as SupplementItem["item_type"], content: i.content,
        })),
      }));
      const stored = blockResult.data ?? [];
      const blocks: ContentBlock[] = stored.length
        ? stored.map(b => {
          const content = (b.content ?? {}) as Record<string, unknown>;
          return {
            id: b.block_type === "question" ? (b.question_id ?? b.id) : b.id,
            type: b.block_type as ContentBlock["type"],
            title: typeof content.title === "string" ? content.title : "",
            body: typeof content.body === "string" ? content.body : "",
            imageUrl: typeof content.imageUrl === "string" ? content.imageUrl : "",
            background: typeof content.background === "string" ? content.background : undefined,
            textColor: typeof content.textColor === "string" ? content.textColor : undefined,
            textAlign: content.textAlign as PresentationContent["textAlign"],
            fontSize: content.fontSize as PresentationContent["fontSize"],
            bold: content.bold === true,
            leaderNotes: typeof content.leaderNotes === "string" ? content.leaderNotes : "",
          };
        })
        : questionRows.map(q => newBlock("question", q.id));
      setDraft({
        title: study.data.title, passage: study.data.passage ?? "",
        description: study.data.description ?? "", leader_notes: study.data.leader_notes ?? "",
        questions, blocks,
      });
      setOriginalQuestionIds(questionIds);
      setHasSessions((sessionResult.data?.length ?? 0) > 0);
      setMessage("");
    }
    void load();
    return () => { active = false; };
  }, [studyId]);

  function updateField(field: "title" | "passage" | "description" | "leader_notes", value: string) {
    setDraft(old => old ? { ...old, [field]: value } : old);
    markChanged();
  }
  function updateQuestion(id: string, change: Partial<StudyQuestion>) {
    setDraft(old => old ? { ...old, questions: old.questions.map(q => q.id === id ? { ...q, ...change } : q) } : old);
    markChanged();
  }
  function addBlock(type: ContentBlock["type"]) {
    setDraft(old => {
      if (!old) return old;
      if (type === "question") {
        const question = emptyQuestion();
        return { ...old, questions: [...old.questions, question], blocks: [...old.blocks, newBlock(type, question.id)] };
      }
      return { ...old, blocks: [...old.blocks, newBlock(type)] };
    });
    markChanged();
  }
  function removeBlock(id: string) {
    setDraft(old => old && old.blocks.length > 0 ? {
      ...old, blocks: old.blocks.filter(b => b.id !== id), questions: old.questions.filter(q => q.id !== id),
    } : old);
    markChanged();
  }
  function moveBlock(index: number, offset: number) {
    setDraft(old => {
      if (!old || index + offset < 0 || index + offset >= old.blocks.length) return old;
      const blocks = [...old.blocks];
      [blocks[index], blocks[index + offset]] = [blocks[index + offset], blocks[index]];
      return { ...old, blocks };
    });
    markChanged();
  }
  function updateBlock(id: string, change: Partial<ContentBlock>) {
    setDraft(old => old ? { ...old, blocks: old.blocks.map(b => b.id === id ? { ...b, ...change } : b) } : old);
    markChanged();
  }

  async function saveChanges() {
    if (!draft || saving || hasSessions || uploadingCount > 0) return;
    if (!draft.title.trim()) { setMessage(tr("Please enter a study title.")); return; }
    if (!draft.blocks.length) { setMessage(tr("Add at least one content block.")); return; }
    if (draft.questions.some(q => !q.text.trim())) { setMessage(tr("Please complete all questions.")); return; }
    for (const b of draft.blocks) {
      if (b.type === "slide" && !b.title.trim() && !b.body.trim()) { setMessage(tr("Each slide needs a title or text.")); return; }
      if (b.type === "text" && !b.body.trim()) { setMessage(tr("Each text section needs content.")); return; }
      if (b.type === "image") {
        try { if (new URL(b.imageUrl).protocol !== "https:") throw new Error(); }
        catch { setMessage(tr("Each image needs a valid public HTTPS URL.")); return; }
      }
    }
    for (const q of draft.questions) {
      const tableError = validateQuestionTable(q.table_config);
      if (tableError) { setMessage(tableError); return; }
      const supplementError = validateSupplementItems(q.supplements);
      if (supplementError) { setMessage(supplementError); return; }
    }
    setSaving(true);
    setMessage(tr("Saving changes..."));
    try {
      const { data: sessions, error: sessionError } = await supabase.from("study_sessions").select("id").eq("study_id", studyId).limit(1);
      if (sessionError) throw new Error(sessionError.message);
      if (sessions?.length) { setHasSessions(true); throw new Error(tr("This study now has a session and cannot be edited.")); }
      const orderedQuestions = draft.blocks.filter(b => b.type === "question")
        .map(b => draft.questions.find(q => q.id === b.id)).filter((q): q is StudyQuestion => Boolean(q));
      const { data: existingNums, error: numsError } = await supabase.from("study_questions").select("question_number").eq("study_id", studyId);
      if (numsError) throw new Error(numsError.message);
      const maxNum = Math.max(0, ...(existingNums ?? []).map(q => q.question_number));
      // Move retained question numbers out of the way before reordering.
      for (let i = 0; i < orderedQuestions.length; i++) {
        const q = orderedQuestions[i];
        if (!originalQuestionIds.includes(q.id)) continue;
        const { error } = await supabase.from("study_questions")
          .update({ question_number: maxNum + i + 1 }).eq("id", q.id).eq("study_id", studyId);
        if (error) throw new Error(error.message);
      }
      // Clear blocks before deleting removed questions. No sessions exist for this study.
      const { error: clearError } = await supabase.from("study_content_blocks").delete().eq("study_id", studyId);
      if (clearError) throw new Error(clearError.message);
      const keptIds = new Set(orderedQuestions.map(q => q.id));
      for (const id of originalQuestionIds) {
        if (keptIds.has(id)) continue;
        const { error } = await supabase.from("study_questions").delete().eq("id", id).eq("study_id", studyId);
        if (error) throw new Error(error.message);
      }
      for (let i = 0; i < orderedQuestions.length; i++) {
        const q = orderedQuestions[i];
        const values = {
          question_number: i + 1, question_text: q.text.trim(),
          leader_notes: q.leader_notes.trim() || null, table_config: normalizeQuestionTable(q.table_config),
        };
        if (originalQuestionIds.includes(q.id)) {
          const { error } = await supabase.from("study_questions").update(values).eq("id", q.id).eq("study_id", studyId);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabase.from("study_questions").insert({ id: q.id, study_id: studyId, ...values });
          if (error) throw new Error(error.message);
        }
        const { data: existingItems, error: lookupError } = await supabase.from("study_question_items").select("id").eq("question_id", q.id);
        if (lookupError) throw new Error(lookupError.message);
        const retainedItems = new Set(q.supplements.map(s => s.id).filter(Boolean));
        for (const item of existingItems ?? []) {
          if (retainedItems.has(item.id)) continue;
          const { error } = await supabase.from("study_question_items").delete().eq("id", item.id);
          if (error) throw new Error(error.message);
        }
        for (let j = 0; j < q.supplements.length; j++) {
          const item = q.supplements[j];
          const itemValues = { item_type: item.item_type, content: item.content.trim(), sort_order: j };
          if ((existingItems ?? []).some(e => e.id === item.id)) {
            const { error } = await supabase.from("study_question_items").update(itemValues).eq("id", item.id);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase.from("study_question_items").insert({ question_id: q.id, ...itemValues });
            if (error) throw new Error(error.message);
          }
        }
      }
      const blockRows = draft.blocks.map((b, sort_order) => ({
        study_id: studyId, block_type: b.type, sort_order,
        question_id: b.type === "question" ? b.id : null,
        content: b.type === "question" ? {} : { title: b.title.trim(), body: b.body.trim(), imageUrl: b.imageUrl.trim(), background: b.background, textColor: b.textColor, textAlign: b.textAlign, fontSize: b.fontSize, bold: b.bold, leaderNotes: b.leaderNotes?.trim() || "" },
      }));
      const { error: blockError } = await supabase.from("study_content_blocks").insert(blockRows);
      if (blockError) throw new Error(blockError.message);
      const { error: studyError } = await supabase.from("studies").update({
        title: draft.title.trim(), passage: draft.passage.trim() || null,
        description: draft.description.trim() || null, leader_notes: draft.leader_notes.trim() || null,
      }).eq("id", studyId);
      if (studyError) throw new Error(studyError.message);
      savedNavigation.current = true;
      setDirty(false);
      router.push("/host/dashboard");
      router.refresh();
    } catch (e) {
      setMessage((e instanceof Error ? e.message : tr("Save failed.")) + " " + tr("Some changes may already have been saved. Review the study before retrying."));
    } finally { setSaving(false); }
  }

  if (!draft) return <main className="p-8 text-center">{message || tr("Loading study editor...")}</main>;
  return <><main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
      <Link href="/" className="text-xl font-bold text-indigo-700">{tr("Bible Study")}</Link><span className="text-sm text-slate-500">{tr("Study Editor")}</span>
    </div></header>
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-bold">{tr("Edit Bible Study")}</h1>
      <p className="mb-8 text-slate-600">{tr("Combine questions, slides, images, and text in any order.")}</p>
      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-slate-900">{tr("Study Introduction")}</span>
            <span className="mt-1 block truncate text-sm text-slate-500">{draft.title.trim() || "Title, Bible passage, description and leader notes"}</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-indigo-700 group-open:hidden">{tr("Expand ▾")}</span>
          <span className="hidden shrink-0 text-sm font-medium text-indigo-700 group-open:inline">{tr("Collapse ▴")}</span>
        </summary>
        <div className="space-y-6 border-t border-slate-200 px-6 py-6">
          <label className="block font-medium">{tr("Study Title")} <span className="text-sm font-normal text-slate-500">{tr("(required)")}</span><input value={draft.title} onChange={e => updateField("title", e.target.value)} placeholder={tr("e.g. Trusting God in Difficult Times")} className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
          <label className="block font-medium">{tr("Bible Passage")} <span className="text-sm font-normal text-slate-500">{tr("(optional · one or more references)")}</span><input value={draft.passage} onChange={e => updateField("passage", e.target.value)} placeholder={tr("e.g. Psalm 11:1–7, Romans 8:31–39 (or leave blank)")} className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
          <label className="block font-medium">{tr("Study Description")}<textarea value={draft.description} onChange={e => updateField("description", e.target.value)} rows={3} placeholder={tr("What is the main purpose of this study?")} className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3" /></label>
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer select-none font-medium text-slate-800">{tr("General Leader Notes")} <span className="text-sm font-normal text-slate-500">{tr("(private · optional)")}</span>{draft.leader_notes.trim() && <span className="ml-2 text-xs font-semibold text-indigo-700">{tr("Notes added")}</span>}</summary>
            <label className="mt-4 block text-sm font-medium" htmlFor="general-leader-notes">{tr("Notes for the study leader")}</label>
            <textarea id="general-leader-notes" value={draft.leader_notes} onChange={e => updateField("leader_notes", e.target.value)} rows={6} placeholder={tr("Introduction, main themes, discussion transitions, and conclusion...")} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3" />
            <p className="mt-1 text-sm text-slate-500">{tr("These notes are private and are not shown to participants.")}</p>
          </details>
        </div>
      </details>
      {hasSessions && <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">{tr("This study already has sessions and cannot be edited.")}</p>}
      <section className="mt-8 space-y-4">
        <h2 className="text-2xl font-semibold">{tr("Study Content")}</h2>
        <p className="text-sm text-amber-800 rounded-lg border border-amber-200 bg-amber-50 p-3">{tr("Drag the ⠿ handle to reorder blocks, or use the ↑ ↓ buttons. Duplicate and collapse blocks to organize longer studies.")}</p>
        {dirty && <p role="status" className="text-sm font-medium text-amber-800">{tr("Unsaved changes — remember to save before leaving.")}</p>}
        {draft.blocks.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
        <p className="font-medium text-slate-800">{tr("No content blocks yet")}</p>
        <p className="mt-1 text-sm text-slate-500">{tr("Start your study with whichever type you prefer using the buttons below.")}</p>
      </div>}
      {draft.blocks.map((block, index) => {
          const q = block.type === "question" ? draft.questions.find(item => item.id === block.id) : undefined;
          const questionNumber = draft.blocks.slice(0, index + 1).filter(item => item.type === "question").length;
          return <div key={block.id}
            onDragOver={event => { if (dragSourceId.current && !hasSessions && !saving) { event.preventDefault(); setDragOverId(block.id); } }}
            onDrop={event => { event.preventDefault(); if (dragSourceId.current) reorderBlocks(dragSourceId.current, block.id); dragSourceId.current = null; setDragOverId(null); }}
            onDragLeave={() => setDragOverId(current => current === block.id ? null : current)}
            className={`rounded-2xl border bg-white p-5 shadow-sm space-y-3 ${dragOverId === block.id ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <strong className="capitalize">{index + 1}. {block.type === "question" ? `${tr("Question")} ${questionNumber}` : tr(block.type)}</strong>
              <div className="flex flex-wrap gap-2 text-sm">
                <span draggable={!saving && !hasSessions}
                  onDragStart={event => { dragSourceId.current = block.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", block.id); }}
                  onDragEnd={() => { dragSourceId.current = null; setDragOverId(null); }}
                  title={tr("Drag to reorder")} aria-label={tr("Drag to reorder")}
                  className={`select-none rounded border px-3 py-1 ${saving || hasSessions ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing"}`}>{tr("⠿ Drag")}</span>
                <button type="button" onClick={() => toggleCollapsed(block.id)} className="rounded border px-3 py-1">{collapsedIds.includes(block.id) ? tr("Expand") : tr("Collapse")}</button>
                <button type="button" disabled={saving || hasSessions} onClick={() => duplicateBlock(block.id)} className="rounded border px-3 py-1 disabled:opacity-30">{tr("Duplicate")}</button>
                <button type="button" disabled={saving || hasSessions || index === 0} onClick={() => moveBlock(index, -1)} className="rounded border px-3 py-1 disabled:opacity-30" aria-label={tr("Move up")}>↑</button>
                <button type="button" disabled={saving || hasSessions || index === draft.blocks.length - 1} onClick={() => moveBlock(index, 1)} className="rounded border px-3 py-1 disabled:opacity-30" aria-label={tr("Move down")}>↓</button>
                <button type="button" disabled={saving || hasSessions} onClick={() => removeBlock(block.id)} className="rounded border border-red-300 px-3 py-1 text-red-700 disabled:opacity-30">{tr("Remove")}</button>
              </div>
            </div>
            {!collapsedIds.includes(block.id) && <div className="space-y-3">
            {q && <>
              <textarea disabled={saving || hasSessions} value={q.text} onChange={e => updateQuestion(q.id, { text: e.target.value })} placeholder={tr("Enter your discussion question...")} rows={3} className="w-full rounded-lg border border-slate-300 px-4 py-3" />
              <QuestionTableBuilder value={q.table_config} onChange={value => updateQuestion(q.id, { table_config: value })} disabled={saving || hasSessions} />
              <QuestionSupplementBuilder value={q.supplements} onChange={value => updateQuestion(q.id, { supplements: value })} disabled={saving || hasSessions} />
              <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer select-none text-sm font-medium text-slate-700">{tr("Leader Notes")} <span className="font-normal text-slate-500">{tr("(private · optional)")}</span>{q.leader_notes.trim() && <span className="ml-2 text-xs font-semibold text-indigo-700">{tr("Notes added")}</span>}</summary>
                <label className="mt-3 block text-sm font-medium" htmlFor={`leader-notes-${q.id}`}>{tr("Notes for this question")}</label>
                <textarea id={`leader-notes-${q.id}`} disabled={saving || hasSessions} value={q.leader_notes} onChange={e => updateQuestion(q.id, { leader_notes: e.target.value })} rows={4} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3" />
              </details>
            </>}
            {block.type === "slide" && <>
              <label className="block font-medium">{tr("Slide title")}<input disabled={saving || hasSessions} value={block.title} onChange={e => updateBlock(block.id, { title: e.target.value })} className="mt-2 w-full rounded-lg border p-3" /></label>
              <label className="block font-medium">{tr("Slide text")}<textarea disabled={saving || hasSessions} value={block.body} onChange={e => updateBlock(block.id, { body: e.target.value })} rows={5} className="mt-2 w-full rounded-lg border p-3" /></label>
            </>}
            {block.type === "text" && <>
              <label className="block font-medium">{tr("Section title (optional)")}<input disabled={saving || hasSessions} value={block.title} onChange={e => updateBlock(block.id, { title: e.target.value })} className="mt-2 w-full rounded-lg border p-3" /></label>
              <label className="block font-medium">{tr("Text / Bible passage")}<textarea disabled={saving || hasSessions} value={block.body} onChange={e => updateBlock(block.id, { body: e.target.value })} rows={5} className="mt-2 w-full rounded-lg border p-3" /></label>
            </>}
            {block.type === "image" && <>
              <label className="block font-medium">{tr("Caption (optional)")}<input disabled={saving || hasSessions} value={block.title} onChange={e => updateBlock(block.id, { title: e.target.value })} className="mt-2 w-full rounded-lg border p-3" /></label>
              <StudyImageUploader
                imageUrl={block.imageUrl}
                onImageUrlChange={url => updateBlock(block.id, { imageUrl: url })}
                disabled={saving || hasSessions}
                onUploadStateChange={trackUpload}
              />
            </>}
            {block.type !== "question" && <PresentationStyleEditor value={block} onChange={change => updateBlock(block.id, change)} disabled={saving || hasSessions} type={block.type} />}
            </div>}
          </div>;
        })}
        <div className="flex flex-wrap gap-2">
          {(["question", "slide", "text", "image"] as const).map(type => <button key={type} type="button" disabled={saving || hasSessions} onClick={() => addBlock(type)} className="rounded-lg border border-indigo-600 px-4 py-2 font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{`+ ${tr("Add")} ${tr(type)}`}</button>)}
        </div>
      </section>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button type="button" disabled={saving || hasSessions} onClick={() => { if (!dirty || window.confirm(tr("Discard unsaved changes and leave the editor?"))) router.push("/host/dashboard"); }} className="rounded-lg bg-indigo-600 px-7 py-3 font-medium text-white disabled:opacity-50">{tr("Back to Dashboard")}</button>
        <button type="button" disabled={saving} onClick={() => setPreviewOpen(true)} className="rounded-lg border border-indigo-600 bg-white px-7 py-3 font-medium text-indigo-700 hover:bg-indigo-50">{tr("Preview Study")}</button>
        <button type="button" disabled={saving || hasSessions || uploadingCount > 0} onClick={() => void saveChanges()} className="rounded-lg bg-emerald-600 px-7 py-3 font-medium text-white disabled:opacity-50">{saving ? tr("Saving...") : tr("Save to Supabase")}</button>
        
      </div>
      {message && <p role="status" className="mt-4 font-medium text-indigo-700">{message}</p>}

    </div>
  </main>{previewOpen && <StudyPreview draft={draft} onClose={() => setPreviewOpen(false)} />}</>;
}
