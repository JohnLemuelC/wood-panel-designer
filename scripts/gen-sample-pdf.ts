// Generate a sample template PDF for physical paper testing.
// Run with: npx tsx scripts/gen-sample-pdf.ts
import { writeFileSync } from "node:fs";
import { buildTemplatePdf } from "../src/lib/pdf/template";
import type { Panel, Hole } from "../src/lib/geometry/types";

const HOLES = new Map<string, Hole[]>([
  ["size-A", [
    { id: "ha1", label: "left D", x_mm: 125, y_mm: 50 },
    { id: "ha2", label: "right D", x_mm: 375, y_mm: 50 },
  ]],
]);

// Wall: 2000 x 1000 mm. Two 500x500 panels at 0deg and 45deg.
const PANELS: Panel[] = [
  {
    id: "p1", canvas_size_id: "size-A", photo_id: null,
    center_x_mm: 300, center_y_mm: 300,
    width_mm: 500, height_mm: 500, rotation_deg: 0,
  },
  {
    id: "p2", canvas_size_id: "size-A", photo_id: null,
    center_x_mm: 1700, center_y_mm: 600,
    width_mm: 500, height_mm: 500, rotation_deg: 45,
  },
];

const main = async () => {
  const bytes = await buildTemplatePdf({
    wallWidthMm: 2000,
    wallHeightMm: 1000,
    pageSize: "A4",
    panels: PANELS,
    canvasHoles: HOLES,
    jobTitle: "Sample Test - 2m x 1m wall",
  });
  writeFileSync("sample-template.pdf", Buffer.from(bytes));
  console.log("Wrote sample-template.pdf -", bytes.length, "bytes");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
