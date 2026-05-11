"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface CanvasSize {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  thickness_mm: number;
  price_cents: number;
  is_active: boolean;
}
interface Hole {
  id: string;
  canvas_size_id: string;
  label: string;
  x_mm: number;
  y_mm: number;
}

interface Props {
  initialSizes: CanvasSize[];
  initialHoles: Hole[];
}

export default function CatalogClient({ initialSizes, initialHoles }: Props) {
  const [sizes, setSizes] = useState<CanvasSize[]>(initialSizes);
  const [holes, setHoles] = useState<Hole[]>(initialHoles);
  const [selectedId, setSelectedId] = useState<string | null>(initialSizes[0]?.id ?? null);
  const supabase = createClient();

  const selected = sizes.find((s) => s.id === selectedId);
  const selectedHoles = useMemo(
    () => holes.filter((h) => h.canvas_size_id === selectedId),
    [holes, selectedId]
  );

  async function addSize() {
    const name = prompt("Name?", "Custom");
    if (!name) return;
    const w = Number(prompt("Width (mm)?", "400"));
    const h = Number(prompt("Height (mm)?", "400"));
    if (!w || !h) return;
    const { data, error } = await supabase
      .from("canvas_sizes")
      .insert({ name, width_mm: w, height_mm: h })
      .select()
      .single();
    if (error) return alert(error.message);
    setSizes((s) => [...s, data]);
    setSelectedId(data.id);
  }

  async function updateSize(id: string, updates: Partial<CanvasSize>) {
    const { error } = await supabase.from("canvas_sizes").update(updates).eq("id", id);
    if (error) return alert(error.message);
    setSizes((s) => s.map((x) => (x.id === id ? { ...x, ...updates } : x)));
  }

  async function toggleActive(id: string, current: boolean) {
    updateSize(id, { is_active: !current });
  }

  async function addHole(canvas_size_id: string, x_mm: number, y_mm: number) {
    const { data, error } = await supabase
      .from("canvas_holes")
      .insert({ canvas_size_id, label: `hole ${selectedHoles.length + 1}`, x_mm, y_mm })
      .select()
      .single();
    if (error) return alert(error.message);
    setHoles((h) => [...h, data]);
  }

  async function updateHole(id: string, updates: Partial<Hole>) {
    const { error } = await supabase.from("canvas_holes").update(updates).eq("id", id);
    if (error) return alert(error.message);
    setHoles((h) => h.map((x) => (x.id === id ? { ...x, ...updates } : x)));
  }

  async function deleteHole(id: string) {
    const { error } = await supabase.from("canvas_holes").delete().eq("id", id);
    if (error) return alert(error.message);
    setHoles((h) => h.filter((x) => x.id !== id));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Size list */}
      <div className="lg:col-span-4 bg-white border border-stone-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-stone-900">Sizes</h2>
          <button
            onClick={addSize}
            className="text-sm bg-stone-900 text-white px-3 py-1 rounded hover:bg-stone-800"
          >
            + Add
          </button>
        </div>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {sizes.map((s) => {
            const hasHoles = holes.some((h) => h.canvas_size_id === s.id);
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left p-2 rounded border ${
                  selectedId === s.id ? "border-stone-900" : "border-stone-200 hover:border-stone-400"
                } ${!s.is_active ? "opacity-50" : ""}`}
              >
                <div className="font-medium text-stone-900 text-sm">{s.name}</div>
                <div className="text-xs text-stone-500">
                  {s.width_mm} x {s.height_mm} mm  &middot;  {s.thickness_mm} mm thick
                  {!hasHoles && (
                    <span className="ml-2 text-amber-600 font-medium">needs hole config</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hole editor */}
      <div className="lg:col-span-8 bg-white border border-stone-200 rounded-xl p-4">
        {selected ? (
          <SizeDetail
            size={selected}
            holes={selectedHoles}
            onUpdateSize={(u) => updateSize(selected.id, u)}
            onToggleActive={() => toggleActive(selected.id, selected.is_active)}
            onAddHole={(x, y) => addHole(selected.id, x, y)}
            onUpdateHole={(id, u) => updateHole(id, u)}
            onDeleteHole={(id) => deleteHole(id)}
          />
        ) : (
          <div className="text-stone-500">Select a size to edit holes.</div>
        )}
      </div>
    </div>
  );
}

function SizeDetail({
  size,
  holes,
  onUpdateSize,
  onToggleActive,
  onAddHole,
  onUpdateHole,
  onDeleteHole,
}: {
  size: CanvasSize;
  holes: Hole[];
  onUpdateSize: (u: Partial<CanvasSize>) => void;
  onToggleActive: () => void;
  onAddHole: (x: number, y: number) => void;
  onUpdateHole: (id: string, u: Partial<Hole>) => void;
  onDeleteHole: (id: string) => void;
}) {
  const [name, setName] = useState(size.name);
  const [width, setWidth] = useState(size.width_mm);
  const [height, setHeight] = useState(size.height_mm);
  const [thickness, setThickness] = useState(size.thickness_mm);
  const [price, setPrice] = useState(size.price_cents);
  const [draggingHoleId, setDraggingHoleId] = useState<string | null>(null);

  useEffect(() => {
    setName(size.name);
    setWidth(size.width_mm);
    setHeight(size.height_mm);
    setThickness(size.thickness_mm);
    setPrice(size.price_cents);
  }, [size.id]);

  function commitSize() {
    onUpdateSize({ name, width_mm: width, height_mm: height, thickness_mm: thickness, price_cents: price });
  }

  // SVG layout
  const RULER_PAD = 30;
  const SVG_W = 600;
  const SVG_H = 500;
  const drawW = SVG_W - RULER_PAD - 20;
  const drawH = SVG_H - RULER_PAD - 20;
  const scale = Math.min(drawW / width, drawH / height);
  const panelW = width * scale;
  const panelH = height * scale;

  function svgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (draggingHoleId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x_svg = e.clientX - rect.left - RULER_PAD;
    const y_svg = e.clientY - rect.top - RULER_PAD;
    if (x_svg < 0 || y_svg < 0 || x_svg > panelW || y_svg > panelH) return;
    const x_mm = Math.round(x_svg / scale);
    const y_mm = Math.round(y_svg / scale);
    onAddHole(x_mm, y_mm);
  }

  function handleHoleDrag(e: React.MouseEvent<SVGCircleElement>, holeId: string) {
    e.stopPropagation();
    setDraggingHoleId(holeId);
  }

  useEffect(() => {
    const holeId: string | null = draggingHoleId;
    if (!holeId) return;
    function onMove(ev: MouseEvent) {
      if (!holeId) return;
      const svg = document.getElementById("hole-svg") as unknown as SVGSVGElement | null;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x_svg = ev.clientX - rect.left - RULER_PAD;
      const y_svg = ev.clientY - rect.top - RULER_PAD;
      if (x_svg < 0 || y_svg < 0 || x_svg > panelW || y_svg > panelH) return;
      const x_mm = Math.round(x_svg / scale);
      const y_mm = Math.round(y_svg / scale);
      onUpdateHole(holeId, { x_mm, y_mm });
    }
    function onUp() {
      setDraggingHoleId(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingHoleId, scale, panelW, panelH, onUpdateHole]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitSize}
          className="border border-stone-300 rounded px-2 py-1 text-sm"
        />
        <input
          type="number" value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          onBlur={commitSize}
          className="border border-stone-300 rounded px-2 py-1 text-sm"
          placeholder="Width mm"
        />
        <input
          type="number" value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          onBlur={commitSize}
          className="border border-stone-300 rounded px-2 py-1 text-sm"
          placeholder="Height mm"
        />
        <input
          type="number" value={thickness}
          onChange={(e) => setThickness(Number(e.target.value))}
          onBlur={commitSize}
          className="border border-stone-300 rounded px-2 py-1 text-sm"
          placeholder="Thickness mm"
        />
        <div className="flex items-center gap-2">
          <input
            type="number" value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            onBlur={commitSize}
            className="border border-stone-300 rounded px-2 py-1 text-sm flex-1"
            placeholder="Price cents"
          />
          <button
            onClick={onToggleActive}
            className={`text-xs rounded px-2 py-1 border ${size.is_active ? "border-emerald-600 text-emerald-700" : "border-stone-300 text-stone-500"}`}
          >
            {size.is_active ? "Active" : "Inactive"}
          </button>
        </div>
      </div>

      <div>
        <p className="text-sm text-stone-600 mb-2">
          Click on the panel to add a hole. Drag holes to reposition. Type exact (x, y) below for fine adjustment.
        </p>
        <svg
          id="hole-svg"
          width={SVG_W}
          height={SVG_H}
          onClick={svgClick}
          className="border border-stone-200 rounded bg-stone-50 cursor-crosshair select-none"
        >
          {/* Rulers */}
          {Array.from({ length: Math.floor(width / 50) + 1 }, (_, i) => (
            <g key={`vr${i}`}>
              <line x1={RULER_PAD + i * 50 * scale} y1={RULER_PAD - 4} x2={RULER_PAD + i * 50 * scale} y2={RULER_PAD} stroke="#78716c" strokeWidth="0.5" />
              <text x={RULER_PAD + i * 50 * scale} y={RULER_PAD - 8} fontSize="8" fill="#78716c" textAnchor="middle">
                {i * 50}
              </text>
            </g>
          ))}
          {Array.from({ length: Math.floor(height / 50) + 1 }, (_, i) => (
            <g key={`hr${i}`}>
              <line x1={RULER_PAD - 4} y1={RULER_PAD + i * 50 * scale} x2={RULER_PAD} y2={RULER_PAD + i * 50 * scale} stroke="#78716c" strokeWidth="0.5" />
              <text x={RULER_PAD - 8} y={RULER_PAD + i * 50 * scale + 3} fontSize="8" fill="#78716c" textAnchor="end">
                {i * 50}
              </text>
            </g>
          ))}
          {/* Panel */}
          <rect x={RULER_PAD} y={RULER_PAD} width={panelW} height={panelH} fill="#fff" stroke="#0a0a0a" strokeWidth="1" />
          {/* Holes */}
          {holes.map((h) => (
            <g key={h.id}>
              <circle
                cx={RULER_PAD + h.x_mm * scale}
                cy={RULER_PAD + h.y_mm * scale}
                r="6"
                fill="#dc2626"
                stroke="#fff"
                strokeWidth="2"
                onMouseDown={(e) => handleHoleDrag(e, h.id)}
                style={{ cursor: "grab" }}
              />
              <text
                x={RULER_PAD + h.x_mm * scale + 10}
                y={RULER_PAD + h.y_mm * scale + 4}
                fontSize="10"
                fill="#0a0a0a"
              >
                {h.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div>
        <h3 className="font-medium text-stone-900 mb-2">Holes (mm relative to panel top-left)</h3>
        {holes.length === 0 ? (
          <p className="text-sm text-amber-700">No holes configured. The 1:1 template will fall back to a default centered hole 50mm from top.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 text-xs">
                <th className="p-1">Label</th>
                <th className="p-1">X (mm)</th>
                <th className="p-1">Y (mm)</th>
                <th className="p-1"></th>
              </tr>
            </thead>
            <tbody>
              {holes.map((h) => (
                <tr key={h.id} className="border-t border-stone-100">
                  <td className="p-1">
                    <input
                      value={h.label}
                      onChange={(e) => onUpdateHole(h.id, { label: e.target.value })}
                      className="border border-stone-300 rounded px-2 py-1 w-full"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number" step="0.1" value={h.x_mm}
                      onChange={(e) => onUpdateHole(h.id, { x_mm: Number(e.target.value) })}
                      className="border border-stone-300 rounded px-2 py-1 w-24"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number" step="0.1" value={h.y_mm}
                      onChange={(e) => onUpdateHole(h.id, { y_mm: Number(e.target.value) })}
                      className="border border-stone-300 rounded px-2 py-1 w-24"
                    />
                  </td>
                  <td className="p-1">
                    <button onClick={() => onDeleteHole(h.id)} className="text-red-600 hover:underline text-xs">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
