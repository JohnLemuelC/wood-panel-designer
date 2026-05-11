import { describe, it, expect } from "vitest";
import {
  rotatePointAround,
  holeToWallCoord,
  computeDrillMarks,
  panelCorners,
  wallToTile,
  tileCount,
  mmToPt,
  ptToMm,
  MM_TO_PT,
} from "../src/lib/geometry";
import type { Panel, Hole } from "../src/lib/geometry/types";

const TOL = 0.001; // sub-millimeter tolerance for math

function approx(a: number, b: number, tol = TOL) {
  return Math.abs(a - b) <= tol;
}

describe("Unit conversion", () => {
  it("MM_TO_PT is 72/25.4", () => {
    expect(MM_TO_PT).toBeCloseTo(72 / 25.4, 10);
  });
  it("mmToPt and ptToMm are inverses", () => {
    const v = 123.456;
    expect(ptToMm(mmToPt(v))).toBeCloseTo(v, 10);
  });
  it("100mm = 283.4645 pt", () => {
    expect(mmToPt(100)).toBeCloseTo(283.4645669, 4);
  });
});

describe("rotatePointAround", () => {
  it("0deg rotation returns input", () => {
    const p = rotatePointAround({ x: 5, y: 10 }, { x: 0, y: 0 }, 0);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(10);
  });
  it("90deg CW maps (1,0) -> (0,1) around origin (screen y-down = visually clockwise)", () => {
    const p = rotatePointAround({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
  it("180deg maps (1,0) -> (-1,0) around origin", () => {
    const p = rotatePointAround({ x: 1, y: 0 }, { x: 0, y: 0 }, 180);
    expect(p.x).toBeCloseTo(-1);
    expect(p.y).toBeCloseTo(0);
  });
  it("90deg CW around non-origin", () => {
    // Rotating (10, 5) around (5, 5) by 90 CW.
    // Translate so origin is (5,5): point becomes (5, 0).
    // After 90 CW: (0, 5). Translate back: (5, 10).
    const p = rotatePointAround({ x: 10, y: 5 }, { x: 5, y: 5 }, 90);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(10);
  });
  it("360deg returns to start", () => {
    const p = rotatePointAround({ x: 7, y: 3 }, { x: 2, y: 2 }, 360);
    expect(p.x).toBeCloseTo(7);
    expect(p.y).toBeCloseTo(3);
  });
});

describe("holeToWallCoord", () => {
  const baseHole: Hole = {
    id: "h1",
    label: "top",
    x_mm: 100,
    y_mm: 50,
  };

  it("unrotated panel: hole position = panel TL + hole local", () => {
    const panel: Panel = {
      id: "p1",
      canvas_size_id: "s1",
      photo_id: null,
      center_x_mm: 200, // top-left at (100, 100) for a 200x200 panel
      center_y_mm: 200,
      width_mm: 200,
      height_mm: 200,
      rotation_deg: 0,
    };
    const w = holeToWallCoord(panel, baseHole);
    expect(w.x).toBeCloseTo(100 + 100); // TL.x + hole.x = 200
    expect(w.y).toBeCloseTo(100 + 50); // TL.y + hole.y = 150
  });

  it("90deg CW rotation: hole moves correctly", () => {
    // Panel 200x200 centered at (200, 200).
    // Hole at panel-local (100, 50) = on the top edge, at center horizontally.
    // After 90 CW rotation around panel center, the "top edge" becomes the "right edge".
    // Hole's wall position before rotation: (200, 150).
    // After 90 CW around (200,200): (200, 150) -> translate to (0,-50) -> 90CW -> (50, 0) -> (250, 200).
    const panel: Panel = {
      id: "p1",
      canvas_size_id: "s1",
      photo_id: null,
      center_x_mm: 200,
      center_y_mm: 200,
      width_mm: 200,
      height_mm: 200,
      rotation_deg: 90,
    };
    const w = holeToWallCoord(panel, baseHole);
    expect(w.x).toBeCloseTo(250);
    expect(w.y).toBeCloseTo(200);
  });

  it("180deg: hole flips across panel center", () => {
    const panel: Panel = {
      id: "p1",
      canvas_size_id: "s1",
      photo_id: null,
      center_x_mm: 500,
      center_y_mm: 500,
      width_mm: 400,
      height_mm: 300,
      rotation_deg: 180,
    };
    // Hole at (50, 30) panel-local. Panel TL = (300, 350). Hole pre-rotation = (350, 380).
    // 180 around (500,500): (350, 380) -> (650, 620).
    const hole: Hole = { id: "h", label: "h", x_mm: 50, y_mm: 30 };
    const w = holeToWallCoord(panel, hole);
    expect(w.x).toBeCloseTo(650);
    expect(w.y).toBeCloseTo(620);
  });

  it("45deg rotation: distance from center preserved", () => {
    const panel: Panel = {
      id: "p1",
      canvas_size_id: "s1",
      photo_id: null,
      center_x_mm: 1000,
      center_y_mm: 1000,
      width_mm: 400,
      height_mm: 400,
      rotation_deg: 45,
    };
    const hole: Hole = { id: "h", label: "h", x_mm: 200, y_mm: 0 }; // top-middle, on top edge
    // Pre-rotation wall pos: TL (800, 800) + hole (200, 0) = (1000, 800).
    // Distance from panel center: |(1000,800) - (1000,1000)| = 200.
    const w = holeToWallCoord(panel, hole);
    const dx = w.x - 1000;
    const dy = w.y - 1000;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeCloseTo(200, 6);
  });
});

describe("computeDrillMarks", () => {
  it("returns one mark per hole per panel", () => {
    const panels: Panel[] = [
      {
        id: "p1",
        canvas_size_id: "s1",
        photo_id: null,
        center_x_mm: 200,
        center_y_mm: 200,
        width_mm: 200,
        height_mm: 200,
        rotation_deg: 0,
      },
      {
        id: "p2",
        canvas_size_id: "s1",
        photo_id: null,
        center_x_mm: 600,
        center_y_mm: 200,
        width_mm: 200,
        height_mm: 200,
        rotation_deg: 0,
      },
    ];
    const holes: Hole[] = [
      { id: "h1", label: "left", x_mm: 50, y_mm: 50 },
      { id: "h2", label: "right", x_mm: 150, y_mm: 50 },
    ];
    const map = new Map<string, Hole[]>([["s1", holes]]);
    const marks = computeDrillMarks(panels, map);
    expect(marks.length).toBe(4);
  });

  it("uses fallback hole when none configured", () => {
    const panels: Panel[] = [
      {
        id: "p1",
        canvas_size_id: "s1",
        photo_id: null,
        center_x_mm: 200,
        center_y_mm: 200,
        width_mm: 200,
        height_mm: 200,
        rotation_deg: 0,
      },
    ];
    const map = new Map<string, Hole[]>();
    const marks = computeDrillMarks(panels, map);
    expect(marks.length).toBe(1);
    // Fallback: centered horizontally, 50mm from top.
    // TL = (100, 100); hole = (100, 50); wall pos = (200, 150).
    expect(marks[0].wall_x_mm).toBeCloseTo(200);
    expect(marks[0].wall_y_mm).toBeCloseTo(150);
  });
});

describe("panelCorners", () => {
  it("unrotated panel: 4 corners at expected positions", () => {
    const panel: Panel = {
      id: "p1",
      canvas_size_id: "s1",
      photo_id: null,
      center_x_mm: 100,
      center_y_mm: 100,
      width_mm: 200,
      height_mm: 100,
      rotation_deg: 0,
    };
    const c = panelCorners(panel);
    expect(c[0]).toEqual({ x: 0, y: 50 }); // TL
    expect(c[1]).toEqual({ x: 200, y: 50 }); // TR
    expect(c[2]).toEqual({ x: 200, y: 150 }); // BR
    expect(c[3]).toEqual({ x: 0, y: 150 }); // BL
  });

  it("90deg rotated panel: corners rotate", () => {
    const panel: Panel = {
      id: "p1",
      canvas_size_id: "s1",
      photo_id: null,
      center_x_mm: 100,
      center_y_mm: 100,
      width_mm: 200,
      height_mm: 100,
      rotation_deg: 90,
    };
    const c = panelCorners(panel);
    // 90 CW around (100,100): TL (0,50) -> ?  Pre: (-100, -50). CW: (50, -100). Plus center: (150, 0).
    expect(c[0].x).toBeCloseTo(150);
    expect(c[0].y).toBeCloseTo(0);
  });
});

describe("wallToTile and tileCount", () => {
  const A4 = { page_width_mm: 210, page_height_mm: 297, margin_mm: 10 };
  // Tile size: 190 x 277

  it("first tile starts at (0,0)", () => {
    const t = wallToTile(0, 0, A4);
    expect(t.tile_col).toBe(0);
    expect(t.tile_row).toBe(0);
    expect(t.x_in_tile_mm).toBeCloseTo(0);
    expect(t.y_in_tile_mm).toBeCloseTo(0);
  });

  it("position just past first tile boundary is in second tile", () => {
    const t = wallToTile(190.5, 277.5, A4);
    expect(t.tile_col).toBe(1);
    expect(t.tile_row).toBe(1);
    expect(t.x_in_tile_mm).toBeCloseTo(0.5);
    expect(t.y_in_tile_mm).toBeCloseTo(0.5);
  });

  it("2m x 1m wall on A4 = 11 cols x 4 rows", () => {
    const { cols, rows } = tileCount(2000, 1000, A4);
    expect(cols).toBe(Math.ceil(2000 / 190)); // 11
    expect(rows).toBe(Math.ceil(1000 / 277)); // 4
  });
});

describe("End-to-end accuracy: 2m span", () => {
  it("hole at wall (2000, 500) on rotated panel stays accurate", () => {
    // Panel 500x500 at center (1750, 500), rotated 90 CW.
    // Hole at panel-local (250, 0) (top-middle).
    // Pre-rotation wall position: TL (1500, 250); hole (1750, 250).
    // 90 CW around (1750, 500): translate (0, -250), rotate (250, 0), translate (2000, 500).
    const panel: Panel = {
      id: "p1",
      canvas_size_id: "s1",
      photo_id: null,
      center_x_mm: 1750,
      center_y_mm: 500,
      width_mm: 500,
      height_mm: 500,
      rotation_deg: 90,
    };
    const hole: Hole = { id: "h", label: "h", x_mm: 250, y_mm: 0 };
    const w = holeToWallCoord(panel, hole);
    expect(w.x).toBeCloseTo(2000, 6);
    expect(w.y).toBeCloseTo(500, 6);
  });
});
