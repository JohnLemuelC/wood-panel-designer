// Geometry transforms for panel holes -> wall coords -> PDF coords.
// All in millimeters. Rotation is clockwise (screen convention: +y is down).

import type { Mm, Degrees, Panel, Hole, DrillMark, Point } from "./types";

// --- Unit conversions ----------------------------------------------------

// PDF points per mm. 1 inch = 25.4 mm = 72 pt. So 1 mm = 72/25.4 pt.
export const MM_TO_PT = 72 / 25.4; // 2.834645669...
export const PT_TO_MM = 25.4 / 72;

export function mmToPt(mm: Mm): number {
  return mm * MM_TO_PT;
}
export function ptToMm(pt: number): Mm {
  return pt * PT_TO_MM;
}

// --- Angle helpers -------------------------------------------------------

function degToRad(deg: Degrees): number {
  return (deg * Math.PI) / 180;
}

/**
 * Rotate a point around an origin by `deg` clockwise.
 * Screen convention: +y is down, so clockwise on screen is +y axis crossing into +x.
 * Standard math rotation matrix for CW in screen coords:
 *   x' = (x - cx) * cos(t) + (y - cy) * sin(t) + cx
 *   y' = -(x - cx) * sin(t) + (y - cy) * cos(t) + cy
 * (note: with screen y-down, "clockwise visually" matches the standard CCW math formula
 *  applied with the y-axis already inverted. Use the formula below and verify with tests.)
 */
export function rotatePointAround(
  point: Point,
  origin: Point,
  deg: Degrees
): Point {
  if (deg === 0) return { x: point.x, y: point.y };
  const t = degToRad(deg);
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  // Screen-clockwise rotation (y-down coordinate system):
  //   x' =  dx*cos - dy*sin
  //   y' =  dx*sin + dy*cos
  // Verified: 90deg CW maps (1,0) -> (0,1), which is "right" -> "down" in screen coords.
  return {
    x: dx * cos - dy * sin + origin.x,
    y: dx * sin + dy * cos + origin.y,
  };
}

// --- Panel hole -> wall coord -------------------------------------------

/**
 * Convert a panel-local hole position (relative to panel top-left, no rotation)
 * into a wall coordinate, applying the panel's rotation around its center.
 */
export function holeToWallCoord(panel: Panel, hole: Hole): Point {
  // Step 1: hole position in panel-local coords, treating panel top-left at (0,0).
  // Step 2: convert to "unrotated wall coords" where the panel is centered at (center_x_mm, center_y_mm).
  // The panel top-left (before rotation) is at (cx - w/2, cy - h/2).
  const topLeftX = panel.center_x_mm - panel.width_mm / 2;
  const topLeftY = panel.center_y_mm - panel.height_mm / 2;
  const unrotatedPoint: Point = {
    x: topLeftX + hole.x_mm,
    y: topLeftY + hole.y_mm,
  };
  // Step 3: rotate around panel center
  return rotatePointAround(
    unrotatedPoint,
    { x: panel.center_x_mm, y: panel.center_y_mm },
    panel.rotation_deg
  );
}

/**
 * Get all drill marks for a layout: every panel's holes transformed to wall coords.
 * Caller supplies canvasHoles map (canvas_size_id -> Hole[]).
 */
export function computeDrillMarks(
  panels: Panel[],
  canvasHolesById: Map<string, Hole[]>
): DrillMark[] {
  const marks: DrillMark[] = [];
  for (const panel of panels) {
    const holes = canvasHolesById.get(panel.canvas_size_id) ?? [];
    // Fallback: if no holes configured, one centered 50mm from top.
    const effectiveHoles: Hole[] =
      holes.length > 0
        ? holes
        : [
            {
              id: "default",
              label: "default-hang",
              x_mm: panel.width_mm / 2,
              y_mm: 50,
            },
          ];
    for (const hole of effectiveHoles) {
      const wallPt = holeToWallCoord(panel, hole);
      marks.push({
        panel_id: panel.id,
        hole_id: hole.id,
        label: hole.label,
        wall_x_mm: wallPt.x,
        wall_y_mm: wallPt.y,
      });
    }
  }
  return marks;
}

/**
 * Get the 4 corners of a panel in wall coords, in order:
 * topLeft, topRight, bottomRight, bottomLeft (post-rotation).
 */
export function panelCorners(panel: Panel): Point[] {
  const halfW = panel.width_mm / 2;
  const halfH = panel.height_mm / 2;
  const center = { x: panel.center_x_mm, y: panel.center_y_mm };
  const unrotated: Point[] = [
    { x: center.x - halfW, y: center.y - halfH }, // TL
    { x: center.x + halfW, y: center.y - halfH }, // TR
    { x: center.x + halfW, y: center.y + halfH }, // BR
    { x: center.x - halfW, y: center.y + halfH }, // BL
  ];
  return unrotated.map((p) => rotatePointAround(p, center, panel.rotation_deg));
}

// --- Wall -> PDF page coords --------------------------------------------

/**
 * For 1:1 tiled PDF: given a wall coordinate, return which page (tile_col, tile_row)
 * it falls on and the position within that page (in mm from the printable top-left).
 *
 * Page is split into a printable area inside margins:
 *   printable_width_mm = page_width_mm - 2 * margin_mm
 *   printable_height_mm = page_height_mm - 2 * margin_mm
 */
export interface PageGridConfig {
  page_width_mm: Mm; // e.g. 210 for A4
  page_height_mm: Mm; // e.g. 297 for A4
  margin_mm: Mm; // e.g. 10
}

export interface TileLocation {
  tile_col: number; // 0-indexed
  tile_row: number; // 0-indexed
  // Position within the tile, in mm from tile's top-left (= page margin top-left)
  x_in_tile_mm: Mm;
  y_in_tile_mm: Mm;
}

export function wallToTile(
  wall_x_mm: Mm,
  wall_y_mm: Mm,
  config: PageGridConfig
): TileLocation {
  const tileW = config.page_width_mm - 2 * config.margin_mm;
  const tileH = config.page_height_mm - 2 * config.margin_mm;
  const tile_col = Math.floor(wall_x_mm / tileW);
  const tile_row = Math.floor(wall_y_mm / tileH);
  const x_in_tile_mm = wall_x_mm - tile_col * tileW;
  const y_in_tile_mm = wall_y_mm - tile_row * tileH;
  return { tile_col, tile_row, x_in_tile_mm, y_in_tile_mm };
}

export function tileCount(
  wall_width_mm: Mm,
  wall_height_mm: Mm,
  config: PageGridConfig
): { cols: number; rows: number } {
  const tileW = config.page_width_mm - 2 * config.margin_mm;
  const tileH = config.page_height_mm - 2 * config.margin_mm;
  return {
    cols: Math.ceil(wall_width_mm / tileW),
    rows: Math.ceil(wall_height_mm / tileH),
  };
}

/**
 * Convert a position on a page (in mm from page top-left) to PDF points.
 * Important: pdf-lib's coordinate origin is bottom-left of the page.
 * Callers using pdf-lib must convert: pdf_y = page_height_pt - top_y_pt.
 */
export function pageMmToPt(x_mm: Mm, y_mm: Mm): { x: number; y_from_top: number } {
  return { x: mmToPt(x_mm), y_from_top: mmToPt(y_mm) };
}
