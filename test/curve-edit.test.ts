// Node editing as darktable's color zones does it (colorzones.c _add_node,
// _sanity_check, _move_point_internal, _delete_node, the hover radius, edit
// by area and the create-curve picker), on the version 2 splines every new
// edit uses.

import { describe, expect, it } from "vitest";
import {
  AREA_RADIUS,
  HOVER_RADIUS,
  MIN_X_DISTANCE,
  addNode,
  areaEdit,
  curveFromPick,
  moveNode,
  nearestNode,
  nearestX,
  removeNode,
  resetNodeY,
  stepRadius,
} from "../src/curve-edit";
import { CHANNELS, DEFAULT_PARAMS, MAX_NODES, type CurveNode } from "../src/model";

const three: CurveNode[] = [
  { x: 0, y: 0.5 },
  { x: 0.5, y: 0.7 },
  { x: 1, y: 0.5 },
];

describe("addNode", () => {
  it("inserts in x order and reports where", () => {
    expect(addNode(three, 0.25, 0.6)).toEqual({
      nodes: [three[0], { x: 0.25, y: 0.6 }, three[1], three[2]],
      index: 1,
    });
    expect(addNode([{ x: 0.3, y: 0.5 }], 0.1, 0.4)?.index).toBe(0);
    expect(addNode([{ x: 0.3, y: 0.5 }], 0.9, 0.4)?.index).toBe(1);
  });

  it("refuses a node within the minimum distance of a neighbour", () => {
    expect(addNode(three, 0.5 + MIN_X_DISTANCE, 0.6)).toBeNull();
    expect(addNode(three, 0.5 - MIN_X_DISTANCE / 2, 0.6)).toBeNull();
    expect(addNode(three, 0.5 + 2 * MIN_X_DISTANCE, 0.6)).not.toBeNull();
  });

  it("refuses a node past the twenty darktable holds", () => {
    const full = Array.from({ length: MAX_NODES }, (_, k) => ({ x: k / (MAX_NODES - 1), y: 0.5 }));
    expect(addNode(full, 0.51, 0.5)).toBeNull();
  });

  it("refuses, selecting by hue, a node within the minimum distance of the other end across the wrap", () => {
    const hue: CurveNode[] = [{ x: 0.001, y: 0.5 }, { x: 0.5, y: 0.5 }];
    expect(addNode(hue, 1, 0.6, CHANNELS.hue)).toBeNull();
    expect(addNode(hue, 1, 0.6, CHANNELS.lightness)).not.toBeNull();
    expect(addNode([{ x: 0.5, y: 0.5 }, { x: 0.999, y: 0.5 }], 0, 0.6, CHANNELS.hue)).toBeNull();
  });

  it("leaves the nodes it was given untouched", () => {
    const before = JSON.stringify(three);
    addNode(three, 0.25, 0.6);
    expect(JSON.stringify(three)).toBe(before);
  });
});

describe("moveNode", () => {
  it("moves a node and clamps it to the graph", () => {
    expect(moveNode(three, 1, 0.4, 1.3, CHANNELS.lightness)[1]).toEqual({ x: 0.4, y: 1 });
    expect(moveNode(three, 0, -0.2, -0.1, CHANNELS.lightness)[0]).toEqual({ x: 0, y: 0 });
  });

  it("lets the end nodes move along x, as version 2 splines do", () => {
    expect(moveNode(three, 0, 0.1, 0.5, CHANNELS.lightness)[0]).toEqual({ x: 0.1, y: 0.5 });
  });

  it("refuses a move onto or past a neighbour, keeping the node where it was", () => {
    expect(moveNode(three, 1, 1, 0.9, CHANNELS.lightness)).toBe(three);
    expect(moveNode(three, 1, MIN_X_DISTANCE, 0.9, CHANNELS.lightness)).toBe(three);
    expect(moveNode(three, 1, 0.5 + 0.1, 0.9, CHANNELS.lightness)[1]).toEqual({ x: 0.6, y: 0.9 });
  });

  it("keeps hue's end nodes the minimum distance apart across the wrap", () => {
    const hue: CurveNode[] = [
      { x: 0.1, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.5 },
    ];
    expect(moveNode(hue, 2, 1, 0.5, CHANNELS.hue)[2].x).toBe(1);
    expect(moveNode(hue, 0, 0, 0.5, CHANNELS.hue)[0].x).toBe(0);
    const last: CurveNode[] = [
      { x: 0.001, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.5 },
    ];
    expect(moveNode(last, 2, 1, 0.5, CHANNELS.hue)[2].x).toBeCloseTo(1.001 - MIN_X_DISTANCE, 6);
  });
});

describe("removeNode", () => {
  it("removes the node", () => {
    expect(removeNode(three, 1)).toEqual([three[0], three[2]]);
  });

  it("keeps a last node, centred and flat", () => {
    expect(removeNode([{ x: 0.3, y: 0.9 }], 0)).toEqual([{ x: 0.5, y: 0.5 }]);
  });
});

describe("resetNodeY", () => {
  it("puts the node back on the centre line", () => {
    expect(resetNodeY(three, 1)[1]).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("nearestNode", () => {
  it("picks the closest node within darktable's radius, in graph units", () => {
    expect(nearestNode(three, 0.52, 0.71)).toBe(1);
    expect(nearestNode(three, 0.5 + HOVER_RADIUS, 0.7)).toBe(-1);
    expect(nearestNode(three, 0.02, 0.5)).toBe(0);
  });
});

describe("nearestX", () => {
  it("picks the node nearest along the axis, however far off the curve", () => {
    expect(nearestX(three, 0.3)).toBe(1);
    expect(nearestX(three, 0.2)).toBe(0);
    expect(nearestX(three, 0.9)).toBe(2);
  });
});

describe("areaEdit", () => {
  it("pulls the node under the pointer all the way, and others by a Gaussian of their distance", () => {
    const out = areaEdit(three, 0.5, 0.2, AREA_RADIUS);
    expect(out[1]).toEqual({ x: 0.5, y: 0.2 });
    const f = Math.exp(-(0.5 * 0.5) / (AREA_RADIUS * AREA_RADIUS));
    expect(out[0].y).toBeCloseTo((1 - f) * 0.5 + f * 0.2, 12);
    expect(out.map((n) => n.x)).toEqual(three.map((n) => n.x));
  });
});

describe("stepRadius", () => {
  it("grows and shrinks by a tenth per notch, between 0.2 / nodes and 1", () => {
    expect(stepRadius(0.125, 1, 8)).toBeCloseTo(0.1375, 12);
    expect(stepRadius(0.125, -1, 8)).toBeCloseTo(0.1125, 12);
    expect(stepRadius(0.026, -1, 8)).toBe(0.025);
    expect(stepRadius(0.95, 1, 8)).toBe(1);
  });
});

describe("curveFromPick", () => {
  const defaults = DEFAULT_PARAMS.curves[CHANNELS.chroma].nodes;
  const picked = { min: 0.4, mean: 0.45, max: 0.6 };

  it("adds feather, min, centre, max and feather to the default nodes, flat", () => {
    expect(curveFromPick(defaults, picked, 0)).toEqual([
      { x: 0.25, y: 0.5 },
      { x: 0.38, y: 0.5 },
      { x: 0.4, y: 0.5 },
      { x: 0.45, y: 0.5 },
      { x: 0.6, y: 0.5 },
      { x: 0.62, y: 0.5 },
      { x: 0.75, y: 0.5 },
    ]);
  });

  it("raises the picked range by 0.1 at its edges and 0.2 at its centre, or lowers it", () => {
    const up = curveFromPick(defaults, picked, 1).map((n) => n.y);
    expect(up.map((y) => Math.round(y * 1e9) / 1e9)).toEqual([0.5, 0.5, 0.6, 0.7, 0.6, 0.5, 0.5]);
    const down = curveFromPick(defaults, picked, -1).map((n) => n.y);
    expect(down.map((y) => Math.round(y * 1e9) / 1e9)).toEqual([0.5, 0.5, 0.4, 0.3, 0.4, 0.5, 0.5]);
  });

  it("skips positions outside (0, 1) and ones too close to another node", () => {
    const nodes = curveFromPick(defaults, { min: 0.01, mean: 0.01, max: 0.99 }, 0);
    expect(nodes.map((n) => n.x)).toEqual([0.01, 0.25, 0.75, 0.99]);
  });
});
