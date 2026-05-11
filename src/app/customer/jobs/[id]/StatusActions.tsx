"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
  jobId: string;
  status: string;
}

export default function StatusActions({ jobId, status }: Props) {
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

  const allowSubmit = status === "DRAFT" || status === "UPLOADED" || status === "ARRANGING";
  const showRequestChanges = status === "PROOFING";
  const showApprove = status === "PROOFING";
  const showPdf = status === "PROOFING" || status === "APPROVED" || status === "PRINTED" || status === "SHIPPED";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {err && <span className="text-xs text-red-600">{err}</span>}
      {showPdf && (
        <>
          <a
            href={`/api/jobs/${jobId}/pdf/template`}
            target="_blank"
            rel="noreferrer"
            className="text-sm border border-stone-300 rounded px-3 py-1.5 hover:bg-stone-100"
          >
            Download 1:1 template
          </a>
          <a
            href={`/api/jobs/${jobId}/pdf/reference`}
            target="_blank"
            rel="noreferrer"
            className="text-sm border border-stone-300 rounded px-3 py-1.5 hover:bg-stone-100"
          >
            Reference sheet
          </a>
        </>
      )}
      {showApprove && (
        <button
          disabled={loading}
          onClick={() => transition("APPROVED")}
          className="text-sm bg-emerald-600 text-white rounded px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve
        </button>
      )}
      {showRequestChanges && (
        <button
          disabled={loading}
          onClick={() => transition("ARRANGING")}
          className="text-sm border border-stone-300 rounded px-3 py-1.5 hover:bg-stone-100 disabled:opacity-50"
        >
          Request changes
        </button>
      )}
      {allowSubmit && (
        <button
          disabled={loading}
          onClick={() => transition("PROOFING")}
          className="text-sm bg-stone-900 text-white rounded px-3 py-1.5 hover:bg-stone-800 disabled:opacity-50"
        >
          Submit for review
        </button>
      )}
    </div>
  );
}
