"use client";

import { useState } from "react";

export default function RequestOperatorButton({ requested }: { requested: boolean }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">(requested ? "done" : "idle");

  async function handleRequest() {
    setStatus("loading");
    await fetch("/api/operator-request", { method: "POST" });
    setStatus("done");
  }

  if (status === "done") {
    return (
      <p className="text-sm text-stone-500">
        Operator access requested. Waiting for approval.
      </p>
    );
  }

  return (
    <button
      onClick={handleRequest}
      disabled={status === "loading"}
      className="text-sm text-stone-600 underline hover:text-stone-900 disabled:opacity-50"
    >
      {status === "loading" ? "Requesting..." : "Request operator access"}
    </button>
  );
}
