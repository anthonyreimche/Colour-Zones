// The stage's inline GLSL (src/stage.ts) transcribed line for line into
// TypeScript, reading only what the shader reads: the bag's uniforms. Unit
// tests can't run GLSL; this checks that what bagPatch writes, evaluated the
// way the shader evaluates it, gives darktable's result. Keep it in step with
// the shader.

import { CHANNELS, MAX_NODES, MODES, TABLE_STRETCH, type Vec3 } from "../../src/model";
import { NODE_STRIDE, qualified, type ParamKey } from "../../src/params";

const TWO_PI = 2 * Math.PI;
const STRONG_C = 1 / (128 * Math.SQRT2);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const glslMod = (x: number, y: number) => x - y * Math.floor(x / y);

const lchHue = (turn: number) => (turn > 0 ? turn / TWO_PI : 1 - Math.abs(turn) / TWO_PI);

const table = (y: number) => Math.floor(clamp(y, 0, 1) * 65535 + 0.5) / 65536;

type Node = [number, number, number, number];

function piece(a: Node, b: Node, h: number, v: number): number {
  const t = (v - a[0]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a[2] + (t3 - 2 * t2 + t) * h * a[3] + (-2 * t3 + 3 * t2) * b[2] + (t3 - t2) * h * b[3];
}

/** curveRead: one curve at czV. */
export function readCurve(flat: readonly number[], count: number, wrap: boolean, v: number): number {
  const node = (k: number): Node => [flat[NODE_STRIDE * k], flat[NODE_STRIDE * k + 1], flat[NODE_STRIDE * k + 2], flat[NODE_STRIDE * k + 3]];
  const n = clamp(count, 1, MAX_NODES);
  let x = v;
  const first = node(0);
  const last = node(n - 1);
  let y: number;
  if (n === 1 || (!wrap && x <= first[0])) y = first[2];
  else if (!wrap && x >= last[0]) y = last[2];
  else {
    if (wrap) {
      x = glslMod(x, 1);
      if (x < first[0]) x += 1;
    }
    let above = n;
    for (let k = 0; k < n; k++) {
      if (node(k)[0] > x) {
        above = k;
        break;
      }
    }
    const i0 = wrap ? (above > 0 ? above - 1 : n - 1) : Math.min(above - 1, n - 2);
    const i1 = i0 + 1 < n ? i0 + 1 : 0;
    const a = node(i0);
    const b = node(i1);
    y = piece(a, b, i1 > i0 ? b[0] - a[0] : b[0] - (a[0] - 1), x);
  }
  return table(y);
}

/** The inline block on one Lab pixel, from the bag. */
export function shaderLab(bag: Readonly<Record<string, unknown>>, pix: Vec3): Vec3 {
  const get = (key: ParamKey) => bag[qualified(key)];
  const selectBy = get("selectBy") as number;
  const mode = get("mode") as number;
  const count = get("count") as number[];
  const [L, a, b] = pix;
  const C = Math.hypot(a, b);
  const turn = C > 0 ? Math.atan2(b, a) : 0;
  const H = glslMod(turn + TWO_PI, TWO_PI) / TWO_PI;
  const strong = mode === MODES.strong;
  let s: number;
  let blend = 0;
  if (strong) {
    s = selectBy === CHANNELS.lightness ? L * 0.01 : selectBy === CHANNELS.chroma ? C * STRONG_C : lchHue(turn);
    s = clamp(s, 0, 1);
  } else if (selectBy === CHANNELS.lightness) s = Math.min(1, L / 100);
  else if (selectBy === CHANNELS.chroma) s = Math.min(1, C / 128);
  else {
    s = H;
    blend = (1 - C / 128) * (1 - C / 128);
  }
  const v = clamp(s * TABLE_STRETCH, 0, 1);
  const wrap = selectBy === CHANNELS.hue;
  const Lm = readCurve(get("curveL") as number[], count[0], wrap, v);
  const Cm = readCurve(get("curveC") as number[], count[1], wrap, v);
  const Hm = readCurve(get("curveH") as number[], count[2], wrap, v);
  if (strong) {
    const turns = lchHue(turn) + Hm - 0.5;
    const chroma = C * 2 * Cm;
    return [L * 2 ** (4 * (Lm - 0.5)), Math.cos(TWO_PI * turns) * chroma, Math.sin(TWO_PI * turns) * chroma];
  }
  const Ls = blend * 0.5 + (1 - blend) * Lm - 0.5;
  const Hs = blend * 0.5 + (1 - blend) * Hm - 0.5;
  const chroma = 2 * Cm * C;
  return [L * 2 ** (4 * Ls), Math.cos(TWO_PI * (H + Hs)) * chroma, Math.sin(TWO_PI * (H + Hs)) * chroma];
}
