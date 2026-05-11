// 1:1 tiled hanging template PDF.
// THIS IS THE SAFETY-CRITICAL FILE. The math here decides where customers drill into their walls.
//
// Architecture:
//   - Wall is sized in mm.
//   - PDF pages tile the wall, each page printable area = page_w - 2*margin, page_h - 2*margin.
//   - Margins exist so the printer can't crop the page edge.
//   - On page 1 we draw a 100mm x 100mm calibration square the customer measures with a ruler.
//   - On every page we draw:
//       * tile crop marks at the corners
//       * portions of any panel outline that fall on this tile
//       * portions of any drill mark (X) that fall on this tile
//       * tile label and "PRINT AT 100% / ACTUAL SIZE" footer
//
// All positioning uses mmToPt internally. Y is measured FROM THE TOP of the page; we convert
// to pdf-lib's bottom-left origin at draw time via `pdfY = pageHeightPt - topYPt`.

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import {
  MM_TO_PT,
  mmToPt,
  panelCorners,
  computeDrillMarks,
  tileCount,
  PageGridConfig,
} from "@/lib/geometry";
import type { Panel, Hole } from "@/lib/geometry/types";

export interface BuildTemplateOptions {
  wallWidthMm: number;
  wallHeightMm: number;
  pageSize: "A4" | "Letter";
  marginMm?: number;
  panels: Panel[];
  canvasHoles: Map<string, Hole[]>;
  jobTitle: string;
}

const PAGE_SIZES = {
  A4: { width_mm: 210, height_mm: 297 },
  Letter: { width_mm: 215.9, height_mm: 279.4 },
};

const DEFAULT_MARGIN_MM = 10;
const CROP_MARK_MM = 5;
const DRILL_MARK_MM = 8; // diameter of the X (half-span each direction)

function rgbN(r: number, g: number, b: number) {
  return rgb(r / 255, g / 255, b / 255);
}

// Returns true if the segment between (x1,y1) and (x2,y2) (all in mm in wall coords) intersects
// the tile rectangle. We use a simple Liang-Barsky / clipping approach via parametric form.
function clipLineToRect(
  x1: number, y1: number, x2: number, y2: number,
  xmin: number, ymin: number, xmax: number, ymax: number
): [number, number, number, number] | null {
  // Liang-Barsky
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - xmin, xmax - x1, y1 - ymin, ymax - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        else if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        else if (r < t1) t1 = r;
      }
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

function drawCropMarks(
  page: PDFPage,
  pageWidthPt: number,
  pageHeightPt: number,
  marginPt: number
) {
  const m = CROP_MARK_MM * MM_TO_PT;
  const stroke = rgbN(0, 0, 0);
  const sw = 0.5;
  // Corners: short crosses at each corner of the printable area.
  const corners: [number, number][] = [
    [marginPt, marginPt],
    [pageWidthPt - marginPt, marginPt],
    [marginPt, pageHeightPt - marginPt],
    [pageWidthPt - marginPt, pageHeightPt - marginPt],
  ];
  for (const [x, y] of corners) {
    page.drawLine({
      start: { x: x - m / 2, y },
      end: { x: x + m / 2, y },
      thickness: sw,
      color: stroke,
    });
    page.drawLine({
      start: { x, y: y - m / 2 },
      end: { x, y: y + m / 2 },
      thickness: sw,
      color: stroke,
    });
  }
}

export async function buildTemplatePdf(opts: BuildTemplateOptions): Promise<Uint8Array> {
  const pageSize = PAGE_SIZES[opts.pageSize];
  const marginMm = opts.marginMm ?? DEFAULT_MARGIN_MM;
  const config: PageGridConfig = {
    page_width_mm: pageSize.width_mm,
    page_height_mm: pageSize.height_mm,
    margin_mm: marginMm,
  };
  const tileW_mm = pageSize.width_mm - 2 * marginMm;
  const tileH_mm = pageSize.height_mm - 2 * marginMm;

  const { cols, rows } = tileCount(opts.wallWidthMm, opts.wallHeightMm, config);

  const drillMarks = computeDrillMarks(opts.panels, opts.canvasHoles);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidthPt = mmToPt(pageSize.width_mm);
  const pageHeightPt = mmToPt(pageSize.height_mm);
  const marginPt = mmToPt(marginMm);

  let pageNo = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      pageNo++;
      const page = pdf.addPage([pageWidthPt, pageHeightPt]);

      // Tile origin in wall coords (top-left of this tile)
      const tile_wall_x_mm = col * tileW_mm;
      const tile_wall_y_mm = row * tileH_mm;
      const tile_x_max = tile_wall_x_mm + tileW_mm;
      const tile_y_max = tile_wall_y_mm + tileH_mm;

      // Helper: convert a wall coord (mm) on THIS tile to PDF page coord (pt, bottom-left origin).
      const wallToPage = (wall_x_mm: number, wall_y_mm: number) => {
        const x_in_tile_mm = wall_x_mm - tile_wall_x_mm;
        const y_in_tile_mm = wall_y_mm - tile_wall_y_mm;
        const x_pt = marginPt + x_in_tile_mm * MM_TO_PT;
        const y_from_top_pt = marginPt + y_in_tile_mm * MM_TO_PT;
        const y_pt = pageHeightPt - y_from_top_pt;
        return { x: x_pt, y: y_pt };
      };

      // Crop marks at the corners of the printable area
      drawCropMarks(page, pageWidthPt, pageHeightPt, marginPt);

      // Page header text
      const headerY = pageHeightPt - 8;
      page.drawText(
        `${opts.jobTitle} - Tile col ${col + 1} of ${cols}, row ${row + 1} of ${rows} (page ${pageNo})`,
        { x: 8, y: headerY, size: 8, font: fontBold, color: rgbN(60, 60, 60) }
      );

      // Footer
      page.drawText(
        "PRINT AT 100% / ACTUAL SIZE. Do NOT use Fit to page or Shrink to printable area.",
        { x: 8, y: 8, size: 8, font: fontBold, color: rgbN(200, 0, 0) }
      );

      // --- Calibration square (page 1 only) ---
      if (pageNo === 1) {
        const calXMm = tile_wall_x_mm + tileW_mm / 2 - 50; // 100mm wide square, centered horizontally on tile
        const calYMm = tile_wall_y_mm + 20;
        const tl = wallToPage(calXMm, calYMm);
        const br = wallToPage(calXMm + 100, calYMm + 100);
        // Square outline (drawn as 4 lines so we can be sure of exact dimensions)
        const corners = [
          { x: tl.x, y: tl.y },
          { x: br.x, y: tl.y },
          { x: br.x, y: br.y },
          { x: tl.x, y: br.y },
        ];
        for (let i = 0; i < 4; i++) {
          const a = corners[i];
          const b = corners[(i + 1) % 4];
          page.drawLine({ start: a, end: b, thickness: 1, color: rgbN(0, 0, 0) });
        }
        // Label inside the square
        const labelPos = wallToPage(calXMm + 50, calYMm + 50);
        page.drawText("100 mm calibration square", {
          x: labelPos.x - 60,
          y: labelPos.y,
          size: 10,
          font: fontBold,
          color: rgbN(0, 0, 0),
        });
        page.drawText("Measure with a ruler before taping tiles.", {
          x: labelPos.x - 70,
          y: labelPos.y - 14,
          size: 8,
          font,
          color: rgbN(60, 60, 60),
        });
      }

      // --- Draw panel outlines, clipped to this tile ---
      for (const panel of opts.panels) {
        const corners = panelCorners(panel);
        for (let i = 0; i < 4; i++) {
          const a = corners[i];
          const b = corners[(i + 1) % 4];
          const clipped = clipLineToRect(
            a.x, a.y, b.x, b.y,
            tile_wall_x_mm, tile_wall_y_mm, tile_x_max, tile_y_max
          );
          if (!clipped) continue;
          const p0 = wallToPage(clipped[0], clipped[1]);
          const p1 = wallToPage(clipped[2], clipped[3]);
          page.drawLine({ start: p0, end: p1, thickness: 1, color: rgbN(0, 0, 0) });
        }
      }

      // --- Draw drill marks (X) clipped to this tile ---
      const halfMark_mm = DRILL_MARK_MM / 2;
      for (const mark of drillMarks) {
        if (
          mark.wall_x_mm < tile_wall_x_mm - halfMark_mm ||
          mark.wall_x_mm > tile_x_max + halfMark_mm ||
          mark.wall_y_mm < tile_wall_y_mm - halfMark_mm ||
          mark.wall_y_mm > tile_y_max + halfMark_mm
        ) {
          continue;
        }

        // The two diagonals of the X go from (-h, -h) to (+h, +h) and (-h, +h) to (+h, -h)
        const segs: [number, number, number, number][] = [
          [
            mark.wall_x_mm - halfMark_mm,
            mark.wall_y_mm - halfMark_mm,
            mark.wall_x_mm + halfMark_mm,
            mark.wall_y_mm + halfMark_mm,
          ],
          [
            mark.wall_x_mm - halfMark_mm,
            mark.wall_y_mm + halfMark_mm,
            mark.wall_x_mm + halfMark_mm,
            mark.wall_y_mm - halfMark_mm,
          ],
        ];
        for (const [x1, y1, x2, y2] of segs) {
          const c = clipLineToRect(
            x1, y1, x2, y2,
            tile_wall_x_mm, tile_wall_y_mm, tile_x_max, tile_y_max
          );
          if (!c) continue;
          const p0 = wallToPage(c[0], c[1]);
          const p1 = wallToPage(c[2], c[3]);
          page.drawLine({ start: p0, end: p1, thickness: 1.5, color: rgbN(220, 0, 0) });
        }

        // Label near the mark (only if the center is on this tile)
        if (
          mark.wall_x_mm >= tile_wall_x_mm &&
          mark.wall_x_mm <= tile_x_max &&
          mark.wall_y_mm >= tile_wall_y_mm &&
          mark.wall_y_mm <= tile_y_max
        ) {
          const lp = wallToPage(mark.wall_x_mm + halfMark_mm + 1, mark.wall_y_mm);
          page.drawText(mark.label, {
            x: lp.x,
            y: lp.y - 3,
            size: 6,
            font,
            color: rgbN(220, 0, 0),
          });
        }
      }
    }
  }

  return await pdf.save();
}
