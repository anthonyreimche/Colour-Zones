// The two on-image pickers, armed from the panel, held as the develop canvas's
// tool. A click reads a small patch, a drag reads the box it draws. "Show"
// marks the picked colour on the graph and bases the graph's colours on it;
// "create" also rebuilds the edited curve around it (color_picker_apply):
// flat, raised with Alt or lowered with Shift. darktable raises with Ctrl,
// which Safelight keeps for panning and zooming: the tool is zoomable, so
// core hands Ctrl / Cmd / Space to the canvas. Both stay on, as darktable's
// toggles do, until the button is pressed again or Esc.

import type { PointerEvent as ReactPointerEvent } from "react";
import { curveFromPick, type PickedShape } from "./curve-edit";
import { pickedSpan } from "./graph-model";
import { DEFAULT_PARAMS, withCurve } from "./model";
import { bagPatch, readParams } from "./params";
import { pickArea, startLiveSampler } from "./picker";
import { React, api } from "./rt";
import type { CanvasTool, OverlayRect2 } from "./safelight";
import { store, type UvBox } from "./store";

/** A frame point → image UV through the displayed image rect, clamped to the
 *  image when asked. Null when the point starts outside the image. */
export function pointToUv(point: { x: number; y: number }, rect: OverlayRect2 | null, clamp = false): { x: number; y: number } | null {
  if (!rect || rect.w <= 0 || rect.h <= 0) return null;
  const x = (point.x - rect.x) / rect.w;
  const y = (point.y - rect.y) / rect.h;
  if (clamp) return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** The create picker's shape from the modifiers held at release. */
export const shapeOf = (e: { altKey: boolean; shiftKey: boolean }): PickedShape => (e.altKey ? 1 : e.shiftKey ? -1 : 0);

/** A pick made before the first sample arrived, applied when it does. */
let pending: { box: UvBox; shape: PickedShape } | null = null;

/** Reads `box` from the latest sample, publishes it, and for the create
 *  picker rebuilds the edited curve around it as one undo step. */
export function applyPick(box: UvBox, shape: PickedShape): void {
  const ui = store().getState();
  if (ui.picker === null) return;
  if (!ui.sample) {
    pending = { box, shape };
    return;
  }
  const picked = pickArea(ui.sample, box);
  ui.setPicked(picked, box);
  if (!picked || ui.picker !== "create") return;
  const dev = api.stores.useDevelopStore.getState();
  const p = readParams(dev.paramBag);
  const curve = {
    interpolation: DEFAULT_PARAMS.curves[ui.channel].interpolation,
    nodes: curveFromPick(DEFAULT_PARAMS.curves[ui.channel].nodes, pickedSpan(p.selectBy, picked), shape),
  };
  dev.setDynParams(bagPatch(withCurve(p, ui.channel, curve)));
  void dev.commitEdit("Colour Zones create curve");
}

export function ZonesTool({ rect }: { rect: OverlayRect2 }) {
  const { useEffect, useRef, useState } = React;
  const picker = store()((s) => s.picker);
  const area = store()((s) => s.area);
  const ref = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [drag, setDrag] = useState<UvBox | null>(null);

  // The sampler runs only while a picker is on. A fresh sample applies a
  // pick that waited for it, and keeps the shown colour current; the create
  // picker's curve is only rebuilt by a pick, never by a render.
  useEffect(() => {
    if (picker === null) return;
    const stop = startLiveSampler((sample) => {
      const ui = store().getState();
      ui.setSample(sample);
      if (!sample) return;
      if (pending) {
        const { box, shape } = pending;
        pending = null;
        applyPick(box, shape);
      } else if (ui.picker === "show" && ui.area) {
        ui.setPicked(pickArea(sample, ui.area), ui.area);
      }
    });
    return () => {
      stop();
      pending = null;
      store().getState().setSample(null);
    };
  }, [picker]);

  const uvAt = (e: { clientX: number; clientY: number }, clamp: boolean) => {
    const el = ref.current;
    return el ? pointToUv(api.develop.framePoint(el, e.clientX, e.clientY), rect, clamp) : null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const uv = uvAt(e, false);
    if (!uv) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { start: uv, end: uv };
    setDrag({ x0: uv.x, y0: uv.y, x1: uv.x, y1: uv.y });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const uv = uvAt(e, true);
    if (!uv) return;
    d.end = uv;
    setDrag({ x0: d.start.x, y0: d.start.y, x1: uv.x, y1: uv.y });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    applyPick({ x0: d.start.x, y0: d.start.y, x1: d.end.x, y1: d.end.y }, shapeOf(e));
  };

  // A gesture the system cancelled picks nothing.
  const onPointerCancel = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const shown = drag ?? area;
  const box = shown ? (
    <div
      style={{
        position: "absolute",
        left: rect.x + Math.min(shown.x0, shown.x1) * rect.w,
        top: rect.y + Math.min(shown.y0, shown.y1) * rect.h,
        width: Math.abs(shown.x1 - shown.x0) * rect.w,
        height: Math.abs(shown.y1 - shown.y0) * rect.h,
        minWidth: 6,
        minHeight: 6,
        transform: shown.x0 === shown.x1 && shown.y0 === shown.y1 ? "translate(-3px, -3px)" : undefined,
        border: "1px solid rgba(255, 255, 255, 0.9)",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.6)",
        pointerEvents: "none",
      }}
    />
  ) : null;

  return (
    <div
      ref={ref}
      style={{ position: "absolute", inset: 0, cursor: api.cursors.resolve("pick") }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {box}
    </div>
  );
}

const ZONES_TOOL: CanvasTool = {
  overlay: ZonesTool,
  zoomable: true,
  onEscape: () => store().getState().setPicker(null),
};

/** Holds the canvas with the pickers' tool while one is on, and lets it go
 *  when the last ends. Returns the unsubscribe. */
export function holdPickerTool(): () => void {
  return store().subscribe((state, prev) => {
    if ((state.picker === null) !== (prev.picker === null)) api.develop.setCanvasTool(state.picker === null ? null : ZONES_TOOL);
  });
}

/** Ends the picker once core has let the canvas go: another extension's
 *  tool, or leaving Develop. */
export function ZonesPickerWatch(): null {
  const picker = store()((s) => s.picker);
  const held = api.develop.useCanvasToolHeld();
  React.useEffect(() => {
    if (picker !== null && !held) store().getState().setPicker(null);
  }, [picker, held]);
  return null;
}
