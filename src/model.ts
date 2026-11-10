// darktable's color zones, reimplemented. darktable's `colorzones` IOP
// (GPL-3.0) selects each pixel by its Lab lightness, chroma or hue, reads
// three curves there and changes the pixel's lightness, chroma and hue by
// them.
//
// Each curve's y is 0.5 for no change. The lightness curve scales L by
// 2^(4(y − 0.5)), two stops either way; the chroma curve scales C by 2y; the
// hue curve turns h by y − 0.5 of a turn. The mix (darktable's "strength")
// stretches every node away from 0.5 by mix/100 before the splines are
// built. Smooth mode (process_v3) selects by L/100, C/128 or hue, and when
// selecting by hue it fades the lightness and hue curves out towards grey;
// strong mode (process_v1) selects by L/100, C/(128√2) or hue through LCh,
// clamped to [0, 1], and applies every curve in full. darktable samples each
// curve into a 65536-entry table of 16-bit values and interpolates it; the
// port evaluates the spline where the table would be read, which agrees to
// the table's step.
//
// References: darktable 5.6.1 src/iop/colorzones.c (params version 5,
// splines version 2), src/common/splines.cpp, src/gui/draw.h, and
// src/common/colorspaces_inline_conversions.h (dt_Lab_2_LCH, Lab and D50).

import { INTERPOLATIONS, splineFrom, splineKnots, type Interpolation, type SplineKnots } from "./spline";

export { INTERPOLATIONS, type Interpolation } from "./spline";

/** The three curves, and the three axes a pixel can be selected by. */
export const CHANNELS = Object.freeze({ lightness: 0, chroma: 1, hue: 2 } as const);
export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];
export const CHANNEL_LIST: readonly Channel[] = [CHANNELS.lightness, CHANNELS.chroma, CHANNELS.hue];

export const MODES = Object.freeze({ smooth: 0, strong: 1 } as const);
export type Mode = (typeof MODES)[keyof typeof MODES];

/** DT_IOP_COLORZONES_MAXNODES. */
export const MAX_NODES = 20;
/** darktable's "mix" range, in %. */
export const STRENGTH_LIMIT = 200;

export interface CurveNode {
  x: number;
  y: number;
}

export interface Curve {
  interpolation: Interpolation;
  /** Sorted by x, x in [0, 1], y in [0, 1]; 1 to MAX_NODES of them. */
  nodes: readonly CurveNode[];
}

export type Curves = readonly [Curve, Curve, Curve];

export interface Params {
  selectBy: Channel;
  mode: Mode;
  /** darktable's "mix", −200..200 %. */
  strength: number;
  /** Indexed by Channel: lightness, chroma, hue. */
  curves: Curves;
}

export type Vec3 = readonly [number, number, number];

/** _reset_nodes for two nodes: on the ends of an open axis, a period apart
 *  around hue's. */
export function defaultNodes(selectBy: Channel): CurveNode[] {
  return selectBy === CHANNELS.hue
    ? [
        { x: 0.25, y: 0.5 },
        { x: 0.75, y: 0.5 },
      ]
    : [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ];
}

/** A curve as _reset_parameters leaves it: two flat nodes, centripetal. */
export function defaultCurve(selectBy: Channel): Curve {
  return { interpolation: INTERPOLATIONS.centripetal, nodes: defaultNodes(selectBy) };
}

/** _reset_parameters: every curve reset for the axis, mix 0, smooth. */
export function resetParams(selectBy: Channel): Params {
  return {
    selectBy,
    mode: MODES.smooth,
    strength: 0,
    curves: [defaultCurve(selectBy), defaultCurve(selectBy), defaultCurve(selectBy)],
  };
}

function deepFreeze(p: Params): Readonly<Params> {
  for (const c of p.curves) {
    for (const n of c.nodes) Object.freeze(n);
    Object.freeze(c.nodes);
    Object.freeze(c);
  }
  Object.freeze(p.curves);
  return Object.freeze(p);
}

/** init(): _reset_parameters(DT_IOP_COLORZONES_h, splines version 2). */
export const DEFAULT_PARAMS: Readonly<Params> = deepFreeze(resetParams(CHANNELS.hue));

/** Replaces one curve. */
export function withCurve(p: Params, channel: Channel, curve: Curve): Params {
  const curves = [...p.curves] as [Curve, Curve, Curve];
  curves[channel] = curve;
  return { ...p, curves };
}

/** Every node of every curve on the centre line: each curve is 0.5
 *  everywhere, whatever the mix, and the stage leaves pixels alone. */
export const isIdle = (p: Params): boolean => p.curves.every((c) => c.nodes.every((n) => n.y === 0.5));

/** commit_params' strength(): y + (y − 0.5) · mix / 100. */
export const strengthen = (y: number, strength: number): number => y + (y - 0.5) * (strength / 100);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** darktable's lookup() reads table entry 65536·s, which was sampled at
 *  x = entry / 65535, and clamps the entry to the table: the curve is read
 *  at s · 65536/65535, held at its ends outside [0, 1]. */
export const TABLE_STRETCH = 65536 / 65535;

/** The table holds round(y · 65535) and reads it back over 65536
 *  (dt_draw_curve_smaple_values), so 0.5 stays exactly 0.5. */
export const quantize = (y: number): number => Math.round(y * 65535) / 65536;

/** One curve's spline, solved: its nodes with the mix applied, periodic when
 *  selecting by hue (all three curves are, as darktable's commit_params
 *  builds them). The stage reads these from the bag (params.ts). */
export function curveKnots(p: Params, channel: Channel): SplineKnots {
  const c = p.curves[channel];
  const knots = c.nodes.map((n) => ({ x: n.x, y: strengthen(n.y, p.strength) }));
  return splineKnots(knots, c.interpolation, p.selectBy === CHANNELS.hue);
}

/** One curve as drawn: curveKnots' spline, clamped to [0, 1]. */
export function curveOf(p: Params, channel: Channel): (x: number) => number {
  const s = splineFrom(curveKnots(p, channel), p.selectBy === CHANNELS.hue);
  return (x) => clamp01(s(x));
}

/** One curve as the stage reads it for selector `s`. */
export function curveAt(p: Params, channel: Channel, s: number): number {
  return quantize(curveOf(p, channel)(clamp01(s * TABLE_STRETCH)));
}

const TWO_PI = 2 * Math.PI;
const STRONG_C = 1 / (128 * Math.SQRT2);

/** dt_Lab_2_LCH's hue: atan2 / 2π when positive, 1 − |atan2| / 2π otherwise. */
export function lchHue(a: number, b: number): number {
  const t = Math.atan2(b, a);
  return t > 0 ? t / TWO_PI : 1 - Math.abs(t) / TWO_PI;
}

/** Where a Lab colour sits on the select-by axis, as strong mode, the picker
 *  and the graph read it: L/100, C/(128√2) or hue, unclamped. */
export function axisPosition(selectBy: Channel, [L, a, b]: Vec3): number {
  if (selectBy === CHANNELS.lightness) return L * 0.01;
  if (selectBy === CHANNELS.chroma) return Math.hypot(a, b) * STRONG_C;
  return lchHue(a, b);
}

/** The selector process_v3 (smooth) or process_v1 (strong) reads the curves at. */
export function selector(p: Params, lab: Vec3): number {
  if (p.mode === MODES.strong) return clamp01(axisPosition(p.selectBy, lab));
  const [L, a, b] = lab;
  if (p.selectBy === CHANNELS.lightness) return Math.min(1, L / 100);
  if (p.selectBy === CHANNELS.chroma) return Math.min(1, Math.hypot(a, b) / 128);
  return ((Math.atan2(b, a) + TWO_PI) % TWO_PI) / TWO_PI;
}

/** One Lab pixel through the three curves: process_v3 in smooth mode,
 *  process_v1 in strong. */
export function processLab(p: Params, lab: Vec3): Vec3 {
  const [L, a, b] = lab;
  const s = selector(p, lab);
  const lut = (channel: Channel) => curveAt(p, channel, s);
  const C = Math.hypot(a, b);
  if (p.mode === MODES.strong) {
    const h = lchHue(a, b) + lut(CHANNELS.hue) - 0.5;
    const C2 = C * 2 * lut(CHANNELS.chroma);
    return [L * Math.pow(2, 4 * (lut(CHANNELS.lightness) - 0.5)), Math.cos(TWO_PI * h) * C2, Math.sin(TWO_PI * h) * C2];
  }
  const h = ((Math.atan2(b, a) + TWO_PI) % TWO_PI) / TWO_PI;
  const blend = p.selectBy === CHANNELS.hue ? (1 - C / 128) ** 2 : 0;
  const Lm = blend * 0.5 + (1 - blend) * lut(CHANNELS.lightness) - 0.5;
  const hm = blend * 0.5 + (1 - blend) * lut(CHANNELS.hue) - 0.5;
  const Cm = 2 * lut(CHANNELS.chroma);
  return [L * Math.pow(2, 4 * Lm), Math.cos(TWO_PI * (h + hm)) * Cm * C, Math.sin(TWO_PI * (h + hm)) * Cm * C];
}

// ── transfer functions (the host shader's srgbToLinear / linearToSrgb) ───────

export function srgbToLinear(v: number): number {
  return v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** srgbToLinear on |v| with the sign put back and no ceiling: the host's
 *  curve on [0, 1], and display values past white or below black keep their
 *  meaning. */
export function decodePerceptual(v: number): number {
  return Math.sign(v) * srgbToLinear(Math.abs(v));
}

/** linearToSrgb's curve on |v| with the sign put back and no ceiling. */
export function encodePerceptual(v: number): number {
  const a = Math.abs(v);
  return Math.sign(v) * (a < 0.0031308 ? a * 12.92 : 1.055 * Math.pow(a, 1 / 2.4) - 0.055);
}

// ── Lab, D50 (colorspaces_inline_conversions.h) ──────────────────────────────

/** darktable's `d50`. */
export const D50_WHITE: Vec3 = [0.9642, 1.0, 0.8249];

/** `sRGB_to_xyz_transposed` read row-major: linear Rec.709 → XYZ D50. */
export const SRGB_TO_XYZ_D50: readonly number[] = [
  0.4360747, 0.3850649, 0.1430804,
  0.2225045, 0.7168786, 0.0606169,
  0.0139322, 0.0971045, 0.7141733,
];

function invert3(m: readonly number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

/** XYZ D50 → linear Rec.709: the exact inverse of SRGB_TO_XYZ_D50, so the
 *  round trip is exact rather than a second rounded table. */
export const XYZ_D50_TO_SRGB: readonly number[] = invert3(SRGB_TO_XYZ_D50);

export const LAB_EPSILON = 216 / 24389;
export const LAB_KAPPA = 24389 / 27;
/** lab_f_inv's threshold: cbrt(epsilon), darktable's 0.20689655172413796f. */
export const LAB_CBRT_EPSILON = Math.cbrt(LAB_EPSILON);

function mul3(m: readonly number[], v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

const labF = (t: number): number => (t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116);
const labFInv = (f: number): number => (f > LAB_CBRT_EPSILON ? f * f * f : (116 * f - 16) / LAB_KAPPA);

export function labFromLinearSrgb(rgb: Vec3): Vec3 {
  const xyz = mul3(SRGB_TO_XYZ_D50, rgb);
  const fx = labF(xyz[0] / D50_WHITE[0]);
  const fy = labF(xyz[1] / D50_WHITE[1]);
  const fz = labF(xyz[2] / D50_WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function linearSrgbFromLab([L, a, b]: Vec3): Vec3 {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  return mul3(XYZ_D50_TO_SRGB, [labFInv(fx) * D50_WHITE[0], labFInv(fy) * D50_WHITE[1], labFInv(fz) * D50_WHITE[2]]);
}

/** A display-encoded colour in D50 Lab, as the stage reads it. */
export function labFromDisplay(c: Vec3): Vec3 {
  return labFromLinearSrgb([decodePerceptual(c[0]), decodePerceptual(c[1]), decodePerceptual(c[2])]);
}

/** The whole per-pixel path the shader runs on a display-encoded pixel:
 *  decode, Lab, the curves, back, encode, signed and unclipped as darktable's
 *  Lab modules are. Idle params return the pixel as it came. */
export function processPixel(p: Params, c: Vec3): Vec3 {
  if (isIdle(p)) return c;
  const rgb = linearSrgbFromLab(processLab(p, labFromDisplay(c)));
  return [encodePerceptual(rgb[0]), encodePerceptual(rgb[1]), encodePerceptual(rgb[2])];
}
