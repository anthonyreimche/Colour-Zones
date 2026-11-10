// The panel over the photo's curves: darktable's color zones controls, the
// tabs that pick the curve to edit, the presets, and the graph's gestures
// (drag a node, drag in empty space to add one there, Ctrl+click to add one
// on the curve, right-click to remove, Ctrl+right-click to flatten,
// double-click to reset, arrow keys to nudge, and edit by area). Every
// gesture is one undo step; drags write the bag live and commit on release.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AREA_RADIUS } from "../src/curve-edit";
import { INSET, plotGeometry } from "../src/graph-model";
import { activate } from "../src/index";
import {
  CHANNELS,
  DEFAULT_PARAMS,
  INTERPOLATIONS,
  MODES,
  defaultCurve,
  resetParams,
  withCurve,
  type Channel,
  type Curve,
  type Params,
} from "../src/model";
import { ColourZonesPanel } from "../src/Panel";
import { bagPatch, readParams } from "../src/params";
import { PRESETS } from "../src/presets";
import { React } from "../src/rt";
import { store } from "../src/store";
import { fakeApi } from "./support/fake-api";

// jsdom has no ResizeObserver, so the graph keeps its starting width; the
// canvas's box is laid out at that width, unzoomed.
const G = plotGeometry(252);
const G_AREA = plotGeometry(252, true);

const lightnessCurve: Curve = {
  interpolation: INTERPOLATIONS.centripetal,
  nodes: [{ x: 0, y: 0.5 }, { x: 0.5, y: 0.7 }, { x: 1, y: 0.5 }],
};

/** Select by lightness, `curve` on the edited channel. */
const byLightness = (channel: Channel, curve: Curve = lightnessCurve): Params => withCurve(resetParams(CHANNELS.lightness), channel, curve);

function setup(initial: Params = byLightness(CHANNELS.chroma), channel: Channel = CHANNELS.chroma, mask: string | null = null) {
  const rig = fakeApi(bagPatch(initial));
  activate(rig.api);
  rig.setMask(mask);
  store().getState().setChannel(channel);
  const view = render(<ColourZonesPanel />);
  const canvas = () => screen.getByLabelText(/ curve$/) as HTMLCanvasElement;
  const box = () => {
    const g = store().getState().editByArea ? G_AREA : G;
    canvas().getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: g.width, bottom: g.height, x: 0, y: 0, width: g.width, height: g.height, toJSON: () => ({}) }) as DOMRect;
  };
  box();
  const at = (x: number, y: number) => ({ clientX: INSET + x * G.plotW, clientY: INSET + (1 - y) * G.plotH, pointerId: 1 });
  const params = () => readParams(rig.params());
  const curve = () => params().curves[store().getState().channel];
  return { rig, view, canvas, box, at, params, curve };
}

afterEach(cleanup);

describe("controls", () => {
  it("offers darktable's choices", () => {
    setup();
    const options = (label: string) => [...(screen.getByLabelText(label) as HTMLSelectElement).options].map((o) => o.textContent);
    expect(options("Select by")).toEqual(["Lightness", "Chroma", "Hue"]);
    expect(options("Process mode")).toEqual(["Smooth", "Strong"]);
    expect(options("Interpolation method")).toEqual(["Cubic spline", "Centripetal spline", "Monotonic spline"]);
    expect(options("Colour Zones preset")).toEqual(["Presets", ...PRESETS.map((p) => p.label)]);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Lightness", "Chroma", "Hue"]);
  });

  it("starts every curve over for a new axis, as darktable does", () => {
    const edited = withCurve({ ...byLightness(CHANNELS.chroma), strength: 40, mode: MODES.strong }, CHANNELS.hue, lightnessCurve);
    const { rig, params } = setup(edited);
    act(() => {
      fireEvent.change(screen.getByLabelText("Select by"), { target: { value: String(CHANNELS.hue) } });
    });
    expect(params()).toEqual(DEFAULT_PARAMS);
    expect(rig.commits).toEqual(["Colour Zones select by"]);
  });

  it("sets the process mode, and the edited curve's interpolation alone, as one step each", () => {
    const { rig, params } = setup();
    act(() => {
      fireEvent.change(screen.getByLabelText("Process mode"), { target: { value: String(MODES.strong) } });
    });
    act(() => {
      fireEvent.change(screen.getByLabelText("Interpolation method"), { target: { value: String(INTERPOLATIONS.monotone) } });
    });
    expect(params().mode).toBe(MODES.strong);
    expect(params().curves.map((c) => c.interpolation)).toEqual([INTERPOLATIONS.centripetal, INTERPOLATIONS.monotone, INTERPOLATIONS.centripetal]);
    expect(rig.commits).toEqual(["Colour Zones process mode", "Colour Zones interpolation"]);
  });

  it("shows the edited curve's interpolation, following the tab", () => {
    setup(withCurve(byLightness(CHANNELS.chroma), CHANNELS.hue, { ...lightnessCurve, interpolation: INTERPOLATIONS.cubic }));
    const interpolation = () => (screen.getByLabelText("Interpolation method") as HTMLSelectElement).value;
    expect(interpolation()).toBe(String(INTERPOLATIONS.centripetal));
    act(() => {
      fireEvent.click(screen.getByRole("tab", { name: "Hue" }));
    });
    expect(store().getState().channel).toBe(CHANNELS.hue);
    expect(interpolation()).toBe(String(INTERPOLATIONS.cubic));
    expect(screen.getByLabelText("Hue curve")).toBeTruthy();
  });

  it("drags the mix live and commits it on release", () => {
    const { rig, view, params } = setup();
    const mix = () => rig.sliders(view.container).find((s) => s.label === "Mix");
    expect(mix()).toMatchObject({ value: 0, min: -200, max: 200, defaultValue: 0 });
    act(() => mix()?.onChange(55));
    expect(params().strength).toBe(55);
    expect(rig.commits).toEqual([]);
    act(() => mix()?.onCommit?.());
    expect(rig.commits).toEqual(["Colour Zones mix"]);
  });

  it("applies a preset as one step", () => {
    const { rig, params } = setup();
    act(() => {
      fireEvent.change(screen.getByLabelText("Colour Zones preset"), { target: { value: "bw-film" } });
    });
    expect(params()).toEqual(PRESETS.find((p) => p.id === "bw-film")?.params);
    expect(rig.commits).toEqual(["Colour Zones preset: B&W: film"]);
  });

  it("offers the pickers on the photo's panel, not a mask's", () => {
    setup();
    expect(screen.getByRole("button", { name: /Show colour/ })).toBeTruthy();
    cleanup();
    setup(undefined, CHANNELS.chroma, "mask-1");
    expect(screen.queryByRole("button", { name: /Show colour/ })).toBeNull();
  });

  it("toggles a picker from its button, one at a time", () => {
    setup();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Show colour/ }));
    });
    expect(store().getState().picker).toBe("show");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Create curve/ }));
    });
    expect(store().getState().picker).toBe("create");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Create curve/ }));
    });
    expect(store().getState().picker).toBeNull();
  });
});

describe("graph", () => {
  it("drags a node of the edited curve, and only that curve, committing once on release", () => {
    const { rig, canvas, at, params } = setup(withCurve(byLightness(CHANNELS.chroma), CHANNELS.hue, lightnessCurve));
    act(() => {
      fireEvent.pointerMove(canvas(), at(0.5, 0.7));
      fireEvent.pointerDown(canvas(), { ...at(0.5, 0.7), button: 0 });
      fireEvent.pointerMove(canvas(), { ...at(0.45, 0.8), buttons: 1 });
      fireEvent.pointerMove(canvas(), { ...at(0.4, 0.9), buttons: 1 });
    });
    expect(params().curves[CHANNELS.chroma].nodes[1].x).toBeCloseTo(0.4, 6);
    expect(params().curves[CHANNELS.chroma].nodes[1].y).toBeCloseTo(0.9, 6);
    expect(params().curves[CHANNELS.hue]).toEqual(lightnessCurve);
    expect(rig.commits).toEqual([]);
    act(() => {
      fireEvent.pointerUp(canvas(), at(0.4, 0.9));
    });
    expect(rig.commits).toEqual(["Colour Zones move node"]);
  });

  it("edits the curve of the tab that is open", () => {
    const { canvas, at, params } = setup(byLightness(CHANNELS.lightness), CHANNELS.lightness);
    act(() => {
      fireEvent.pointerMove(canvas(), at(0.5, 0.7));
      fireEvent.contextMenu(canvas(), at(0.5, 0.7));
    });
    expect(params().curves[CHANNELS.lightness].nodes).toHaveLength(2);
  });

  it("adds a node where a drag starts in empty space, and drags it", () => {
    const { rig, canvas, at, curve } = setup();
    act(() => {
      fireEvent.pointerMove(canvas(), at(0.25, 0.2));
      fireEvent.pointerDown(canvas(), { ...at(0.25, 0.2), button: 0 });
      fireEvent.pointerMove(canvas(), { ...at(0.26, 0.25), buttons: 1 });
      fireEvent.pointerUp(canvas(), at(0.26, 0.25));
    });
    expect(curve().nodes).toHaveLength(4);
    expect(curve().nodes[1].x).toBeCloseTo(0.26, 6);
    expect(curve().nodes[1].y).toBeCloseTo(0.25, 6);
    expect(rig.commits).toEqual(["Colour Zones add node"]);
  });

  it("adds a node on the curve with Ctrl+click", () => {
    const { rig, canvas, at, curve } = setup();
    act(() => {
      fireEvent.pointerDown(canvas(), { ...at(0.25, 0.1), button: 0, ctrlKey: true });
      fireEvent.pointerUp(canvas(), at(0.25, 0.1));
    });
    expect(curve().nodes).toHaveLength(4);
    expect(curve().nodes[1].x).toBeCloseTo(0.25, 6);
    expect(curve().nodes[1].y).toBeGreaterThan(0.5);
    expect(rig.commits).toEqual(["Colour Zones add node"]);
  });

  it("adds nothing with Ctrl+click on a node, as darktable does", () => {
    const { rig, canvas, at, curve } = setup();
    act(() => {
      fireEvent.pointerDown(canvas(), { ...at(0.51, 0.7), button: 0, ctrlKey: true });
      fireEvent.pointerUp(canvas(), at(0.51, 0.7));
    });
    expect(curve().nodes).toHaveLength(3);
    expect(rig.commits).toEqual([]);
  });

  it("removes the hovered node on right-click, and flattens it on Ctrl+right-click", () => {
    const { rig, canvas, at, curve } = setup();
    act(() => {
      fireEvent.pointerMove(canvas(), at(0.5, 0.7));
      fireEvent.contextMenu(canvas(), { ...at(0.5, 0.7), ctrlKey: true });
    });
    expect(curve().nodes).toEqual([{ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }]);
    act(() => {
      fireEvent.pointerMove(canvas(), at(0.5, 0.5));
      fireEvent.contextMenu(canvas(), at(0.5, 0.5));
    });
    expect(curve().nodes).toEqual([{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]);
    expect(rig.commits).toEqual(["Colour Zones reset node", "Colour Zones remove node"]);
  });

  it("resets the edited curve and its interpolation on double-click, leaving the rest", () => {
    const edited = withCurve({ ...byLightness(CHANNELS.chroma, { ...lightnessCurve, interpolation: INTERPOLATIONS.cubic }), strength: 30 }, CHANNELS.hue, lightnessCurve);
    const { rig, canvas, at, params } = setup(edited);
    act(() => {
      fireEvent.doubleClick(canvas(), at(0.3, 0.3));
    });
    expect(params().curves[CHANNELS.chroma]).toEqual(defaultCurve(CHANNELS.lightness));
    expect(params().curves[CHANNELS.hue]).toEqual(lightnessCurve);
    expect(params().strength).toBe(30);
    expect(rig.commits).toEqual(["Colour Zones reset curve"]);
  });

  it("nudges the hovered node with the arrow keys", () => {
    const { rig, canvas, at, curve } = setup();
    act(() => {
      fireEvent.pointerMove(canvas(), at(0.5, 0.7));
      fireEvent.keyDown(canvas(), { key: "ArrowUp" });
      fireEvent.keyDown(canvas(), { key: "ArrowLeft" });
    });
    expect(curve().nodes[1].x).toBeCloseTo(0.499, 6);
    expect(curve().nodes[1].y).toBeCloseTo(0.701, 6);
    expect(rig.commits).toEqual(["Colour Zones move node", "Colour Zones move node"]);
  });

  it("follows the bag when something else changes it", () => {
    const { rig, canvas, at, curve } = setup();
    act(() => rig.replace(bagPatch(resetParams(CHANNELS.lightness))));
    act(() => {
      fireEvent.pointerMove(canvas(), at(0.5, 0.7));
      fireEvent.contextMenu(canvas(), at(0.5, 0.7));
    });
    expect(curve().nodes).toHaveLength(2);
    expect(rig.commits).toEqual([]);
  });
});

describe("edit by area", () => {
  function areaSetup() {
    const s = setup();
    act(() => {
      fireEvent.click(screen.getByLabelText("Edit by area"));
    });
    expect(store().getState().editByArea).toBe(true);
    s.box();
    return s;
  }

  it("pulls the nodes near the pointer towards it while dragging, as one step", () => {
    const { rig, canvas, at, curve } = areaSetup();
    act(() => {
      fireEvent.pointerDown(canvas(), { ...at(0.5, 0.2), button: 0 });
      fireEvent.pointerMove(canvas(), { ...at(0.5, 0.2), buttons: 1 });
    });
    expect(curve().nodes[1]).toEqual({ x: 0.5, y: expect.closeTo(0.2, 6) });
    expect(curve().nodes[0].y).toBeCloseTo(0.5, 3);
    act(() => {
      fireEvent.pointerUp(canvas(), at(0.5, 0.2));
    });
    expect(rig.commits).toEqual(["Colour Zones edit by area"]);
  });

  it("slides the node whose arrow is under the pointer along the axis", () => {
    const { rig, canvas, curve } = areaSetup();
    const below = (x: number) => ({ clientX: INSET + x * G_AREA.plotW, clientY: INSET + G_AREA.plotH + 6, pointerId: 1 });
    act(() => {
      fireEvent.pointerMove(canvas(), below(0.48));
      fireEvent.pointerDown(canvas(), { ...below(0.48), button: 0 });
      fireEvent.pointerMove(canvas(), { ...below(0.6), buttons: 1 });
      fireEvent.pointerUp(canvas(), below(0.6));
    });
    expect(curve().nodes[1].x).toBeCloseTo(0.62, 6);
    expect(curve().nodes[1].y).toBe(0.7);
    expect(rig.commits).toEqual(["Colour Zones move node"]);
  });

  it("sizes the circle with the wheel", () => {
    const { canvas } = areaSetup();
    act(() => {
      canvas().dispatchEvent(new WheelEvent("wheel", { deltaY: 100, cancelable: true }));
    });
    expect(store().getState().radius).toBeCloseTo(AREA_RADIUS * 1.1, 12);
  });
});
