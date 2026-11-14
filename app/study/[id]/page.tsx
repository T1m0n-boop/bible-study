
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const questions = [
  "What does it mean to take refuge in the Lord?",
  "What advice did David receive, and why did he reject it?",
  "What does Psalm 11 teach us about God's sovereignty?",
];

const storageKey = "bible-study-example-notes";

export default function StudyPage() {
  const [answers, setAnswers] = useState<string[]>(
    questions.map(() => "")
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          setAnswers(
            questions.map((_, index) =>
              typeof parsed[index] === "string"
                ? parsed[index]
                : ""
            )
          );
        }
      } catch {
        // Ignore invalid saved data.
      }
    }

    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;

    localStorage.setItem(storageKey, JSON.stringify(answers));
  }, [answers, loaded]);

  function updateAnswer(index: number, value: string) {
    setAnswers((previous) =>
      previous.map((answer, i) =>
        i === index ? value : answer
      )
    );
  }

  function downloadNotes() {
    const content = [
      "Bible Study: Trusting God in Difficult Times",
      "Bible Passage: Psalm 11:1-7",
      "",
      ...questions.flatMap((question, index) => [
        `Question ${index + 1}: ${question}`,
        `My answer: ${answers[index] || ""}`,
        "",
      ]),
    ].join("\n");

    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "my-bible-study-notes.txt";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link
            href="/"
            className="text-xl font-bold text-indigo-700"
          >
            Bible Study
          </Link>

          <span className="text-sm text-slate-500">
            Personal Workbook
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-3 text-3xl font-bold">
          Trusting God in Difficult Times
        </h1>

        <p className="mb-2 text-indigo-700">
          Psalm 11:1–7
        </p>

        <p className="mb-8 text-slate-600">
          Write your personal reflections as you discuss
          each question together.
        </p>

        <div className="space-y-6">
          {questions.map((question, index) => (
            <section
              key={index}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="mb-2 text-sm font-semibold text-indigo-700">
                Question {index + 1}
              </p>

              <h2 className="mb-4 text-lg font-semibold">
                {question}
              </h2>

              <textarea
                value={answers[index]}
                onChange={(e) =>
                  updateAnswer(index, e.target.value)
                }
                placeholder="Write your personal notes here..."
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
              />
            </section>
          ))}
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Your answers are automatically saved in this browser.
        </p>

        <button
          onClick={downloadNotes}
          className="mt-6 rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
        >
          Download My Notes
        </button>

        <div className="mt-8">
          <Link
            href="/"
            className="font-medium text-indigo-700 hover:underline"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
