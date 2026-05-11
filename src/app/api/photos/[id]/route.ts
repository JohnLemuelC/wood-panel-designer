// DELETE a photo: removes storage object + DB row.
// GET a photo's signed URL for display.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: photo } = await supabase.from("photos").select("*").eq("id", id).single();
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Owner or operator
  if (photo.user_id !== user.id) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "operator") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  await admin.storage.from("photos").remove([photo.storage_path]);
  await admin.from("photos").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
