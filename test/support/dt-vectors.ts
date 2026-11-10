// darktable's output for the reference cases and presets
// (test/reference/vectors.json), typed, and each case's params as the
// extension's. Read with JSON.parse rather than imported: the bundler's JSON
// import turns darktable's -0 into 0, and atan2(0, -0) is half a turn from
// atan2(0, 0).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Channel, Curve, Params } from "../../src/model";

interface Vectors {
  lab: number[];
  selects: number[];
  cases: DtCase[];
  presets: DtCase[];
}

export interface DtCurve {
  interpolation: number;
  nodes: [number, number][];
  lookup: number[];
}

export interface DtCase {
  name: string;
  selectBy: number;
  mode: number;
  strength: number;
  curves: DtCurve[];
  out: number[];
}

const vectors = JSON.parse(readFileSync(resolve(process.cwd(), "test/reference/vectors.json"), "utf8")) as Vectors;

export const dtCases = vectors.cases;
export const dtPresets = vectors.presets;
export const dtLab = vectors.lab;
export const dtSelects = vectors.selects;

export function paramsOf(c: DtCase): Params {
  const curve = (k: DtCurve): Curve => ({
    interpolation: k.interpolation as Curve["interpolation"],
    nodes: k.nodes.map(([x, y]) => ({ x, y })),
  });
  return {
    selectBy: c.selectBy as Channel,
    mode: c.mode as Params["mode"],
    strength: c.strength,
    curves: [curve(c.curves[0]), curve(c.curves[1]), curve(c.curves[2])],
  };
}
