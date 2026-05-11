import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildReferencePdf } from "@/lib/pdf/reference";
import type { Panel, Hole } from "@/lib/geometry/types";
import type { PanelData } from "@/lib/layout";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, user_id, title, wall_width_mm, wall_height_mm, layout")
    .eq("id", id)
    .single();
  if (error || !job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.user_id !== user.id) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "operator") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const panelData = (job.layout as PanelData[]) ?? [];
  const sizeIds = [...new Set(panelData.map((p) => p.canvas_size_id))];
  const { data: holes } = await supabase
    .from("canvas_holes")
    .select("id, canvas_size_id, label, x_mm, y_mm")
    .in("canvas_size_id", sizeIds.length > 0 ? sizeIds : ["00000000-0000-0000-0000-000000000000"]);

  const holesMap = new Map<string, Hole[]>();
  for (const h of holes ?? []) {
    const list = holesMap.get(h.canvas_size_id) ?? [];
    list.push({ id: h.id, label: h.label, x_mm: Number(h.x_mm), y_mm: Number(h.y_mm) });
    holesMap.set(h.canvas_size_id, list);
  }

  const pdfBytes = await buildReferencePdf({
    wallWidthMm: job.wall_width_mm,
    wallHeightMm: job.wall_height_mm,
    panels: panelData as Panel[],
    canvasHoles: holesMap,
    jobTitle: job.title,
  });

  return new NextResponse(new Uint8Array(pdfBytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${job.title.replace(/[^a-zA-Z0-9-_]+/g, "_")}_reference.pdf"`,
    },
  });
}
