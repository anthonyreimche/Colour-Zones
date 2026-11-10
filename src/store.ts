// Session state shared by the panel, the graph and the on-image picker: the
// curve being edited (darktable's tab, a GUI setting rather than a param),
// edit by area and its radius, which picker is on, what it picked, and the
// photo as the stage receives it. Built on the host's zustand `create` so
// the components subscribe like core.

import { AREA_RADIUS } from "./curve-edit";
import type { PickedColour } from "./graph-model";
import { CHANNELS, type Channel } from "./model";
import { api } from "./rt";
import type { AppStore } from "./safelight";

/** darktable's two pickers: one shows a picked colour on the graph, the
 *  other builds the edited curve around it. */
export type PickerMode = "show" | "create" | null;

/** The photo as this stage receives it: linear Rec.709 floats, RGBA rows from
 *  the top. */
export interface InputSample {
  data: Float32Array;
  width: number;
  height: number;
}

/** An image area in UV, corner to corner. */
export interface UvBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface UiState {
  channel: Channel;
  editByArea: boolean;
  radius: number;
  picker: PickerMode;
  picked: PickedColour | null;
  /** The area the picker last read, drawn on the image while it is on. */
  area: UvBox | null;
  sample: InputSample | null;
  setChannel(channel: Channel): void;
  setEditByArea(on: boolean): void;
  setRadius(radius: number): void;
  setPicker(mode: PickerMode): void;
  setPicked(picked: PickedColour | null, area: UvBox | null): void;
  setSample(sample: InputSample | null): void;
}

let current: AppStore<UiState> | null = null;

export function initStore(): void {
  current = api.stores.create<UiState>((set) => ({
    channel: CHANNELS.lightness,
    editByArea: false,
    radius: AREA_RADIUS,
    picker: null,
    picked: null,
    area: null,
    sample: null,
    setChannel: (channel) => set({ channel }),
    setEditByArea: (editByArea) => set({ editByArea }),
    setRadius: (radius) => set({ radius }),
    setPicker: (picker) => set(picker === null ? { picker, picked: null, area: null } : { picker }),
    setPicked: (picked, area) => set({ picked, area }),
    setSample: (sample) => set({ sample }),
  }));
}

export function store(): AppStore<UiState> {
  if (!current) throw new Error("[colour-zones] store() called before activate()");
  return current;
}
