// The on-image picker's data: the photo as the stage receives it, and the
// LCh statistics of a picked area as darktable's colour picker reports them
// in color zones (per channel mean, minimum and maximum of LCh, hue as
// dt_Lab_2_LCH gives it).
//
// While a picker is on, the sampler renders the open photo with this stage
// switched off (`active` 0 over the photo's bag) as linear Rec.709 floats,
// and renders it again, throttled, after each settled render, so a pick
// reads what the stage is handed. darktable reads its module's own input; a
// stage after this one in the display phase is in this frame too, which only
// matters when such a stage is on.

import type { PickedColour } from "./graph-model";
import { labFromLinearSrgb, lchHue } from "./model";
import { STAGE_ID, qualified } from "./params";
import { api } from "./rt";
import type { AppStore, DevelopParams, DevelopState, FloatFrame } from "./safelight";
import type { InputSample, UvBox } from "./store";

export const CAPTURE_THROTTLE_MS = 150;
/** A click reads this many sample pixels square around the point. */
export const POINT_PATCH = 3;

/** The LCh statistics of the sample's pixels inside `box` (a click's box is
 *  POINT_PATCH wide); null outside the image or for an empty sample. */
export function pickArea(sample: InputSample, box: UvBox): PickedColour | null {
  const { data, width, height } = sample;
  if (width < 1 || height < 1) return null;
  const toPx = (u: number, size: number) => Math.min(size - 1, Math.max(0, Math.floor(u * size)));
  let x0 = toPx(Math.min(box.x0, box.x1), width);
  let x1 = toPx(Math.max(box.x0, box.x1), width);
  let y0 = toPx(Math.min(box.y0, box.y1), height);
  let y1 = toPx(Math.max(box.y0, box.y1), height);
  if (x0 === x1 && y0 === y1) {
    const half = POINT_PATCH >> 1;
    x0 = Math.max(0, x0 - half);
    x1 = Math.min(width - 1, x1 + half);
    y0 = Math.max(0, y0 - half);
    y1 = Math.min(height - 1, y1 + half);
  }
  const mean = [0, 0, 0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = 4 * (y * width + x);
      const [L, a, b] = labFromLinearSrgb([data[o], data[o + 1], data[o + 2]]);
      const lch = [L, Math.hypot(a, b), lchHue(a, b)];
      if (!lch.every(Number.isFinite)) continue;
      for (let k = 0; k < 3; k++) {
        mean[k] += lch[k];
        min[k] = Math.min(min[k], lch[k]);
        max[k] = Math.max(max[k], lch[k]);
      }
      n++;
    }
  }
  if (n === 0) return null;
  return {
    mean: [mean[0] / n, mean[1] / n, mean[2] / n],
    min: [min[0], min[1], min[2]],
    max: [max[0], max[1], max[2]],
  };
}

/** A settled render's cause, split: the photo, its params and every bag
 *  entry but this stage's (what the sampled frame depends on), and this
 *  stage's own entries (what it doesn't). */
interface RenderKey {
  photoId: string | null;
  params: unknown;
  others: Record<string, unknown>;
  ours: Record<string, unknown>;
}

function renderKey(state: DevelopState): RenderKey {
  const others: Record<string, unknown> = {};
  const ours: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state.paramBag)) (k.startsWith(`${STAGE_ID}.`) ? ours : others)[k] = v;
  return { photoId: state.photoId, params: state.previewParams ?? state.params, others, ours };
}

function sameEntries(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** True when only this stage's entries changed: the render was its own, and
 *  the frame rendered with it off is as it was. A settle with nothing changed
 *  (the source finishing its decode) still re-renders. */
const onlyOurs = (a: RenderKey, b: RenderKey): boolean =>
  a.photoId === b.photoId && a.params === b.params && sameEntries(a.others, b.others) && !sameEntries(a.ours, b.ours);

export interface SamplerDeps {
  develop: AppStore<DevelopState>;
  render(photoId: string, params: DevelopParams): Promise<FloatFrame | null>;
  publish(sample: InputSample | null): void;
  throttleMs?: number;
}

/** Follow the develop store and publish the stage's input after each
 *  settled render that could have changed it, one capture in flight and at
 *  most one queued. Returns the stop function. */
export function startSampler(deps: SamplerDeps): () => void {
  const throttle = deps.throttleMs ?? CAPTURE_THROTTLE_MS;
  let stopped = false;
  let inFlight = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastStart = -Infinity;

  const run = () => {
    timer = null;
    const state = deps.develop.getState();
    if (stopped || !state.photoId) return;
    inFlight = true;
    lastStart = Date.now();
    deps
      .render(state.photoId, state.previewParams ?? state.params)
      .then((frame) => {
        if (!stopped) deps.publish(frame ? { data: frame.data, width: frame.width, height: frame.height } : null);
      })
      .catch(() => {
        if (!stopped) deps.publish(null);
      })
      .finally(() => {
        inFlight = false;
        if (queued && !stopped) {
          queued = false;
          request();
        }
      });
  };

  function request(): void {
    if (stopped) return;
    if (inFlight) {
      queued = true;
      return;
    }
    if (timer !== null) return;
    timer = setTimeout(run, Math.max(0, throttle - (Date.now() - lastStart)));
  }

  // The frame is rendered with this stage off, so a render settled by an
  // edit of this stage alone changes nothing in it.
  let seen = renderKey(deps.develop.getState());
  const unsubscribe = deps.develop.subscribe((state, prev) => {
    if (state.photoId !== prev.photoId && !state.photoId) {
      deps.publish(null);
      return;
    }
    if (!state.photoId || state.histogram === prev.histogram) return;
    const key = renderKey(state);
    const skip = onlyOurs(key, seen);
    seen = key;
    if (!skip) request();
  });

  request();

  return () => {
    stopped = true;
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

/** The production sampler over the live app. */
export function startLiveSampler(publish: (sample: InputSample | null) => void): () => void {
  return startSampler({
    develop: api.stores.useDevelopStore,
    render: (photoId, params) =>
      api.develop.renderPhotoFloatFrame(photoId, params, {
        paramBag: { [qualified("active")]: 0 },
        space: { encoding: "linear", primaries: "rec709" },
      }),
    publish,
  });
}
