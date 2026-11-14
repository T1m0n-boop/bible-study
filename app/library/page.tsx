
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../components/LanguageProvider";
import { downloadStudyPdf, downloadStudyDocx, type ExportStudy } from "../../lib/studyExport";

type SavedStudy = {
  session_id: string;
  join_code: string;
  session_name: string | null;
  status: "waiting" | "live" | "ended";
  study_title: string;
  passage: string | null;
  note_count: number;
  updated_at: string;
};

type ArchivedSupplement = {
  id: string;
  item_type: "reference" | "hint" | "explanation";
  content: string;
  sort_order: number;
};

type ArchivedNote = {
  id: string;
  original_session_id: string;
  original_question_id: string;
  study_title: string;
  passage: string | null;
  session_name: string | null;
  question_number: number;
  question_text: string;
  note_text: string;
  table_config: { headers: string[]; rows: string[] } | null;
  table_answers: Record<string, string> | null;
  supplements: ArchivedSupplement[] | null;
  note_updated_at: string;
  archived_at: string;
};

type ArchivedStudy = {
  sessionId: string;
  title: string;
  passage: string | null;
  sessionName: string | null;
  archivedAt: string;
  notes: ArchivedNote[];
};

type SaveStatus = "saving" | "saved" | "error";

function formatDate(value: string, language: "en" | "ro") {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? language === "ro" ? "Dată necunoscută" : "Unknown date"
    : date.toLocaleString(language === "ro" ? "ro-RO" : "en-US");
}

function groupArchivedNotes(
  notes: ArchivedNote[]
): ArchivedStudy[] {
  const groups = new Map<string, ArchivedStudy>();

  for (const note of notes) {
    let group = groups.get(note.original_session_id);

    if (!group) {
      group = {
        sessionId: note.original_session_id,
        title: note.study_title,
        passage: note.passage,
        sessionName: note.session_name,
        archivedAt: note.archived_at,
        notes: [],
      };

      groups.set(note.original_session_id, group);
    }

    group.notes.push(note);

    if (note.archived_at > group.archivedAt) {
      group.archivedAt = note.archived_at;
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      notes: group.notes.sort(
        (a, b) => a.question_number - b.question_number
      ),
    }))
    .sort((a, b) =>
      b.archivedAt.localeCompare(a.archivedAt)
    );
}

export default function StudyLibraryPage() {
  const { t, language } = useLanguage();
  const [studies, setStudies] = useState<SavedStudy[]>([]);
  const [archivedStudies, setArchivedStudies] =
    useState<ArchivedStudy[]>([]);
  const [expandedArchive, setExpandedArchive] =
    useState<string | null>(null);
  const [saveStatuses, setSaveStatuses] = useState<
    Record<string, SaveStatus>
  >({});
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [exportFormats, setExportFormats] = useState<Record<string, "mobile" | "a4" | "docx" | "txt">>({});
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");

  // Track pending saves so rapid typing does not
  // overwrite newer changes with older requests.
  const saveQueue = useRef<
    Record<string, Promise<void> | undefined>
  >({});
  const latestNotes = useRef<Record<string, string>>({});
  const latestAnswers = useRef<Record<string, Record<string, string>>>({});
  const saveTimers = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  useEffect(() => {
    let active = true;
    const timers = saveTimers.current;

    async function loadLibrary() {
      setLoading(true);
      setError("");

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (!active) return;

      if (authError || !authData.user) {
        setSignedIn(false);
        setLoading(false);
        return;
      }

      setSignedIn(true);

      const { data: liveData, error: liveError } =
        await supabase.rpc("get_my_study_library");

      if (!active) return;

      if (liveError) {
        setError(liveError.message);
        setLoading(false);
        return;
      }

      const { data: archiveData, error: archiveError } =
        await supabase
          .from("archived_participant_notes")
          .select(
            "id, original_session_id, original_question_id, " +
            "study_title, passage, session_name, " +
            "question_number, question_text, note_text, table_config, table_answers, supplements, " +
            "note_updated_at, archived_at"
          )
          .eq("user_id", authData.user.id)
          .order("archived_at", { ascending: false });

      if (!active) return;

      if (archiveError) {
        setError(archiveError.message);
        setLoading(false);
        return;
      }

      const archived = (archiveData ?? []) as unknown as ArchivedNote[];

      for (const note of archived) {
        latestNotes.current[note.id] = note.note_text;
        latestAnswers.current[note.id] = note.table_answers ?? {};
      }

      setStudies((liveData ?? []) as SavedStudy[]);
      setArchivedStudies(groupArchivedNotes(archived));
      setLoading(false);
    }

    void loadLibrary();

    return () => {
      active = false;
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  function updateNoteLocally(noteId: string, value: string) {
    latestNotes.current[noteId] = value;

    setArchivedStudies((previous) =>
      previous.map((study) => ({
        ...study,
        notes: study.notes.map((note) =>
          note.id === noteId
            ? { ...note, note_text: value }
            : note
        ),
      }))
    );

    setSaveStatuses((previous) => ({
      ...previous,
      [noteId]: "saving",
    }));

    if (saveTimers.current[noteId]) {
      clearTimeout(saveTimers.current[noteId]);
    }

    // Wait briefly after typing before sending changes.
    saveTimers.current[noteId] = setTimeout(() => {
      void queueSave(noteId);
    }, 700);
  }

  function updateTableAnswer(noteId: string, rowIndex: number, value: string) {
    const next = { ...(latestAnswers.current[noteId] ?? {}), [String(rowIndex)]: value };
    latestAnswers.current[noteId] = next;
    setArchivedStudies(previous => previous.map(study => ({
      ...study,
      notes: study.notes.map(note => note.id === noteId ? { ...note, table_answers: next } : note),
    })));
    setSaveStatuses(previous => ({ ...previous, [noteId]: "saving" }));
    if (saveTimers.current[noteId]) clearTimeout(saveTimers.current[noteId]);
    saveTimers.current[noteId] = setTimeout(() => void queueSave(noteId), 700);
  }

  function queueSave(noteId: string): Promise<void> {
    const previousSave =
      saveQueue.current[noteId] ?? Promise.resolve();

    const nextSave = previousSave
      .catch(() => undefined)
      .then(async () => {
        const value = latestNotes.current[noteId] ?? "";
        const answers = { ...(latestAnswers.current[noteId] ?? {}) };

        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError || !authData.user) {
          setSaveStatuses((previous) => ({
            ...previous,
            [noteId]: "error",
          }));
          return;
        }

        const { error: saveError } = await supabase
          .from("archived_participant_notes")
          .update({ note_text: value, table_answers: answers })
          .eq("id", noteId)
          .eq("user_id", authData.user.id);

        if (saveError) {
          setSaveStatuses((previous) => ({
            ...previous,
            [noteId]: "error",
          }));
          return;
        }

        // Don't say "Saved" if the participant
        // has typed something newer meanwhile.
        if (latestNotes.current[noteId] === value &&
            JSON.stringify(latestAnswers.current[noteId] ?? {}) === JSON.stringify(answers)) {
          setSaveStatuses((previous) => ({
            ...previous,
            [noteId]: "saved",
          }));
        }
      });

    saveQueue.current[noteId] = nextSave;
    return nextSave;
  }

  async function saveNow(noteId: string) {
    if (saveTimers.current[noteId]) {
      clearTimeout(saveTimers.current[noteId]);
      delete saveTimers.current[noteId];
    }

    setSaveStatuses((previous) => ({
      ...previous,
      [noteId]: "saving",
    }));

    await queueSave(noteId);
  }

  async function exportArchivedStudy(study: ArchivedStudy, format: "mobile" | "a4" | "docx" | "txt") {
    if (exporting) return;
    setExporting(study.sessionId);
    setExportError("");
    try {
    // Flush pending edits before exporting.
    for (const note of study.notes) {
      if (saveTimers.current[note.id]) {
        clearTimeout(saveTimers.current[note.id]);
        delete saveTimers.current[note.id];
        await queueSave(note.id);
      }

      if (saveQueue.current[note.id]) {
        await saveQueue.current[note.id];
      }
    }

    if (study.notes.some(note => saveStatuses[note.id] === "error")) {
      throw new Error(t("library.exportSaveError"));
    }

    if (format !== "txt") {
      const exportStudy: ExportStudy = {
        title: study.title, passage: study.passage, sessionName: study.sessionName, sessionId: study.sessionId,
        notes: study.notes.map(note => ({
          question_number: note.question_number, question_text: note.question_text,
          note_text: latestNotes.current[note.id] ?? note.note_text,
          table_config: note.table_config, table_answers: latestAnswers.current[note.id] ?? note.table_answers,
          supplements: note.supplements,
        })),
      };
      if (format === "docx") await downloadStudyDocx(exportStudy, language);
      else await downloadStudyPdf(exportStudy, language, format);
      return;
    }

    const lines = [
      study.title,
      study.passage || "",
      study.sessionName || t("library.defaultSession"),
      t("library.exportTitle"),
      "",
      ...study.notes.flatMap((note) => [
        `${t("library.question")} ${note.question_number}: ${note.question_text}`,
        ...((note.supplements ?? []).map(item =>
          `${item.item_type === "reference" ? t("library.reference") : item.item_type === "hint" ? t("library.hint") : t("library.explanation")}: ${item.content}`
        )),
        latestNotes.current[note.id] ?? note.note_text,
        ...(note.table_config ? [
          `${t("library.table")}:`,
          `${note.table_config.headers?.[0] ?? t("library.category")} | ${note.table_config.headers?.[1] ?? t("library.answer")}`,
          ...(note.table_config.rows ?? []).map((row, index) =>
            `${row} | ${(latestAnswers.current[note.id] ?? {})[String(index)] ?? ""}`
          ),
        ] : []),
        "",
      ]),
    ];

    const file = new Blob(
      ["\uFEFF" + lines.join("\n")],
      { type: "text/plain;charset=utf-8" }
    );

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      `archived-bible-study-${study.sessionId}.txt`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : t("library.exportFailed"));
    } finally {
      setExporting(null);
    }
  }

  function statusLabel(status: SavedStudy["status"]) {
    if (status === "live") return t("library.live");
    if (status === "ended") return t("library.completed");
    return t("library.waiting");
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link
            href="/"
            className="text-xl font-bold text-indigo-700"
          >{t("app.title")}</Link>

          <Link
            href="/join"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >{t("library.join")}</Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-bold">{t("library.title")}</h1>

        <p className="mt-3 text-slate-600">{t("library.intro")}</p>

        {loading && (
          <p className="mt-8 text-slate-600">{t("library.loading")}</p>
        )}

        {!loading && !signedIn && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold">{t("library.signInTitle")}</h2>

            <p className="mt-3 text-slate-600">{t("library.signInDesc")}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/participant-login"
                className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700"
              >{t("library.signIn")}</Link>

              <Link
                href="/register"
                className="rounded-lg border border-indigo-600 px-5 py-3 font-medium text-indigo-700 hover:bg-indigo-50"
              >{t("library.createAccount")}</Link>
            </div>
          </div>
        )}

        {!loading && signedIn && error && (
          <div
            role="alert"
            className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700"
          >
            <p className="font-semibold">{t("library.loadError")}</p>
            <p className="mt-2">{error}</p>
          </div>
        )}

        {exportError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">{exportError}</p>}

        {!loading && signedIn && !error && (
          <>
            <section className="mt-10">
              <h2 className="text-2xl font-bold">{t("library.available")}</h2>

              <p className="mt-2 text-sm text-slate-600">{t("library.availableDesc")}</p>

              {studies.length === 0 ? (
                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-6">
                  <p className="text-slate-600">{t("library.noAvailable")}</p>

                  <Link
                    href="/join"
                    className="mt-4 inline-block font-medium text-indigo-700 hover:underline"
                  >{t("library.join")}</Link>
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  {studies.map((study) => (
                    <article
                      key={study.session_id}
                      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold">
                            {study.study_title}
                          </h3>

                          {study.passage && (
                            <p className="mt-2 font-medium text-indigo-700">
                              {study.passage}
                            </p>
                          )}
                        </div>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
                          {statusLabel(study.status)}
                        </span>
                      </div>

                      <p className="mt-4 text-slate-600">
                        {study.session_name ||
                          t("library.defaultSession")}
                      </p>

                      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                        <span>
                          {study.note_count} {t("library.questionsSaved")}
                        </span>

                        <span>
                          {t("library.lastUpdated")}:{" "}
                          {formatDate(study.updated_at, language)}
                        </span>
                      </div>

                      <Link
                        href={`/join/${encodeURIComponent(
                          study.join_code
                        )}`}
                        className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700"
                      >{t("library.openStudy")}</Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-12 border-t border-slate-200 pt-10">
              <h2 className="text-2xl font-bold">{t("library.archived")}</h2>

              <p className="mt-2 text-sm text-slate-600">{t("library.archivedDesc")}</p>

              {archivedStudies.length === 0 ? (
                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-6">
                  <p className="text-slate-600">{t("library.noArchived")}</p>
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  {archivedStudies.map((study) => {
                    const expanded =
                      expandedArchive === study.sessionId;

                    return (
                      <article
                        key={study.sessionId}
                        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-semibold">
                              {study.title}
                            </h3>

                            {study.passage && (
                              <p className="mt-2 font-medium text-indigo-700">
                                {study.passage}
                              </p>
                            )}
                          </div>

                          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">{t("library.archivedBadge")}</span>
                        </div>

                        <p className="mt-4 text-slate-600">
                          {study.sessionName ||
                            t("library.defaultSession")}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                          <span>
                            {study.notes.length} {t("library.savedRecords")}
                          </span>

                          <span>
                            {t("library.archivedAt")}:{" "}
                            {formatDate(study.archivedAt, language)}
                          </span>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedArchive(
                                expanded
                                  ? null
                                  : study.sessionId
                              )
                            }
                            aria-expanded={expanded}
                            className="rounded-lg border border-indigo-600 px-5 py-3 font-medium text-indigo-700 hover:bg-indigo-50"
                          >
                            {expanded
                              ? t("library.hideNotes")
                              : t("library.viewNotes")}
                          </button>

                          <div className="flex flex-wrap items-center gap-2">
                            <label className="sr-only" htmlFor={`export-format-${study.sessionId}`}>{t("library.exportFormat")}</label>
                            <select id={`export-format-${study.sessionId}`}
                              value={exportFormats[study.sessionId] ?? "mobile"}
                              onChange={event => setExportFormats(previous => ({ ...previous, [study.sessionId]: event.target.value as "mobile" | "a4" | "docx" | "txt" }))}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm">
                              <option value="mobile">{t("library.exportMobilePdf")}</option>
                              <option value="a4">{t("library.exportA4Pdf")}</option>
                              <option value="docx">{t("library.exportWord")}</option>
                              <option value="txt">{t("library.exportTxt")}</option>
                            </select>
                            <button type="button" disabled={exporting !== null}
                              onClick={() => void exportArchivedStudy(study, exportFormats[study.sessionId] ?? "mobile")}
                              className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                              {exporting === study.sessionId ? t("library.exporting") : t("library.export")}
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="mt-6 space-y-5 border-t border-slate-200 pt-6">
                            {study.notes.map((note) => {
                              const saveStatus =
                                saveStatuses[note.id];

                              return (
                                <div
                                  key={note.id}
                                  className="rounded-xl bg-slate-50 p-5"
                                >
                                  <p className="text-sm font-semibold text-indigo-700">
                                    {t("library.question")}{" "}
                                    {note.question_number}
                                  </p>

                                  <h4 className="mt-2 font-semibold">
                                    {note.question_text}
                                  </h4>

                                  {(note.supplements?.length ?? 0) > 0 && (
                                    <div className="mt-4 space-y-2 rounded-lg border border-indigo-100 bg-white p-4">
                                      <p className="text-sm font-semibold text-indigo-800">{t("library.revealed")}</p>
                                      {(note.supplements ?? []).map((item) => (
                                        <div key={item.id} className="rounded-lg bg-indigo-50 p-3">
                                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                                            {item.item_type === "reference" ? t("library.reference") : item.item_type === "hint" ? t("library.hint") : t("library.explanation")}
                                          </p>
                                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{item.content}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {note.table_config && Array.isArray(note.table_config.rows) && (
                                    <div className="mt-5 overflow-x-auto">
                                      <p className="mb-2 text-sm font-medium text-slate-700">{t("library.tableAnswers")}</p>
                                      <table className="w-full border-collapse text-sm">
                                        <thead><tr>
                                          <th className="border border-slate-300 bg-slate-100 p-3 text-left">{note.table_config.headers?.[0] ?? t("library.category")}</th>
                                          <th className="border border-slate-300 bg-slate-100 p-3 text-left">{note.table_config.headers?.[1] ?? t("library.answer")}</th>
                                        </tr></thead>
                                        <tbody>
                                          {note.table_config.rows.map((row, index) => (
                                            <tr key={index}>
                                              <td className="border border-slate-300 p-3">{row}</td>
                                              <td className="border border-slate-300 p-2">
                                                <input
                                                  aria-label={`${row} answer`}
                                                  value={note.table_answers?.[String(index)] ?? ""}
                                                  onChange={event => updateTableAnswer(note.id, index, event.target.value)}
                                                  className="w-full rounded-md border border-slate-300 bg-white p-2"
                                                  placeholder={t("library.yourAnswer")}
                                                />
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}

                                  <label
                                    htmlFor={`archived-note-${note.id}`}
                                    className="mt-5 block text-sm font-medium text-slate-700"
                                  >{t("library.personalNotes")}</label>

                                  <textarea
                                    id={`archived-note-${note.id}`}
                                    value={note.note_text}
                                    onChange={(event) =>
                                      updateNoteLocally(
                                        note.id,
                                        event.target.value
                                      )
                                    }
                                    rows={5}
                                    className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white p-4 text-slate-900 focus:border-indigo-500 focus:outline-none"
                                  />

                                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                                    <p
                                      role="status"
                                      className={
                                        "text-xs " +
                                        (saveStatus === "error"
                                          ? "text-red-600"
                                          : saveStatus === "saved"
                                            ? "text-emerald-700"
                                            : "text-slate-500")
                                      }
                                    >
                                      {saveStatus === "saving"
                                        ? t("library.saving")
                                        : saveStatus === "saved"
                                          ? t("library.saved")
                                          : saveStatus === "error"
                                            ? t("library.saveError")
                                            : t("library.autoSave")}
                                    </p>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        void saveNow(note.id)
                                      }
                                      className="text-sm font-medium text-indigo-700 hover:underline"
                                    >{t("library.saveNow")}</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
