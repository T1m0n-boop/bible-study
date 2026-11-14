"use client";

import { useLanguage } from "./LanguageProvider";

export type SupplementType = "reference" | "hint" | "explanation";
export type SupplementItem = {
  id?: string;
  localId: string;
  item_type: SupplementType;
  content: string;
};

type Props = {
  value: SupplementItem[];
  onChange: (items: SupplementItem[]) => void;
  disabled?: boolean;
};

export default function QuestionSupplementBuilder({ value, onChange, disabled = false }: Props) {
  const { t } = useLanguage();
  function update(index: number, patch: Partial<SupplementItem>) {
    onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function move(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return (
    <section className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
      <h3 className="font-semibold text-slate-900">{t("builder.supplement.title")}</h3>
      <p className="mt-1 text-sm text-slate-600">{t("builder.supplement.instructions")}</p>
      {value.length > 0 && <div className="mt-4 space-y-3">{value.map((item, index) => (
        <div key={item.localId} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`supplement-type-${item.localId}`} className="text-sm font-medium">{t("builder.supplement.type")}</label>
            <select id={`supplement-type-${item.localId}`} value={item.item_type} disabled={disabled}
              onChange={e => update(index, { item_type: e.target.value as SupplementType })}
              className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">
              <option value="reference">{t("builder.supplement.reference")}</option>
              <option value="hint">{t("builder.supplement.hint")}</option>
              <option value="explanation">{t("builder.supplement.explanation")}</option>
            </select>
            <span className="ml-auto text-xs text-slate-500">{t("builder.supplement.item")} {index + 1}</span>
          </div>
          <label htmlFor={`supplement-content-${item.localId}`} className="mt-3 block text-sm font-medium">{t("builder.supplement.content")}</label>
          <textarea id={`supplement-content-${item.localId}`} rows={item.item_type === "reference" ? 2 : 3}
            value={item.content} disabled={disabled}
            placeholder={item.item_type === "reference" ? t("builder.supplement.referencePlaceholder") : item.item_type === "hint" ? t("builder.supplement.hintPlaceholder") : t("builder.supplement.explanationPlaceholder")}
            onChange={e => update(index, { content: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3" />
          {!disabled && <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="rounded border px-3 py-1 disabled:opacity-40">↑ {t("builder.up")}</button>
            <button type="button" disabled={index === value.length - 1} onClick={() => move(index, 1)} className="rounded border px-3 py-1 disabled:opacity-40">↓ {t("builder.down")}</button>
            <button type="button" onClick={() => onChange(value.filter((_, i) => i !== index))} className="rounded border border-red-300 px-3 py-1 text-red-700">{t("builder.remove")}</button>
          </div>}
        </div>
      ))}</div>}
      {!disabled && <button type="button" onClick={() => onChange([...value, { localId: crypto.randomUUID(), item_type: "reference", content: "" }])}
        className="mt-4 rounded-lg border border-indigo-600 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50">+ {t("builder.supplement.add")}</button>}
      {value.length === 0 && <p className="mt-3 text-xs text-slate-500">{t("builder.supplement.none")}</p>}
    </section>
  );
}

export function validateSupplementItems(items: SupplementItem[]): string | null {
  if (items.some(item => !item.content.trim())) return "Fill in or remove each supplementary item.";
  return null;
}
