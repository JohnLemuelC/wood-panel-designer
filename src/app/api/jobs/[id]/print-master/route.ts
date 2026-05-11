// Operator-only: zip of per-panel 300dpi images + MANIFEST.txt
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import JSZip from "jszip";
import sharp from "sharp";
import type { PanelData } from "@/lib/layout";

const DPI = 300;
const MM_PER_INCH = 25.4;

function mmToPx300(mm: number) {
  return Math.round((mm / MM_PER_INCH) * DPI);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Operator only
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "operator") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, title, status, layout")
    .eq("id", id)
    .single();
  if (error || !job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.status !== "APPROVED" && job.status !== "PRINTED" && job.status !== "SHIPPED") {
    return NextResponse.json({ error: "Job must be APPROVED first" }, { status: 400 });
  }

  const panelData = (job.layout as PanelData[]) ?? [];
  const photoIds = [...new Set(panelData.map((p) => p.photo_id).filter(Boolean))] as string[];
  const { data: photos } = await supabase.from("photos").select("*").in("id", photoIds.length > 0 ? photoIds : ["00000000-0000-0000-0000-000000000000"]);
  const photosById = new Map((photos ?? []).map((p) => [p.id, p]));

  const admin = createAdminClient();
  const zip = new JSZip();
  const manifest: string[] = [
    `Print master export for: ${job.title}`,
    `Generated: ${new Date().toISOString()}`,
    `DPI: ${DPI}`,
    `Total panels: ${panelData.length}`,
    "",
    "Panel | Size (mm) | Output (px) | Source photo",
    "---",
  ];

  for (let i = 0; i < panelData.length; i++) {
    const panel = panelData[i];
    const photo = panel.photo_id ? photosById.get(panel.photo_id) : null;
    const wPx = mmToPx300(panel.width_mm);
    const hPx = mmToPx300(panel.height_mm);
    const filename = `panel_${String(i + 1).padStart(2, "0")}_${panel.width_mm}x${panel.height_mm}mm.png`;

    if (!photo) {
      // Blank placeholder
      const img = await sharp({
        create: { width: wPx, height: hPx, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      }).png().toBuffer();
      zip.file(filename, img);
      manifest.push(`${filename} | ${panel.width_mm}x${panel.height_mm} | ${wPx}x${hPx} | (none)`);
      continue;
    }

    // Download original from storage
    const { data: blob, error: dlErr } = await admin.storage.from("photos").download(photo.storage_path);
    if (dlErr || !blob) {
      manifest.push(`${filename} | ${panel.width_mm}x${panel.height_mm} | (FAILED - ${dlErr?.message ?? "download failed"})`);
      continue;
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    // Resize/fit cover to the panel dimensions
    const out = await sharp(buf)
      .resize(wPx, hPx, { fit: "cover" })
      .png()
      .toBuffer();
    zip.file(filename, out);
    manifest.push(
      `${filename} | ${panel.width_mm}x${panel.height_mm} | ${wPx}x${hPx} | ${photo.original_name ?? photo.id}`
    );
  }

  zip.file("MANIFEST.txt", manifest.join("\n"));
  const zipBytes = await zip.generateAsync({ type: "uint8array" });

  return new NextResponse(zipBytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${job.title.replace(/[^a-zA-Z0-9-_]+/g, "_")}_print_master.zip"`,
    },
  });
}
