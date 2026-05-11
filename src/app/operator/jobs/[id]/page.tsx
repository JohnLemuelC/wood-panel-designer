import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import EditorClient from "@/components/editor/EditorClient";
import OperatorActions from "./OperatorActions";
import type { PanelData } from "@/lib/layout";

export default async function OperatorJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/operator/jobs/${id}`);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "operator") redirect("/customer");

  const { data: job, error } = await supabase.from("jobs").select("*").eq("id", id).single();
  if (error || !job) return notFound();

  const { data: customer } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", job.user_id)
    .single();

  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path, original_name")
    .eq("job_id", id)
    .order("created_at");

  const { data: sizes } = await supabase.from("canvas_sizes").select("*").order("width_mm");

  const layout = (job.layout as PanelData[]) ?? [];

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <AppHeader />
      <main className="flex-1 max-w-7xl mx-auto p-4 w-full">
        <div className="flex items-center justify-between mb-3">
          <div>
            <Link href="/operator" className="text-sm text-stone-500 hover:text-stone-700">
              &larr; Pipeline
            </Link>
            <h1 className="text-xl font-bold text-stone-900 mt-1">{job.title}</h1>
            <div className="text-xs text-stone-500">
              {job.wall_width_mm} x {job.wall_height_mm} mm  &middot;  Customer: {customer?.email}  &middot;  Status: <span className="font-medium">{job.status}</span>
            </div>
          </div>
          <OperatorActions jobId={job.id} status={job.status} />
        </div>
        <EditorClient
          jobId={job.id}
          wallWidthMm={job.wall_width_mm}
          wallHeightMm={job.wall_height_mm}
          initialLayout={layout}
          initialPhotos={photos ?? []}
          canvasSizes={sizes ?? []}
          readOnly={false}
        />
      </main>
    </div>
  );
}
