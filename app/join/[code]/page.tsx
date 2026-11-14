import { connection } from "next/server";
import ParticipantStudyClient from "./ParticipantStudyClient";

export default async function ParticipantStudyPage() {
  await connection();
  return <ParticipantStudyClient />;
}
