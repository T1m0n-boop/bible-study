import { Suspense } from "react";
import { connection } from "next/server";
import SessionControlClient from "./SessionControlClient";

export default async function SessionControlPage() {
  // This page depends on the active request and a client-side session ID.
  // Do not prerender it at build time.
  await connection();

  return (
    <Suspense fallback={<main className="p-8 text-center">Loading session...</main>}>
      <SessionControlClient />
    </Suspense>
  );
}
