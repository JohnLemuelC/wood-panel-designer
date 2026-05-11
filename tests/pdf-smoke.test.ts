// PDF smoke test - verify it builds, has expected page count, and inline measurements
// (We can't visually inspect here, but we verify byte signature + dimensions are correct.)

import { describe, it, expect } from "vitest";
import { buildTemplatePdf } from "../src/lib/pdf/template";
import { buildReferencePdf } from "../src/lib/pdf/reference";
import { mmToPt } from "../src/lib/geometry";
import type { Panel, Hole } from "../src/lib/geometry/types";
import { PDFDocument } from "pdf-lib";

const SIZE_ID_A = "00000000-0000-0000-0000-000000000001";
const SIZE_ID_B = "00000000-0000-0000-0000-000000000002";

const HOLES = new Map<string, Hole[]>([
  [SIZE_ID_A, [
    { id: "ha1", label: "left D", x_mm: 100, y_mm: 50 },
    { id: "ha2", label: "right D", x_mm: 400, y_mm: 50 },
  ]],
  [SIZE_ID_B, [
    { id: "hb1", label: "center", x_mm: 200, y_mm: 50 },
  ]],
]);

const PANELS: Panel[] = [
  {
    id: "p1", canvas_size_id: SIZE_ID_A, photo_id: null,
    center_x_mm: 400, center_y_mm: 300,
    width_mm: 500, height_mm: 500, rotation_deg: 0,
  },
  {
    id: "p2", canvas_size_id: SIZE_ID_B, photo_id: null,
    center_x_mm: 1500, center_y_mm: 700,
    width_mm: 400, height_mm: 400, rotation_deg: 45,
  },
];

describe("Template PDF generation", () => {
  it("generates a non-empty PDF starting with %PDF-", async () => {
    const bytes = await buildTemplatePdf({
      wallWidthMm: 2000,
      wallHeightMm: 1000,
      pageSize: "A4",
      panels: PANELS,
      canvasHoles: HOLES,
      jobTitle: "Test",
    });
    expect(bytes.length).toBeGreaterThan(1000);
    const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
    expect(header).toBe("%PDF-");
  });

  it("page dimensions are exactly A4 in points", async () => {
    const bytes = await buildTemplatePdf({
      wallWidthMm: 2000,
      wallHeightMm: 1000,
      pageSize: "A4",
      panels: PANELS,
      canvasHoles: HOLES,
      jobTitle: "Test",
    });
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(mmToPt(210), 3);
    expect(page.getHeight()).toBeCloseTo(mmToPt(297), 3);
  });

  it("tile count matches expected for 2m x 1m on A4 (10mm margin)", async () => {
    const bytes = await buildTemplatePdf({
      wallWidthMm: 2000,
      wallHeightMm: 1000,
      pageSize: "A4",
      panels: PANELS,
      canvasHoles: HOLES,
      jobTitle: "Test",
    });
    const pdf = await PDFDocument.load(bytes);
    // Tile size = 190 x 277. Cols = ceil(2000/190) = 11. Rows = ceil(1000/277) = 4. Total = 44.
    expect(pdf.getPageCount()).toBe(44);
  });
});

describe("Reference PDF generation", () => {
  it("generates a single-page A4 landscape PDF", async () => {
    const bytes = await buildReferencePdf({
      wallWidthMm: 2000,
      wallHeightMm: 1000,
      panels: PANELS,
      canvasHoles: HOLES,
      jobTitle: "Test",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const page = pdf.getPage(0);
    // A4 landscape = 297 x 210 mm
    expect(page.getWidth()).toBeCloseTo(mmToPt(297), 3);
    expect(page.getHeight()).toBeCloseTo(mmToPt(210), 3);
  });
});
