// The graph's geometry and colours: color zones' inset, the pointer clamped
// to the plot, the LCh cells behind each curve, the colour bar, and where a
// picked colour lands on the axis.

import { describe, expect, it } from "vitest";
import {
  ARROW_STRIP,
  BAR_HEIGHT,
  BASE_LCH,
  CELLS_X,
  CELLS_Y,
  INSET,
  backgroundCells,
  barCells,
  barLch,
  belowPlot,
  cellLch,
  pickedSpan,
  plotGeometry,
  toPlot,
} from "../src/graph-model";
import { CHANNELS } from "../src/model";

const rgbOf = (css: string): number[] => (css.match(/\d+/g) ?? []).map(Number);
const spread = (css: string): number => Math.max(...rgbOf(css)) - Math.min(...rgbOf(css));
const sum = (css: string): number => rgbOf(css).reduce((a, b) => a + b, 0);
const { lightness: L, chroma: C, hue: H } = CHANNELS;

describe("plotGeometry and toPlot", () => {
  it("keeps darktable's 5 px inset around the plot, then the colour bar", () => {
    expect(INSET).toBe(5);
    const g = plotGeometry(210);
    expect(g.plotW).toBe(200);
    expect(g.barTop).toBe(g.plotH + 2 * INSET);
    expect(g.height).toBe(g.barTop + BAR_HEIGHT);
  });

  it("makes room for edit by area's arrows under the plot", () => {
    const g = plotGeometry(210, true);
    expect(g.barTop).toBe(g.plotH + 2 * INSET + ARROW_STRIP);
    expect(belowPlot(g, INSET + g.plotH + 2)).toBe(true);
    expect(belowPlot(g, INSET + g.plotH - 2)).toBe(false);
  });

  it("maps the plot's corners to the curve's and clamps outside them", () => {
    const g = plotGeometry(210);
    expect(toPlot(g, INSET, INSET)).toEqual({ x: 0, y: 1 });
    expect(toPlot(g, INSET + g.plotW, INSET + g.plotH)).toEqual({ x: 1, y: 0 });
    expect(toPlot(g, -40, 400)).toEqual({ x: 0, y: 0 });
    expect(toPlot(g, INSET + g.plotW / 2, INSET + g.plotH / 2)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("background", () => {
  it("is darktable's 64 × 36 grid, memoised", () => {
    expect(backgroundCells(H, C)).toHaveLength(CELLS_X * CELLS_Y);
    expect(backgroundCells(H, C)).toBe(backgroundCells(H, C));
  });

  it("on the chroma curve, doubles the chroma at the top and removes it at the bottom", () => {
    // darktable's rows sit half a row off its grid lines: the top row is
    // jj = 1 + 0.5/35, the middle one 0.5.
    expect(cellLch(H, C, 10, 0)[1] / cellLch(H, C, 10, CELLS_Y / 2)[1]).toBeCloseTo(2 * (1 + 0.5 / 35), 9);
    const cells = backgroundCells(H, C);
    expect(spread(cells[(CELLS_Y - 1) * CELLS_X + 20])).toBeLessThan(8);
    expect(spread(cells[20])).toBeGreaterThan(spread(cells[(CELLS_Y - 1) * CELLS_X + 20]) + 60);
  });

  it("on the lightness curve, runs dark to light bottom to top; scaling L when selecting by it", () => {
    const cells = backgroundCells(H, L);
    expect(sum(cells[(CELLS_Y - 1) * CELLS_X + 20])).toBeLessThan(sum(cells[20]));
    expect(cellLch(H, L, 10, 0)[0]).toBeCloseTo(100 * (1 + 0.5 / 35), 9);
    expect(cellLch(L, L, 40, CELLS_Y / 2)[0]).toBeCloseTo(cellLch(L, C, 40, CELLS_Y / 2)[0] * 0.5, 9);
  });

  it("on the hue curve, turns the hue half a turn either way about the axis's own", () => {
    expect(cellLch(L, H, 10, 0)[2] - BASE_LCH[2]).toBeCloseTo(1.5, 9);
    expect(cellLch(L, H, 10, CELLS_Y - 1)[2] - BASE_LCH[2]).toBeCloseTo(0.5, 9);
  });

  it("runs dark to light by lightness, grey to colourful by chroma, round the hues by hue", () => {
    const mid = CELLS_Y / 2;
    const byL = backgroundCells(L, C);
    expect(sum(byL[mid * CELLS_X + 2])).toBeLessThan(sum(byL[mid * CELLS_X + CELLS_X - 3]));
    const byC = backgroundCells(C, C);
    expect(spread(byC[mid * CELLS_X + 1])).toBeLessThan(spread(byC[mid * CELLS_X + CELLS_X - 2]));
    expect(cellLch(H, C, 0, mid)[2]).toBe(0);
    expect(cellLch(H, C, CELLS_X - 1, mid)[2]).toBe(1);
  });

  it("bases lightness and chroma on darktable's default colour, sRGB (0, 0.3, 0.7), or on a picked one", () => {
    expect(cellLch(L, C, 5, 5)[2]).toBe(BASE_LCH[2]);
    expect(BASE_LCH[2]).toBeGreaterThan(0.7);
    expect(BASE_LCH[2]).toBeLessThan(0.8);
    expect(cellLch(L, C, 5, 5, [40, 30, 0.1])[2]).toBe(0.1);
    expect(backgroundCells(L, C, [40, 30, 0.1])).not.toBe(backgroundCells(L, C));
  });
});

describe("colour bar", () => {
  it("is the axis's colours, without the plot's saturation factor", () => {
    expect(barCells(H)).toHaveLength(CELLS_X);
    expect(barLch(H, 10)[1]).toBeCloseTo(2 * cellLch(H, C, 10, CELLS_Y / 2)[1], 9);
    expect(barLch(L, 0)[0]).toBeLessThan(barLch(L, CELLS_X - 1)[0]);
  });
});

describe("pickedSpan", () => {
  it("places a picked colour as darktable's picker draws it: L/100, C/(128√2), hue", () => {
    const picked = { mean: [50, 64, 0.3] as const, min: [20, 10, 0.2] as const, max: [80, 128, 0.4] as const };
    expect(pickedSpan(L, picked)).toEqual({ mean: 0.5, min: 0.2, max: 0.8 });
    expect(pickedSpan(C, picked).max).toBeCloseTo(1 / Math.SQRT2, 12);
    expect(pickedSpan(H, picked)).toEqual({ mean: 0.3, min: 0.2, max: 0.4 });
  });
});
