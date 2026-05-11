import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import CatalogClient from "./CatalogClient";

export default async function CatalogPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/operator/catalog");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "operator") redirect("/customer");

  const { data: sizes } = await supabase
    .from("canvas_sizes")
    .select("*")
    .order("width_mm");
  const { data: holes } = await supabase.from("canvas_holes").select("*");

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader />
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-stone-900 mb-4">Canvas catalog</h1>
        <CatalogClient initialSizes={sizes ?? []} initialHoles={holes ?? []} />
      </main>
    </div>
  );
}
