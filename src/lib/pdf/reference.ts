// Scaled reference sheet PDF.
// Single-page A4 (landscape). Shows the wall scaled-down with all panels labelled, plus a table
// at the bottom listing every panel's position and every drill point in mm.

import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib";
import { MM_TO_PT, mmToPt, panelCorners, computeDrillMarks } from "@/lib/geometry";
import type { Panel, Hole } from "@/lib/geometry/types";

export interface BuildReferenceOptions {
  wallWidthMm: number;
  wallHeightMm: number;
  panels: Panel[];
  canvasHoles: Map<string, Hole[]>;
  jobTitle: string;
  pageSize?: "A4" | "Letter";
}

const PAGE_SIZES = {
  A4: { width_mm: 297, height_mm: 210 }, // landscape
  Letter: { width_mm: 279.4, height_mm: 215.9 },
};

function rgbN(r: number, g: number, b: number) {
  return rgb(r / 255, g / 255, b / 255);
}

export async function buildReferencePdf(opts: BuildReferenceOptions): Promise<Uint8Array> {
  const ps = PAGE_SIZES[opts.pageSize ?? "A4"];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidthPt = mmToPt(ps.width_mm);
  const pageHeightPt = mmToPt(ps.height_mm);
  const page = pdf.addPage([pageWidthPt, pageHeightPt]);

  // Header
  page.drawText(`Reference sheet - ${opts.jobTitle}`, {
    x: 20, y: pageHeightPt - 25, size: 14, font: fontBold, color: rgbN(0, 0, 0),
  });
  page.drawText(
    `Wall: ${opts.wallWidthMm} mm wide x ${opts.wallHeightMm} mm tall. ${opts.panels.length} panel(s).`,
    { x: 20, y: pageHeightPt - 42, size: 10, font, color: rgbN(60, 60, 60) }
  );

  // Compute a scale factor to fit the wall into the top half of the page
  const drawAreaTopPt = pageHeightPt - 60;
  const drawAreaBottomPt = pageHeightPt * 0.45;
  const drawAreaH = drawAreaTopPt - drawAreaBottomPt;
  const drawAreaWPt = pageWidthPt - 40;
  const wallPtW = mmToPt(opts.wallWidthMm);
  const wallPtH = mmToPt(opts.wallHeightMm);
  const fitScale = Math.min(drawAreaWPt / wallPtW, drawAreaH / wallPtH);
  // Wall draw region center
  const wallDrawW = wallPtW * fitScale;
  const wallDrawH = wallPtH * fitScale;
  const wallOriginX = (pageWidthPt - wallDrawW) / 2;
  const wallOriginY = drawAreaTopPt - wallDrawH; // bottom of wall image

  // wall to page (note: pdf-lib y is bottom-left; we draw with top-down for the wall)
  const wallToPage = (wall_x_mm: number, wall_y_mm: number) => ({
    x: wallOriginX + mmToPt(wall_x_mm) * fitScale,
    y: drawAreaTopPt - mmToPt(wall_y_mm) * fitScale,
  });

  // Wall rectangle
  const wallTL = wallToPage(0, 0);
  const wallBR = wallToPage(opts.wallWidthMm, opts.wallHeightMm);
  page.drawRectangle({
    x: wallTL.x,
    y: wallBR.y,
    width: wallBR.x - wallTL.x,
    height: wallTL.y - wallBR.y,
    borderColor: rgbN(0, 0, 0),
    borderWidth: 0.7,
    color: rgbN(250, 250, 250),
  });

  // Draw panels
  opts.panels.forEach((panel, i) => {
    const corners = panelCorners(panel);
    for (let k = 0; k < 4; k++) {
      const a = wallToPage(corners[k].x, corners[k].y);
      const b = wallToPage(corners[(k + 1) % 4].x, corners[(k + 1) % 4].y);
      page.drawLine({ start: a, end: b, thickness: 0.7, color: rgbN(0, 0, 0) });
    }
    // Label inside panel center
    const lp = wallToPage(panel.center_x_mm, panel.center_y_mm);
    page.drawText(`P${i + 1}`, {
      x: lp.x - 6, y: lp.y - 4, size: 8, font: fontBold, color: rgbN(0, 0, 0),
    });
  });

  // Drill marks
  const marks = computeDrillMarks(opts.panels, opts.canvasHoles);
  for (const mark of marks) {
    const p = wallToPage(mark.wall_x_mm, mark.wall_y_mm);
    const r = 2;
    page.drawLine({ start: { x: p.x - r, y: p.y - r }, end: { x: p.x + r, y: p.y + r }, thickness: 0.7, color: rgbN(220, 0, 0) });
    page.drawLine({ start: { x: p.x - r, y: p.y + r }, end: { x: p.x + r, y: p.y - r }, thickness: 0.7, color: rgbN(220, 0, 0) });
  }

  // ---- Table ----
  const tableTop = pageHeightPt * 0.42;
  page.drawText("Panel positions and drill points (all in mm)", {
    x: 20, y: tableTop, size: 10, font: fontBold, color: rgbN(0, 0, 0),
  });

  let y = tableTop - 16;
  const colX = [20, 70, 130, 200, 260, 340, 400];
  const headers = ["Panel", "Size (mm)", "Center (mm)", "Rotation", "Drill #", "Drill label", "Drill position (mm)"];
  headers.forEach((h, i) => page.drawText(h, { x: colX[i], y, size: 8, font: fontBold, color: rgbN(60, 60, 60) }));
  y -= 10;
  page.drawLine({ start: { x: 20, y }, end: { x: pageWidthPt - 20, y }, thickness: 0.5, color: rgbN(200, 200, 200) });
  y -= 10;

  opts.panels.forEach((panel, i) => {
    const panelHoles = opts.canvasHoles.get(panel.canvas_size_id) ?? [];
    const effectiveHoles = panelHoles.length > 0
      ? panelHoles
      : [{ id: "default", label: "default-hang", x_mm: panel.width_mm / 2, y_mm: 50 }];
    const panelMarks = marks.filter((m) => m.panel_id === panel.id);
    effectiveHoles.forEach((hole, hi) => {
      if (y < 30) return; // out of room; we ignore overflow for now
      const mark = panelMarks[hi];
      page.drawText(`P${i + 1}`, { x: colX[0], y, size: 8, font, color: rgbN(0, 0, 0) });
      page.drawText(`${panel.width_mm} x ${panel.height_mm}`, { x: colX[1], y, size: 8, font, color: rgbN(0, 0, 0) });
      page.drawText(`(${panel.center_x_mm.toFixed(1)}, ${panel.center_y_mm.toFixed(1)})`, { x: colX[2], y, size: 8, font, color: rgbN(0, 0, 0) });
      page.drawText(`${panel.rotation_deg.toFixed(0)} deg`, { x: colX[3], y, size: 8, font, color: rgbN(0, 0, 0) });
      page.drawText(`${hi + 1}`, { x: colX[4], y, size: 8, font, color: rgbN(0, 0, 0) });
      page.drawText(hole.label, { x: colX[5], y, size: 8, font, color: rgbN(0, 0, 0) });
      if (mark) {
        page.drawText(`(${mark.wall_x_mm.toFixed(1)}, ${mark.wall_y_mm.toFixed(1)})`, { x: colX[6], y, size: 8, font, color: rgbN(220, 0, 0) });
      }
      y -= 11;
    });
  });

  return await pdf.save();
}
