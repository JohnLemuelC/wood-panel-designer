"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props { jobId: string; status: string }

export default function OperatorActions({ jobId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function transition(to: string) {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {err && <span className="text-xs text-red-600">{err}</span>}
      <a
        href={`/api/jobs/${jobId}/pdf/template`}
        target="_blank"
        rel="noreferrer"
        className="text-sm border border-stone-300 rounded px-3 py-1.5 hover:bg-stone-100"
      >
        1:1 template
      </a>
      <a
        href={`/api/jobs/${jobId}/pdf/reference`}
        target="_blank"
        rel="noreferrer"
        className="text-sm border border-stone-300 rounded px-3 py-1.5 hover:bg-stone-100"
      >
        Reference
      </a>
      {(status === "APPROVED" || status === "PRINTED" || status === "SHIPPED") && (
        <a
          href={`/api/jobs/${jobId}/print-master`}
          className="text-sm bg-stone-900 text-white rounded px-3 py-1.5 hover:bg-stone-800"
        >
          Download print master
        </a>
      )}
      {status === "ARRANGING" && (
        <button disabled={loading} onClick={() => transition("PROOFING")} className="text-sm bg-stone-900 text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-50">
          Send proof to customer
        </button>
      )}
      {status === "APPROVED" && (
        <button disabled={loading} onClick={() => transition("PRINTED")} className="text-sm bg-emerald-600 text-white rounded px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50">
          Mark printed
        </button>
      )}
      {status === "PRINTED" && (
        <button disabled={loading} onClick={() => transition("SHIPPED")} className="text-sm bg-emerald-600 text-white rounded px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50">
          Mark shipped
        </button>
      )}
    </div>
  );
}
