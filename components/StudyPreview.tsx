"use client";

import { useEffect, useRef, useState } from "react";
import { useEditorTranslation } from "./EditorTranslation";
import type { QuestionTableConfig } from "./QuestionTableBuilder";
import type { SupplementItem } from "./QuestionSupplementBuilder";
import { getPresentationFontSizes, type PresentationContent } from "./PresentationBlocks";

export type PreviewQuestion = { id: string; text: string; leader_notes: string; table_config: QuestionTableConfig | null; supplements: SupplementItem[] };
export type PreviewBlock = { id: string; type: "question" | "slide" | "text" | "image"; title: string; body: string; imageUrl: string } & PresentationContent;
export type PreviewDraft = { title: string; passage: string; description: string; leader_notes: string; questions: PreviewQuestion[]; blocks: PreviewBlock[] };

// Read-only preview uses the live editor state; no save or database request is needed.
export default function StudyPreview({ draft, onClose }: { draft: PreviewDraft; onClose: () => void }) {
  const tr = useEditorTranslation();
  const [showLeaderNotes, setShowLeaderNotes] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    scrollRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const orderedQuestions = draft.blocks.filter(block => block.type === "question");
  let questionNumber = 0;

  const formatText = (value: string) => value.trim() || tr("(No content yet)");
  const renderTable = (config: QuestionTableConfig | null) => {
    if (!config) return null;
    return <div className="mt-4 overflow-x-auto">
      <p className="mb-2 text-sm font-semibold">{tr("Question table")}</p>
      <table className="w-full border-collapse text-left text-sm">
        <thead><tr>
          <th className="border border-slate-300 bg-slate-100 p-3">{config.headers[0]}</th>
          <th className="border border-slate-300 bg-slate-100 p-3">{config.headers[1]}</th>
        </tr></thead>
        <tbody>{config.rows.map((label, i) => <tr key={i}>
          <td className="border border-slate-300 p-3 whitespace-pre-wrap">{label}</td>
          <td className="border border-slate-300 p-3 text-slate-400">{tr("Participant answer")}</td>
        </tr>)}</tbody>
      </table>
    </div>;
  };

  return <div role="dialog" aria-modal="true" aria-label="Full study preview" className="fixed inset-0 z-50 bg-slate-950/70 p-2 sm:p-6">
    <div ref={scrollRef} tabIndex={-1} className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl outline-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-4">
        <div><h2 className="text-xl font-bold">{tr("Full Study Preview")}</h2><p className="text-xs text-slate-500">{tr("Read-only · current unsaved content · ")}{draft.blocks.length} {tr("blocks")}</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={showLeaderNotes} onChange={event => setShowLeaderNotes(event.target.checked)} /> {tr("Show leader notes")}</label>
          <button type="button" onClick={onClose} className="rounded-lg bg-indigo-700 px-4 py-2 font-medium text-white">{tr("Close Preview")}</button>
        </div>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-10">
        <section className="rounded-xl border bg-white p-6">
          <h1 className="text-3xl font-bold">{draft.title || tr("Untitled Bible Study")}</h1>
          {draft.passage && <p className="mt-2 font-semibold text-indigo-700">{draft.passage}</p>}
          {draft.description && <p className="mt-4 whitespace-pre-wrap text-slate-700">{draft.description}</p>}
          {showLeaderNotes && draft.leader_notes && <aside className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4"><strong className="text-amber-900">{tr("General leader notes")}</strong><p className="mt-2 whitespace-pre-wrap">{draft.leader_notes}</p></aside>}
        </section>
        {draft.blocks.map((block, index) => {
          const question = block.type === "question" ? draft.questions.find(q => q.id === block.id) : undefined;
          if (block.type === "question") questionNumber++;
          const currentQuestionNumber = questionNumber;
          const sizes = getPresentationFontSizes(block.fontSize, true);
          const background = typeof block.background === "string" ? block.background : undefined;
          const textColor = typeof block.textColor === "string" ? block.textColor : undefined;
          const textAlign = block.textAlign === "center" || block.textAlign === "right" ? block.textAlign : "left";
          const safeBackground = background?.startsWith("#") ? background : undefined;
          const safeTextColor = textColor?.startsWith("#") ? textColor : undefined;
          return <section key={block.id} className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="border-b bg-slate-100 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{index + 1} / {draft.blocks.length} · {block.type === "question" ? `${tr("Discussion question")} ${currentQuestionNumber}` : tr(block.type)}</div>
            <div className="p-6" style={block.type !== "question" ? { backgroundColor: safeBackground, color: safeTextColor, textAlign } : undefined}>
              {block.type === "question" && <>
                <h3 className="text-xl font-semibold whitespace-pre-wrap">{currentQuestionNumber}. {formatText(question?.text ?? "")}</h3>
                {question && renderTable(question.table_config)}
                {question && question.supplements.length > 0 && <div className="mt-5 space-y-3"><h4 className="font-semibold">{tr("Supplementary materials")}</h4>
                  {question.supplements.map((item, i) => <div key={item.localId || item.id || i} className="rounded-lg border p-3">
                    <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{item.item_type}</div>
                    <p className="whitespace-pre-wrap">{item.content || tr("(Empty supplement)")}</p>
                  </div>)}</div>}
                {showLeaderNotes && question?.leader_notes && <aside className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4"><strong className="text-amber-900">{tr("Leader notes")}</strong><p className="mt-2 whitespace-pre-wrap">{question.leader_notes}</p></aside>}
              </>}
              {block.type === "slide" && <div className="flex min-h-48 flex-col justify-center"><h3 className="font-bold whitespace-pre-wrap break-words leading-tight" style={{ fontSize: sizes.title, fontWeight: block.bold ? 800 : 700 }}>{block.title}</h3><p className="mt-4 whitespace-pre-wrap break-words leading-relaxed" style={{ fontSize: sizes.body, fontWeight: block.bold ? 700 : 400 }}>{formatText(block.body)}</p></div>}
              {block.type === "text" && <><h3 className="font-bold break-words" style={{ fontSize: sizes.title, fontWeight: block.bold ? 800 : 700 }}>{block.title}</h3><p className="mt-3 whitespace-pre-wrap break-words leading-relaxed" style={{ fontSize: sizes.body, fontWeight: block.bold ? 700 : 400 }}>{formatText(block.body)}</p></>}
              {block.type === "image" && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={block.imageUrl} alt={block.title || tr("Study illustration")} className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain" />{block.title && <p className="mt-3 font-medium break-words" style={{ fontSize: sizes.title, fontWeight: block.bold ? 800 : 500 }}>{block.title}</p>}</>}
              {showLeaderNotes && block.type !== "question" && block.leaderNotes && <aside className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-slate-900"><strong className="text-amber-900">{tr("Leader notes")}</strong><p className="mt-2 whitespace-pre-wrap">{block.leaderNotes}</p></aside>}
            </div>
          </section>;
        })}
        {orderedQuestions.length === 0 && <p className="text-sm text-slate-500">{tr("This study has no discussion questions yet.")}</p>}
      </div>
    </div>
  </div>;
}

