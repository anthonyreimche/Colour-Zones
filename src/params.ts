// The param-bag contract: darktable's color zones params under the stage's
// qualified keys, as the GPU uniforms take them. Each curve is one vec4[20]
// array, a node per entry in node order: its x and y, then the spline's
// knot there, solved from the params (the y with the mix applied, and the
// tangent). The shader only evaluates the knots: Direct3D 11 can't link the
// tangent solvers per pixel. The node counts and interpolations are ivec3s,
// lightness, chroma, hue. `active` is 0 while every node sits on the centre
// line, which lets the renderer leave the stage out of the program.
//
// The derived values are never read back; every writer goes through
// bagPatch, so presets, copy and paste and masks carry knots that match the
// nodes beside them. A value of the wrong type or out of range reads as its
// default, key by key, as the GPU binds it, so the panel and the shader see
// the same curves.

import {
  CHANNELS,
  CHANNEL_LIST,
  DEFAULT_PARAMS,
  INTERPOLATIONS,
  MAX_NODES,
  MODES,
  STRENGTH_LIMIT,
  curveKnots,
  isIdle,
  type Channel,
  type Curve,
  type CurveNode,
  type Interpolation,
  type Params,
} from "./model";

export const EXT_ID = "colour-zones";
export const STAGE_ID = `${EXT_ID}.lab`;

/** The curve arrays' keys, by channel. */
export const CURVE_KEYS = ["curveL", "curveC", "curveH"] as const;

export const PARAM_KEYS = ["selectBy", "mode", "strength", "active", "count", "interpolation", ...CURVE_KEYS] as const;
export type ParamKey = (typeof PARAM_KEYS)[number];

export const qualified = (key: ParamKey): string => `${STAGE_ID}.${key}`;

type BagValue = number | number[];

/** Floats per node in a curve array: x, y, knot y, tangent. */
export const NODE_STRIDE = 4;

/** One curve as its uniform holds it: each of its 1 to MAX_NODES nodes with
 *  its solved knot, the last repeated through the unused entries. The spline solver wraps hue's
 *  nodes into [0, 1) and sorts them, which only moves a node at x = 1 to the
 *  front; its knot is put back beside its node, as evaluating the period in
 *  node order gives the same pieces. */
export function curveArray(p: Params, channel: Channel): number[] {
  const nodes = p.curves[channel].nodes;
  const knots = curveKnots(p, channel);
  const periodic = p.selectBy === CHANNELS.hue;
  const wrapped = nodes.map((n) => (periodic ? ((n.x % 1) + 1) % 1 : n.x));
  const order = nodes.map((_, i) => i).sort((i, j) => wrapped[i] - wrapped[j]);
  const knotOf = new Array<number>(nodes.length);
  order.forEach((node, k) => (knotOf[node] = k));
  return Array.from({ length: MAX_NODES }, (_, i) => {
    const node = Math.min(i, nodes.length - 1);
    const k = knotOf[node];
    return [nodes[node].x, nodes[node].y, knots.y[k], knots.dy[k]];
  }).flat();
}

export function bagPatch(p: Params): Record<string, BagValue> {
  const patch: Record<string, BagValue> = {
    [qualified("selectBy")]: p.selectBy,
    [qualified("mode")]: p.mode,
    [qualified("strength")]: p.strength,
    [qualified("active")]: isIdle(p) ? 0 : 1,
    [qualified("count")]: p.curves.map((c) => Math.min(c.nodes.length, MAX_NODES)),
    [qualified("interpolation")]: p.curves.map((c) => c.interpolation),
  };
  for (const ch of CHANNEL_LIST) patch[qualified(CURVE_KEYS[ch])] = curveArray(p, ch);
  return patch;
}

function readChoice<T extends number>(v: unknown, choices: Readonly<Record<string, T>>, fallback: T): T {
  return Object.values(choices).find((c) => c === v) ?? fallback;
}

const isNumberArray = (v: unknown, length: number): v is number[] =>
  Array.isArray(v) && v.length === length && v.every((x) => typeof x === "number" && Number.isFinite(x));

function readCurve(bag: Readonly<Record<string, unknown>>, channel: Channel): Curve {
  const fallback = DEFAULT_PARAMS.curves[channel];
  const counts = bag[qualified("count")];
  const types = bag[qualified("interpolation")];
  const stored = bag[qualified(CURVE_KEYS[channel])];
  const interpolation = isNumberArray(types, 3)
    ? readChoice(types[channel], INTERPOLATIONS, fallback.interpolation)
    : fallback.interpolation;
  if (!isNumberArray(stored, NODE_STRIDE * MAX_NODES) || !isNumberArray(counts, 3)) return { interpolation, nodes: fallback.nodes };
  const n = Math.min(MAX_NODES, Math.max(1, Math.round(counts[channel])));
  const nodes: CurveNode[] = [];
  for (let k = 0; k < n; k++) nodes.push({ x: stored[NODE_STRIDE * k], y: stored[NODE_STRIDE * k + 1] });
  // Only bagPatch writes these, from nodes the editor keeps in order; nodes
  // out of [0, 1] or out of order (a hand-edited bag) read as the default.
  const ordered = nodes.every((nd, k) => nd.x >= 0 && nd.x <= 1 && nd.y >= 0 && nd.y <= 1 && (k === 0 || nd.x > nodes[k - 1].x));
  return { interpolation: interpolation as Interpolation, nodes: ordered ? nodes : fallback.nodes };
}

/** `bag` is the host's untyped per-photo bag (any extension writes to it). */
export function readParams(bag: Readonly<Record<string, unknown>>): Params {
  const strength = bag[qualified("strength")];
  return {
    selectBy: readChoice(bag[qualified("selectBy")], CHANNELS, DEFAULT_PARAMS.selectBy),
    mode: readChoice(bag[qualified("mode")], MODES, DEFAULT_PARAMS.mode),
    strength:
      typeof strength === "number" && Number.isFinite(strength)
        ? Math.min(STRENGTH_LIMIT, Math.max(-STRENGTH_LIMIT, strength))
        : DEFAULT_PARAMS.strength,
    curves: [readCurve(bag, CHANNELS.lightness), readCurve(bag, CHANNELS.chroma), readCurve(bag, CHANNELS.hue)],
  };
}

export const resetPatch = (): Record<string, BagValue> => bagPatch(DEFAULT_PARAMS);
