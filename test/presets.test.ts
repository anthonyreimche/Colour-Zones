// The built-in presets against darktable's own: test/reference compiles
// init_presets() as it is, and every preset's params must match it to single
// precision (darktable computes k / 7 in float).

import { describe, expect, it } from "vitest";
import { CHANNEL_LIST } from "../src/model";
import { PRESETS } from "../src/presets";
import { dtPresets, paramsOf } from "./support/dt-vectors";

describe("PRESETS", () => {
  it("are darktable's six, in its order", () => {
    expect(PRESETS.map((p) => p.label.toLowerCase())).toEqual(dtPresets.map((p) => p.name.toLowerCase()));
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  for (const dt of dtPresets) {
    it(`"${dt.name}" sets darktable's params`, () => {
      const ours = PRESETS.find((p) => p.label.toLowerCase() === dt.name.toLowerCase());
      expect(ours).toBeDefined();
      const want = paramsOf(dt);
      const got = ours!.params;
      expect(got.selectBy).toBe(want.selectBy);
      expect(got.mode).toBe(want.mode);
      expect(got.strength).toBe(want.strength);
      for (const ch of CHANNEL_LIST) {
        expect(got.curves[ch].interpolation).toBe(want.curves[ch].interpolation);
        expect(got.curves[ch].nodes.length).toBe(want.curves[ch].nodes.length);
        got.curves[ch].nodes.forEach((n, k) => {
          expect(n.x).toBeCloseTo(want.curves[ch].nodes[k].x, 6);
          expect(n.y).toBeCloseTo(want.curves[ch].nodes[k].y, 6);
        });
      }
    });
  }
});
