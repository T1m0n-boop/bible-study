"use client";

import { useLanguage } from "./LanguageProvider";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="site-language" className="sr-only">Language / Limba</label>
      <select
        id="site-language"
        aria-label="Language / Limba"
        value={language}
        onChange={(event) => setLanguage(event.target.value as "en" | "ro")}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-900"
      >
        <option value="en">English</option>
        <option value="ro">Română</option>
      </select>
    </div>
  );
}
