// The curve graph, after color zones' drawing area: the LCh cells of the
// edited curve behind the plot, a grid with the centre line (no change), all
// three curves as darktable draws them (before the mix, the edited one last
// and bright, the others faint), the edited curve's nodes, the picked colour
// while a picker is on, and under it all the colour bar of the select-by
// axis.
//
// Gestures are darktable's: hover picks the node within reach; dragging it
// moves it; a drag that starts away from every node adds one where the
// pointer goes and drags that; Ctrl+click adds a node on the curve;
// right-click removes the hovered node and Ctrl+right-click flattens it;
// double-click resets the curve; the arrow keys nudge the hovered node.
// With edit by area on, a drag pulls the nodes near the pointer towards it
// (the wheel sizes the circle), and the arrows under the plot slide a node
// along the axis. Drags write the bag live and commit on release, so each
// gesture is one undo step. Each change starts from the bag the scope holds
// now, as drags outrun renders.

import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { KEY_STEP, addNode, areaEdit, moveNode, nearestNode, nearestX, removeNode, resetNodeY, stepRadius } from "./curve-edit";
import {
  ARROW_STRIP,
  BAR_HEIGHT,
  BASE_LCH,
  CELLS_X,
  CELLS_Y,
  INSET,
  backgroundCells,
  barCells,
  belowPlot,
  pickedSpan,
  plotGeometry,
  toPlot,
  type PlotGeometry,
} from "./graph-model";
import { CHANNEL_LIST, curveOf, defaultCurve, withCurve, type Channel, type CurveNode, type Params } from "./model";
import { bagPatch, readParams } from "./params";
import { React, api } from "./rt";
import { store, type UiState } from "./store";

const FRAME_WIDTH = 252;
const CURVE_SAMPLES = 256;
const CHANNEL_NAMES = ["Lightness", "Chroma", "Hue"];

interface Drag {
  /** The node being dragged, or -1 until a drag from empty space adds one,
   *  or while editing by area. */
  node: number;
  /** Node minus pointer at the grab, so the node doesn't jump to the pointer. */
  dx: number;
  dy: number;
  moved: boolean;
  added: boolean;
  /** Editing by area: pulling the curve, or sliding the arrowed node. */
  area: boolean;
}

interface Extras {
  hover: number;
  /** Edit by area's pointer, in curve units, while it is over the graph. */
  mouse: { x: number; y: number } | null;
  /** The node whose arrow is under the pointer, or -1. */
  xMove: number;
  ui: Pick<UiState, "editByArea" | "radius" | "picker" | "picked">;
}

const curvePath = (g: PlotGeometry, curve: (x: number) => number): Path2D => {
  const path = new Path2D();
  for (let k = 0; k < CURVE_SAMPLES; k++) {
    const x = k / (CURVE_SAMPLES - 1);
    const px = INSET + x * g.plotW;
    const py = INSET + (1 - curve(x)) * g.plotH;
    if (k === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }
  return path;
};

function draw(ctx: CanvasRenderingContext2D, g: PlotGeometry, p: Params, channel: Channel, x: Extras): void {
  const { plotW, plotH } = g;
  const cx = (v: number) => INSET + v * plotW;
  const cy = (v: number) => INSET + (1 - v) * plotH;
  ctx.clearRect(0, 0, g.width, g.height);

  const picked = x.ui.picker !== null ? x.ui.picked : null;
  const base = picked ? picked.mean : BASE_LCH;
  const cells = backgroundCells(p.selectBy, channel, base);
  const cw = plotW / CELLS_X;
  const ch = plotH / CELLS_Y;
  for (let j = 0; j < CELLS_Y; j++) {
    for (let i = 0; i < CELLS_X; i++) {
      ctx.fillStyle = cells[j * CELLS_X + i];
      ctx.fillRect(INSET + i * cw, INSET + j * ch, cw + 0.5, ch + 0.5);
    }
  }
  const bar = barCells(p.selectBy, base);
  for (let i = 0; i < CELLS_X; i++) {
    ctx.fillStyle = bar[i];
    ctx.fillRect(INSET + i * cw, g.barTop, cw + 0.5, BAR_HEIGHT);
  }

  ctx.lineWidth = 0.5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  for (let k = 1; k < 8; k++) {
    ctx.moveTo(cx(k / 8), INSET);
    ctx.lineTo(cx(k / 8), INSET + plotH);
  }
  for (const y of [0.25, 0.75]) {
    ctx.moveTo(INSET, cy(y));
    ctx.lineTo(INSET + plotW, cy(y));
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.beginPath();
  ctx.moveTo(INSET, cy(0.5));
  ctx.lineTo(INSET + plotW, cy(0.5));
  ctx.stroke();

  if (picked) {
    const span = pickedSpan(p.selectBy, picked);
    for (const [top, height] of [
      [INSET, plotH],
      [g.barTop, BAR_HEIGHT],
    ]) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.fillRect(cx(span.min), top, Math.max(0, span.max - span.min) * plotW, height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.fillRect(cx(span.mean) - 1, top, 2, height);
    }
  }

  const flat = { ...p, strength: 0 };
  ctx.save();
  ctx.beginPath();
  ctx.rect(INSET, INSET, plotW, plotH);
  ctx.clip();
  for (const other of CHANNEL_LIST) {
    if (other === channel) continue;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(240, 240, 240, 0.35)";
    ctx.stroke(curvePath(g, curveOf(flat, other)));
  }

  const nodes = p.curves[channel].nodes;
  const area = x.ui.editByArea && x.mouse && x.xMove < 0 ? x.mouse : null;
  if (area) {
    // The band the curve can be pulled across here: every node pulled all the
    // way up, and all the way down, around the pointer.
    const pulled = (y: number) => curveOf(withCurve(flat, channel, { ...p.curves[channel], nodes: areaEdit(nodes, area.x, y, x.ui.radius) }), channel);
    const up = pulled(1);
    const down = pulled(0);
    const band = new Path2D();
    for (let k = 0; k < CURVE_SAMPLES; k++) {
      const v = k / (CURVE_SAMPLES - 1);
      if (k === 0) band.moveTo(cx(v), cy(down(v)));
      else band.lineTo(cx(v), cy(down(v)));
    }
    for (let k = CURVE_SAMPLES - 1; k >= 0; k--) {
      const v = k / (CURVE_SAMPLES - 1);
      band.lineTo(cx(v), cy(up(v)));
    }
    band.closePath();
    ctx.fillStyle = "rgba(240, 240, 240, 0.3)";
    ctx.fill(band);
  }

  const curve = curveOf(flat, channel);
  const path = curvePath(g, curve);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
  ctx.stroke(path);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(240, 240, 240, 0.95)";
  ctx.stroke(path);
  nodes.forEach((n, k) => {
    ctx.beginPath();
    ctx.arc(cx(n.x), cy(n.y), k === x.hover ? 5 : 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = k === x.hover ? "rgba(240, 240, 240, 1)" : "rgba(30, 30, 30, 0.9)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = k === x.hover ? "rgba(30, 30, 30, 0.9)" : "rgba(240, 240, 240, 0.95)";
    ctx.stroke();
  });
  if (area) {
    ctx.beginPath();
    ctx.arc(cx(area.x), cy(curve(area.x)), x.ui.radius * plotW, 0, 2 * Math.PI);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(240, 240, 240, 0.7)";
    ctx.stroke();
  }
  ctx.restore();

  if (x.ui.editByArea) {
    const w = 7;
    const base = INSET + plotH + ARROW_STRIP;
    nodes.forEach((n, k) => {
      ctx.beginPath();
      ctx.moveTo(cx(n.x) - w / 2, base);
      ctx.lineTo(cx(n.x), base - w);
      ctx.lineTo(cx(n.x) + w / 2, base);
      ctx.closePath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(160, 160, 160, 1)";
      ctx.fillStyle = "rgba(160, 160, 160, 1)";
      if (k === x.xMove) ctx.fill();
      else ctx.stroke();
    });
  }
}

export function ZonesGraph() {
  const { useEffect, useRef, useState } = React;
  const scope = api.develop.useParamScope();
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const p = readParams(scope.getParams());
  const channel = store()((s) => s.channel);
  const editByArea = store()((s) => s.editByArea);
  const radius = store()((s) => s.radius);
  const picker = store()((s) => s.picker);
  const picked = store()((s) => s.picked);
  const [width, setWidth] = useState(FRAME_WIDTH);
  const [hover, setHoverState] = useState(-1);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [xMove, setXMoveState] = useState(-1);
  // Key and pointer events can arrive before React renders the last state.
  const hoverRef = useRef(-1);
  const xMoveRef = useRef(-1);
  const setHover = (k: number) => {
    hoverRef.current = k;
    setHoverState(k);
  };
  const setXMove = (k: number) => {
    xMoveRef.current = k;
    setXMoveState(k);
  };
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const g = plotGeometry(width, editByArea);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 40) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(g.width * dpr);
    canvas.height = Math.round(g.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, g, p, channel, { hover, mouse, xMove, ui: { editByArea, radius, picker, picked } });
  });

  // The wheel sizes edit by area's circle. It is attached natively
  // (non-passive) so the dock doesn't scroll underneath; React's onWheel
  // can't preventDefault.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !editByArea) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const ui = store().getState();
      const count = readParams(scopeRef.current.getParams()).curves[ui.channel].nodes.length;
      ui.setRadius(stepRadius(ui.radius, Math.sign(e.deltaY), count));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [editByArea]);

  const live = () => readParams(scope.getParams());
  const write = (nodes: readonly CurveNode[], cur: Params = live()) =>
    scope.setParams(bagPatch(withCurve(cur, channel, { ...cur.curves[channel], nodes })));
  const commit = (what: string) => scope.commit(`Colour Zones ${what}`);

  /** The pointer in the canvas's layout px: the client offset scaled by the
   *  interface zoom, which getBoundingClientRect includes and layout doesn't. */
  const local = (e: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width > 0 ? g.width / r.width : 1;
    return { px: (e.clientX - r.left) * scale, py: (e.clientY - r.top) * scale };
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { px, py } = local(e);
    const { x, y } = toPlot(g, px, py);
    const cur = live();
    const nodes = cur.curves[channel].nodes;
    if (e.ctrlKey || e.metaKey) {
      // darktable adds on Ctrl+click only away from every node, unless editing
      // by area.
      if (!editByArea && nearestNode(nodes, x, y) >= 0) return;
      const onCurve = curveOf({ ...cur, strength: 0 }, channel)(x);
      const added = addNode(nodes, x, onCurve, cur.selectBy);
      if (added) {
        write(added.nodes, cur);
        setHover(added.index);
        commit("add node");
      }
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (editByArea) {
      const k = belowPlot(g, py) ? nearestX(nodes, x) : -1;
      setXMove(k);
      dragRef.current = { node: k, dx: k >= 0 ? nodes[k].x - x : 0, dy: 0, moved: false, added: false, area: k < 0 };
      return;
    }
    const k = nearestNode(nodes, x, y);
    dragRef.current =
      k >= 0
        ? { node: k, dx: nodes[k].x - x, dy: nodes[k].y - y, moved: false, added: false, area: false }
        : { node: -1, dx: 0, dy: 0, moved: false, added: false, area: false };
    setHover(k);
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const { px, py } = local(e);
    const { x, y } = toPlot(g, px, py);
    const cur = live();
    const nodes = cur.curves[channel].nodes;
    const drag = dragRef.current;
    if (editByArea) {
      setMouse({ x, y });
      if (!drag) {
        setXMove(belowPlot(g, py) ? nearestX(nodes, x) : -1);
        return;
      }
      if (drag.area) {
        write(areaEdit(nodes, x, y, store().getState().radius), cur);
        drag.moved = true;
        return;
      }
      const n = nodes[drag.node];
      const next = moveNode(nodes, drag.node, x + drag.dx, n.y, cur.selectBy);
      if (next === nodes) return;
      write(next, cur);
      drag.moved = true;
      return;
    }
    if (!drag) {
      setHover(nearestNode(nodes, x, y));
      return;
    }
    if (drag.node < 0) {
      const added = addNode(nodes, x, y, cur.selectBy);
      if (!added) return;
      write(added.nodes, cur);
      drag.node = added.index;
      drag.added = true;
      setHover(added.index);
      return;
    }
    const next = moveNode(nodes, drag.node, x + drag.dx, y + drag.dy, cur.selectBy);
    if (next === nodes) return;
    write(next, cur);
    drag.moved = true;
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (drag?.added) commit("add node");
    else if (drag?.area && drag.moved) commit("edit by area");
    else if (drag?.moved) commit("move node");
  };

  const onDoubleClick = () => {
    dragRef.current = null;
    const cur = live();
    scope.setParams(bagPatch(withCurve(cur, channel, defaultCurve(cur.selectBy))));
    setHover(-1);
    commit("reset curve");
  };

  const onContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (editByArea) return;
    const { px, py } = local(e);
    const { x, y } = toPlot(g, px, py);
    const cur = live();
    const nodes = cur.curves[channel].nodes;
    const k = nearestNode(nodes, x, y);
    if (k < 0) return;
    if (e.ctrlKey || e.metaKey) {
      write(resetNodeY(nodes, k), cur);
      commit("reset node");
    } else {
      write(removeNode(nodes, k), cur);
      setHover(-1);
      commit("remove node");
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const step = { ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP], ArrowRight: [KEY_STEP, 0], ArrowLeft: [-KEY_STEP, 0] }[e.key];
    const cur = live();
    const nodes = cur.curves[channel].nodes;
    const k = editByArea ? xMoveRef.current : hoverRef.current;
    if (!step || k < 0 || k >= nodes.length) return;
    e.preventDefault();
    const n = nodes[k];
    const next = moveNode(nodes, k, n.x + step[0], n.y + step[1], cur.selectBy);
    if (next === nodes) return;
    write(next, cur);
    commit("move node");
  };

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        aria-label={`${CHANNEL_NAMES[channel]} curve`}
        tabIndex={0}
        style={{ display: "block", width: "100%", height: g.height, cursor: "crosshair", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          if (dragRef.current) return;
          setHover(-1);
          setMouse(null);
          setXMove(-1);
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
