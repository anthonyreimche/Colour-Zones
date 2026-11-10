// The curves and the per-pixel maths against darktable's own color zones
// (test/reference: darktable 5.6.1's splines.cpp and colorzones.c compiled
// as they are). darktable samples each curve into a 65536-entry table of
// 16-bit values and interpolates it; the port evaluates the spline where the
// table is read and rounds it as the table does, so the two agree to one
// table step (1/65536). A pixel then agrees to what one step does to it: a
// step of the lightness curve is 4·ln 2 steps of L, relative; of the chroma
// curve, two steps of C; of the hue curve, a 2π step turn of a and b.
// Outside [0, 1] darktable's lookup extrapolates its end entries with weights
// in the hundreds, which costs float up to about 1e-4 of the value:
// selectors there, and the pixels whose selector lands there (below L 0 in
// smooth mode by lightness), get that much room.

import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  CHANNEL_LIST,
  DEFAULT_PARAMS,
  INTERPOLATIONS,
  MODES,
  curveAt,
  defaultNodes,
  isIdle,
  labFromLinearSrgb,
  linearSrgbFromLab,
  processLab,
  processPixel,
  resetParams,
  withCurve,
  type Curve,
  type Vec3,
} from "../src/model";
import { dtCases, dtLab, dtPresets, dtSelects, paramsOf, type DtCase } from "./support/dt-vectors";

const TABLE_STEP = 1 / 65536;
const STEPS = 1.01;
const EXTRAPOLATION_NOISE = 2e-4;

const all: DtCase[] = [...dtCases, ...dtPresets];
const lab = dtLab;

describe("curveAt against darktable's table lookup", () => {
  for (const c of all) {
    it(c.name, () => {
      const p = paramsOf(c);
      for (const ch of CHANNEL_LIST) {
        let inside = 0;
        let outside = 0;
        dtSelects.forEach((s, i) => {
          const d = Math.abs(curveAt(p, ch, s) - c.curves[ch].lookup[i]);
          if (s >= 0 && s <= 1) inside = Math.max(inside, d);
          else outside = Math.max(outside, d);
        });
        expect(inside).toBeLessThanOrEqual(TABLE_STEP * STEPS);
        expect(outside).toBeLessThan(EXTRAPOLATION_NOISE);
      }
    });
  }
});

describe("processLab against darktable's process_v3 (smooth) and process_v1 (strong)", () => {
  for (const c of all) {
    it(c.name, () => {
      const p = paramsOf(c);
      for (let i = 0; i < lab.length; i += 3) {
        const input: Vec3 = [lab[i], lab[i + 1], lab[i + 2]];
        const want: Vec3 = [c.out[i], c.out[i + 1], c.out[i + 2]];
        const got = processLab(p, input);
        // One table step per curve, or the extrapolation's float noise.
        const outside = c.selectBy === CHANNELS.lightness && c.mode === MODES.smooth && input[0] < 0;
        const step = outside ? EXTRAPOLATION_NOISE : 2 * TABLE_STEP;
        const lTol = 4 * Math.LN2 * step * Math.abs(want[0]) + 2e-6 * Math.abs(input[0]) + 1e-6;
        const chroma = Math.max(Math.hypot(input[1], input[2]), Math.hypot(want[1], want[2]));
        const abTol = (2 + 2 * Math.PI) * step * chroma * 2 + 2e-6 * chroma + 1e-6;
        const at = `pixel ${i / 3} (${input.join(", ")})`;
        expect(Math.abs(got[0] - want[0]), `${at} L`).toBeLessThanOrEqual(lTol);
        expect(Math.abs(got[1] - want[1]), `${at} a`).toBeLessThanOrEqual(abTol);
        expect(Math.abs(got[2] - want[2]), `${at} b`).toBeLessThanOrEqual(abTol);
      }
    });
  }
});

describe("hue's periodic wrap", () => {
  it("treats a node at x = 1 as the same hue as x = 0, on every curve", () => {
    const at1: Curve = { interpolation: INTERPOLATIONS.centripetal, nodes: [{ x: 0.1, y: 0.7 }, { x: 0.5, y: 0.4 }, { x: 1, y: 0.6 }] };
    const at0: Curve = { interpolation: INTERPOLATIONS.centripetal, nodes: [{ x: 0, y: 0.6 }, { x: 0.1, y: 0.7 }, { x: 0.5, y: 0.4 }] };
    for (const ch of CHANNEL_LIST) {
      const a = withCurve(DEFAULT_PARAMS, ch, at1);
      const b = withCurve(DEFAULT_PARAMS, ch, at0);
      for (const x of [0, 0.05, 0.3, 0.7, 0.95, 0.999]) expect(curveAt(a, ch, x)).toBeCloseTo(curveAt(b, ch, x), 6);
    }
  });
});

describe("defaults", () => {
  it("are darktable's: select by hue, smooth, mix 0, three centripetal curves of two flat nodes", () => {
    const curve = { interpolation: INTERPOLATIONS.centripetal, nodes: [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }] };
    expect(DEFAULT_PARAMS).toEqual({ selectBy: CHANNELS.hue, mode: MODES.smooth, strength: 0, curves: [curve, curve, curve] });
  });

  it("put the two nodes on the ends for lightness and chroma, a period apart for hue", () => {
    expect(defaultNodes(CHANNELS.lightness)).toEqual([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]);
    expect(defaultNodes(CHANNELS.chroma)).toEqual([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]);
    expect(defaultNodes(CHANNELS.hue)).toEqual([{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }]);
  });

  it("reset every curve for the axis, as _reset_parameters does", () => {
    const p = resetParams(CHANNELS.chroma);
    expect(p.selectBy).toBe(CHANNELS.chroma);
    for (const c of p.curves) expect(c.nodes).toEqual(defaultNodes(CHANNELS.chroma));
  });
});

describe("isIdle", () => {
  it("is true while every node of every curve sits on the centre line, whatever the mix", () => {
    expect(isIdle(DEFAULT_PARAMS)).toBe(true);
    expect(isIdle({ ...DEFAULT_PARAMS, strength: 150, mode: MODES.strong })).toBe(true);
  });

  it("is false once a node of any curve leaves it", () => {
    for (const ch of CHANNEL_LIST) {
      const p = withCurve(DEFAULT_PARAMS, ch, { interpolation: INTERPOLATIONS.centripetal, nodes: [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.51 }] });
      expect(isIdle(p)).toBe(false);
    }
  });

  it("leaves pixels alone at the defaults", () => {
    const px: Vec3 = [0.3, 0.12, 0.05];
    expect(processPixel(DEFAULT_PARAMS, px)).toEqual(px);
  });
});

describe("Lab", () => {
  it("round-trips linear Rec.709 through D50 Lab", () => {
    const rgb: Vec3 = [0.42, 0.13, 0.77];
    const back = linearSrgbFromLab(labFromLinearSrgb(rgb));
    back.forEach((v, i) => expect(v).toBeCloseTo(rgb[i], 10));
  });
});

describe("processPixel", () => {
  const flat = (y: number): Curve => ({ interpolation: INTERPOLATIONS.centripetal, nodes: [{ x: 0, y }, { x: 1, y }] });

  it("desaturates a display pixel to its own grey when the chroma curve is at 0", () => {
    const p = withCurve(resetParams(CHANNELS.lightness), CHANNELS.chroma, flat(0));
    const out = processPixel(p, [0.8, 0.3, 0.2]);
    expect(Math.abs(out[0] - out[1])).toBeLessThan(1e-4);
    expect(Math.abs(out[1] - out[2])).toBeLessThan(1e-4);
  });

  it("doubles L when the lightness curve is at 0.75, and turns hue half way at 1", () => {
    const lighter = withCurve(resetParams(CHANNELS.lightness), CHANNELS.lightness, flat(0.75));
    // The table holds 0.75 as 49151/65536: 2^(4 · 0.249985).
    expect(processLab(lighter, [40, 10, 5])[0]).toBeCloseTo(40 * 2 ** (4 * (49151 / 65536 - 0.5)), 9);
    const turned = withCurve(resetParams(CHANNELS.lightness), CHANNELS.hue, flat(1));
    const [, a, b] = processLab(turned, [40, 10, 5]);
    // 1 is stored as 65535/65536, a hair short of half a turn.
    expect(a).toBeCloseTo(-10, 2);
    expect(b).toBeCloseTo(-5, 2);
  });

  it("keeps values past white unclipped", () => {
    const p = withCurve(resetParams(CHANNELS.lightness), CHANNELS.chroma, flat(0.6));
    const out = processPixel(p, [1.4, 1.2, 1.1]);
    expect(Math.max(...out)).toBeGreaterThan(1.2);
  });
});
