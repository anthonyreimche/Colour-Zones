// A stage runs on every photo, so at its defaults it must leave the image as
// it was. Unit tests can't run GLSL (the reference rig renders it against
// darktable); these hold the parts that make the idle stage a no-op, its
// place in the pipeline, the uniforms the bag binds, and a shader shape
// Direct3D 11 links.

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, MAX_NODES, SRGB_TO_XYZ_D50 } from "../src/model";
import { PARAM_KEYS, STAGE_ID, bagPatch } from "../src/params";
import { glslLiteral, zonesStage } from "../src/stage";

const stage = zonesStage();

/** The body of every for loop in `src`, from its opening brace to the match. */
function loopBodies(src: string): string[] {
  return [...src.matchAll(/\bfor\s*\(/g)].map((m) => {
    const open = src.indexOf("{", m.index);
    let depth = 0;
    let end = open;
    for (; end < src.length; end++) {
      if (src[end] === "{") depth++;
      else if (src[end] === "}" && --depth === 0) break;
    }
    return src.slice(open + 1, end);
  });
}

describe("zonesStage", () => {
  it("sits in darktable's Lab section: display-adjust, after Colour Correction", () => {
    expect(stage.id).toBe(STAGE_ID);
    expect(stage.phase).toBe("display-adjust");
    expect(stage.after).toEqual(["colour-correction.lab"]);
  });

  it("asks for the display values unclipped, as darktable's Lab modules see them", () => {
    expect(stage.space).toEqual({ encoding: "perceptual" });
  });

  it("declares one uniform per param, defaulting to the defaults' bag values", () => {
    expect(stage.uniforms.map((u) => u.key)).toEqual([...PARAM_KEYS]);
    const patch = bagPatch(DEFAULT_PARAMS);
    for (const u of stage.uniforms) expect(u.default).toEqual(patch[`${STAGE_ID}.${u.key}`]);
  });

  it("types the uniforms as the shader reads them", () => {
    const types = Object.fromEntries(stage.uniforms.map((u) => [u.key, [u.glslType, u.length]]));
    expect(types).toEqual({
      selectBy: ["int", undefined],
      mode: ["int", undefined],
      strength: ["float", undefined],
      active: ["int", undefined],
      count: ["ivec3", undefined],
      interpolation: ["ivec3", undefined],
      curveL: ["vec4", MAX_NODES],
      curveC: ["vec4", MAX_NODES],
      curveH: ["vec4", MAX_NODES],
    });
  });

  // Every develop-program uniform shares one budget (MAX_FRAGMENT_UNIFORM_VECTORS,
  // 224 at WebGL 2's minimum), and each mask that uses the stage adds a copy:
  // a vec4 per node and one row per scalar, nothing more.
  it("takes 66 uniform rows: twenty nodes per curve and six scalars", () => {
    const rows = stage.uniforms.reduce((sum, u) => sum + (u.length ?? 1), 0);
    expect(rows).toBe(3 * MAX_NODES + 6);
  });

  it("is dormant, left out of the program, while no node has moved", () => {
    expect(stage.dormantWhen).toEqual({ active: 0 });
    expect(bagPatch(DEFAULT_PARAMS)[`${STAGE_ID}.active`]).toBe(0);
  });

  // Direct3D 11 (ANGLE) failed to link the per-pixel tangent solvers: local
  // arrays written at run-time indices inside nested loops. The splines are
  // solved on the CPU into the curve uniforms; the shader only evaluates them.
  describe("evaluates the solved knots without solving them", () => {
    const glsl = `${stage.helpers}
${stage.glsl}`;

    it("reads each curve's uniform", () => {
      for (const key of ["curveL", "curveC", "curveH"]) expect(stage.glsl).toContain(`${key}[`);
    });

    it("declares no local arrays", () => {
      expect(glsl).not.toMatch(/\b(?:float|int|bool|[iu]?vec[234]|mat[234])\s*(?:\[[^\]]*\]\s*\w+|\w+\s*\[[^\]]*\])\s*[;=]/);
    });

    it("nests no loops", () => {
      for (const body of loopBodies(glsl)) expect(body).not.toMatch(/\b(?:for|while)\s*\(/);
    });

    it("has none of the tangent solvers", () => {
      for (const name of ["czKnots", "czCentripetal", "czMonotone", "czMonotonePeriodic", "czHarmonic", "czCubic"]) {
        expect(glsl).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
    });
  });

  it("only writes the pixel inside the branch the active flag guards", () => {
    const body = stage.glsl;
    const branch = body.indexOf("if (active != 0)");
    expect(branch).toBeGreaterThan(0);
    expect(body.match(/\bc\s*=/g)).toHaveLength(1);
    expect(body.indexOf("c =")).toBeGreaterThan(branch);
  });

  it("uses the model's Lab matrix", () => {
    expect(stage.helpers).toContain(glslLiteral(SRGB_TO_XYZ_D50[0]));
  });

  it("is maskable and a global look in presets", () => {
    expect(stage.mask).toEqual({ maskable: true });
    expect(stage.presetScope).toBe("global");
  });

  it("writes float literals GLSL accepts", () => {
    expect(glslLiteral(1)).toBe("1.000000000");
    expect(glslLiteral(-2)).toBe("-2.000000000");
    expect(glslLiteral(0.25)).toBe("0.2500000000");
    expect(glslLiteral(1.52587890625e-5)).toBe("0.00001525878906");
  });
});
