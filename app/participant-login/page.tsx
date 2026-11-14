
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ParticipantLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    if (!email.trim() || !password) {
      setError("Please enter your email address and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError) {
        if (loginError.message.toLowerCase().includes("invalid login")) {
          setError(
            "The email address or password is incorrect. Please check your details and try again."
          );
        } else if (
          loginError.message.toLowerCase().includes("email not confirmed")
        ) {
          setError(
            "Your email address has not been confirmed. Please check your inbox for the confirmation email."
          );
        } else {
          setError(loginError.message);
        }
        return;
      }

      router.replace("/participant/dashboard");
      router.refresh();
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
            Welcome Back
          </h1>

          <p className="mt-3 text-slate-600">
            Sign in to continue your Bible studies and access
            your personal notes.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <form onSubmit={handleLogin} className="space-y-6">
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

              <div className="relative mt-2">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-4 pr-20 text-base text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-3 px-2 text-sm font-medium text-indigo-700 hover:text-indigo-900"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-7 border-t border-slate-200 pt-6 text-center">
            <p className="text-sm text-slate-600">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-semibold text-indigo-700 hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-center">
          <p className="font-medium text-slate-800">
            Just joining a study?
          </p>
          <p className="mt-2 text-sm text-slate-600">
            You don&apos;t need an account to participate.
            Simply enter the joining code from your study leader.
          </p>
          <Link
            href="/join"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-indigo-600 px-5 py-2.5 font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Join as a Guest
          </Link>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Are you a study leader?{" "}
          <Link
            href="/login"
            className="font-semibold text-indigo-700 hover:underline"
          >
            Leader Sign In
          </Link>
        </p>
      </div>
    </main>
  );
}
