"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

type Leader = {
  user_id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
};

type OwnedStudy = {
  study_id: string;
  study_title: string;
  passage: string | null;
  owner_id: string;
  owner_email: string | null;
  owner_is_leader: boolean;
  created_at: string;
};

export default function LeaderManagementPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [studies, setStudies] = useState<OwnedStudy[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [selectedOwners, setSelectedOwners] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    const [leadersResult, studiesResult] = await Promise.all([
      supabase.rpc("admin_list_study_leaders"),
      supabase.rpc("admin_list_owned_studies"),
    ]);

    if (leadersResult.error || studiesResult.error) {
      setError(
        leadersResult.error?.message ??
          studiesResult.error?.message ??
          "Could not load administrator data."
      );
      return false;
    }

    setLeaders((leadersResult.data ?? []) as Leader[]);
    setStudies((studiesResult.data ?? []) as OwnedStudy[]);
    return true;
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (!active) return;
      if (authError || !authData.user) {
        setLoading(false);
        return;
      }

      const { data: adminStatus, error: adminError } =
        await supabase.rpc("is_study_admin");

      if (!active) return;
      if (adminError) {
        setError(adminError.message);
        setLoading(false);
        return;
      }
      if (adminStatus !== true) {
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      await loadData();
      if (active) setLoading(false);
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [loadData]);

  async function addLeader(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!address || busy || removingId || transferringId) return;

    setBusy(true);
    setMessage("");
    setError("");

    const { data, error: addError } = await supabase.rpc(
      "admin_add_study_leader",
      { p_email: address }
    );

    if (addError) {
      setError(addError.message);
    } else {
      setMessage(data ?? "Leader access granted.");
      setEmail("");
      await loadData();
    }
    setBusy(false);
  }

  async function removeLeader(leader: Leader) {
    if (leader.is_admin || busy || removingId || transferringId) return;

    const ownedCount = studies.filter(
      (study) => study.owner_id === leader.user_id
    ).length;
    const extra = ownedCount
      ? `\n\nThey own ${ownedCount} study/studies. Those studies will be preserved, but no active leader will be able to manage them until ownership is transferred or the leader is reinstated.`
      : "";

    const confirmed = window.confirm(
      `Remove leader permissions from ${leader.email}?\n\n` +
        "Their account and personal notes will remain." +
        extra
    );
    if (!confirmed) return;

    setRemovingId(leader.user_id);
    setMessage("");
    setError("");

    const { data, error: removeError } = await supabase.rpc(
      "admin_remove_study_leader",
      { p_user_id: leader.user_id }
    );

    if (removeError) {
      setError(removeError.message);
    } else {
      setMessage(data ?? "Leader access removed.");
      await loadData();
    }
    setRemovingId(null);
  }

  async function transferStudy(study: OwnedStudy) {
    if (busy || removingId || transferringId) return;
    const newOwnerId = selectedOwners[study.study_id];
    if (!newOwnerId || newOwnerId === study.owner_id) return;

    const target = leaders.find((leader) => leader.user_id === newOwnerId);
    if (!target) {
      setError("Please select an approved leader.");
      return;
    }

    const currentOwner = study.owner_email ?? "an unknown account";
    const confirmed = window.confirm(
      `Transfer “${study.study_title}”?\n\n` +
        `From: ${currentOwner}\nTo: ${target.email}\n\n` +
        "The current owner will lose access. Questions, sessions, and participant notes will be preserved."
    );
    if (!confirmed) return;

    setTransferringId(study.study_id);
    setMessage("");
    setError("");

    const { data, error: transferError } = await supabase.rpc(
      "admin_transfer_study",
      {
        p_study_id: study.study_id,
        p_new_owner_id: newOwnerId,
      }
    );

    if (transferError) {
      setError(transferError.message);
    } else {
      setMessage(data ?? "Study ownership transferred.");
      setSelectedOwners((previous) => {
        const next = { ...previous };
        delete next[study.study_id];
        return next;
      });
      await loadData();
    }
    setTransferringId(null);
  }

  const controlsDisabled = busy || removingId !== null || transferringId !== null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="text-xl font-bold text-indigo-700">
            Bible Study
          </Link>
          <Link
            href="/host/dashboard"
            className="text-sm font-medium text-indigo-700 hover:underline"
          >
            Leader Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-bold">Leader Management</h1>
        <p className="mt-3 text-slate-600">
          Manage who can lead Bible studies and transfer study ownership.
          Only administrators can make these changes.
        </p>

        {loading && (
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-slate-600">Checking administrator permissions...</p>
          </div>
        )}

        {!loading && !isAdmin && (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold">Administrator access required</h2>
            <p className="mt-2 text-slate-700">
              You must be signed in with an administrator account to manage leaders.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700"
              >
                Leader Sign In
              </Link>
              <Link
                href="/"
                className="rounded-lg border border-slate-300 px-5 py-3 font-medium hover:bg-white"
              >
                Home
              </Link>
            </div>
          </div>
        )}

        {!loading && isAdmin && (
          <>
            {message && (
              <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                {message}
              </div>
            )}
            {error && (
              <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                {error}
              </div>
            )}

            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Add a Leader</h2>
              <p className="mt-2 text-sm text-slate-600">
                Enter the email address of an existing registered participant.
              </p>
              <form
                onSubmit={(event) => void addLeader(event)}
                className="mt-5 flex flex-col gap-3 sm:flex-row"
              >
                <label htmlFor="leader-email" className="sr-only">Participant email</label>
                <input
                  id="leader-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="participant@example.com"
                  required
                  disabled={controlsDisabled}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={controlsDisabled || !email.trim()}
                  className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Adding..." : "Add Leader"}
                </button>
              </form>
            </section>

            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Current Leaders</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                  {leaders.length} total
                </span>
              </div>
              {leaders.length === 0 ? (
                <p className="mt-5 text-slate-600">No leaders found.</p>
              ) : (
                <div className="mt-5 divide-y divide-slate-200">
                  {leaders.map((leader) => (
                    <div key={leader.user_id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                      <div className="min-w-0">
                        <p className="break-all font-medium">{leader.email}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">Leader</span>
                          {leader.is_admin && (
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">Administrator</span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Leader since {new Date(leader.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {leader.is_admin ? (
                        <span className="text-sm text-slate-500">Protected account</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void removeLeader(leader)}
                          disabled={controlsDisabled}
                          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {removingId === leader.user_id ? "Removing..." : "Remove Leader"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Owned Studies</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                  {studies.length} total
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Transfer a study to another approved leader. Existing questions,
                sessions, and participant notes will remain unchanged.
              </p>
              {studies.length === 0 ? (
                <p className="mt-5 text-slate-600">No studies found.</p>
              ) : (
                <div className="mt-5 divide-y divide-slate-200">
                  {studies.map((study) => {
                    const selectedId = selectedOwners[study.study_id] ?? "";
                    const canTransfer = selectedId !== "" && selectedId !== study.owner_id;
                    return (
                      <div key={study.study_id} className="py-5">
                        <h3 className="font-semibold">{study.study_title}</h3>
                        {study.passage && <p className="mt-1 text-sm text-slate-600">{study.passage}</p>}
                        <p className="mt-2 break-all text-sm text-slate-700">
                          <span className="font-medium">Owner:</span>{" "}
                          {study.owner_email ?? study.owner_id}
                        </p>
                        {!study.owner_is_leader && (
                          <p className="mt-2 text-sm font-medium text-amber-700">
                            Former leader — this study needs an active owner to be managed.
                          </p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">
                          Created {new Date(study.created_at).toLocaleDateString()}
                        </p>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                          <div className="min-w-0 flex-1">
                            <label htmlFor={`transfer-${study.study_id}`} className="mb-1 block text-sm font-medium">
                              Transfer to
                            </label>
                            <select
                              id={`transfer-${study.study_id}`}
                              value={selectedId}
                              onChange={(event) =>
                                setSelectedOwners((previous) => ({
                                  ...previous,
                                  [study.study_id]: event.target.value,
                                }))
                              }
                              disabled={controlsDisabled}
                              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 focus:border-indigo-500 focus:outline-none"
                            >
                              <option value="">Select a leader...</option>
                              {leaders
                                .filter((leader) => leader.user_id !== study.owner_id)
                                .map((leader) => (
                                  <option key={leader.user_id} value={leader.user_id}>
                                    {leader.email}{leader.is_admin ? " (Admin)" : ""}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => void transferStudy(study)}
                            disabled={controlsDisabled || !canTransfer}
                            className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {transferringId === study.study_id ? "Transferring..." : "Transfer Study"}
                          </button>
                        </div>
                      </div>
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
