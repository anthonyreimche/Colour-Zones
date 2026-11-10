// The param-bag contract: darktable's color zones params under the stage's
// qualified keys, each curve a vec4[20] uniform of its nodes beside their
// solved knots, counts and interpolations as ivec3s. A value of the wrong
// type or out of range reads as its default, key by key, as the GPU binds it.

import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  CHANNEL_LIST,
  DEFAULT_PARAMS,
  INTERPOLATIONS,
  MAX_NODES,
  MODES,
  curveAt,
  processLab,
  withCurve,
  type Curve,
  type Params,
  type Vec3,
} from "../src/model";
import { CURVE_KEYS, NODE_STRIDE, PARAM_KEYS, STAGE_ID, bagPatch, qualified, readParams, resetPatch } from "../src/params";
import { dtCases, dtLab, dtPresets, dtSelects, paramsOf } from "./support/dt-vectors";
import { readCurve, shaderLab } from "./support/shader-mirror";

const edited: Params = {
  selectBy: CHANNELS.lightness,
  mode: MODES.strong,
  strength: -40,
  curves: [
    { interpolation: INTERPOLATIONS.cubic, nodes: [{ x: 0, y: 0.6 }, { x: 1, y: 0.45 }] },
    { interpolation: INTERPOLATIONS.monotone, nodes: [{ x: 0, y: 0.3 }, { x: 0.4, y: 0.8 }, { x: 1, y: 0.5 }] },
    { interpolation: INTERPOLATIONS.centripetal, nodes: [{ x: 0.5, y: 0.55 }] },
  ],
};

describe("bagPatch", () => {
  it("writes every key under the stage id", () => {
    const patch = bagPatch(DEFAULT_PARAMS);
    expect(Object.keys(patch).sort()).toEqual(PARAM_KEYS.map(qualified).sort());
    expect(PARAM_KEYS.map(qualified).every((k) => k.startsWith(`${STAGE_ID}.`))).toBe(true);
  });

  it("writes the counts and interpolations per curve, lightness, chroma, hue", () => {
    const patch = bagPatch(edited);
    expect(patch[qualified("count")]).toEqual([2, 3, 1]);
    expect(patch[qualified("interpolation")]).toEqual([INTERPOLATIONS.cubic, INTERPOLATIONS.monotone, INTERPOLATIONS.centripetal]);
  });

  it("writes each node's x and y in node order, the last repeated through the unused entries", () => {
    const flat = bagPatch(edited)[qualified("curveC")] as number[];
    expect(flat).toHaveLength(NODE_STRIDE * MAX_NODES);
    const xy = (k: number) => [flat[NODE_STRIDE * k], flat[NODE_STRIDE * k + 1]];
    expect([xy(0), xy(1), xy(2)]).toEqual([[0, 0.3], [0.4, 0.8], [1, 0.5]]);
    for (let k = 3; k < MAX_NODES; k++) expect(flat.slice(NODE_STRIDE * k, NODE_STRIDE * k + 4)).toEqual(flat.slice(8, 12));
  });

  it("keeps a hue node at x = 1 in its place, its knot beside it", () => {
    const p = withCurve(DEFAULT_PARAMS, CHANNELS.chroma, {
      interpolation: INTERPOLATIONS.centripetal,
      nodes: [{ x: 0.25, y: 0.7 }, { x: 0.5, y: 0.4 }, { x: 1, y: 0.6 }],
    });
    const flat = bagPatch(p)[qualified("curveC")] as number[];
    expect([flat[0], flat[1], flat[2]]).toEqual([0.25, 0.7, 0.7]);
    expect([flat[8], flat[9], flat[10]]).toEqual([1, 0.6, 0.6]);
  });

  it("marks the stage active once any node of any curve leaves the centre line", () => {
    expect(bagPatch(DEFAULT_PARAMS)[qualified("active")]).toBe(0);
    for (const ch of CHANNEL_LIST) {
      const curve: Curve = { interpolation: INTERPOLATIONS.centripetal, nodes: [{ x: 0.3, y: 0.52 }] };
      expect(bagPatch(withCurve(DEFAULT_PARAMS, ch, curve))[qualified("active")]).toBe(1);
    }
  });

  // The shader only evaluates the knots, in node order. Read the shader's way,
  // the bag must give the CPU curve (hence darktable's) at every selector.
  describe("read the shader's way, gives the model's curves", () => {
    for (const c of [...dtCases, ...dtPresets]) {
      it(c.name, () => {
        const p = paramsOf(c);
        const bag = bagPatch(p);
        const counts = bag[qualified("count")] as number[];
        for (const ch of CHANNEL_LIST) {
          const flat = bag[qualified(CURVE_KEYS[ch])] as number[];
          for (const s of dtSelects) {
            const v = Math.min(Math.max(s * (65536 / 65535), 0), 1);
            const gpu = readCurve(flat, counts[ch], p.selectBy === CHANNELS.hue, v);
            expect(Math.abs(gpu - curveAt(p, ch, s)), `${["L", "C", "h"][ch]} at ${s}`).toBeLessThanOrEqual(1 / 65536);
          }
        }
      });
    }
  });

  // The whole inline block, from the bag, against the model, which
  // model.test.ts holds to darktable's pixels. The shader takes a colour
  // without chroma as hue 0; darktable's atan2 tells a = -0 from a = +0,
  // which a shader can't, so those pixels are left out.
  describe("the shader's pixel path, from the bag, gives the model's pixels", () => {
    for (const c of [...dtCases, ...dtPresets]) {
      it(c.name, () => {
        const bag = bagPatch(paramsOf(c));
        for (let i = 0; i < dtLab.length; i += 3) {
          const input: Vec3 = [dtLab[i], dtLab[i + 1], dtLab[i + 2]];
          if (input[1] === 0 && input[2] === 0) continue;
          const got = shaderLab(bag, input);
          const want = processLab(paramsOf(c), input);
          for (let k = 0; k < 3; k++) expect(Math.abs(got[k] - want[k]), `pixel ${i / 3} channel ${k}`).toBeLessThan(1e-9 * (1 + Math.abs(want[k])));
        }
      });
    }
  });
});

describe("readParams", () => {
  it("round-trips bagPatch", () => {
    expect(readParams(bagPatch(edited))).toEqual(edited);
    expect(readParams(bagPatch(DEFAULT_PARAMS))).toEqual(DEFAULT_PARAMS);
  });

  it("reads an empty bag as the defaults", () => {
    expect(readParams({})).toEqual(DEFAULT_PARAMS);
  });

  it("reads values of the wrong type or out of range as their defaults", () => {
    const bag = {
      ...bagPatch(edited),
      [qualified("selectBy")]: 3,
      [qualified("mode")]: "strong",
      [qualified("strength")]: Number.NaN,
      [qualified("interpolation")]: [1.5, 7, 0],
    };
    const p = readParams(bag);
    expect(p.selectBy).toBe(DEFAULT_PARAMS.selectBy);
    expect(p.mode).toBe(DEFAULT_PARAMS.mode);
    expect(p.strength).toBe(DEFAULT_PARAMS.strength);
    expect(p.curves.map((c) => c.interpolation)).toEqual([INTERPOLATIONS.centripetal, INTERPOLATIONS.centripetal, INTERPOLATIONS.cubic]);
    expect(p.curves.map((c) => c.nodes)).toEqual(edited.curves.map((c) => c.nodes));
  });

  it("clamps each count to 1..20, taking the nodes the GPU would", () => {
    const flat = bagPatch(edited)[qualified("curveC")];
    const read = (count: number) => readParams({ [qualified("curveC")]: flat, [qualified("count")]: [2, count, 2] }).curves[1].nodes;
    expect(read(0)).toEqual([edited.curves[1].nodes[0]]);
    expect(read(2)).toEqual(edited.curves[1].nodes.slice(0, 2));
    // Twenty entries of a three-node curve repeat its last node: not a curve.
    expect(read(99)).toEqual(DEFAULT_PARAMS.curves[1].nodes);
  });

  it("falls back to a curve's default nodes when its stored ones are malformed", () => {
    const bag = { ...bagPatch(edited), [qualified("curveH")]: [0, 1, 2] };
    const p = readParams(bag);
    expect(p.curves[CHANNELS.hue].nodes).toEqual(DEFAULT_PARAMS.curves[CHANNELS.hue].nodes);
    expect(p.curves[CHANNELS.chroma].nodes).toEqual(edited.curves[CHANNELS.chroma].nodes);
  });

  it("reads nodes out of [0, 1] or out of order, from a hand-edited bag, as the default curve", () => {
    const flat = [...(bagPatch(edited)[qualified("curveC")] as number[])];
    flat[4] = -0.1;
    expect(readParams({ ...bagPatch(edited), [qualified("curveC")]: flat }).curves[CHANNELS.chroma].nodes).toEqual(DEFAULT_PARAMS.curves[CHANNELS.chroma].nodes);
    flat[4] = 0.4;
    flat[8] = 0.2;
    expect(readParams({ ...bagPatch(edited), [qualified("curveC")]: flat }).curves[CHANNELS.chroma].nodes).toEqual(DEFAULT_PARAMS.curves[CHANNELS.chroma].nodes);
  });

  it("clamps the mix to darktable's ±200 %", () => {
    expect(readParams({ [qualified("strength")]: 900 }).strength).toBe(200);
    expect(readParams({ [qualified("strength")]: -900 }).strength).toBe(-200);
  });
});

describe("resetPatch", () => {
  it("is the defaults' patch", () => {
    expect(resetPatch()).toEqual(bagPatch(DEFAULT_PARAMS));
  });
});
