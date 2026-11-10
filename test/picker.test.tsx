// The on-image pickers: the LCh statistics of a picked area, the sampler that
// renders the photo as the stage receives it, and the overlay's two modes,
// show (marks the colour) and create (rebuilds the edited curve, flat, raised
// with Alt or lowered with Shift, as one undo step).

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { curveFromPick } from "../src/curve-edit";
import { pickedSpan } from "../src/graph-model";
import { activate } from "../src/index";
import { CHANNELS, DEFAULT_PARAMS, labFromLinearSrgb, lchHue, resetParams, type Vec3 } from "../src/model";
import { ZonesOverlay, pointToUv, shapeOf } from "../src/Overlay";
import { bagPatch, qualified, readParams } from "../src/params";
import { pickArea, startSampler } from "../src/picker";
import { React } from "../src/rt";
import { store, type InputSample } from "../src/store";
import type { FloatFrame } from "../src/safelight";
import { fakeApi } from "./support/fake-api";

/** A 4 × 2 frame: the left half one colour, the right half another. */
function halves(left: Vec3, right: Vec3): InputSample {
  const data = new Float32Array(4 * 4 * 2);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 4; x++) data.set([...(x < 2 ? left : right), 1], 4 * (y * 4 + x));
  }
  return { data, width: 4, height: 2 };
}

const lch = (rgb: Vec3): Vec3 => {
  const [L, a, b] = labFromLinearSrgb(rgb);
  return [L, Math.hypot(a, b), lchHue(a, b)];
};

const RED: Vec3 = [0.5, 0.1, 0.08];
const BLUE: Vec3 = [0.05, 0.1, 0.6];

afterEach(cleanup);

describe("pickArea", () => {
  const sample = halves(RED, BLUE);

  it("reads a point as a small patch around it", () => {
    const picked = pickArea(sample, { x0: 0.1, y0: 0.2, x1: 0.1, y1: 0.2 });
    expect(picked?.mean[0]).toBeCloseTo(lch(RED)[0], 5);
    expect(picked?.min).toEqual(picked?.max);
  });

  it("gives an area's mean, minimum and maximum per LCh channel", () => {
    const picked = pickArea(sample, { x0: 0, y0: 0, x1: 1, y1: 1 });
    const [r, b] = [lch(RED), lch(BLUE)];
    for (let k = 0; k < 3; k++) {
      expect(picked?.mean[k]).toBeCloseTo((r[k] + b[k]) / 2, 5);
      expect(picked?.min[k]).toBeCloseTo(Math.min(r[k], b[k]), 5);
      expect(picked?.max[k]).toBeCloseTo(Math.max(r[k], b[k]), 5);
    }
  });

  it("reads a box drawn either way", () => {
    expect(pickArea(sample, { x0: 1, y0: 1, x1: 0, y1: 0 })).toEqual(pickArea(sample, { x0: 0, y0: 0, x1: 1, y1: 1 }));
  });
});

describe("startSampler", () => {
  it("publishes a render on start and after each settled render, until stopped", async () => {
    vi.useFakeTimers();
    try {
      const rig = fakeApi();
      activate(rig.api);
      const frame: FloatFrame = { data: new Float32Array(4), width: 1, height: 1, space: { encoding: "linear", primaries: "rec709" }, point: "pre-output" };
      const render = vi.fn(async () => frame);
      const published: unknown[] = [];
      const stop = startSampler({ develop: rig.api.stores.useDevelopStore, render, publish: (s) => published.push(s), throttleMs: 10 });
      await vi.advanceTimersByTimeAsync(20);
      expect(render).toHaveBeenCalledTimes(1);
      expect(published).toEqual([{ data: frame.data, width: 1, height: 1 }]);
      rig.settle();
      await vi.advanceTimersByTimeAsync(20);
      expect(render).toHaveBeenCalledTimes(2);
      // A render settled by an edit of this stage alone leaves its input as it was.
      act(() => rig.api.stores.useDevelopStore.getState().setDynParams(bagPatch(resetParams(CHANNELS.chroma))));
      rig.settle();
      await vi.advanceTimersByTimeAsync(20);
      expect(render).toHaveBeenCalledTimes(2);
      act(() => rig.api.stores.useDevelopStore.getState().setDynParams({ "other.stage.amount": 3 }));
      rig.settle();
      await vi.advanceTimersByTimeAsync(20);
      expect(render).toHaveBeenCalledTimes(3);
      stop();
      rig.settle();
      await vi.advanceTimersByTimeAsync(20);
      expect(render).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pointToUv", () => {
  const box = { left: 10, top: 20, width: 200, height: 100 };
  const rect = { x: 50, y: 10, w: 100, h: 80 };

  it("maps a client point through the image rect, scaled by the interface zoom", () => {
    expect(pointToUv(110, 60, box, 200, rect)).toEqual({ x: 0.5, y: 0.375 });
    expect(pointToUv(60, 40, box, 400, rect)).toEqual({ x: 0.5, y: 0.375 });
  });

  it("is null outside the image unless clamped", () => {
    expect(pointToUv(15, 60, box, 200, rect)).toBeNull();
    expect(pointToUv(15, 60, box, 200, rect, true)).toEqual({ x: 0, y: 0.375 });
  });
});

describe("shapeOf", () => {
  it("raises with Alt, lowers with Shift, else flat", () => {
    expect(shapeOf({ altKey: true, shiftKey: false })).toBe(1);
    expect(shapeOf({ altKey: false, shiftKey: true })).toBe(-1);
    expect(shapeOf({ altKey: false, shiftKey: false })).toBe(0);
  });
});

describe("ZonesOverlay", () => {
  function overlaySetup(mode: "show" | "create") {
    const rig = fakeApi(bagPatch(resetParams(CHANNELS.hue)));
    activate(rig.api);
    rig.setImageRect({ x: 0, y: 0, w: 200, h: 100 });
    const sample = halves(RED, BLUE);
    rig.setFloatFrame({ ...sample, space: { encoding: "linear", primaries: "rec709" }, point: "pre-output" });
    store().getState().setChannel(CHANNELS.chroma);
    act(() => store().getState().setPicker(mode));
    const view = render(<ZonesOverlay />);
    const layer = view.container.firstElementChild as HTMLDivElement;
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(layer, "clientWidth", { value: 200 });
    const drag = async (shift = false, alt = false) => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 200));
      });
      act(() => {
        fireEvent.pointerDown(layer, { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
        fireEvent.pointerMove(layer, { clientX: 190, clientY: 90, pointerId: 1 });
        fireEvent.pointerUp(layer, { clientX: 190, clientY: 90, pointerId: 1, shiftKey: shift, altKey: alt });
      });
    };
    return { rig, view, layer, drag };
  }

  it("draws nothing while no picker is on", () => {
    const rig = fakeApi();
    activate(rig.api);
    const view = render(<ZonesOverlay />);
    expect(view.container.firstElementChild).toBeNull();
  });

  it("renders the photo with the stage switched off for the picker to read", async () => {
    const { rig } = overlaySetup("show");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(rig.floatRenders[0]?.options?.paramBag).toEqual({ [qualified("active")]: 0 });
    expect(store().getState().sample).not.toBeNull();
  });

  it("show: marks the picked area's colour without changing the edit", async () => {
    const { rig, drag } = overlaySetup("show");
    await drag();
    const picked = store().getState().picked;
    expect(picked?.min[2]).toBeCloseTo(Math.min(lch(RED)[2], lch(BLUE)[2]), 6);
    expect(rig.commits).toEqual([]);
  });

  it("create: rebuilds the edited curve around the picked area as one step, raised with Alt", async () => {
    const { rig, drag } = overlaySetup("create");
    await drag(false, true);
    const picked = store().getState().picked!;
    const p = readParams(rig.params());
    expect(p.curves[CHANNELS.chroma].nodes).toEqual(curveFromPick(DEFAULT_PARAMS.curves[CHANNELS.chroma].nodes, pickedSpan(CHANNELS.hue, picked), 1));
    expect(p.curves[CHANNELS.lightness]).toEqual(resetParams(CHANNELS.hue).curves[CHANNELS.lightness]);
    expect(rig.commits).toEqual(["Colour Zones create curve"]);
  });

  it("picks nothing from a gesture the system cancelled", async () => {
    const { rig, layer } = overlaySetup("create");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    act(() => {
      fireEvent.pointerDown(layer, { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
      fireEvent.pointerCancel(layer, { clientX: 190, clientY: 90, pointerId: 1 });
    });
    expect(store().getState().picked).toBeNull();
    expect(rig.commits).toEqual([]);
  });

  it("ends the picker on Esc", () => {
    overlaySetup("show");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(store().getState().picker).toBeNull();
  });
});
