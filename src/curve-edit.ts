// Node editing as darktable's color zones does it on version 2 splines
// (colorzones.c): _add_node, _sanity_check and _move_point_internal,
// _delete_node, the hover radius of the motion handler, edit by area
// (dt_iop_colorzones_get_params and the scroll handler's radius) and the
// create-curve picker (color_picker_apply). Each returns new nodes and leaves
// its input alone; a refused edit returns null or its input as it is.

import { CHANNELS, MAX_NODES, type Channel, type CurveNode } from "./model";

/** DT_IOP_COLORZONES_MIN_X_DISTANCE. */
export const MIN_X_DISTANCE = 0.0025;
/** The motion handler's "minimum area around the node to select it", in
 *  graph units (the plot is 1 × 1). */
export const HOVER_RADIUS = 0.04;
/** DT_IOP_COLORZONES_DEFAULT_STEP: an arrow key's nudge. */
export const KEY_STEP = 0.001;
/** gui_init's mouse_radius: 1 / DT_IOP_COLORZONES_BANDS. */
export const AREA_RADIUS = 1 / 8;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** _add_node: inserts in x order, or refuses (null) a node within the
 *  minimum distance of a neighbour or past the twentieth. Selecting by hue
 *  it also refuses one within the minimum distance of the other end across
 *  the wrap, which darktable doesn't: two nodes a period apart would make a
 *  piece of zero width. */
export function addNode(
  nodes: readonly CurveNode[],
  x: number,
  y: number,
  selectBy?: Channel,
): { nodes: CurveNode[]; index: number } | null {
  if (nodes.length >= MAX_NODES) return null;
  let index = nodes.findIndex((n) => n.x > x);
  if (index === -1) index = nodes.length;
  if ((index > 0 && x - nodes[index - 1].x <= MIN_X_DISTANCE) || (index < nodes.length && nodes[index].x - x <= MIN_X_DISTANCE)) {
    return null;
  }
  if (selectBy === CHANNELS.hue && nodes.length > 0) {
    const first = nodes[0].x;
    const last = nodes[nodes.length - 1].x;
    if ((index === 0 && x + 1 - last <= MIN_X_DISTANCE) || (index === nodes.length && first + 1 - x <= MIN_X_DISTANCE)) return null;
  }
  const next = nodes.map((n) => ({ ...n }));
  next.splice(index, 0, { x, y });
  return { nodes: next, index };
}

/** _sanity_check: at least the minimum distance from both neighbours. */
function fits(nodes: readonly CurveNode[], index: number, x: number): boolean {
  const before = index > 0 ? nodes[index - 1].x : null;
  const after = index < nodes.length - 1 ? nodes[index + 1].x : null;
  return (before === null || x - before > MIN_X_DISTANCE) && (after === null || after - x > MIN_X_DISTANCE);
}

/** _move_point_internal: the node goes to (x, y) clamped to the graph, unless
 *  that brings it too close to a neighbour, when nothing moves. Selecting by
 *  hue, the end nodes also keep the minimum distance across the wrap. */
export function moveNode(nodes: readonly CurveNode[], index: number, x: number, y: number, selectBy: Channel): readonly CurveNode[] {
  let nx = clamp01(x);
  const ny = clamp01(y);
  if (!fits(nodes, index, nx)) return nodes;
  const last = nodes.length - 1;
  if (selectBy === CHANNELS.hue && last > 0) {
    if (index === 0 && nx + 1 - nodes[last].x < MIN_X_DISTANCE) nx = nodes[last].x + MIN_X_DISTANCE - 1;
    else if (index === last && nodes[0].x + 1 - nx < MIN_X_DISTANCE) nx = nodes[0].x + 1 - MIN_X_DISTANCE;
  }
  const next = nodes.map((n) => ({ ...n }));
  next[index] = { x: nx, y: ny };
  return next;
}

/** _delete_node: removes the node; the last one left is centred and flat
 *  instead. */
export function removeNode(nodes: readonly CurveNode[], index: number): CurveNode[] {
  if (nodes.length <= 1) return [{ x: 0.5, y: 0.5 }];
  return nodes.filter((_, k) => k !== index).map((n) => ({ ...n }));
}

/** _delete_node with Ctrl: the node back on the centre line. */
export function resetNodeY(nodes: readonly CurveNode[], index: number): CurveNode[] {
  return nodes.map((n, k) => (k === index ? { x: n.x, y: 0.5 } : { ...n }));
}

/** The node nearest (x, y) within HOVER_RADIUS, or -1. */
export function nearestNode(nodes: readonly CurveNode[], x: number, y: number): number {
  let best = HOVER_RADIUS * HOVER_RADIUS;
  let nearest = -1;
  nodes.forEach((n, k) => {
    const d = (x - n.x) * (x - n.x) + (y - n.y) * (y - n.y);
    if (d < best) {
      best = d;
      nearest = k;
    }
  });
  return nearest;
}

/** The node nearest x along the axis alone: the one edit by area's arrows
 *  move. */
export function nearestX(nodes: readonly CurveNode[], x: number): number {
  let nearest = 0;
  nodes.forEach((n, k) => {
    if (Math.abs(n.x - x) < Math.abs(nodes[nearest].x - x)) nearest = k;
  });
  return nearest;
}

/** dt_iop_colorzones_get_params on version 2 splines: every node pulled
 *  towards height y by a Gaussian of the distance from x, `radius` wide. One
 *  call per pointer move, as darktable does, so a slow drag pulls further. */
export function areaEdit(nodes: readonly CurveNode[], x: number, y: number, radius: number): CurveNode[] {
  return nodes.map((n) => {
    const f = Math.exp(-((x - n.x) * (x - n.x)) / (radius * radius));
    return { x: n.x, y: (1 - f) * n.y + f * y };
  });
}

/** The scroll handler's radius step: 10 % per wheel notch, between a fifth
 *  of a node's share of the axis and the whole axis. */
export function stepRadius(radius: number, notches: number, nodeCount: number): number {
  const r = radius * (1 + 0.1 * notches);
  const lo = 0.2 / nodeCount;
  return r > 1 ? 1 : r < lo ? lo : r;
}

/** Which curve the create-curve picker builds: flat, raised or lowered. */
export type PickedShape = 0 | 1 | -1;

/** color_picker_apply's create-curve branch: from the picked area's minimum,
 *  mean and maximum along the select-by axis, the curve's default nodes plus
 *  five more, feather, min, centre, max, feather, 0.02 apart at the edges,
 *  raised by 0.1 and 0.2 (or lowered) for a shaped curve. Positions outside
 *  (0, 1) are skipped, and one too close to another is refused as _add_node
 *  refuses it. */
export function curveFromPick(
  defaults: readonly CurveNode[],
  picked: { min: number; mean: number; max: number },
  shape: PickedShape,
): CurveNode[] {
  const feather = 0.02;
  const step = 0.1 * shape;
  let nodes = defaults.map((n) => ({ ...n }));
  const add = (x: number, y: number) => {
    if (!(x > 0 && x < 1)) return;
    const added = addNode(nodes, x, y);
    if (added) nodes = added.nodes;
  };
  add(picked.min - feather, 0.5);
  add(picked.min, 0.5 + step);
  add(picked.mean, 0.5 + 2 * step);
  add(picked.max, 0.5 + step);
  add(picked.max + feather, 0.5);
  return nodes;
}
