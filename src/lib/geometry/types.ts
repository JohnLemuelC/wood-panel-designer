// All dimensions in millimeters. All angles in degrees (rotation clockwise).
// Wall coordinate system: origin at top-left of wall, +x right, +y down.
// Panel-local coordinate system: origin at top-left of panel, +x right, +y down.
// PDF coordinate system: origin at top-left of PAGE (we translate from PDF's bottom-left default).

export type Mm = number;
export type Degrees = number;

export interface Point {
  x: Mm;
  y: Mm;
}

export interface Hole {
  id: string;
  label: string;
  x_mm: Mm; // panel-local
  y_mm: Mm; // panel-local
}

export interface CanvasSize {
  id: string;
  name: string;
  width_mm: Mm;
  height_mm: Mm;
  thickness_mm: Mm;
  price_cents: number;
  is_active: boolean;
  holes: Hole[];
}

export interface Panel {
  id: string; // panel instance id (in layout)
  canvas_size_id: string;
  photo_id: string | null;
  // Position of panel's pivot (= panel's top-left BEFORE rotation, but we rotate around panel center).
  // We store the center position to make rotation symmetric.
  center_x_mm: Mm; // wall coords
  center_y_mm: Mm; // wall coords
  width_mm: Mm;
  height_mm: Mm;
  rotation_deg: Degrees; // clockwise around panel center
}

export interface DrillMark {
  panel_id: string;
  hole_id: string;
  label: string;
  // Final position on the wall (in mm)
  wall_x_mm: Mm;
  wall_y_mm: Mm;
}

export interface Wall {
  width_mm: Mm;
  height_mm: Mm;
}
