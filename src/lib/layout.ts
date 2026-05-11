// Layout types stored as JSONB on the jobs table.
// All measurements in mm. Coordinates in wall frame (origin = top-left of wall).

import { z } from "zod";

export const PanelSchema = z.object({
  id: z.string(),
  canvas_size_id: z.string().uuid(),
  photo_id: z.string().uuid().nullable(),
  center_x_mm: z.number(),
  center_y_mm: z.number(),
  width_mm: z.number(),
  height_mm: z.number(),
  rotation_deg: z.number(),
});
export type PanelData = z.infer<typeof PanelSchema>;

export const LayoutSchema = z.array(PanelSchema);
export type LayoutData = z.infer<typeof LayoutSchema>;
