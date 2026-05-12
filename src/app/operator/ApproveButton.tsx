"use client";

import { useState } from "react";

export default function ApproveButton({ userId }: { userId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  async function handleApprove() {
    setStatus("loading");
    await fetch("/api/operator-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setStatus("done");
  }

  if (status === "done") {
    return <span className="text-xs text-emerald-600 font-medium">Approved</span>;
  }

  return (
    <button
      onClick={handleApprove}
      disabled={status === "loading"}
      className="text-xs bg-stone-900 text-white px-3 py-1 rounded hover:bg-stone-800 disabled:opacity-50"
    >
      {status === "loading" ? "Approving..." : "Approve"}
    </button>
  );
}
