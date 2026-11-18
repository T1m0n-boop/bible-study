import { Suspense } from "react";
import ProjectorClient from "./ProjectorClient";

export default function ProjectorPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-slate-950 p-8 text-white">Loading projector...</main>}>
      <ProjectorClient />
    </Suspense>
  );
}
