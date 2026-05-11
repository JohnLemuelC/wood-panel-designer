// POST { job_id, filename, mime_type }
// Returns { signed_url, storage_path, photo_row } where the browser PUTs the file directly to storage.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { v4 as uuid } from "uuid";

const schema = z.object({
  job_id: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mime_type: z.string().regex(/^image\/(jpeg|png|webp)$/),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { job_id, filename, mime_type } = parsed.data;

  // Confirm the job belongs to this user (or user is operator)
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, user_id")
    .eq("id", job_id)
    .single();
  if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.user_id !== user.id) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "operator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Generate storage path: <user_id>/<job_id>/<photo_id>-<safe_filename>
  const photo_id = uuid();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storage_path = `${job.user_id}/${job_id}/${photo_id}-${safeName}`;

  // Create signed upload URL using admin client (service role)
  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from("photos")
    .createSignedUploadUrl(storage_path);
  if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 });

  // Pre-create the photo row (placeholder; client will update after upload)
  const { data: photoRow, error: insErr } = await supabase
    .from("photos")
    .insert({
      id: photo_id,
      job_id,
      user_id: job.user_id,
      storage_path,
      original_name: filename,
      mime_type,
    })
    .select()
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    signed_url: signed.signedUrl,
    token: signed.token,
    storage_path,
    photo: photoRow,
  });
}
