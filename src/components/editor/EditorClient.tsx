"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PanelData } from "@/lib/layout";
import type { PhotoItem, CanvasSizeOption } from "./types";

const WallEditor = dynamic(() => import("./WallEditor"), {
  ssr: false,
  loading: () => <div className="text-stone-500 p-8">Loading editor...</div>,
});

interface Props {
  jobId: string;
  wallWidthMm: number;
  wallHeightMm: number;
  initialLayout: PanelData[];
  initialPhotos: PhotoItem[];
  canvasSizes: CanvasSizeOption[];
  readOnly?: boolean;
}

export default function EditorClient({
  jobId,
  wallWidthMm,
  wallHeightMm,
  initialLayout,
  initialPhotos,
  canvasSizes,
  readOnly,
}: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);

  const handleSave = useCallback(async (layout: PanelData[]) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("jobs")
      .update({ layout, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) throw error;
  }, [jobId]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newPhotos: PhotoItem[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.match(/^image\/(jpeg|png|webp)$/)) continue;
      try {
        const signRes = await fetch("/api/photos/sign-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, filename: f.name, mime_type: f.type }),
        });
        if (!signRes.ok) {
          console.error("Sign upload failed", await signRes.text());
          continue;
        }
        const { signed_url, photo } = await signRes.json();
        // PUT directly to storage
        const upRes = await fetch(signed_url, {
          method: "PUT",
          headers: { "Content-Type": f.type },
          body: f,
        });
        if (!upRes.ok) {
          console.error("Upload failed", upRes.status);
          continue;
        }
        newPhotos.push({
          id: photo.id,
          storage_path: photo.storage_path,
          original_name: photo.original_name,
        });
      } catch (e) {
        console.error(e);
      }
    }
    setPhotos((cur) => [...cur, ...newPhotos]);
    setUploading(false);
  }, [jobId]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-3">
      {!readOnly && (
        <div className="bg-white border border-stone-200 rounded-xl p-3 flex items-center gap-3">
          <label className="cursor-pointer bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-800">
            {uploading ? "Uploading..." : "+ Upload photos"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          <span className="text-sm text-stone-500">
            Drag photos from the tray onto the wall to place them.
          </span>
        </div>
      )}
      <WallEditor
        jobId={jobId}
        wallWidthMm={wallWidthMm}
        wallHeightMm={wallHeightMm}
        initialLayout={initialLayout}
        photos={photos}
        canvasSizes={canvasSizes}
        readOnly={readOnly}
        onSave={handleSave}
        onPhotosChanged={setPhotos}
      />
    </div>
  );
}
