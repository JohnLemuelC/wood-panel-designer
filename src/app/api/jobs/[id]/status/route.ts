// POST { to: <new_status> }
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const VALID = ["DRAFT", "UPLOADED", "ARRANGING", "PROOFING", "APPROVED", "PRINTED", "SHIPPED"] as const;
type Status = (typeof VALID)[number];

// Allowed transitions
const TRANSITIONS: Record<Status, Status[]> = {
  DRAFT: ["UPLOADED", "ARRANGING", "PROOFING"],
  UPLOADED: ["ARRANGING", "PROOFING"],
  ARRANGING: ["PROOFING"],
  PROOFING: ["ARRANGING", "APPROVED"], // request changes goes back to ARRANGING
  APPROVED: ["PRINTED"],
  PRINTED: ["SHIPPED"],
  SHIPPED: [],
};

const schema = z.object({ to: z.enum(VALID) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });
  const to = parsed.data.to;

  // Load job
  const { data: job, error } = await supabase.from("jobs").select("*").eq("id", id).single();
  if (error || !job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Role
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isOp = profile?.role === "operator";
  const isOwner = job.user_id === user.id;
  if (!isOp && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Validate transition
  const current = job.status as Status;
  if (!TRANSITIONS[current]?.includes(to)) {
    return NextResponse.json({ error: `Invalid transition ${current} -> ${to}` }, { status: 400 });
  }

  // Role-based transition restrictions
  // Customer can: submit (-> PROOFING), approve (PROOFING -> APPROVED), request changes (PROOFING -> ARRANGING)
  // Operator can: anything
  if (!isOp) {
    const customerAllowed: Array<[Status, Status]> = [
      ["DRAFT", "PROOFING"],
      ["UPLOADED", "PROOFING"],
      ["ARRANGING", "PROOFING"],
      ["PROOFING", "APPROVED"],
      ["PROOFING", "ARRANGING"],
    ];
    if (!customerAllowed.some(([f, t]) => f === current && t === to)) {
      return NextResponse.json({ error: "Customer cannot perform this transition" }, { status: 403 });
    }
  }

  const { error: updErr } = await supabase
    .from("jobs")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await supabase.from("job_status_log").insert({
    job_id: id,
    from_status: current,
    to_status: to,
    actor_id: user.id,
  });

  return NextResponse.json({ ok: true, status: to });
}
