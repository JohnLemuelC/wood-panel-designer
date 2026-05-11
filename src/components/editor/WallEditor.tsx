"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Group, Image as KonvaImage, Text, Line } from "react-konva";
import { v4 as uuid } from "uuid";
import type Konva from "konva";

import { useHistory } from "./useHistory";
import type { EditorProps, PhotoItem, CanvasSizeOption } from "./types";
import type { PanelData } from "@/lib/layout";

const SNAP_MM = 10;
const STAGE_PADDING = 20;
const HISTORY_DEBOUNCE_MS = 300;

function snap(v: number) {
  return Math.round(v / SNAP_MM) * SNAP_MM;
}

interface PanelImageProps {
  panel: PanelData;
  photo?: PhotoItem;
  scale: number; // px per mm
  selected: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<PanelData>) => void;
  onCommit: () => void;
}

function PanelOnWall({
  panel, photo, scale, selected, readOnly, onSelect, onChange, onCommit,
}: PanelImageProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!photo?.signed_url) {
      setImg(null);
      return;
    }
    const el = new window.Image();
    el.crossOrigin = "anonymous";
    el.src = photo.signed_url;
    el.onload = () => setImg(el);
  }, [photo?.signed_url]);

  const widthPx = panel.width_mm * scale;
  const heightPx = panel.height_mm * scale;

  return (
    <Group
      x={panel.center_x_mm * scale}
      y={panel.center_y_mm * scale}
      rotation={panel.rotation_deg}
      draggable={!readOnly}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(e) => {
        const cx = e.target.x() / scale;
        const cy = e.target.y() / scale;
        onChange({ center_x_mm: cx, center_y_mm: cy });
      }}
      onDragEnd={(e) => {
        const cx = snap(e.target.x() / scale);
        const cy = snap(e.target.y() / scale);
        onChange({ center_x_mm: cx, center_y_mm: cy });
        // Snap stage position to align
        e.target.x(cx * scale);
        e.target.y(cy * scale);
        onCommit();
      }}
    >
      <Rect
        x={-widthPx / 2}
        y={-heightPx / 2}
        width={widthPx}
        height={heightPx}
        fill={img ? "#fff" : "#e7e5e4"}
        stroke={selected ? "#0a0a0a" : "#78716c"}
        strokeWidth={selected ? 2 : 1}
        shadowColor="black"
        shadowOpacity={0.1}
        shadowBlur={selected ? 8 : 2}
      />
      {img && (
        <KonvaImage
          image={img}
          x={-widthPx / 2}
          y={-heightPx / 2}
          width={widthPx}
          height={heightPx}
        />
      )}
      {!img && (
        <Text
          text={photo?.original_name ?? "No photo"}
          x={-widthPx / 2}
          y={-8}
          width={widthPx}
          align="center"
          fontSize={12}
          fill="#78716c"
        />
      )}
    </Group>
  );
}

export default function WallEditor(props: EditorProps) {
  const {
    jobId,
    wallWidthMm,
    wallHeightMm,
    initialLayout,
    photos,
    canvasSizes,
    readOnly,
    onSave,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setContainerSize({ w: width, h: height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fit wall to container
  const scale = useMemo(() => {
    const wScale = (containerSize.w - STAGE_PADDING * 2) / wallWidthMm;
    const hScale = (containerSize.h - STAGE_PADDING * 2) / wallHeightMm;
    return Math.max(0.05, Math.min(wScale, hScale));
  }, [containerSize, wallWidthMm, wallHeightMm]);

  const stageW = wallWidthMm * scale + STAGE_PADDING * 2;
  const stageH = wallHeightMm * scale + STAGE_PADDING * 2;

  const history = useHistory<PanelData[]>(initialLayout);
  const layout = history.state;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Fetch signed view URLs for photos
  useEffect(() => {
    let alive = true;
    (async () => {
      const updates: Record<string, string> = {};
      for (const p of photos) {
        if (signedUrls[p.id]) continue;
        try {
          const r = await fetch(`/api/photos/${p.id}/signed-view`);
          if (r.ok) {
            const j = await r.json();
            updates[p.id] = j.url;
          }
        } catch {}
      }
      if (alive && Object.keys(updates).length > 0) {
        setSignedUrls((cur) => ({ ...cur, ...updates }));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  const photoById = useMemo(() => {
    const m = new Map<string, PhotoItem>();
    for (const p of photos) m.set(p.id, { ...p, signed_url: signedUrls[p.id] });
    return m;
  }, [photos, signedUrls]);

  // Auto-save debounced
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const triggerSave = useCallback((next: PanelData[]) => {
    if (readOnly) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        setSaving(true);
        await onSave(next);
        setSavedAt(new Date());
      } catch (e) {
        console.error(e);
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [onSave, readOnly]);

  // Save whenever layout changes (after history commit)
  useEffect(() => {
    triggerSave(layout);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (readOnly) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((isMod && e.key.toLowerCase() === "z" && e.shiftKey) || (isMod && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        history.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removePanel(selectedId);
      } else if (e.key === "r" || e.key === "R") {
        if (selectedId) rotatePanel(selectedId, 90);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, selectedId, readOnly]);

  // --- Panel operations ---
  const addPanelFromPhoto = useCallback((photoId: string, droppedXMm: number, droppedYMm: number) => {
    const defaultSize = canvasSizes.find((s) => s.is_active) ?? canvasSizes[0];
    if (!defaultSize) return;
    const next: PanelData = {
      id: uuid(),
      canvas_size_id: defaultSize.id,
      photo_id: photoId,
      center_x_mm: snap(droppedXMm),
      center_y_mm: snap(droppedYMm),
      width_mm: defaultSize.width_mm,
      height_mm: defaultSize.height_mm,
      rotation_deg: 0,
    };
    history.set([...layout, next]);
    setSelectedId(next.id);
  }, [layout, canvasSizes, history]);

  const updatePanel = useCallback((id: string, updates: Partial<PanelData>, opts?: { skipHistory?: boolean }) => {
    history.set((cur) => cur.map((p) => (p.id === id ? { ...p, ...updates } : p)), opts);
  }, [history]);

  const removePanel = useCallback((id: string) => {
    history.set((cur) => cur.filter((p) => p.id !== id));
    setSelectedId(null);
  }, [history]);

  const rotatePanel = useCallback((id: string, byDeg: number) => {
    history.set((cur) => cur.map((p) => p.id === id ? { ...p, rotation_deg: (p.rotation_deg + byDeg) % 360 } : p));
  }, [history]);

  const swapPanelSize = useCallback((id: string, newSizeId: string) => {
    const s = canvasSizes.find((cs) => cs.id === newSizeId);
    if (!s) return;
    history.set((cur) => cur.map((p) => p.id === id ? { ...p, canvas_size_id: s.id, width_mm: s.width_mm, height_mm: s.height_mm } : p));
  }, [canvasSizes, history]);

  const swapPhoto = useCallback((id: string, newPhotoId: string) => {
    history.set((cur) => cur.map((p) => p.id === id ? { ...p, photo_id: newPhotoId } : p));
  }, [history]);

  // Photos currently in use on the wall
  const photoIdsOnWall = useMemo(() => new Set(layout.map((p) => p.photo_id).filter(Boolean) as string[]), [layout]);

  // Drag-and-drop from tray
  const stageRef = useRef<Konva.Stage>(null);
  const dragPhotoIdRef = useRef<string | null>(null);

  const onTrayDragStart = (photoId: string) => () => {
    dragPhotoIdRef.current = photoId;
  };

  // Handle drop onto stage container
  const handleStageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!stageRef.current || !dragPhotoIdRef.current) return;
    const stage = stageRef.current;
    const containerRect = stage.container().getBoundingClientRect();
    const x = e.clientX - containerRect.left - STAGE_PADDING;
    const y = e.clientY - containerRect.top - STAGE_PADDING;
    const xMm = x / scale;
    const yMm = y / scale;
    if (xMm < 0 || yMm < 0 || xMm > wallWidthMm || yMm > wallHeightMm) return;
    addPanelFromPhoto(dragPhotoIdRef.current, xMm, yMm);
    dragPhotoIdRef.current = null;
  };

  const selected = layout.find((p) => p.id === selectedId) ?? null;

  // Grid lines
  const gridLines = useMemo(() => {
    const lines: { points: number[]; key: string }[] = [];
    const step = 100; // 100mm grid lines
    for (let x = 0; x <= wallWidthMm; x += step) {
      lines.push({ points: [x * scale, 0, x * scale, wallHeightMm * scale], key: `v${x}` });
    }
    for (let y = 0; y <= wallHeightMm; y += step) {
      lines.push({ points: [0, y * scale, wallWidthMm * scale, y * scale], key: `h${y}` });
    }
    return lines;
  }, [wallWidthMm, wallHeightMm, scale]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={history.undo}
          disabled={!history.canUndo || readOnly}
          className="text-sm border border-stone-300 rounded px-3 py-1 disabled:opacity-30"
        >
          Undo
        </button>
        <button
          onClick={history.redo}
          disabled={!history.canRedo || readOnly}
          className="text-sm border border-stone-300 rounded px-3 py-1 disabled:opacity-30"
        >
          Redo
        </button>
        <span className="text-xs text-stone-500 ml-2">
          {saving ? "Saving..." : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ""}
        </span>
        {selected && !readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <select
              value={selected.canvas_size_id}
              onChange={(e) => swapPanelSize(selected.id, e.target.value)}
              className="text-sm border border-stone-300 rounded px-2 py-1"
            >
              {canvasSizes.filter((s) => s.is_active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.width_mm}x{s.height_mm} mm)
                </option>
              ))}
            </select>
            <button onClick={() => rotatePanel(selected.id, 90)} className="text-sm border border-stone-300 rounded px-3 py-1">
              Rotate 90 deg
            </button>
            <button onClick={() => removePanel(selected.id)} className="text-sm border border-red-300 text-red-700 rounded px-3 py-1">
              Remove
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-1 min-h-[500px]">
        {/* Photo tray */}
        <div className="w-44 bg-white border border-stone-200 rounded-xl p-3 overflow-y-auto">
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Photos</div>
          {photos.length === 0 && (
            <div className="text-xs text-stone-400">No photos yet. Upload some above.</div>
          )}
          <div className="space-y-2">
            {photos.map((p) => {
              const inUse = photoIdsOnWall.has(p.id);
              const url = signedUrls[p.id];
              return (
                <div
                  key={p.id}
                  draggable={!readOnly}
                  onDragStart={onTrayDragStart(p.id)}
                  className={`relative border rounded-lg overflow-hidden cursor-grab ${inUse ? "opacity-50" : ""} ${readOnly ? "cursor-default" : ""}`}
                  title={p.original_name ?? ""}
                >
                  {url ? (
                    <img src={url} alt="" className="w-full h-20 object-cover" />
                  ) : (
                    <div className="w-full h-20 bg-stone-100 flex items-center justify-center text-xs text-stone-400">
                      Loading
                    </div>
                  )}
                  {inUse && (
                    <span className="absolute top-1 right-1 bg-stone-900 text-white text-[10px] px-1 rounded">on wall</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 bg-stone-100 border border-stone-200 rounded-xl overflow-hidden relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleStageDrop}
        >
          <Stage
            ref={stageRef}
            width={stageW}
            height={stageH}
            style={{ marginLeft: (containerSize.w - stageW) / 2, marginTop: (containerSize.h - stageH) / 2 }}
          >
            <Layer x={STAGE_PADDING} y={STAGE_PADDING}>
              {/* Wall background */}
              <Rect
                x={0}
                y={0}
                width={wallWidthMm * scale}
                height={wallHeightMm * scale}
                fill="#fafaf9"
                stroke="#a8a29e"
                strokeWidth={1}
              />
              {/* Grid */}
              {gridLines.map((l) => (
                <Line key={l.key} points={l.points} stroke="#e7e5e4" strokeWidth={0.5} />
              ))}
            </Layer>
            <Layer x={STAGE_PADDING} y={STAGE_PADDING}>
              {layout.map((panel) => (
                <PanelOnWall
                  key={panel.id}
                  panel={panel}
                  photo={panel.photo_id ? photoById.get(panel.photo_id) : undefined}
                  scale={scale}
                  selected={selectedId === panel.id}
                  readOnly={!!readOnly}
                  onSelect={() => setSelectedId(panel.id)}
                  onChange={(updates) => updatePanel(panel.id, updates, { skipHistory: true })}
                  onCommit={() => {
                    // Push the current state into history
                    history.set(layout, { skipHistory: false });
                  }}
                />
              ))}
            </Layer>
          </Stage>
          <div className="absolute bottom-2 right-3 text-xs text-stone-500 bg-white/80 rounded px-2 py-1">
            {wallWidthMm} x {wallHeightMm} mm  &middot;  scale 1px = {(1 / scale).toFixed(1)} mm
          </div>
        </div>
      </div>
    </div>
  );
}
