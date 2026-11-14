import { Suspense } from "react";
import { connection } from "next/server";
import EditStudyClient from "./EditStudyClient";

export default async function EditStudyPage() {
  // This route requires the request-time study ID.
  await connection();

  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl p-8">Loading study...</main>}>
      <EditStudyClient />
    </Suspense>
  );
}
