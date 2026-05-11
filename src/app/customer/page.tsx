import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";

export default async function CustomerHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/customer");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, wall_width_mm, wall_height_mm, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader />
      <main className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-stone-900">My jobs</h1>
          <Link
            href="/customer/jobs/new"
            className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-800"
          >
            + New job
          </Link>
        </div>
        {(!jobs || jobs.length === 0) ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
            <p className="text-stone-600">No jobs yet. Create your first one to get started.</p>
            <Link
              href="/customer/jobs/new"
              className="inline-block mt-4 bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-800"
            >
              Create job
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {jobs.map((j) => (
              <Link
                key={j.id}
                href={`/customer/jobs/${j.id}`}
                className="bg-white border border-stone-200 rounded-xl p-4 flex items-center justify-between hover:border-stone-400"
              >
                <div>
                  <div className="font-medium text-stone-900">{j.title}</div>
                  <div className="text-sm text-stone-500">
                    {j.wall_width_mm} mm x {j.wall_height_mm} mm
                  </div>
                </div>
                <span className="text-xs uppercase tracking-wide bg-stone-100 text-stone-700 rounded-full px-3 py-1">
                  {j.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
