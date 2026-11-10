// The GPU side: darktable's color zones as one inline fragment in the host's
// display-adjust phase, the point in Safelight's pipeline that matches
// darktable's Lab section (display-referred, after the tone transform),
// ordered after the Colour Correction port as darktable's pipe orders
// colorcorrection before colorzones. There is no prepass; the work is per
// pixel.
//
// The display colour `c` arrives sRGB-encoded and, through the declared
// space, unclipped on process version 2. The branch decodes it with the
// host's curve extended both ways, takes it to D50 Lab through darktable's
// matrix, reads the three curves at the pixel's selector, applies them as
// process_v3 (smooth) or process_v1 (strong) does, and encodes it back the
// same way. Version 1 photos hand `c` clipped, which the same path reads as
// it is.
//
// The curves depend on the params alone, so their splines are solved on the
// CPU: bagPatch writes each node with its knot's y and tangent, and per pixel
// the shader only finds the piece the selector falls in and evaluates it as
// spline.ts splineFrom does. Solving the tangents per pixel took local arrays
// written in nested loops, which Direct3D 11 (ANGLE) failed to link. While
// every node sits on the centre line `active` is 0: the renderer leaves the
// stage out, and where it is in the program (a mask's copy, a build without
// dormancy) the branch is not taken, so the stage is a bit-exact no-op.
// Every constant is formatted from the model's numbers, so the shader and
// the CPU reference cannot drift.

import type { GlslType, ProcessingStageContribution, UniformDeclaration } from "./safelight";
import {
  CHANNELS,
  D50_WHITE,
  DEFAULT_PARAMS,
  LAB_CBRT_EPSILON,
  LAB_EPSILON,
  LAB_KAPPA,
  MAX_NODES,
  MODES,
  SRGB_TO_XYZ_D50,
  STRENGTH_LIMIT,
  TABLE_STRETCH,
  XYZ_D50_TO_SRGB,
} from "./model";
import { PARAM_KEYS, STAGE_ID, bagPatch, qualified, type ParamKey } from "./params";

/** A GLSL float literal at full single precision, always with a decimal point
 *  (GLSL ES never promotes an integer literal to float). */
export function glslLiteral(v: number): string {
  const s = v.toPrecision(10);
  return s.includes("e") ? v.toFixed(12) : s;
}

/** A row-major 3×3 as a GLSL mat3 constructor (column-major arguments). */
function glslMat3(rowMajor: readonly number[]): string {
  const cols = [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => glslLiteral(rowMajor[i]));
  return `mat3(${cols.join(", ")})`;
}

const N = String(MAX_NODES);
const EPS = glslLiteral(LAB_EPSILON);
const CBRT_EPS = glslLiteral(LAB_CBRT_EPSILON);
const KAPPA = glslLiteral(LAB_KAPPA);
const WHITE = `vec3(${D50_WHITE.map(glslLiteral).join(", ")})`;
const STRETCH = glslLiteral(TABLE_STRETCH);
const TWO_PI = glslLiteral(2 * Math.PI);
const STRONG_C = glslLiteral(1 / (128 * Math.SQRT2));

// Helpers take everything as arguments, so a mask's copy of the stage shares
// them. The host rewrites the uniform keys (selectBy, mode, strength, active,
// count, interpolation, curveL, curveC, curveH) at identifier boundaries here
// and in the inline block, so no local or parameter uses one of those names.
const HELPERS = `
vec3 czDecode(vec3 y) {
  vec3 a = abs(y);
  return sign(y) * mix(a / 12.92, pow((a + 0.055) / 1.055, vec3(2.4)), step(0.04045, a));
}
vec3 czEncode(vec3 x) {
  vec3 a = abs(x);
  return sign(x) * mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, a));
}
float czF(float t) {
  return t > ${EPS} ? pow(t, 1.0 / 3.0) : (${KAPPA} * t + 16.0) / 116.0;
}
float czFInv(float f) {
  return f > ${CBRT_EPS} ? f * f * f : (116.0 * f - 16.0) / ${KAPPA};
}
vec3 czLab(vec3 rgb) {
  const mat3 toXyz = ${glslMat3(SRGB_TO_XYZ_D50)};
  vec3 r = (toXyz * rgb) / ${WHITE};
  vec3 f = vec3(czF(r.x), czF(r.y), czF(r.z));
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}
vec3 czRgb(vec3 lab) {
  const mat3 toRgb = ${glslMat3(XYZ_D50_TO_SRGB)};
  float fy = (lab.x + 16.0) / 116.0;
  float fx = lab.y / 500.0 + fy;
  float fz = fy - lab.z / 200.0;
  return toRgb * (vec3(czFInv(fx), czFInv(fy), czFInv(fz)) * ${WHITE});
}

// dt_Lab_2_LCH's hue from an atan2 angle.
float czLchHue(float turn) {
  return turn > 0.0 ? turn / ${TWO_PI} : 1.0 - abs(turn) / ${TWO_PI};
}

// spline_base::operator()'s cubic Hermite piece from node a to node b, h
// apart; a node holds x, y, the knot's y and its tangent.
float czPiece(vec4 a, vec4 b, float h, float v) {
  float t = (v - a.x) / h;
  float t2 = t * t;
  float t3 = t2 * t;
  return (2.0 * t3 - 3.0 * t2 + 1.0) * a.z + (t3 - 2.0 * t2 + t) * h * a.w
    + (-2.0 * t3 + 3.0 * t2) * b.z + (t3 - t2) * h * b.w;
}

// The curve clamped to [0, 1] and rounded as darktable's table holds it
// (model.ts quantize).
float czTable(float y) {
  return floor(clamp(y, 0.0, 1.0) * 65535.0 + 0.5) / 65536.0;
}
`;

/** One curve read at czV into `out`. The search reads the curve's uniform in
 *  place rather than through a helper: it indexes the nodes at run-time
 *  indices, and a helper's array parameter would be a local copy indexed
 *  that way. */
function curveRead(key: ParamKey, n: string, out: string): string {
  return `
    {
      int czN = clamp(${n}, 1, ${N});
      float czX = czV;
      vec4 czFirst = ${key}[0];
      vec4 czLast = ${key}[czN - 1];
      float czY;
      if (czN == 1 || (!czWrap && czX <= czFirst.x)) {
        czY = czFirst.z;
      } else if (!czWrap && czX >= czLast.x) {
        czY = czLast.z;
      } else {
        if (czWrap) {
          czX = mod(czX, 1.0);
          if (czX < czFirst.x) czX += 1.0;
        }
        int czAbove = czN;
        for (int czK = 0; czK < ${N}; czK++) {
          if (czK >= czN) break;
          if (${key}[czK].x > czX) { czAbove = czK; break; }
        }
        int czI0 = czWrap ? (czAbove > 0 ? czAbove - 1 : czN - 1) : min(czAbove - 1, czN - 2);
        int czI1 = czI0 + 1 < czN ? czI0 + 1 : 0;
        vec4 czA = ${key}[czI0];
        vec4 czB = ${key}[czI1];
        czY = czPiece(czA, czB, czI1 > czI0 ? czB.x - czA.x : czB.x - (czA.x - 1.0), czX);
      }
      ${out} = czTable(czY);
    }`;
}

const INLINE = `
{
  if (active != 0) {
    vec3 czPix = czLab(czDecode(c));
    float czC = length(czPix.yz);
    float czTurn = czC > 0.0 ? atan(czPix.z, czPix.y) : 0.0;
    float czH = mod(czTurn + ${TWO_PI}, ${TWO_PI}) / ${TWO_PI};
    bool czStrong = mode == ${MODES.strong};
    float czS;
    float czBlend = 0.0;
    if (czStrong) {
      czS = selectBy == ${CHANNELS.lightness} ? czPix.x * 0.01
        : selectBy == ${CHANNELS.chroma} ? czC * ${STRONG_C}
        : czLchHue(czTurn);
      czS = clamp(czS, 0.0, 1.0);
    } else if (selectBy == ${CHANNELS.lightness}) {
      czS = min(1.0, czPix.x / 100.0);
    } else if (selectBy == ${CHANNELS.chroma}) {
      czS = min(1.0, czC / 128.0);
    } else {
      czS = czH;
      czBlend = (1.0 - czC / 128.0) * (1.0 - czC / 128.0);
    }
    float czV = clamp(czS * ${STRETCH}, 0.0, 1.0);
    bool czWrap = selectBy == ${CHANNELS.hue};
    float czLm;
    float czCm;
    float czHm;${curveRead("curveL", "count.x", "czLm")}${curveRead("curveC", "count.y", "czCm")}${curveRead("curveH", "count.z", "czHm")}
    if (czStrong) {
      float czTurns = czLchHue(czTurn) + czHm - 0.5;
      float czChroma = czC * 2.0 * czCm;
      czPix = vec3(czPix.x * exp2(4.0 * (czLm - 0.5)), cos(${TWO_PI} * czTurns) * czChroma, sin(${TWO_PI} * czTurns) * czChroma);
    } else {
      float czLs = czBlend * 0.5 + (1.0 - czBlend) * czLm - 0.5;
      float czHs = czBlend * 0.5 + (1.0 - czBlend) * czHm - 0.5;
      float czChroma = 2.0 * czCm * czC;
      czPix = vec3(czPix.x * exp2(4.0 * czLs), cos(${TWO_PI} * (czH + czHs)) * czChroma, sin(${TWO_PI} * (czH + czHs)) * czChroma);
    }
    c = czEncode(czRgb(czPix));
  }
}
`;

type Scalar = { glslType: GlslType; range: { min: number; max: number; step?: number } };

const SCALARS: Partial<Record<ParamKey, Scalar>> = {
  selectBy: { glslType: "int", range: { min: 0, max: 2, step: 1 } },
  mode: { glslType: "int", range: { min: 0, max: 1, step: 1 } },
  strength: { glslType: "float", range: { min: -STRENGTH_LIMIT, max: STRENGTH_LIMIT, step: 1 } },
  active: { glslType: "int", range: { min: 0, max: 1, step: 1 } },
};

const LABELS: Record<ParamKey, string> = {
  selectBy: "select by",
  mode: "process mode",
  strength: "mix",
  active: "active",
  count: "nodes",
  interpolation: "interpolation method",
  curveL: "lightness curve",
  curveC: "chroma curve",
  curveH: "hue curve",
};

function uniforms(): UniformDeclaration[] {
  const defaults = bagPatch(DEFAULT_PARAMS);
  return PARAM_KEYS.map((key): UniformDeclaration => {
    const value = defaults[qualified(key)];
    const label = LABELS[key];
    const scalar = SCALARS[key];
    if (scalar) return { key, glslType: scalar.glslType, default: value, label, range: scalar.range };
    if (key === "count" || key === "interpolation") return { key, glslType: "ivec3", default: value, label };
    return { key, glslType: "vec4", length: MAX_NODES, default: value, label };
  });
}

export function zonesStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Colour Zones",
    phase: "display-adjust",
    space: { encoding: "perceptual" },
    glsl: INLINE,
    helpers: HELPERS,
    uniforms: uniforms(),
    presetScope: "global",
    // A mask's copy runs at the defaults until one of its nodes moves, so the
    // gate keeps an untouched mask bit-exact too.
    mask: { maskable: true },
    dormantWhen: { active: 0 },
    after: ["colour-correction.lab"],
  };
}
