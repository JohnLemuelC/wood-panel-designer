import type { PanelData } from "@/lib/layout";

export interface PhotoItem {
  id: string;
  storage_path: string;
  original_name: string | null;
  signed_url?: string;
}

export interface CanvasSizeOption {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  thickness_mm: number;
  price_cents: number;
  is_active: boolean;
}

export interface EditorProps {
  jobId: string;
  wallWidthMm: number;
  wallHeightMm: number;
  initialLayout: PanelData[];
  photos: PhotoItem[];
  canvasSizes: CanvasSizeOption[];
  readOnly?: boolean;
  onSave: (layout: PanelData[]) => Promise<void> | void;
  onPhotosChanged?: (photos: PhotoItem[]) => void;
}
