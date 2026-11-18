
import { Suspense } from "react";
import SessionControlClient from "./SessionControlClient";

export default function SessionControlPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-center">
          Loading session...
        </main>
      }
    >
      <SessionControlClient />
    </Suspense>
  );
}
