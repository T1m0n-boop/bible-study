"use client";
import { useEditorTranslation } from "./EditorTranslation";

export type PresentationStyle = {
  background?: string;
  textColor?: string;
  textAlign?: "left" | "center" | "right";
  fontSize?: "normal" | "large" | "extra-large";
  bold?: boolean;
};
export type PresentationContent = PresentationStyle & {
  title?: string; body?: string; imageUrl?: string; leaderNotes?: string;
};
// Shared font sizes for live, full-study, and presentation previews.
// Keeping these in one place prevents individual previews ignoring the editor selection.
export function getPresentationFontSizes(size: PresentationStyle["fontSize"], compact = false) {
  if (compact) {
    switch (size) {
      case "extra-large": return { title: "2.25rem", body: "1.5rem" };
      case "large": return { title: "1.875rem", body: "1.25rem" };
      default: return { title: "1.5rem", body: "1rem" };
    }
  }
  switch (size) {
    case "extra-large": return { title: "clamp(2rem, 5vw, 5rem)", body: "clamp(1.5rem, 3vw, 3rem)" };
    case "large": return { title: "clamp(1.75rem, 4vw, 4rem)", body: "clamp(1.25rem, 2.5vw, 2.5rem)" };
    default: return { title: "clamp(1.5rem, 3vw, 3rem)", body: "clamp(1rem, 2vw, 2rem)" };
  }
}
const backgrounds = ["#0f172a", "#1e3a8a", "#14532d", "#581c87", "#ffffff", "#f8fafc"];
const colors = ["#ffffff", "#0f172a", "#fef08a", "#bfdbfe", "#fbcfe8"];
export function PresentationPreview({ content, type = "slide", compact = false }: { content: PresentationContent; type?: "slide" | "text" | "image"; compact?: boolean }) {
  const tr = useEditorTranslation();
  const background = content.background || "#0f172a";
  const textColor = content.textColor || "#ffffff";
  const align = content.textAlign || "center";
  const sizes = getPresentationFontSizes(content.fontSize, compact);
  return <div className={`flex w-full flex-col justify-center overflow-auto rounded-xl ${compact ? "min-h-64 p-6" : "min-h-[75dvh] p-6 sm:p-12"}`}
    style={{ backgroundColor: background, color: textColor, textAlign: align }}>
    <div className="mx-auto w-full max-w-6xl">
      {content.title && <h2 className="mb-6 break-words leading-tight" style={{ fontSize: sizes.title, fontWeight: content.bold ? 800 : 700 }}>{content.title}</h2>}
      {type === "image" && content.imageUrl && <img src={content.imageUrl} alt={content.title || tr("Study illustration")} className={`mx-auto w-auto max-w-full rounded-lg object-contain ${compact ? "max-h-52" : "max-h-[65dvh]"}`} />}
      {content.body && <p className="whitespace-pre-wrap break-words leading-relaxed" style={{ fontSize: sizes.body, fontWeight: content.bold ? 700 : 400 }}>{content.body}</p>}
    </div>
  </div>;
}
export function PresentationStyleEditor({ value, onChange, disabled = false, type = "slide" }: {
  value: PresentationContent; onChange: (change: Partial<PresentationContent>) => void; disabled?: boolean; type?: "slide" | "text" | "image";
}) {
  const tr = useEditorTranslation();
  return <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h3 className="font-semibold">{tr("Presentation appearance")}</h3>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium">{tr("Text alignment")}
        <select disabled={disabled} value={value.textAlign || "center"} onChange={e => onChange({ textAlign: e.target.value as PresentationStyle["textAlign"] })} className="mt-1 w-full rounded-lg border bg-white p-2">
          <option value="left">{tr("Left")}</option><option value="center">{tr("Center")}</option><option value="right">{tr("Right")}</option>
        </select>
      </label>
      <label className="block text-sm font-medium">{tr("Text size")}
        <select disabled={disabled} value={value.fontSize || "normal"} onChange={e => onChange({ fontSize: e.target.value as PresentationStyle["fontSize"] })} className="mt-1 w-full rounded-lg border bg-white p-2">
          <option value="normal">{tr("Normal")}</option><option value="large">{tr("Large")}</option><option value="extra-large">{tr("Extra large")}</option>
        </select>
      </label>
    </div>
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!value.bold} disabled={disabled} onChange={e => onChange({ bold: e.target.checked })} /> Bold text</label>
    <div><p className="mb-2 text-sm font-medium">{tr("Background")}</p><div className="flex flex-wrap gap-2">{backgrounds.map(c => <button key={c} type="button" disabled={disabled} title={c} aria-label={`${tr("Background")} ${c}`} aria-pressed={(value.background || "#0f172a") === c} onClick={() => onChange({ background: c })} className={`h-9 w-9 rounded-lg border-2 ${(value.background || "#0f172a") === c ? "ring-2 ring-indigo-500 ring-offset-2" : ""}`} style={{ backgroundColor: c }} />)}</div></div>
    <div><p className="mb-2 text-sm font-medium">{tr("Text color")}</p><div className="flex flex-wrap gap-2">{colors.map(c => <button key={c} type="button" disabled={disabled} title={c} aria-label={`${tr("Text color")} ${c}`} aria-pressed={(value.textColor || "#ffffff") === c} onClick={() => onChange({ textColor: c })} className={`h-9 w-9 rounded-lg border-2 ${(value.textColor || "#ffffff") === c ? "ring-2 ring-indigo-500 ring-offset-2" : ""}`} style={{ backgroundColor: c }} />)}</div></div>
    <details className="rounded-lg border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer select-none text-sm font-medium text-slate-800">{tr("Leader Notes")} <span className="font-normal text-slate-500">{tr("(private · optional)")}</span>{value.leaderNotes?.trim() && <span className="ml-2 text-xs font-semibold text-indigo-700">{tr("Notes added")}</span>}</summary>
      <label className="mt-3 block text-sm font-medium">{tr("Notes for this block")}
        <textarea disabled={disabled} value={value.leaderNotes || ""} onChange={e => onChange({ leaderNotes: e.target.value })} rows={3} placeholder={tr("Talking points and reminders, not visible to participants")} className="mt-2 w-full rounded-lg border bg-white p-3" />
      </label>
    </details>
    <h3 className="font-semibold">{tr("Live preview")}</h3>
    <PresentationPreview content={value} type={type} compact />
  </div>;
}
