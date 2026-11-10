//#region src/spline.ts
var e = Object.freeze({
	cubic: 0,
	centripetal: 1,
	monotone: 2
}), t = 1.1920928955078125e-7, n = (e) => e < 0 ? 0 : e > 1 ? 1 : e;
function r(e, t, n) {
	let r = e.length, i = Array(r).fill(0);
	if (r === 1) return i;
	for (let n = 1; n < r - 1; n++) i[n] = (t[n + 1] - t[n - 1]) / (e[n + 1] - e[n - 1]);
	return n ? (i[0] = (t[1] - t[r - 1]) / (e[1] - e[r - 1] + 1), i[r - 1] = (t[0] - t[r - 2]) / (e[0] - e[r - 2] + 1)) : (i[0] = (t[1] - t[0]) / (e[1] - e[0]), i[r - 1] = (t[r - 1] - t[r - 2]) / (e[r - 1] - e[r - 2])), i;
}
function i(e, n) {
	let r = e.length, i = Array(r).fill(0);
	if (r === 1) return i;
	let a = [];
	for (let t = 0; t < r - 1; t++) a.push((n[t + 1] - n[t]) / (e[t + 1] - e[t]));
	i[0] = a[0];
	for (let e = 1; e < r - 1; e++) i[e] = a[e - 1] * a[e] <= 0 ? 0 : (a[e - 1] + a[e]) / 2;
	i[r - 1] = a[r - 2];
	for (let e = 0; e < r - 1; e++) if (Math.abs(a[e]) < t) i[e] = 0, i[e + 1] = 0;
	else {
		let t = i[e] / a[e], n = i[e + 1] / a[e], r = t * t + n * n;
		r > 9 && (i[e] = 3 * t * a[e] / Math.sqrt(r), i[e + 1] = 3 * n * a[e] / Math.sqrt(r));
	}
	return i;
}
function a(e, t) {
	let n = e.length, r = Array(n).fill(0);
	if (n === 1) return r;
	let i = [], a = [];
	for (let r = 0; r < n - 1; r++) i.push(e[r + 1] - e[r]), a.push((t[r + 1] - t[r]) / (e[r + 1] - e[r]));
	i.push(e[0] - e[n - 1] + 1), a.push((t[0] - t[n - 1]) / (e[0] - e[n - 1] + 1));
	let o = (e, t, n, r) => {
		if (e * t > 0) {
			let i = (n + 2 * r) / (3 * (n + r));
			return e * t / (i * t + (1 - i) * e);
		}
		return 0;
	};
	r[0] = o(a[n - 1], a[0], i[n - 1], i[0]);
	for (let e = 1; e < n; e++) r[e] = o(a[e - 1], a[e], i[e - 1], i[e]);
	return r;
}
function o(e, t, n) {
	let r = e.length, i = Array(r).fill(0);
	if (r === 1) return i;
	let a = [], o = [];
	for (let n = 0; n < r - 1; n++) a.push(e[n + 1] - e[n]), o.push(t[n + 1] - t[n]);
	n && (a.push(e[0] - e[r - 1] + 1), o.push(t[0] - t[r - 1]));
	let u = Array(r).fill(0), d = Array(r).fill(0), f = Array(r).fill(0), p = Array(r).fill(0);
	for (let e = 1; e < r - 1; e++) u[e] = a[e - 1] / 6, d[e] = (a[e - 1] + a[e]) / 3, f[e] = a[e] / 6, p[e] = o[e] / a[e] - o[e - 1] / a[e - 1];
	n ? (d[0] = (a[r - 1] + a[0]) / 3, d[r - 1] = (a[r - 2] + a[r - 1]) / 3, p[0] = o[0] / a[0] - o[r - 1] / a[r - 1], p[r - 1] = o[r - 1] / a[r - 1] - o[r - 2] / a[r - 2], r > 2 ? (f[0] = a[0] / 6, u[r - 1] = a[r - 2] / 6, c(u, d, f, a[r - 1] / 6, p)) : l(d, (a[0] + a[1]) / 6, p)) : (d[0] = 1, d[r - 1] = 1, s(u, d, f, p));
	let m = 0;
	for (let e = 0; e < r - 1; e++) m = o[e] / a[e] - a[e] / 6 * (p[e + 1] - p[e]), i[e] = -a[e] * p[e] / 2 + m;
	return i[r - 1] = n ? a[r - 2] * p[r - 1] / 2 + m : m, i;
}
function s(e, t, n, r) {
	let i = t.length;
	for (let r = 0; r + 1 < i; r++) e[r + 1] /= t[r], t[r + 1] -= e[r + 1] * n[r];
	for (let t = 1; t < i; t++) r[t] -= e[t] * r[t - 1];
	for (let e = i - 1; e >= 0; e--) e + 1 < i && (r[e] -= n[e] * r[e + 1]), r[e] /= t[e];
}
function c(e, t, n, r, i) {
	let a = t.length, o = Array(a).fill(0), s = Array(a).fill(0);
	o[0] = r, o[a - 2] = n[a - 2], s[0] = r, s[a - 2] = e[a - 1];
	let c = t[a - 1];
	for (let r = 0; r + 1 < a; r++) {
		let i = t[r];
		if (r + 1 < a - 1) {
			let s = e[r + 1] / i;
			e[r + 1] = s, t[r + 1] -= s * n[r], o[r + 1] -= s * o[r], r + 1 === a - 2 && (n[a - 2] = o[a - 2]);
		}
		let l = s[r] / i;
		s[r] = l, r + 1 < a - 1 && (s[r + 1] -= l * n[r]), c -= l * o[r];
	}
	for (let t = 1; t < a - 1; t++) i[t] -= e[t] * i[t - 1];
	for (let e = 0; e < a - 1; e++) i[a - 1] -= s[e] * i[e];
	i[a - 1] /= c;
	for (let e = a - 2; e >= 0; e--) e + 1 < a - 1 && (i[e] -= n[e] * i[e + 1]), i[e] -= o[e] * i[a - 1], i[e] /= t[e];
}
function l(e, t, n) {
	let r = t / e[0], i = e[1] - r * t;
	n[1] -= r * n[0], n[1] /= i, n[0] = (n[0] - t * n[1]) / e[0];
}
function u(t, n, s) {
	let c = t.map((e) => ({
		x: e.x,
		y: e.y
	}));
	s && (c = c.map((e) => ({
		x: (e.x % 1 + 1) % 1,
		y: e.y
	})), c.sort((e, t) => e.x - t.x));
	let l = c.map((e) => e.x), u = c.map((e) => e.y);
	return {
		x: l,
		y: u,
		dy: n === e.cubic ? o(l, u, s) : n === e.monotone ? s ? a(l, u) : i(l, u) : r(l, u, s)
	};
}
function d({ x: e, y: t, dy: r }, i) {
	let a = e.length;
	return a === 1 ? () => t[0] : (o) => {
		let s = o, c = 0, l = 0, u = 0;
		if (i) s %= 1, s < e[0] && (s += 1), c = f(e, s), c = c > 0 ? c - 1 : a - 1, l = c + 1 < a ? c + 1 : 0, u = l > c ? e[l] - e[c] : e[l] - (e[c] - 1);
		else {
			if (s = Math.min(Math.max(s, e[0]), e[a - 1]), s <= e[0]) return n(t[0]);
			if (s >= e[a - 1]) return n(t[a - 1]);
			c = Math.min(f(e, s) - 1, a - 2), l = c + 1, u = e[l] - e[c];
		}
		let d = (s - e[c]) / u, p = d * d, m = p * d, h = 2 * m - 3 * p + 1, g = m - 2 * p + d, _ = -2 * m + 3 * p, v = m - p;
		return n(h * t[c] + g * u * r[c] + _ * t[l] + v * u * r[l]);
	};
}
function f(e, t) {
	let n = 0;
	for (; n < e.length && e[n] <= t;) n++;
	return n;
}
//#endregion
//#region src/model.ts
var p = Object.freeze({
	lightness: 0,
	chroma: 1,
	hue: 2
}), m = [
	p.lightness,
	p.chroma,
	p.hue
], h = Object.freeze({
	smooth: 0,
	strong: 1
});
function g(e) {
	return e === p.hue ? [{
		x: .25,
		y: .5
	}, {
		x: .75,
		y: .5
	}] : [{
		x: 0,
		y: .5
	}, {
		x: 1,
		y: .5
	}];
}
function _(t) {
	return {
		interpolation: e.centripetal,
		nodes: g(t)
	};
}
function v(e) {
	return {
		selectBy: e,
		mode: h.smooth,
		strength: 0,
		curves: [
			_(e),
			_(e),
			_(e)
		]
	};
}
function y(e) {
	for (let t of e.curves) {
		for (let e of t.nodes) Object.freeze(e);
		Object.freeze(t.nodes), Object.freeze(t);
	}
	return Object.freeze(e.curves), Object.freeze(e);
}
var b = y(v(p.hue));
function x(e, t, n) {
	let r = [...e.curves];
	return r[t] = n, {
		...e,
		curves: r
	};
}
var S = (e) => e.curves.every((e) => e.nodes.every((e) => e.y === .5)), C = (e, t) => e + (e - .5) * (t / 100), w = (e) => e < 0 ? 0 : e > 1 ? 1 : e, ee = 65536 / 65535;
function T(e, t) {
	let n = e.curves[t];
	return u(n.nodes.map((t) => ({
		x: t.x,
		y: C(t.y, e.strength)
	})), n.interpolation, e.selectBy === p.hue);
}
function E(e, t) {
	let n = d(T(e, t), e.selectBy === p.hue);
	return (e) => w(n(e));
}
var D = 2 * Math.PI;
function O(e, t) {
	let n = Math.atan2(t, e);
	return n > 0 ? n / D : 1 - Math.abs(n) / D;
}
function k(e) {
	return e < .04045 ? e / 12.92 : ((e + .055) / 1.055) ** 2.4;
}
function A(e) {
	let t = Math.abs(e);
	return Math.sign(e) * (t < .0031308 ? t * 12.92 : 1.055 * t ** (1 / 2.4) - .055);
}
var j = [
	.9642,
	1,
	.8249
], M = [
	.4360747,
	.3850649,
	.1430804,
	.2225045,
	.7168786,
	.0606169,
	.0139322,
	.0971045,
	.7141733
];
function te(e) {
	let [t, n, r, i, a, o, s, c, l] = e, u = a * l - o * c, d = -(i * l - o * s), f = i * c - a * s, p = t * u + n * d + r * f;
	return [
		u / p,
		-(n * l - r * c) / p,
		(n * o - r * a) / p,
		d / p,
		(t * l - r * s) / p,
		-(t * o - r * i) / p,
		f / p,
		-(t * c - n * s) / p,
		(t * a - n * i) / p
	];
}
var ne = te(M), N = 216 / 24389, re = 24389 / 27, ie = Math.cbrt(N);
function ae(e, t) {
	return [
		e[0] * t[0] + e[1] * t[1] + e[2] * t[2],
		e[3] * t[0] + e[4] * t[1] + e[5] * t[2],
		e[6] * t[0] + e[7] * t[1] + e[8] * t[2]
	];
}
var oe = (e) => e > .008856451679035631 ? Math.cbrt(e) : (re * e + 16) / 116, se = (e) => e > ie ? e * e * e : (116 * e - 16) / re;
function ce(e) {
	let t = ae(M, e), n = oe(t[0] / j[0]), r = oe(t[1] / j[1]), i = oe(t[2] / j[2]);
	return [
		116 * r - 16,
		500 * (n - r),
		200 * (r - i)
	];
}
function le([e, t, n]) {
	let r = (e + 16) / 116, i = t / 500 + r, a = r - n / 200;
	return ae(ne, [
		se(i) * j[0],
		se(r) * j[1],
		se(a) * j[2]
	]);
}
//#endregion
//#region src/curve-edit.ts
var ue = .0025, de = .04, P = .001, fe = 1 / 8, pe = (e) => e < 0 ? 0 : e > 1 ? 1 : e;
function me(e, t, n, r) {
	if (e.length >= 20) return null;
	let i = e.findIndex((e) => e.x > t);
	if (i === -1 && (i = e.length), i > 0 && t - e[i - 1].x <= .0025 || i < e.length && e[i].x - t <= .0025) return null;
	if (r === p.hue && e.length > 0) {
		let n = e[0].x, r = e[e.length - 1].x;
		if (i === 0 && t + 1 - r <= .0025 || i === e.length && n + 1 - t <= .0025) return null;
	}
	let a = e.map((e) => ({ ...e }));
	return a.splice(i, 0, {
		x: t,
		y: n
	}), {
		nodes: a,
		index: i
	};
}
function he(e, t, n) {
	let r = t > 0 ? e[t - 1].x : null, i = t < e.length - 1 ? e[t + 1].x : null;
	return (r === null || n - r > .0025) && (i === null || i - n > .0025);
}
function F(e, t, n, r, i) {
	let a = pe(n), o = pe(r);
	if (!he(e, t, a)) return e;
	let s = e.length - 1;
	i === p.hue && s > 0 && (t === 0 && a + 1 - e[s].x < .0025 ? a = e[s].x + ue - 1 : t === s && e[0].x + 1 - a < .0025 && (a = e[0].x + 1 - ue));
	let c = e.map((e) => ({ ...e }));
	return c[t] = {
		x: a,
		y: o
	}, c;
}
function ge(e, t) {
	return e.length <= 1 ? [{
		x: .5,
		y: .5
	}] : e.filter((e, n) => n !== t).map((e) => ({ ...e }));
}
function _e(e, t) {
	return e.map((e, n) => n === t ? {
		x: e.x,
		y: .5
	} : { ...e });
}
function I(e, t, n) {
	let r = de * de, i = -1;
	return e.forEach((e, a) => {
		let o = (t - e.x) * (t - e.x) + (n - e.y) * (n - e.y);
		o < r && (r = o, i = a);
	}), i;
}
function ve(e, t) {
	let n = 0;
	return e.forEach((r, i) => {
		Math.abs(r.x - t) < Math.abs(e[n].x - t) && (n = i);
	}), n;
}
function ye(e, t, n, r) {
	return e.map((e) => {
		let i = Math.exp(-((t - e.x) * (t - e.x)) / (r * r));
		return {
			x: e.x,
			y: (1 - i) * e.y + i * n
		};
	});
}
function be(e, t, n) {
	let r = e * (1 + .1 * t), i = .2 / n;
	return r > 1 ? 1 : r < i ? i : r;
}
function xe(e, t, n) {
	let r = .02, i = .1 * n, a = e.map((e) => ({ ...e })), o = (e, t) => {
		if (!(e > 0 && e < 1)) return;
		let n = me(a, e, t);
		n && (a = n.nodes);
	};
	return o(t.min - r, .5), o(t.min, .5 + i), o(t.mean, .5 + 2 * i), o(t.max, .5 + i), o(t.max + r, .5), a;
}
var Se = .6, Ce = .5;
function we(e, t = !1) {
	let n = Math.max(1, e - 10), r = Math.round(n * Se), i = r + 10 + (t ? 10 : 0);
	return {
		width: e,
		height: i + 12,
		plotW: n,
		plotH: r,
		barTop: i
	};
}
var L = (e) => e < 0 ? 0 : e > 1 ? 1 : e;
function R(e, t, n) {
	return {
		x: L((t - 5) / e.plotW),
		y: 1 - L((n - 5) / e.plotH)
	};
}
var Te = (e, t) => t > 5 + e.plotH;
function Ee([e, t, n]) {
	let r = Math.atan2(n, t);
	return [
		e,
		Math.hypot(t, n),
		r > 0 ? r / (2 * Math.PI) : 1 - Math.abs(r) / (2 * Math.PI)
	];
}
var z = Ee(ce([
	k(0),
	k(.3),
	k(.7)
]));
function De(e, t, n, r, i) {
	let a = (t + .5) / 63, o = t / 63;
	return e === p.lightness ? [
		100 * a,
		r * .5,
		n[2]
	] : e === p.chroma ? [
		50,
		n[1] * 2 * i * a,
		n[2]
	] : [
		50,
		r * .5,
		o
	];
}
function Oe(e, t, n, r, i = z) {
	let [a, o, s] = De(e, n, i, 128 * Ce * Math.SQRT2, Ce), c = 1 - (r - .5) / 35, l = 1 - r / 35 + .5;
	return t === p.lightness ? [
		e === p.lightness ? a * c : a - 50 + 100 * c,
		o,
		s
	] : t === p.chroma ? [
		a,
		o * 2 * c,
		s
	] : [
		a,
		o,
		s + l
	];
}
var ke = (e, t, n = z) => De(e, t, n, 128 * Math.SQRT2, 1);
function Ae(e) {
	let [t, n, r] = e, i = t, a = Math.cos(2 * Math.PI * r) * n, o = Math.sin(2 * Math.PI * r) * n, s = 1 - (Math.min(100, t) - i) / 100 * (Math.min(80, Math.max(0, t - 20)) / 80), c = i === 0 ? 1 : t / i * s * s * s, l = le([
		t,
		a * c,
		o * c
	]), u = (e) => Math.round(L(A(e)) * 255);
	return `rgb(${u(l[0])}, ${u(l[1])}, ${u(l[2])})`;
}
var B = /* @__PURE__ */ new Map(), je = 12;
function Me(e, t) {
	let n = B.get(e);
	if (n) return n;
	let r = t();
	return B.size >= je && B.delete(B.keys().next().value), B.set(e, r), r;
}
function Ne(e, t, n = z) {
	return Me(`plot ${e} ${t} ${n.join(" ")}`, () => {
		let r = [];
		for (let i = 0; i < 36; i++) for (let a = 0; a < 64; a++) r.push(Ae(Oe(e, t, a, i, n)));
		return r;
	});
}
function Pe(e, t = z) {
	return Me(`bar ${e} ${t.join(" ")}`, () => Array.from({ length: 64 }, (n, r) => Ae(ke(e, r, t))));
}
function Fe(e, t) {
	let n = (t) => e === p.lightness ? t[0] / 100 : e === p.chroma ? t[1] / (128 * Math.SQRT2) : t[2];
	return {
		mean: n(t.mean),
		min: n(t.min),
		max: n(t.max)
	};
}
//#endregion
//#region src/params.ts
var Ie = "colour-zones", Le = `${Ie}.lab`, Re = [
	"curveL",
	"curveC",
	"curveH"
], ze = [
	"selectBy",
	"mode",
	"strength",
	"active",
	"count",
	"interpolation",
	...Re
], V = (e) => `${Le}.${e}`;
function Be(e, t) {
	let n = e.curves[t].nodes, r = T(e, t), i = e.selectBy === p.hue, a = n.map((e) => i ? (e.x % 1 + 1) % 1 : e.x), o = n.map((e, t) => t).sort((e, t) => a[e] - a[t]), s = Array(n.length);
	return o.forEach((e, t) => s[e] = t), Array.from({ length: 20 }, (e, t) => {
		let i = Math.min(t, n.length - 1), a = s[i];
		return [
			n[i].x,
			n[i].y,
			r.y[a],
			r.dy[a]
		];
	}).flat();
}
function H(e) {
	let t = {
		[V("selectBy")]: e.selectBy,
		[V("mode")]: e.mode,
		[V("strength")]: e.strength,
		[V("active")]: +!S(e),
		[V("count")]: e.curves.map((e) => Math.min(e.nodes.length, 20)),
		[V("interpolation")]: e.curves.map((e) => e.interpolation)
	};
	for (let n of m) t[V(Re[n])] = Be(e, n);
	return t;
}
function Ve(e, t, n) {
	return Object.values(t).find((t) => t === e) ?? n;
}
var He = (e, t) => Array.isArray(e) && e.length === t && e.every((e) => typeof e == "number" && Number.isFinite(e));
function Ue(t, n) {
	let r = b.curves[n], i = t[V("count")], a = t[V("interpolation")], o = t[V(Re[n])], s = He(a, 3) ? Ve(a[n], e, r.interpolation) : r.interpolation;
	if (!He(o, 80) || !He(i, 3)) return {
		interpolation: s,
		nodes: r.nodes
	};
	let c = Math.min(20, Math.max(1, Math.round(i[n]))), l = [];
	for (let e = 0; e < c; e++) l.push({
		x: o[4 * e],
		y: o[4 * e + 1]
	});
	return {
		interpolation: s,
		nodes: l.every((e, t) => e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1 && (t === 0 || e.x > l[t - 1].x)) ? l : r.nodes
	};
}
function U(e) {
	let t = e[V("strength")];
	return {
		selectBy: Ve(e[V("selectBy")], p, b.selectBy),
		mode: Ve(e[V("mode")], h, b.mode),
		strength: typeof t == "number" && Number.isFinite(t) ? Math.min(200, Math.max(-200, t)) : b.strength,
		curves: [
			Ue(e, p.lightness),
			Ue(e, p.chroma),
			Ue(e, p.hue)
		]
	};
}
var We = () => H(b), W, G;
function Ge(e) {
	G = e, W = e.react;
}
function Ke(e, t) {
	let { data: n, width: r, height: i } = e;
	if (r < 1 || i < 1) return null;
	let a = (e, t) => Math.min(t - 1, Math.max(0, Math.floor(e * t))), o = a(Math.min(t.x0, t.x1), r), s = a(Math.max(t.x0, t.x1), r), c = a(Math.min(t.y0, t.y1), i), l = a(Math.max(t.y0, t.y1), i);
	o === s && c === l && (o = Math.max(0, o - 1), s = Math.min(r - 1, s + 1), c = Math.max(0, c - 1), l = Math.min(i - 1, l + 1));
	let u = [
		0,
		0,
		0
	], d = [
		Infinity,
		Infinity,
		Infinity
	], f = [
		-Infinity,
		-Infinity,
		-Infinity
	], p = 0;
	for (let e = c; e <= l; e++) for (let t = o; t <= s; t++) {
		let i = 4 * (e * r + t), [a, o, s] = ce([
			n[i],
			n[i + 1],
			n[i + 2]
		]), c = [
			a,
			Math.hypot(o, s),
			O(o, s)
		];
		if (c.every(Number.isFinite)) {
			for (let e = 0; e < 3; e++) u[e] += c[e], d[e] = Math.min(d[e], c[e]), f[e] = Math.max(f[e], c[e]);
			p++;
		}
	}
	return p === 0 ? null : {
		mean: [
			u[0] / p,
			u[1] / p,
			u[2] / p
		],
		min: [
			d[0],
			d[1],
			d[2]
		],
		max: [
			f[0],
			f[1],
			f[2]
		]
	};
}
function qe(e) {
	let t = {}, n = {};
	for (let [r, i] of Object.entries(e.paramBag)) (r.startsWith("colour-zones.lab.") ? n : t)[r] = i;
	return {
		photoId: e.photoId,
		params: e.previewParams ?? e.params,
		others: t,
		ours: n
	};
}
function Je(e, t) {
	let n = Object.keys(e);
	return n.length === Object.keys(t).length && n.every((n) => e[n] === t[n]);
}
var Ye = (e, t) => e.photoId === t.photoId && e.params === t.params && Je(e.others, t.others) && !Je(e.ours, t.ours);
function Xe(e) {
	let t = e.throttleMs ?? 150, n = !1, r = !1, i = !1, a = null, o = -Infinity, s = () => {
		a = null;
		let t = e.develop.getState();
		!n && t.photoId && (r = !0, o = Date.now(), e.render(t.photoId, t.previewParams ?? t.params).then((t) => {
			n || e.publish(t ? {
				data: t.data,
				width: t.width,
				height: t.height
			} : null);
		}).catch(() => {
			n || e.publish(null);
		}).finally(() => {
			r = !1, i && !n && (i = !1, c());
		}));
	};
	function c() {
		n || (r ? i = !0 : a === null && (a = setTimeout(s, Math.max(0, t - (Date.now() - o)))));
	}
	let l = qe(e.develop.getState()), u = e.develop.subscribe((t, n) => {
		if (t.photoId !== n.photoId && !t.photoId) {
			e.publish(null);
			return;
		}
		if (!t.photoId || t.histogram === n.histogram) return;
		let r = qe(t), i = Ye(r, l);
		l = r, i || c();
	});
	return c(), () => {
		n = !0, u(), a !== null && clearTimeout(a), a = null;
	};
}
function Ze(e) {
	return Xe({
		develop: G.stores.useDevelopStore,
		render: (e, t) => G.develop.renderPhotoFloatFrame(e, t, {
			paramBag: { [V("active")]: 0 },
			space: {
				encoding: "linear",
				primaries: "rec709"
			}
		}),
		publish: e
	});
}
//#endregion
//#region src/store.ts
var Qe = null;
function $e() {
	Qe = G.stores.create((e) => ({
		channel: p.lightness,
		editByArea: !1,
		radius: fe,
		picker: null,
		picked: null,
		area: null,
		sample: null,
		setChannel: (t) => e({ channel: t }),
		setEditByArea: (t) => e({ editByArea: t }),
		setRadius: (t) => e({ radius: t }),
		setPicker: (t) => e(t === null ? {
			picker: t,
			picked: null,
			area: null
		} : { picker: t }),
		setPicked: (t, n) => e({
			picked: t,
			area: n
		}),
		setSample: (t) => e({ sample: t })
	}));
}
function K() {
	if (!Qe) throw Error("[colour-zones] store() called before activate()");
	return Qe;
}
//#endregion
//#region src/Overlay.tsx
function et(e, t, n, r, i, a = !1) {
	if (!i || n.width <= 0 || n.height <= 0 || i.w <= 0 || i.h <= 0) return null;
	let o = r / n.width, s = ((e - n.left) * o - i.x) / i.w, c = ((t - n.top) * o - i.y) / i.h;
	return a ? {
		x: Math.min(1, Math.max(0, s)),
		y: Math.min(1, Math.max(0, c))
	} : s < 0 || s > 1 || c < 0 || c > 1 ? null : {
		x: s,
		y: c
	};
}
var tt = (e) => e.altKey ? 1 : e.shiftKey ? -1 : 0, q = null;
function nt(e, t) {
	let n = K().getState();
	if (n.picker === null) return;
	if (!n.sample) {
		q = {
			box: e,
			shape: t
		};
		return;
	}
	let r = Ke(n.sample, e);
	if (n.setPicked(r, e), !r || n.picker !== "create") return;
	let i = G.stores.useDevelopStore.getState(), a = U(i.paramBag), o = {
		interpolation: b.curves[n.channel].interpolation,
		nodes: xe(b.curves[n.channel].nodes, Fe(a.selectBy, r), t)
	};
	i.setDynParams(H(x(a, n.channel, o))), i.commitEdit("Colour Zones create curve");
}
function rt() {
	let { useEffect: e, useRef: t, useState: n } = W, r = K()((e) => e.picker), i = K()((e) => e.area), a = G.develop.useDevelopOverlay(), o = t(null), s = t(null), [c, l] = n(null), [u, d] = n(!1);
	if (e(() => {
		if (r === null) return;
		let e = Ze((e) => {
			let t = K().getState();
			if (t.setSample(e), e) {
				if (q) {
					let { box: e, shape: t } = q;
					q = null, nt(e, t);
				} else t.picker === "show" && t.area && t.setPicked(Ke(e, t.area), t.area);
			}
		});
		return () => {
			e(), q = null, K().getState().setSample(null);
		};
	}, [r]), e(() => {
		if (r === null) return;
		let e = /* @__PURE__ */ new Set(), t = () => d(e.has("Control") || e.has("Meta") || e.has(" ")), n = (n) => {
			n.key === "Escape" ? K().getState().setPicker(null) : (e.add(n.key), t());
		}, i = (n) => {
			e.delete(n.key), t();
		}, a = () => {
			e.clear(), t();
		};
		return window.addEventListener("keydown", n), window.addEventListener("keyup", i), window.addEventListener("blur", a), () => {
			window.removeEventListener("keydown", n), window.removeEventListener("keyup", i), window.removeEventListener("blur", a), d(!1);
		};
	}, [r]), r === null) return null;
	let f = (e, t) => {
		let n = o.current;
		return n ? et(e.clientX, e.clientY, n.getBoundingClientRect(), n.clientWidth, a.rect, t) : null;
	}, p = (e) => {
		if (e.button !== 0) return;
		let t = f(e, !1);
		t && (e.preventDefault(), e.currentTarget.setPointerCapture?.(e.pointerId), s.current = {
			start: t,
			end: t
		}, l({
			x0: t.x,
			y0: t.y,
			x1: t.x,
			y1: t.y
		}));
	}, m = (e) => {
		let t = s.current;
		if (!t) return;
		let n = f(e, !0);
		n && (t.end = n, l({
			x0: t.start.x,
			y0: t.start.y,
			x1: n.x,
			y1: n.y
		}));
	}, h = (e) => {
		let t = s.current;
		s.current = null, l(null), e.currentTarget.releasePointerCapture?.(e.pointerId), t && nt({
			x0: t.start.x,
			y0: t.start.y,
			x1: t.end.x,
			y1: t.end.y
		}, tt(e));
	}, g = () => {
		s.current = null, l(null);
	}, _ = {
		position: "absolute",
		inset: 0,
		pointerEvents: u ? "none" : "auto",
		cursor: G.cursors.resolve("pick")
	}, v = c ?? i, y = a.rect, b = v && y ? /* @__PURE__ */ W.createElement("div", { style: {
		position: "absolute",
		left: y.x + Math.min(v.x0, v.x1) * y.w,
		top: y.y + Math.min(v.y0, v.y1) * y.h,
		width: Math.abs(v.x1 - v.x0) * y.w,
		height: Math.abs(v.y1 - v.y0) * y.h,
		minWidth: 6,
		minHeight: 6,
		transform: v.x0 === v.x1 && v.y0 === v.y1 ? "translate(-3px, -3px)" : void 0,
		border: "1px solid rgba(255, 255, 255, 0.9)",
		boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.6)",
		pointerEvents: "none"
	} }) : null;
	return /* @__PURE__ */ W.createElement("div", {
		ref: o,
		style: _,
		onPointerDown: p,
		onPointerMove: m,
		onPointerUp: h,
		onPointerCancel: g
	}, b);
}
//#endregion
//#region src/Graph.tsx
var it = 252, at = 256, ot = [
	"Lightness",
	"Chroma",
	"Hue"
], st = (e, t) => {
	let n = new Path2D();
	for (let r = 0; r < at; r++) {
		let i = r / 255, a = 5 + i * e.plotW, o = 5 + (1 - t(i)) * e.plotH;
		r === 0 ? n.moveTo(a, o) : n.lineTo(a, o);
	}
	return n;
};
function ct(e, t, n, r, i) {
	let { plotW: a, plotH: o } = t, s = (e) => 5 + e * a, c = (e) => 5 + (1 - e) * o;
	e.clearRect(0, 0, t.width, t.height);
	let l = i.ui.picker === null ? null : i.ui.picked, u = l ? l.mean : z, d = Ne(n.selectBy, r, u), f = a / 64, p = o / 36;
	for (let t = 0; t < 36; t++) for (let n = 0; n < 64; n++) e.fillStyle = d[t * 64 + n], e.fillRect(5 + n * f, 5 + t * p, f + .5, p + .5);
	let h = Pe(n.selectBy, u);
	for (let n = 0; n < 64; n++) e.fillStyle = h[n], e.fillRect(5 + n * f, t.barTop, f + .5, 12);
	e.lineWidth = .5, e.strokeStyle = "rgba(0, 0, 0, 0.3)", e.beginPath();
	for (let t = 1; t < 8; t++) e.moveTo(s(t / 8), 5), e.lineTo(s(t / 8), 5 + o);
	for (let t of [.25, .75]) e.moveTo(5, c(t)), e.lineTo(5 + a, c(t));
	if (e.stroke(), e.lineWidth = 1, e.strokeStyle = "rgba(0, 0, 0, 0.55)", e.beginPath(), e.moveTo(5, c(.5)), e.lineTo(5 + a, c(.5)), e.stroke(), l) {
		let r = Fe(n.selectBy, l);
		for (let [n, i] of [[5, o], [t.barTop, 12]]) e.fillStyle = "rgba(255, 255, 255, 0.25)", e.fillRect(s(r.min), n, Math.max(0, r.max - r.min) * a, i), e.fillStyle = "rgba(255, 255, 255, 0.95)", e.fillRect(s(r.mean) - 1, n, 2, i);
	}
	let g = {
		...n,
		strength: 0
	};
	e.save(), e.beginPath(), e.rect(5, 5, a, o), e.clip();
	for (let n of m) n !== r && (e.lineWidth = 1.5, e.strokeStyle = "rgba(240, 240, 240, 0.35)", e.stroke(st(t, E(g, n))));
	let _ = n.curves[r].nodes, v = i.ui.editByArea && i.mouse && i.xMove < 0 ? i.mouse : null;
	if (v) {
		let t = (e) => E(x(g, r, {
			...n.curves[r],
			nodes: ye(_, v.x, e, i.ui.radius)
		}), r), a = t(1), o = t(0), l = new Path2D();
		for (let e = 0; e < at; e++) {
			let t = e / 255;
			e === 0 ? l.moveTo(s(t), c(o(t))) : l.lineTo(s(t), c(o(t)));
		}
		for (let e = 255; e >= 0; e--) {
			let t = e / 255;
			l.lineTo(s(t), c(a(t)));
		}
		l.closePath(), e.fillStyle = "rgba(240, 240, 240, 0.3)", e.fill(l);
	}
	let y = E(g, r), b = st(t, y);
	if (e.lineWidth = 3, e.strokeStyle = "rgba(0, 0, 0, 0.5)", e.stroke(b), e.lineWidth = 1.5, e.strokeStyle = "rgba(240, 240, 240, 0.95)", e.stroke(b), _.forEach((t, n) => {
		e.beginPath(), e.arc(s(t.x), c(t.y), n === i.hover ? 5 : 3.5, 0, 2 * Math.PI), e.fillStyle = n === i.hover ? "rgba(240, 240, 240, 1)" : "rgba(30, 30, 30, 0.9)", e.fill(), e.lineWidth = 1.5, e.strokeStyle = n === i.hover ? "rgba(30, 30, 30, 0.9)" : "rgba(240, 240, 240, 0.95)", e.stroke();
	}), v && (e.beginPath(), e.arc(s(v.x), c(y(v.x)), i.ui.radius * a, 0, 2 * Math.PI), e.lineWidth = 1, e.strokeStyle = "rgba(240, 240, 240, 0.7)", e.stroke()), e.restore(), i.ui.editByArea) {
		let t = 5 + o + 10;
		_.forEach((n, r) => {
			e.beginPath(), e.moveTo(s(n.x) - 7 / 2, t), e.lineTo(s(n.x), t - 7), e.lineTo(s(n.x) + 7 / 2, t), e.closePath(), e.lineWidth = 1, e.strokeStyle = "rgba(160, 160, 160, 1)", e.fillStyle = "rgba(160, 160, 160, 1)", r === i.xMove ? e.fill() : e.stroke();
		});
	}
}
function lt() {
	let { useEffect: e, useRef: t, useState: n } = W, r = G.develop.useParamScope(), i = t(r);
	i.current = r;
	let a = U(r.getParams()), o = K()((e) => e.channel), s = K()((e) => e.editByArea), c = K()((e) => e.radius), l = K()((e) => e.picker), u = K()((e) => e.picked), [d, f] = n(it), [p, m] = n(-1), [h, g] = n(null), [v, y] = n(-1), b = t(-1), S = t(-1), C = (e) => {
		b.current = e, m(e);
	}, w = (e) => {
		S.current = e, y(e);
	}, ee = t(null), T = t(null), D = t(null), O = we(d, s);
	e(() => {
		let e = ee.current;
		if (!e || typeof ResizeObserver > "u") return;
		let t = new ResizeObserver((e) => {
			let t = Math.round(e[0].contentRect.width);
			t > 40 && f(t);
		});
		return t.observe(e), () => t.disconnect();
	}, []), e(() => {
		let e = T.current;
		if (!e) return;
		let t = window.devicePixelRatio || 1;
		e.width = Math.round(O.width * t), e.height = Math.round(O.height * t);
		let n = e.getContext("2d");
		n && (n.setTransform(t, 0, 0, t, 0, 0), ct(n, O, a, o, {
			hover: p,
			mouse: h,
			xMove: v,
			ui: {
				editByArea: s,
				radius: c,
				picker: l,
				picked: u
			}
		}));
	}), e(() => {
		let e = T.current;
		if (!e || !s) return;
		let t = (e) => {
			if (e.deltaY === 0) return;
			e.preventDefault();
			let t = K().getState(), n = U(i.current.getParams()).curves[t.channel].nodes.length;
			t.setRadius(be(t.radius, Math.sign(e.deltaY), n));
		};
		return e.addEventListener("wheel", t, { passive: !1 }), () => e.removeEventListener("wheel", t);
	}, [s]);
	let k = () => U(r.getParams()), A = (e, t = k()) => r.setParams(H(x(t, o, {
		...t.curves[o],
		nodes: e
	}))), j = (e) => r.commit(`Colour Zones ${e}`), M = (e) => {
		let t = e.currentTarget.getBoundingClientRect(), n = t.width > 0 ? O.width / t.width : 1;
		return {
			px: (e.clientX - t.left) * n,
			py: (e.clientY - t.top) * n
		};
	}, te = (e) => {
		if (e.button !== 0) return;
		let { px: t, py: n } = M(e), { x: r, y: i } = R(O, t, n), a = k(), c = a.curves[o].nodes;
		if (e.ctrlKey || e.metaKey) {
			if (!s && I(c, r, i) >= 0) return;
			let e = me(c, r, E({
				...a,
				strength: 0
			}, o)(r), a.selectBy);
			e && (A(e.nodes, a), C(e.index), j("add node"));
			return;
		}
		if (e.currentTarget.setPointerCapture?.(e.pointerId), s) {
			let e = Te(O, n) ? ve(c, r) : -1;
			w(e), D.current = {
				node: e,
				dx: e >= 0 ? c[e].x - r : 0,
				dy: 0,
				moved: !1,
				added: !1,
				area: e < 0
			};
			return;
		}
		let l = I(c, r, i);
		D.current = l >= 0 ? {
			node: l,
			dx: c[l].x - r,
			dy: c[l].y - i,
			moved: !1,
			added: !1,
			area: !1
		} : {
			node: -1,
			dx: 0,
			dy: 0,
			moved: !1,
			added: !1,
			area: !1
		}, C(l);
	}, ne = (e) => {
		let { px: t, py: n } = M(e), { x: r, y: i } = R(O, t, n), a = k(), c = a.curves[o].nodes, l = D.current;
		if (s) {
			if (g({
				x: r,
				y: i
			}), !l) {
				w(Te(O, n) ? ve(c, r) : -1);
				return;
			}
			if (l.area) {
				A(ye(c, r, i, K().getState().radius), a), l.moved = !0;
				return;
			}
			let e = c[l.node], t = F(c, l.node, r + l.dx, e.y, a.selectBy);
			if (t === c) return;
			A(t, a), l.moved = !0;
			return;
		}
		if (!l) {
			C(I(c, r, i));
			return;
		}
		if (l.node < 0) {
			let e = me(c, r, i, a.selectBy);
			if (!e) return;
			A(e.nodes, a), l.node = e.index, l.added = !0, C(e.index);
			return;
		}
		let u = F(c, l.node, r + l.dx, i + l.dy, a.selectBy);
		u !== c && (A(u, a), l.moved = !0);
	}, N = (e) => {
		let t = D.current;
		D.current = null, e.currentTarget.releasePointerCapture?.(e.pointerId), t?.added ? j("add node") : t?.area && t.moved ? j("edit by area") : t?.moved && j("move node");
	};
	return /* @__PURE__ */ W.createElement("div", {
		ref: ee,
		style: { width: "100%" }
	}, /* @__PURE__ */ W.createElement("canvas", {
		ref: T,
		"aria-label": `${ot[o]} curve`,
		tabIndex: 0,
		style: {
			display: "block",
			width: "100%",
			height: O.height,
			cursor: "crosshair",
			touchAction: "none"
		},
		onPointerDown: te,
		onPointerMove: ne,
		onPointerUp: N,
		onPointerCancel: N,
		onPointerLeave: () => {
			D.current || (C(-1), g(null), w(-1));
		},
		onDoubleClick: () => {
			D.current = null;
			let e = k();
			r.setParams(H(x(e, o, _(e.selectBy)))), C(-1), j("reset curve");
		},
		onContextMenu: (e) => {
			if (e.preventDefault(), s) return;
			let { px: t, py: n } = M(e), { x: r, y: i } = R(O, t, n), a = k(), c = a.curves[o].nodes, l = I(c, r, i);
			l < 0 || (e.ctrlKey || e.metaKey ? (A(_e(c, l), a), j("reset node")) : (A(ge(c, l), a), C(-1), j("remove node")));
		},
		onKeyDown: (e) => {
			let t = {
				ArrowUp: [0, P],
				ArrowDown: [0, -P],
				ArrowRight: [P, 0],
				ArrowLeft: [-P, 0]
			}[e.key], n = k(), r = n.curves[o].nodes, i = s ? S.current : b.current;
			if (!t || i < 0 || i >= r.length) return;
			e.preventDefault();
			let a = r[i], c = F(r, i, a.x + t[0], a.y + t[1], n.selectBy);
			c !== r && (A(c, n), j("move node"));
		}
	}));
}
//#endregion
//#region src/presets.ts
var J = 8, Y = (e, t, n) => Array.from({ length: e }, (e, r) => ({
	x: r / t,
	y: n
})), X = (t, n = e.centripetal) => ({
	interpolation: n,
	nodes: t
}), Z = (e, t, n, r) => ({
	selectBy: e,
	mode: h.smooth,
	strength: 0,
	curves: [
		t,
		n,
		r
	]
});
function ut() {
	let e = Y(7, 7, 0);
	return e[0].y = .65, e[1].x = 3 / 16, e[3].x = .5, e[4].x = .51, e[6].x = 15 / 16, Z(p.hue, X(Y(7, 7, .5)), X(e), X(Y(7, 7, .5)));
}
function dt() {
	let e = Y(7, 7, 0);
	return e[0].y = .5, e[2].x = .25, e[1].x = .16, e[1].y = .3, Z(p.hue, X(Y(7, 7, .5)), X(e), X(Y(7, 7, .5)));
}
function ft() {
	let e = Y(J, 7, .5), t = Y(J, 7, .5);
	for (let e = 3; e < J; e++) t[e].y += (e - 2.5) / 6 * .25;
	for (let t = 4; t < J; t++) e[t].y -= (t - 3.5) / 5 * .35;
	return Z(p.chroma, X(e), X(t), X(Y(J, 7, .5)));
}
function pt() {
	let e = Y(7, 7, .5), t = Y(7, 7, .5);
	return e[1].y = .45, t[1].y = .55, Z(p.hue, X(Y(7, 7, .5)), X(e), X(t));
}
function mt() {
	return Z(p.hue, X([
		{
			x: 0,
			y: .61304
		},
		{
			x: .01,
			y: .61304
		},
		{
			x: .245283,
			y: .447962
		},
		{
			x: .498113,
			y: .529201
		},
		{
			x: .641509,
			y: .664967
		},
		{
			x: .879245,
			y: .777294
		},
		{
			x: .99,
			y: .61304
		}
	]), X(Y(7, 7, 0)), X(Y(7, 7, .5)));
}
function ht() {
	let t = () => X(Y(8, 8, .5), e.monotone);
	return Z(p.hue, t(), t(), t());
}
var gt = [
	{
		id: "bw-red",
		label: "B&W: with red",
		params: ut()
	},
	{
		id: "bw-skin",
		label: "B&W: with skin tones",
		params: dt()
	},
	{
		id: "polarizing",
		label: "Polarizing filter",
		params: ft()
	},
	{
		id: "natural-skin",
		label: "Natural skin tones",
		params: pt()
	},
	{
		id: "bw-film",
		label: "B&W: film",
		params: mt()
	},
	{
		id: "hsl-base",
		label: "HSL base setting",
		params: ht()
	}
], _t = [
	{
		value: String(p.lightness),
		label: "Lightness"
	},
	{
		value: String(p.chroma),
		label: "Chroma"
	},
	{
		value: String(p.hue),
		label: "Hue"
	}
], vt = [{
	value: String(h.smooth),
	label: "Smooth"
}, {
	value: String(h.strong),
	label: "Strong"
}], yt = [
	{
		value: String(e.cubic),
		label: "Cubic spline"
	},
	{
		value: String(e.centripetal),
		label: "Centripetal spline"
	},
	{
		value: String(e.monotone),
		label: "Monotonic spline"
	}
], bt = {
	show: "Show a colour from the image on the graph. Click a point or drag an area; Esc ends.",
	create: "Create the curve from an area of the image. Drag for a flat curve, Alt+drag to raise it, Shift+drag to lower it; Esc ends."
};
function xt() {
	let { useEffect: e } = W, { Slider: t, PickerIcon: n } = G.components, { Button: r, Field: i, Row: a, SegmentedControl: o, Select: s, Stack: c, Toggle: l } = G.ui, u = G.develop.useParamScope(), d = K()((e) => e.channel), f = K()((e) => e.editByArea), p = K()((e) => e.picker), m = u.maskId !== null, h = U(u.getParams()), g = () => U(u.getParams()), _ = (e) => u.setParams(H(e)), y = (e) => u.commit(`Colour Zones ${e}`);
	e(() => {
		if (!m) return () => K().getState().setPicker(null);
	}, [m]);
	let b = (e, t, n, r) => /* @__PURE__ */ W.createElement(i, { label: e }, /* @__PURE__ */ W.createElement(s, {
		ariaLabel: e,
		value: String(t),
		options: n,
		onChange: (e) => r(Number(e))
	})), S = (e, t) => /* @__PURE__ */ W.createElement(r, {
		size: "sm",
		active: p === e,
		title: bt[e],
		"aria-pressed": p === e,
		onClick: () => K().getState().setPicker(p === e ? null : e)
	}, /* @__PURE__ */ W.createElement(a, {
		gap: 4,
		align: "center"
	}, /* @__PURE__ */ W.createElement(n, { size: 12 }), t));
	return /* @__PURE__ */ W.createElement(c, {
		gap: 6,
		style: { padding: 8 }
	}, /* @__PURE__ */ W.createElement(s, {
		ariaLabel: "Colour Zones preset",
		value: "",
		placeholder: "Presets",
		options: gt.map((e) => ({
			value: e.id,
			label: e.label
		})),
		onChange: (e) => {
			let t = gt.find((t) => t.id === e);
			t && (_(t.params), y(`preset: ${t.label}`));
		}
	}), /* @__PURE__ */ W.createElement(o, {
		size: "sm",
		value: String(d),
		options: _t,
		onChange: (e) => K().getState().setChannel(Number(e))
	}), m ? null : /* @__PURE__ */ W.createElement(a, { gap: 6 }, S("show", "Show colour"), S("create", "Create curve")), /* @__PURE__ */ W.createElement(lt, null), /* @__PURE__ */ W.createElement(l, {
		label: "Edit by area",
		checked: f,
		onChange: (e) => K().getState().setEditByArea(e)
	}), b("Select by", h.selectBy, _t, (e) => {
		_(v(e)), y("select by");
	}), b("Process mode", h.mode, vt, (e) => {
		_({
			...g(),
			mode: e
		}), y("process mode");
	}), /* @__PURE__ */ W.createElement(t, {
		label: "Mix",
		value: h.strength,
		min: -200,
		max: 200,
		step: 1,
		defaultValue: 0,
		onChange: (e) => _({
			...g(),
			strength: e
		}),
		onCommit: () => y("mix")
	}), b("Interpolation method", h.curves[d].interpolation, yt, (e) => {
		let t = g();
		_(x(t, d, {
			...t.curves[d],
			interpolation: e
		})), y("interpolation");
	}));
}
//#endregion
//#region src/stage.ts
function Q(e) {
	let t = e.toPrecision(10);
	return t.includes("e") ? e.toFixed(12) : t;
}
function St(e) {
	return `mat3(${[
		0,
		3,
		6,
		1,
		4,
		7,
		2,
		5,
		8
	].map((t) => Q(e[t])).join(", ")})`;
}
var Ct = "20", wt = Q(N), Tt = Q(ie), Et = Q(re), Dt = `vec3(${j.map(Q).join(", ")})`, Ot = Q(ee), $ = Q(2 * Math.PI), kt = Q(1 / (128 * Math.SQRT2)), At = `
vec3 czDecode(vec3 y) {
  vec3 a = abs(y);
  return sign(y) * mix(a / 12.92, pow((a + 0.055) / 1.055, vec3(2.4)), step(0.04045, a));
}
vec3 czEncode(vec3 x) {
  vec3 a = abs(x);
  return sign(x) * mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, a));
}
float czF(float t) {
  return t > ${wt} ? pow(t, 1.0 / 3.0) : (${Et} * t + 16.0) / 116.0;
}
float czFInv(float f) {
  return f > ${Tt} ? f * f * f : (116.0 * f - 16.0) / ${Et};
}
vec3 czLab(vec3 rgb) {
  const mat3 toXyz = ${St(M)};
  vec3 r = (toXyz * rgb) / ${Dt};
  vec3 f = vec3(czF(r.x), czF(r.y), czF(r.z));
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}
vec3 czRgb(vec3 lab) {
  const mat3 toRgb = ${St(ne)};
  float fy = (lab.x + 16.0) / 116.0;
  float fx = lab.y / 500.0 + fy;
  float fz = fy - lab.z / 200.0;
  return toRgb * (vec3(czFInv(fx), czFInv(fy), czFInv(fz)) * ${Dt});
}

// dt_Lab_2_LCH's hue from an atan2 angle.
float czLchHue(float turn) {
  return turn > 0.0 ? turn / ${$} : 1.0 - abs(turn) / ${$};
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
function jt(e, t, n) {
	return `
    {
      int czN = clamp(${t}, 1, ${Ct});
      float czX = czV;
      vec4 czFirst = ${e}[0];
      vec4 czLast = ${e}[czN - 1];
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
        for (int czK = 0; czK < ${Ct}; czK++) {
          if (czK >= czN) break;
          if (${e}[czK].x > czX) { czAbove = czK; break; }
        }
        int czI0 = czWrap ? (czAbove > 0 ? czAbove - 1 : czN - 1) : min(czAbove - 1, czN - 2);
        int czI1 = czI0 + 1 < czN ? czI0 + 1 : 0;
        vec4 czA = ${e}[czI0];
        vec4 czB = ${e}[czI1];
        czY = czPiece(czA, czB, czI1 > czI0 ? czB.x - czA.x : czB.x - (czA.x - 1.0), czX);
      }
      ${n} = czTable(czY);
    }`;
}
var Mt = `
{
  if (active != 0) {
    vec3 czPix = czLab(czDecode(c));
    float czC = length(czPix.yz);
    float czTurn = czC > 0.0 ? atan(czPix.z, czPix.y) : 0.0;
    float czH = mod(czTurn + ${$}, ${$}) / ${$};
    bool czStrong = mode == ${h.strong};
    float czS;
    float czBlend = 0.0;
    if (czStrong) {
      czS = selectBy == ${p.lightness} ? czPix.x * 0.01
        : selectBy == ${p.chroma} ? czC * ${kt}
        : czLchHue(czTurn);
      czS = clamp(czS, 0.0, 1.0);
    } else if (selectBy == ${p.lightness}) {
      czS = min(1.0, czPix.x / 100.0);
    } else if (selectBy == ${p.chroma}) {
      czS = min(1.0, czC / 128.0);
    } else {
      czS = czH;
      czBlend = (1.0 - czC / 128.0) * (1.0 - czC / 128.0);
    }
    float czV = clamp(czS * ${Ot}, 0.0, 1.0);
    bool czWrap = selectBy == ${p.hue};
    float czLm;
    float czCm;
    float czHm;${jt("curveL", "count.x", "czLm")}${jt("curveC", "count.y", "czCm")}${jt("curveH", "count.z", "czHm")}
    if (czStrong) {
      float czTurns = czLchHue(czTurn) + czHm - 0.5;
      float czChroma = czC * 2.0 * czCm;
      czPix = vec3(czPix.x * exp2(4.0 * (czLm - 0.5)), cos(${$} * czTurns) * czChroma, sin(${$} * czTurns) * czChroma);
    } else {
      float czLs = czBlend * 0.5 + (1.0 - czBlend) * czLm - 0.5;
      float czHs = czBlend * 0.5 + (1.0 - czBlend) * czHm - 0.5;
      float czChroma = 2.0 * czCm * czC;
      czPix = vec3(czPix.x * exp2(4.0 * czLs), cos(${$} * (czH + czHs)) * czChroma, sin(${$} * (czH + czHs)) * czChroma);
    }
    c = czEncode(czRgb(czPix));
  }
}
`, Nt = {
	selectBy: {
		glslType: "int",
		range: {
			min: 0,
			max: 2,
			step: 1
		}
	},
	mode: {
		glslType: "int",
		range: {
			min: 0,
			max: 1,
			step: 1
		}
	},
	strength: {
		glslType: "float",
		range: {
			min: -200,
			max: 200,
			step: 1
		}
	},
	active: {
		glslType: "int",
		range: {
			min: 0,
			max: 1,
			step: 1
		}
	}
}, Pt = {
	selectBy: "select by",
	mode: "process mode",
	strength: "mix",
	active: "active",
	count: "nodes",
	interpolation: "interpolation method",
	curveL: "lightness curve",
	curveC: "chroma curve",
	curveH: "hue curve"
};
function Ft() {
	let e = H(b);
	return ze.map((t) => {
		let n = e[V(t)], r = Pt[t], i = Nt[t];
		return i ? {
			key: t,
			glslType: i.glslType,
			default: n,
			label: r,
			range: i.range
		} : t === "count" || t === "interpolation" ? {
			key: t,
			glslType: "ivec3",
			default: n,
			label: r
		} : {
			key: t,
			glslType: "vec4",
			length: 20,
			default: n,
			label: r
		};
	});
}
function It() {
	return {
		id: Le,
		name: "Colour Zones",
		phase: "display-adjust",
		space: { encoding: "perceptual" },
		glsl: Mt,
		helpers: At,
		uniforms: Ft(),
		presetScope: "global",
		mask: { maskable: !0 },
		dormantWhen: { active: 0 },
		after: ["colour-correction.lab"]
	};
}
//#endregion
//#region src/index.tsx
var Lt = `${Ie}.panel`, Rt = `${Ie}.overlay`, zt = null;
function Bt() {
	let e = G.stores.useDevelopStore.getState();
	e.setDynParams(We()), e.commitEdit("Colour Zones reset");
}
function Vt(e) {
	Ge(e), $e(), zt = e, e.registerProcessingStage(It()), e.registerPanel({
		id: Lt,
		title: "Colour Zones",
		component: xt,
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 268
		},
		onReset: Bt,
		mask: {
			component: xt,
			owns: ze.map(V)
		}
	}), e.registerSlot({
		id: Rt,
		slot: "develop-canvas-overlay",
		component: rt,
		order: 60
	});
}
function Ht() {
	let e = zt;
	if (e) {
		zt = null;
		try {
			K().getState().setPicker(null), e.unregisterProcessingStage(Le), e.unregisterSlot(Rt);
		} catch (e) {
			console.warn("[colour-zones] deactivate failed:", e);
		}
	}
}
//#endregion
export { Rt as OVERLAY_ID, Lt as PANEL_ID, Vt as activate, Ht as deactivate };

//# sourceMappingURL=index.js.map