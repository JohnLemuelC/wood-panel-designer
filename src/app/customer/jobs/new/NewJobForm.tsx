"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewJobForm() {
  const [title, setTitle] = useState("");
  const [wallWidth, setWallWidth] = useState(2000);
  const [wallHeight, setWallHeight] = useState(1500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setError("Not logged in");
      setLoading(false);
      return;
    }
    const { data, error: err } = await supabase
      .from("jobs")
      .insert({
        user_id: u.user.id,
        title,
        wall_width_mm: wallWidth,
        wall_height_mm: wallHeight,
        status: "DRAFT",
      })
      .select("id")
      .single();
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    router.push(`/customer/jobs/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Title</label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Living room family wall"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-900"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Wall width (mm)</label>
          <input
            type="number"
            required
            min={100}
            value={wallWidth}
            onChange={(e) => setWallWidth(Number(e.target.value))}
            className="w-full border border-stone-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Wall height (mm)</label>
          <input
            type="number"
            required
            min={100}
            value={wallHeight}
            onChange={(e) => setWallHeight(Number(e.target.value))}
            className="w-full border border-stone-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-stone-900 text-white py-3 rounded-lg font-medium hover:bg-stone-800 disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create job"}
      </button>
    </form>
  );
}
