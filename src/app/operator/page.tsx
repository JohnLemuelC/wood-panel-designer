import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import ApproveButton from "./ApproveButton";

const PIPELINE = ["DRAFT", "UPLOADED", "ARRANGING", "PROOFING", "APPROVED", "PRINTED", "SHIPPED"] as const;

export default async function OperatorHome() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/operator");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "operator") {
    return (
      <div className="min-h-screen bg-stone-50">
        <AppHeader />
        <main className="max-w-2xl mx-auto p-8 text-center">
          <h1 className="text-2xl font-bold text-stone-900">Operator access required</h1>
          <p className="text-stone-600 mt-2">
            You are signed in as a customer. To access the operator dashboard, ask an admin to update your role.
          </p>
        </main>
      </div>
    );
  }

  const { data: requests } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("operator_requested", true)
    .eq("role", "customer");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, wall_width_mm, wall_height_mm, updated_at, user_id, profiles!inner(email)")
    .order("updated_at", { ascending: false });

  const byStatus: Record<string, any[]> = {};
  for (const s of PIPELINE) byStatus[s] = [];
  for (const j of jobs ?? []) byStatus[j.status]?.push(j);

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto p-6">
        {requests && requests.length > 0 && (
          <div className="mb-6 bg-white border border-amber-200 rounded-xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Operator access requests ({requests.length})</h2>
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-stone-700">{r.email}</span>
                  <ApproveButton userId={r.id} />
                </div>
              ))}
            </div>
          </div>
        )}
        <h1 className="text-2xl font-bold text-stone-900 mb-4">Pipeline</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {PIPELINE.map((s) => (
            <div key={s} className="bg-white border border-stone-200 rounded-xl p-3 min-h-[120px]">
              <div className="text-xs font-bold tracking-wide text-stone-500 mb-2">
                {s} ({byStatus[s].length})
              </div>
              <div className="space-y-2">
                {byStatus[s].map((j) => (
                  <Link
                    key={j.id}
                    href={`/operator/jobs/${j.id}`}
                    className="block bg-stone-50 border border-stone-200 rounded p-2 text-sm hover:border-stone-400"
                  >
                    <div className="font-medium text-stone-900 truncate">{j.title}</div>
                    <div className="text-xs text-stone-500">
                      {j.wall_width_mm} x {j.wall_height_mm} mm
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
