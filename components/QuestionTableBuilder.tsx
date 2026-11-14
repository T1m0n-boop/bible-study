"use client";

import { useLanguage } from "./LanguageProvider";

export type QuestionTableConfig = { headers: [string, string]; rows: string[] };

export default function QuestionTableBuilder({ value, onChange, disabled = false }: {
  value: QuestionTableConfig | null;
  onChange: (next: QuestionTableConfig | null) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <label className="flex items-center gap-2 font-medium text-slate-800">
        <input type="checkbox" checked={value !== null} disabled={disabled}
          onChange={e => onChange(e.target.checked ? { headers: [t("builder.table.category"), t("builder.table.answer")], rows: [t("builder.table.newCategory")] } : null)} />
        {t("builder.table.add")}
      </label>
      {value && <div className="mt-4 space-y-3">
        <p className="text-sm text-slate-600">{t("builder.table.instructions")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([0, 1] as const).map(i => <label key={i} className="text-sm font-medium">
            {i === 0 ? t("builder.table.firstHeading") : t("builder.table.answerHeading")}
            <input disabled={disabled} value={value.headers[i]} maxLength={100}
              onChange={e => { const headers: [string, string] = [...value.headers]; headers[i] = e.target.value; onChange({ ...value, headers }); }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" />
          </label>)}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t("builder.table.rows")}</p>
          {value.rows.map((row, index) => <div key={index} className="flex flex-wrap items-center gap-2">
            <input aria-label={`${t("builder.table.row")} ${index + 1}`} disabled={disabled} value={row} maxLength={200}
              onChange={e => onChange({ ...value, rows: value.rows.map((r, i) => i === index ? e.target.value : r) })}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white p-2" />
            <button type="button" disabled={disabled || index === 0} onClick={() => {
              const rows = [...value.rows]; [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]]; onChange({ ...value, rows });
            }} className="rounded border bg-white px-2 py-2 disabled:opacity-40" aria-label={`${t("builder.table.moveRow")} ${index + 1} ${t("builder.up")}`}>↑</button>
            <button type="button" disabled={disabled || index === value.rows.length - 1} onClick={() => {
              const rows = [...value.rows]; [rows[index + 1], rows[index]] = [rows[index], rows[index + 1]]; onChange({ ...value, rows });
            }} className="rounded border bg-white px-2 py-2 disabled:opacity-40" aria-label={`${t("builder.table.moveRow")} ${index + 1} ${t("builder.down")}`}>↓</button>
            <button type="button" disabled={disabled || value.rows.length === 1} onClick={() => onChange({ ...value, rows: value.rows.filter((_, i) => i !== index) })}
              className="rounded border border-red-200 bg-white px-3 py-2 text-red-700 disabled:opacity-40">{t("builder.remove")}</button>
          </div>)}
        </div>
        <button type="button" disabled={disabled || value.rows.length >= 100} onClick={() => onChange({ ...value, rows: [...value.rows, ""] })}
          className="rounded-lg border border-indigo-600 bg-white px-3 py-2 text-sm font-medium text-indigo-700 disabled:opacity-40">+ {t("builder.table.addRow")}</button>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr><th className="border-b p-3">{value.headers[0] || t("builder.table.firstColumn")}</th><th className="border-b p-3">{value.headers[1] || t("builder.table.answerColumn")}</th></tr></thead>
            <tbody>{value.rows.map((row, i) => <tr key={i}><td className="border-b p-3">{row || t("builder.table.emptyLabel")}</td><td className="border-b p-3 text-slate-400">{t("builder.table.participantTypes")}</td></tr>)}</tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}

export function validateQuestionTable(value: QuestionTableConfig | null): string | null {
  if (!value) return null;
  if (value.headers.length !== 2 || value.headers.some(h => !h.trim() || h.trim().length > 100)) return "Both table headings must be filled in (maximum 100 characters).";
  if (value.rows.length < 1 || value.rows.length > 100 || value.rows.some(r => !r.trim() || r.trim().length > 200)) return "Every table row needs a label (maximum 200 characters; up to 100 rows).";
  return null;
}

export function normalizeQuestionTable(value: QuestionTableConfig | null): QuestionTableConfig | null {
  return value ? { headers: [value.headers[0].trim(), value.headers[1].trim()], rows: value.rows.map(r => r.trim()) } : null;
}
