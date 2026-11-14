
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function LeaderGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [status, setStatus] = useState<
    "checking" | "allowed" | "denied"
  >("checking");

  useEffect(() => {
    let active = true;

    async function checkLeader() {
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !data.user) {
        setStatus("denied");
        router.replace("/login");
        return;
      }

      const { data: leader, error: leaderError } =
        await supabase
          .from("study_leaders")
          .select("user_id")
          .eq("user_id", data.user.id)
          .maybeSingle();

      if (!active) return;

      if (leaderError || !leader) {
        setStatus("denied");
        router.replace("/login");
        return;
      }

      setStatus("allowed");
    }

    checkLeader();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <>
      {status !== "allowed" && (
        <main
          style={{
            padding: "40px",
            textAlign: "center",
          }}
        >
          {status === "checking"
            ? "Checking leader access..."
            : "Redirecting to login..."}
        </main>
      )}

      <div
        hidden={status !== "allowed"}
        inert={status !== "allowed"}
      >
        {children}
      </div>
    </>
  );
}
