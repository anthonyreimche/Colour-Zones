// The graph's pure geometry and colours, after color zones' drawing areas
// (colorzones.c _area_draw_callback, _draw_background and
// _bottom_area_draw_callback, at zoom 1): a 5 px inset around the plot;
// behind the curves a 64 × 36 grid of LCh cells that shows what the edited
// curve does along the select-by axis; under the graph a bar of the axis's
// colours. Both are based on the picked colour while a picker is on, else on
// display sRGB (0, 0.3, 0.7), with darktable's default background
// saturation factor of 0.5.

import {
  CHANNELS,
  encodePerceptual,
  labFromLinearSrgb,
  linearSrgbFromLab,
  srgbToLinear,
  type Channel,
  type Vec3,
} from "./model";

/** DT_IOP_COLORZONES_INSET. */
export const INSET = 5;
/** The plot's height over its width. */
export const PLOT_ASPECT = 0.6;
/** The strip under the plot that holds edit by area's node arrows. */
export const ARROW_STRIP = 10;
/** The colour bar under the graph. */
export const BAR_HEIGHT = 12;
/** DT_COLORZONES_CELLSI × DT_COLORZONES_CELLSJ. */
export const CELLS_X = 64;
export const CELLS_Y = 36;
/** plugins/darkroom/colorzones/bg_sat_factor's default. */
export const BG_SAT_FACTOR = 0.5;

export interface PlotGeometry {
  width: number;
  height: number;
  plotW: number;
  plotH: number;
  /** Where the colour bar starts, from the top. */
  barTop: number;
}

/** The canvas's layout: the plot in its inset, then the arrow strip while
 *  editing by area, then the colour bar. */
export function plotGeometry(width: number, arrows = false): PlotGeometry {
  const plotW = Math.max(1, width - 2 * INSET);
  const plotH = Math.round(plotW * PLOT_ASPECT);
  const barTop = plotH + 2 * INSET + (arrows ? ARROW_STRIP : 0);
  return { width, height: barTop + BAR_HEIGHT, plotW, plotH, barTop };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A pointer offset in the canvas, in curve units, clamped to the plot as
 *  darktable's motion handler clamps the mouse. */
export function toPlot(g: PlotGeometry, px: number, py: number): { x: number; y: number } {
  return { x: clamp01((px - INSET) / g.plotW), y: 1 - clamp01((py - INSET) / g.plotH) };
}

/** True when a canvas point is below the plot, where edit by area's arrows
 *  pick a node to slide along the axis. */
export const belowPlot = (g: PlotGeometry, py: number): boolean => py > INSET + g.plotH;

export type Lch = Vec3;

export function lchFromLab([L, a, b]: Vec3): Lch {
  const t = Math.atan2(b, a);
  return [L, Math.hypot(a, b), t > 0 ? t / (2 * Math.PI) : 1 - Math.abs(t) / (2 * Math.PI)];
}

/** _select_base_display_color without a picked colour. */
export const BASE_LCH: Lch = lchFromLab(labFromLinearSrgb([srgbToLinear(0), srgbToLinear(0.3), srgbToLinear(0.7)]));

/** The LCh along the select-by axis at cell column i, before the edited
 *  curve's ordinate. `normalizeC` and `chromaScale` are the two places the
 *  plot uses the background saturation factor and the bar doesn't. */
function axisLch(selectBy: Channel, i: number, base: Lch, normalizeC: number, chromaScale: number): Lch {
  const ii = (i + 0.5) / (CELLS_X - 1);
  const iih = i / (CELLS_X - 1);
  if (selectBy === CHANNELS.lightness) return [100 * ii, normalizeC * 0.5, base[2]];
  if (selectBy === CHANNELS.chroma) return [50, base[1] * 2 * chromaScale * ii, base[2]];
  return [50, normalizeC * 0.5, iih];
}

/** The LCh of plot cell (i, j), j counted from the top: the axis's colour,
 *  moved along the edited curve's ordinate. */
export function cellLch(selectBy: Channel, channel: Channel, i: number, j: number, base: Lch = BASE_LCH): Lch {
  const [L, C, h] = axisLch(selectBy, i, base, 128 * BG_SAT_FACTOR * Math.SQRT2, BG_SAT_FACTOR);
  const jj = 1 - (j - 0.5) / (CELLS_Y - 1);
  const jjh = 1 - j / (CELLS_Y - 1) + 0.5;
  if (channel === CHANNELS.lightness) return [selectBy === CHANNELS.lightness ? L * jj : L - 50 + 100 * jj, C, h];
  if (channel === CHANNELS.chroma) return [L, C * 2 * jj, h];
  return [L, C, h + jjh];
}

/** The colour bar's LCh at cell column i. */
export const barLch = (selectBy: Channel, i: number, base: Lch = BASE_LCH): Lch =>
  axisLch(selectBy, i, base, 128 * Math.SQRT2, 1);

/** COLORZONES_DRAW_BACKGROUD_BOX: Lab, the exposure module's gamut squeeze
 *  past L 100, then display sRGB. */
export function cellCss(lch: Lch): string {
  const [L, C, h] = lch;
  const L0 = L;
  const a = Math.cos(2 * Math.PI * h) * C;
  const b = Math.sin(2 * Math.PI * h) * C;
  const lcap = Math.min(100, L);
  const clip = 1 - ((lcap - L0) / 100) * (Math.min(80, Math.max(0, L - 20)) / 80);
  const squeeze = L0 === 0 ? 1 : (L / L0) * clip * clip * clip;
  const rgb = linearSrgbFromLab([L, a * squeeze, b * squeeze]);
  const byte = (v: number) => Math.round(clamp01(encodePerceptual(v)) * 255);
  return `rgb(${byte(rgb[0])}, ${byte(rgb[1])}, ${byte(rgb[2])})`;
}

const cache = new Map<string, string[]>();
const CACHE_SIZE = 12;

function memo(key: string, build: () => string[]): readonly string[] {
  const hit = cache.get(key);
  if (hit) return hit;
  const cells = build();
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  cache.set(key, cells);
  return cells;
}

/** The plot cells' colours, row by row from the top. */
export function backgroundCells(selectBy: Channel, channel: Channel, base: Lch = BASE_LCH): readonly string[] {
  return memo(`plot ${selectBy} ${channel} ${base.join(" ")}`, () => {
    const cells: string[] = [];
    for (let j = 0; j < CELLS_Y; j++) for (let i = 0; i < CELLS_X; i++) cells.push(cellCss(cellLch(selectBy, channel, i, j, base)));
    return cells;
  });
}

/** The colour bar's cells, left to right. */
export function barCells(selectBy: Channel, base: Lch = BASE_LCH): readonly string[] {
  return memo(`bar ${selectBy} ${base.join(" ")}`, () => Array.from({ length: CELLS_X }, (_, i) => cellCss(barLch(selectBy, i, base))));
}

/** A picked area's colour: its mean, and its per-channel minimum and
 *  maximum, in LCh (darktable's picker statistics). */
export interface PickedColour {
  mean: Lch;
  min: Lch;
  max: Lch;
}

/** Where a picked colour sits on the graph's axis: the mean and the
 *  min–max band, in curve units, as _draw_color_picker places them. */
export function pickedSpan(selectBy: Channel, picked: PickedColour): { mean: number; min: number; max: number } {
  const at = (lch: Lch) =>
    selectBy === CHANNELS.lightness ? lch[0] / 100 : selectBy === CHANNELS.chroma ? lch[1] / (128 * Math.SQRT2) : lch[2];
  return { mean: at(picked.mean), min: at(picked.min), max: at(picked.max) };
}
