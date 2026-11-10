// darktable's version 2 splines (src/common/splines.cpp, namespace interpol),
// reimplemented: cubic Hermite pieces whose knot tangents come from one of
// three rules, on an open interval or around a period. splineKnots solves the
// knots and splineFrom evaluates them. The stage's GLSL (stage.ts) evaluates
// the same solved knots from the param bag, so keep the two evaluations in
// step.
//
// darktable builds every spline with the y limits [0, 1] its curve box sets,
// so evaluation clamps there. The open spline also clamps x to its first and
// last knots, where it extends flat.

export const INTERPOLATIONS = Object.freeze({ cubic: 0, centripetal: 1, monotone: 2 } as const);
export type Interpolation = (typeof INTERPOLATIONS)[keyof typeof INTERPOLATIONS];

export interface Knot {
  x: number;
  y: number;
}

const FLOAT_EPSILON = 1.1920928955078125e-7;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Catmull_Rom_spline::init: central differences, one-sided at open ends. */
function centripetalTangents(x: readonly number[], y: readonly number[], periodic: boolean): number[] {
  const n = x.length;
  const dy = new Array<number>(n).fill(0);
  if (n === 1) return dy;
  for (let i = 1; i < n - 1; i++) dy[i] = (y[i + 1] - y[i - 1]) / (x[i + 1] - x[i - 1]);
  if (periodic) {
    dy[0] = (y[1] - y[n - 1]) / (x[1] - x[n - 1] + 1);
    dy[n - 1] = (y[0] - y[n - 2]) / (x[0] - x[n - 2] + 1);
  } else {
    dy[0] = (y[1] - y[0]) / (x[1] - x[0]);
    dy[n - 1] = (y[n - 1] - y[n - 2]) / (x[n - 1] - x[n - 2]);
  }
  return dy;
}

/** monotone_hermite_spline::init (open): Fritsch–Carlson, limited in order. */
function monotoneTangents(x: readonly number[], y: readonly number[]): number[] {
  const n = x.length;
  const dy = new Array<number>(n).fill(0);
  if (n === 1) return dy;
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) delta.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  dy[0] = delta[0];
  for (let i = 1; i < n - 1; i++) dy[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  dy[n - 1] = delta[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(delta[i]) < FLOAT_EPSILON) {
      dy[i] = 0;
      dy[i + 1] = 0;
    } else {
      const alpha = dy[i] / delta[i];
      const beta = dy[i + 1] / delta[i];
      const tau = alpha * alpha + beta * beta;
      if (tau > 9) {
        dy[i] = (3 * alpha * delta[i]) / Math.sqrt(tau);
        dy[i + 1] = (3 * beta * delta[i]) / Math.sqrt(tau);
      }
    }
  }
  return dy;
}

/** monotone_hermite_spline_variant::init (periodic): the weighted harmonic
 *  mean of SIAM J. Sci. Stat. Comput. 5 (1984), the periodic monotone rule
 *  darktable's sampler picks. */
function monotoneVariantTangents(x: readonly number[], y: readonly number[]): number[] {
  const n = x.length;
  const dy = new Array<number>(n).fill(0);
  if (n === 1) return dy;
  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(x[i + 1] - x[i]);
    delta.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  }
  h.push(x[0] - x[n - 1] + 1);
  delta.push((y[0] - y[n - 1]) / (x[0] - x[n - 1] + 1));
  const g = (s1: number, s2: number, h1: number, h2: number): number => {
    if (s1 * s2 > 0) {
      const alpha = (h1 + 2 * h2) / (3 * (h1 + h2));
      return (s1 * s2) / (alpha * s2 + (1 - alpha) * s1);
    }
    return 0;
  };
  dy[0] = g(delta[n - 1], delta[0], h[n - 1], h[0]);
  for (let i = 1; i < n; i++) dy[i] = g(delta[i - 1], delta[i], h[i - 1], h[i]);
  return dy;
}

/** smooth_cubic_spline::init: second derivatives from the spline's linear
 *  system (natural ends, or closed around the period), then the tangents.
 *  The periodic system is cyclic tridiagonal; darktable factors it densely
 *  without pivoting, which only ever fills the last row and column, so those
 *  are all this keeps. */
function cubicTangents(x: readonly number[], y: readonly number[], periodic: boolean): number[] {
  const n = x.length;
  const dy = new Array<number>(n).fill(0);
  if (n === 1) return dy;
  const dx: number[] = [];
  const dyv: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(x[i + 1] - x[i]);
    dyv.push(y[i + 1] - y[i]);
  }
  if (periodic) {
    dx.push(x[0] - x[n - 1] + 1);
    dyv.push(y[0] - y[n - 1]);
  }
  // Row i holds sub[i] at column i-1, diag[i], sup[i] at column i+1; when
  // periodic, col[i] is column n-1 and row[j] is row n-1's column j.
  const sub = new Array<number>(n).fill(0);
  const diag = new Array<number>(n).fill(0);
  const sup = new Array<number>(n).fill(0);
  const b = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    sub[i] = dx[i - 1] / 6;
    diag[i] = (dx[i - 1] + dx[i]) / 3;
    sup[i] = dx[i] / 6;
    b[i] = dyv[i] / dx[i] - dyv[i - 1] / dx[i - 1];
  }
  if (!periodic) {
    diag[0] = 1;
    diag[n - 1] = 1;
    solveTridiagonal(sub, diag, sup, b);
  } else {
    diag[0] = (dx[n - 1] + dx[0]) / 3;
    diag[n - 1] = (dx[n - 2] + dx[n - 1]) / 3;
    b[0] = dyv[0] / dx[0] - dyv[n - 1] / dx[n - 1];
    b[n - 1] = dyv[n - 1] / dx[n - 1] - dyv[n - 2] / dx[n - 2];
    if (n > 2) {
      sup[0] = dx[0] / 6;
      sub[n - 1] = dx[n - 2] / 6;
      solveCyclic(sub, diag, sup, dx[n - 1] / 6, b);
    } else {
      const off = (dx[0] + dx[1]) / 6;
      solveDense2(diag, off, b);
    }
  }
  let c = 0;
  for (let i = 0; i < n - 1; i++) {
    c = dyv[i] / dx[i] - (dx[i] / 6) * (b[i + 1] - b[i]);
    dy[i] = (-dx[i] * b[i]) / 2 + c;
  }
  dy[n - 1] = periodic ? (dx[n - 2] * b[n - 1]) / 2 + c : c;
  return dy;
}

/** LU_factor + LU_solve on the banded matrix, in place on b. */
function solveTridiagonal(sub: number[], diag: number[], sup: number[], b: number[]): void {
  const n = diag.length;
  for (let i = 0; i + 1 < n; i++) {
    sub[i + 1] /= diag[i];
    diag[i + 1] -= sub[i + 1] * sup[i];
  }
  for (let i = 1; i < n; i++) b[i] -= sub[i] * b[i - 1];
  for (let i = n - 1; i >= 0; i--) {
    if (i + 1 < n) b[i] -= sup[i] * b[i + 1];
    b[i] /= diag[i];
  }
}

/** The dense LU_factor + LU_solve on a cyclic tridiagonal matrix whose corner
 *  entries are both `corner`, keeping only the entries that can be non-zero:
 *  the band, column n-1 (col) and row n-1 (row). */
function solveCyclic(sub: number[], diag: number[], sup: number[], corner: number, b: number[]): void {
  const n = diag.length;
  // col[i] = A(i, n-1) for i < n-1; row[j] = A(n-1, j) for j < n-1.
  const col = new Array<number>(n).fill(0);
  const row = new Array<number>(n).fill(0);
  col[0] = corner;
  col[n - 2] = sup[n - 2];
  row[0] = corner;
  row[n - 2] = sub[n - 1];
  let last = diag[n - 1];
  for (let i = 0; i + 1 < n; i++) {
    const t = diag[i];
    // Rows i+1 (when it isn't the last) and n-1 lose their column-i entries.
    if (i + 1 < n - 1) {
      const l = sub[i + 1] / t;
      sub[i + 1] = l;
      diag[i + 1] -= l * sup[i];
      // Column n-1 of row i+1: its own band entry when i+1 = n-2, else fill.
      col[i + 1] -= l * col[i];
      if (i + 1 === n - 2) sup[n - 2] = col[n - 2];
    }
    const r = row[i] / t;
    row[i] = r;
    if (i + 1 < n - 1) row[i + 1] -= r * sup[i];
    last -= r * col[i];
  }
  // Forward substitution (unit lower).
  for (let i = 1; i < n - 1; i++) b[i] -= sub[i] * b[i - 1];
  for (let j = 0; j < n - 1; j++) b[n - 1] -= row[j] * b[j];
  // Back substitution.
  b[n - 1] /= last;
  for (let i = n - 2; i >= 0; i--) {
    if (i + 1 < n - 1) b[i] -= sup[i] * b[i + 1];
    b[i] -= col[i] * b[n - 1];
    b[i] /= diag[i];
  }
}

/** Two knots around a period: the full 2×2 system. */
function solveDense2(diag: number[], off: number, b: number[]): void {
  const l = off / diag[0];
  const d1 = diag[1] - l * off;
  b[1] -= l * b[0];
  b[1] /= d1;
  b[0] = (b[0] - off * b[1]) / diag[0];
}

export interface Spline {
  (x: number): number;
}

/** A solved spline: the knots in evaluation order with their tangents. */
export interface SplineKnots {
  x: number[];
  y: number[];
  dy: number[];
}

/** The knots of a spline through `knots` (sorted by x, x distinct, at least
 *  one), solved: around a period, x wrapped into [0, 1) and the knots sorted;
 *  then each knot's tangent by the interpolation's rule. */
export function splineKnots(knots: readonly Knot[], type: Interpolation, periodic: boolean): SplineKnots {
  let pts = knots.map((k) => ({ x: k.x, y: k.y }));
  if (periodic) {
    pts = pts.map((k) => ({ x: ((k.x % 1) + 1) % 1, y: k.y }));
    pts.sort((a, b) => a.x - b.x);
  }
  const x = pts.map((k) => k.x);
  const y = pts.map((k) => k.y);
  const dy =
    type === INTERPOLATIONS.cubic
      ? cubicTangents(x, y, periodic)
      : type === INTERPOLATIONS.monotone
        ? periodic
          ? monotoneVariantTangents(x, y)
          : monotoneTangents(x, y)
        : centripetalTangents(x, y, periodic);
  return { x, y, dy };
}

/** The spline whose knots splineKnots solved, with darktable's evaluation:
 *  clamped to [0, 1] in y, flat past the ends when open, wrapped by a period
 *  of 1 when periodic. */
export function splineFrom({ x, y, dy }: SplineKnots, periodic: boolean): Spline {
  const n = x.length;
  if (n === 1) return () => y[0];

  return (xin: number): number => {
    let v = xin;
    let n0 = 0;
    let n1 = 0;
    let h = 0;
    if (periodic) {
      v = v % 1;
      if (v < x[0]) v += 1;
      n0 = upperBound(x, v);
      n0 = n0 > 0 ? n0 - 1 : n - 1;
      n1 = n0 + 1 < n ? n0 + 1 : 0;
      h = n1 > n0 ? x[n1] - x[n0] : x[n1] - (x[n0] - 1);
    } else {
      v = Math.min(Math.max(v, x[0]), x[n - 1]);
      if (v <= x[0]) return clamp01(y[0]);
      if (v >= x[n - 1]) return clamp01(y[n - 1]);
      n0 = Math.min(upperBound(x, v) - 1, n - 2);
      n1 = n0 + 1;
      h = x[n1] - x[n0];
    }
    const t = (v - x[n0]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return clamp01(h00 * y[n0] + h10 * h * dy[n0] + h01 * y[n1] + h11 * h * dy[n1]);
  };
}

/** std::upper_bound: the first index whose x is greater than v. */
function upperBound(x: readonly number[], v: number): number {
  let i = 0;
  while (i < x.length && x[i] <= v) i++;
  return i;
}
