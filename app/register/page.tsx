
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleRegister(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Your passwords do not match. Please try again.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo:
              `${window.location.origin}/participant/dashboard`,
          },
        });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      setPassword("");
      setConfirmPassword("");

      if (data.session) {
        router.replace("/participant/dashboard");
        router.refresh();
      } else {
        setSuccess(
          "Registration submitted. If email confirmation is required, check your inbox and follow the confirmation link. You can then sign in to access your dashboard."
        );
      }
    } catch {
      setError(
        "Something went wrong. Please check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 sm:py-16">
      <div className="w-full max-w-md">
        <div className="text-center">
          <span aria-hidden="true" className="text-5xl">
            📖
          </span>

          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Create Your Account
          </h1>

          <p className="mt-3 text-slate-600">
            Save your Bible study notes online, revisit past studies,
            and access your personal library across devices.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <form onSubmit={handleRegister} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-slate-800"
              >
                Email Address
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-slate-800"
              >
                Password
              </label>

              <p className="mt-1 text-sm text-slate-500">
                Use at least 8 characters.
              </p>

              <div className="relative mt-2">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Create a password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-4 pr-20 text-base text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? "Hide passwords" : "Show passwords"
                  }
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-3 px-2 text-sm font-medium text-indigo-700"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-semibold text-slate-800"
              >
                Confirm Password
              </label>

              <input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setError("");
                }}
                placeholder="Enter your password again"
                required
                minLength={8}
                autoComplete="new-password"
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {success && (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
              >
                <p>{success}</p>
                <Link
                  href="/participant-login"
                  className="mt-3 inline-block font-semibold underline"
                >
                  Go to Sign In
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || Boolean(success)}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <div className="mt-7 border-t border-slate-200 pt-6 text-center">
            <p className="text-sm text-slate-600">
              Already have an account?{" "}
              <Link
                href="/participant-login"
                className="font-semibold text-indigo-700 hover:underline"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-center">
          <p className="font-medium text-slate-800">
            Just want to join a Bible study?
          </p>

          <p className="mt-2 text-sm text-slate-600">
            You can participate without creating an account.
            Guest notes are stored on your device.
          </p>

          <Link
            href="/join"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-indigo-600 px-5 py-2.5 font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Join as a Guest
          </Link>
        </div>
      </div>
    </main>
  );
}
