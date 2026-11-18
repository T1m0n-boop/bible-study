
import { Suspense } from "react";
import EditStudyClient from "./EditStudyClient";

export default function EditStudyPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl p-8">
          Loading study...
        </main>
      }
    >
      <EditStudyClient />
    </Suspense>
  );
}
