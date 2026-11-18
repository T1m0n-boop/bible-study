import { Suspense } from "react";
import { connection } from "next/server";
import ParticipantStudyClient from "./ParticipantStudyClient";

async function DynamicParticipantPage() {
  await connection();
  return <ParticipantStudyClient />;
}

export default function ParticipantStudyPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-8 text-center">
          Loading Bible study...
        </main>
      }
    >
      <DynamicParticipantPage />
    </Suspense>
  );
}