// color zones' built-in presets, as darktable 5.6.1's init_presets() defines
// them. Each sets every param, like a module preset. darktable's "B&W: with
// red" also sets an eighth chroma node that its seven-node curve never
// reads; it is left out here, which changes nothing.

import { CHANNELS, INTERPOLATIONS, MODES, type Channel, type Curve, type CurveNode, type Interpolation, type Params } from "./model";

export interface ZonesPreset {
  id: string;
  label: string;
  params: Params;
}

/** darktable's DT_IOP_COLORZONES_BANDS. */
const BANDS = 8;

const spread = (count: number, divisor: number, y: number): CurveNode[] =>
  Array.from({ length: count }, (_, k) => ({ x: k / divisor, y }));

const curve = (nodes: CurveNode[], interpolation: Interpolation = INTERPOLATIONS.centripetal): Curve => ({ interpolation, nodes });

const preset = (selectBy: Channel, lightness: Curve, chroma: Curve, hue: Curve): Params => ({
  selectBy,
  mode: MODES.smooth,
  strength: 0,
  curves: [lightness, chroma, hue],
});

function withRed(): Params {
  const chroma = spread(BANDS - 1, BANDS - 1, 0);
  chroma[0].y = 0.65;
  chroma[1].x = 3 / 16;
  chroma[3].x = 0.5;
  chroma[4].x = 0.51;
  chroma[6].x = 15 / 16;
  return preset(CHANNELS.hue, curve(spread(BANDS - 1, BANDS - 1, 0.5)), curve(chroma), curve(spread(BANDS - 1, BANDS - 1, 0.5)));
}

function withSkinTones(): Params {
  const chroma = spread(BANDS - 1, BANDS - 1, 0);
  chroma[0].y = 0.5;
  chroma[2].x = 0.25;
  chroma[1].x = 0.16;
  chroma[1].y = 0.3;
  return preset(CHANNELS.hue, curve(spread(BANDS - 1, BANDS - 1, 0.5)), curve(chroma), curve(spread(BANDS - 1, BANDS - 1, 0.5)));
}

function polarizing(): Params {
  const lightness = spread(BANDS, BANDS - 1, 0.5);
  const chroma = spread(BANDS, BANDS - 1, 0.5);
  for (let k = 3; k < BANDS; k++) chroma[k].y += ((k - 2.5) / (BANDS - 2)) * 0.25;
  for (let k = 4; k < BANDS; k++) lightness[k].y -= ((k - 3.5) / (BANDS - 3)) * 0.35;
  return preset(CHANNELS.chroma, curve(lightness), curve(chroma), curve(spread(BANDS, BANDS - 1, 0.5)));
}

function naturalSkin(): Params {
  const chroma = spread(BANDS - 1, BANDS - 1, 0.5);
  const hue = spread(BANDS - 1, BANDS - 1, 0.5);
  chroma[1].y = 0.45;
  hue[1].y = 0.55;
  return preset(CHANNELS.hue, curve(spread(BANDS - 1, BANDS - 1, 0.5)), curve(chroma), curve(hue));
}

function film(): Params {
  const lightness: CurveNode[] = [
    { x: 0, y: 0.61304 },
    { x: 0.01, y: 0.61304 },
    { x: 0.245283, y: 0.447962 },
    { x: 0.498113, y: 0.529201 },
    { x: 0.641509, y: 0.664967 },
    { x: 0.879245, y: 0.777294 },
    { x: 0.99, y: 0.61304 },
  ];
  return preset(CHANNELS.hue, curve(lightness), curve(spread(BANDS - 1, BANDS - 1, 0)), curve(spread(BANDS - 1, BANDS - 1, 0.5)));
}

function hslBase(): Params {
  const bands = 8;
  const flat = () => curve(spread(bands, bands, 0.5), INTERPOLATIONS.monotone);
  return preset(CHANNELS.hue, flat(), flat(), flat());
}

export const PRESETS: readonly ZonesPreset[] = [
  { id: "bw-red", label: "B&W: with red", params: withRed() },
  { id: "bw-skin", label: "B&W: with skin tones", params: withSkinTones() },
  { id: "polarizing", label: "Polarizing filter", params: polarizing() },
  { id: "natural-skin", label: "Natural skin tones", params: naturalSkin() },
  { id: "bw-film", label: "B&W: film", params: film() },
  { id: "hsl-base", label: "HSL base setting", params: hslBase() },
];
